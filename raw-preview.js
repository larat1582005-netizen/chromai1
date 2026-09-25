/* ════════════════════════════════════════════════════════════════
   ChromaIQ — Multi-Threaded RAW Preview Extractor (raw-preview.js)
   ════════════════════════════════════════════════════════════════
   Optimized with Inline Web Workers to process heavy TIFF structures
   and brute-force JPEG scans off the main thread. Prevents UI freezing
   on large camera files (30MB-80MB+).
   ════════════════════════════════════════════════════════════════ */

(function (window) {
  'use strict';

  const RAW_EXTENSIONS = ['cr2', 'cr3', 'nef', 'arw', 'dng'];

  function getExt(filename) {
    const m = /\.([a-zA-Z0-9]+)$/.exec(filename || '');
    return m ? m[1].toLowerCase() : '';
  }

  /** Quick check by file extension (cheap, used for UI / accept filtering). */
  function isRawExtension(file) {
    return RAW_EXTENSIONS.includes(getExt(file.name));
  }

  /** Stronger check: extension AND TIFF magic bytes (II*\0 or MM\0*). */
  async function isRawFile(file) {
    if (!isRawExtension(file)) return false;
    try {
      const head = await file.slice(0, 4).arrayBuffer();
      const v = new DataView(head);
      const b0 = v.getUint8(0), b1 = v.getUint8(1);
      const isLE = b0 === 0x49 && b1 === 0x49; // "II"
      const isBE = b0 === 0x4D && b1 === 0x4D; // "MM"
      if (!isLE && !isBE) return false;
      const magic = isLE ? v.getUint16(2, true) : v.getUint16(2, false);
      return magic === 42;
    } catch (e) {
      return false;
    }
  }

  function formatExif(raw) {
    const out = {};
    if (raw.make || raw.model) {
      out.camera = [raw.make, raw.model].filter(Boolean).join(' ').trim();
    }
    if (raw.iso) out.iso = raw.iso;
    if (raw.aperture) out.aperture = 'f/' + raw.aperture.toFixed(1);
    if (raw.shutter) {
      out.shutter = raw.shutter >= 1
        ? raw.shutter.toFixed(1) + 's'
        : '1/' + Math.round(1 / raw.shutter) + 's';
    }
    if (raw.focalLength) out.focalLength = Math.round(raw.focalLength) + 'mm';
    return out;
  }

  /* ─── كود الـ Web Worker الذي سيعمل في الخلفية تماماً ─── */
  const WORKER_SOURCE = `
    self.onmessage = function (e) {
      const buffer = e.data;
      try {
        let walked = walkTiff(buffer);
        let candidates = walked.candidates;
        let exif = walked.exif;

        candidates = candidates.filter(c =>
          c.offset >= 0 && c.length > 0 && c.offset + c.length <= buffer.byteLength);

        if (candidates.length === 0) {
          candidates = scanForJpegs(buffer);
        }

        if (candidates.length === 0) {
          self.postMessage({ error: 'NO_PREVIEW_FOUND' });
          return;
        }

        candidates.sort((a, b) => b.length - a.length);
        const best = candidates[0];

        // قطع الجزء الخاص بالصورة المعاينة وإرسالها كمصفوفة منفصلة سريعة
        const previewBuffer = buffer.slice(best.offset, best.offset + best.length);

        self.postMessage({
          success: true,
          previewBuffer: previewBuffer,
          exif: exif
        }, [previewBuffer]);

      } catch (err) {
        self.postMessage({ error: err.message });
      }
    };

    function readIFD(view, offset, little) {
      const count = view.getUint16(offset, little);
      const entries = [];
      for (let i = 0; i < count; i++) {
        const eOff = offset + 2 + i * 12;
        entries.push({
          tag:   view.getUint16(eOff, little),
          type:  view.getUint16(eOff + 2, little),
          count: view.getUint32(eOff + 4, little),
          valueOffset: eOff + 8,
        });
      }
      const nextIFDOffset = view.getUint32(offset + 2 + count * 12, little);
      return { entries, nextIFDOffset };
    }

    function entryValueAsLong(view, entry, little) {
      if (entry.type === 4) return view.getUint32(entry.valueOffset, little);
      if (entry.type === 3) return view.getUint16(entry.valueOffset, little);
      return view.getUint32(entry.valueOffset, little);
    }

    function entryValueAsRational(view, entry, little) {
      const off = view.getUint32(entry.valueOffset, little);
      const num = view.getUint32(off, little);
      const den = view.getUint32(off + 4, little);
      return den !== 0 ? num / den : 0;
    }

    function entryValueAsAscii(view, entry, little) {
      let off = entry.count <= 4 ? entry.valueOffset : view.getUint32(entry.valueOffset, little);
      let s = '';
      for (let i = 0; i < entry.count - 1; i++) {
        const c = view.getUint8(off + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s.trim();
    }

    function walkTiff(buffer) {
      const view = new DataView(buffer);
      const b0 = view.getUint8(0), b1 = view.getUint8(1);
      const little = b0 === 0x49 && b1 === 0x49;
      const firstIFDOffset = view.getUint32(4, little);

      const candidates = [];
      const exif = {};
      const visited = new Set();
      const queue = [firstIFDOffset];

      while (queue.length) {
        const ifdOffset = queue.shift();
        if (!ifdOffset || visited.has(ifdOffset) || ifdOffset >= buffer.byteLength) continue;
        visited.add(ifdOffset);

        let ifd;
        try { ifd = readIFD(view, ifdOffset, little); } catch (e) { continue; }

        let stripOffset = null, stripLength = null, compression = null;
        let jpegOffset = null, jpegLength = null;

        for (const entry of ifd.entries) {
          try {
            switch (entry.tag) {
              case 0x010F: exif.make  = entryValueAsAscii(view, entry, little); break;
              case 0x0110: exif.model = entryValueAsAscii(view, entry, little); break;
              case 0x0103: compression = entryValueAsLong(view, entry, little); break;
              case 0x0111: stripOffset = entryValueAsLong(view, entry, little); break;
              case 0x0117: stripLength = entryValueAsLong(view, entry, little); break;
              case 0x0201: jpegOffset = entryValueAsLong(view, entry, little); break;
              case 0x0202: jpegLength = entryValueAsLong(view, entry, little); break;
              case 0x014A: {
                const n = entry.count;
                const base = n <= 1 ? entry.valueOffset : view.getUint32(entry.valueOffset, little);
                for (let i = 0; i < n; i++) queue.push(view.getUint32(base + i * 4, little));
                break;
              }
              case 0x8769: queue.push(entryValueAsLong(view, entry, little)); break;
              case 0x8827: exif.iso          = entryValueAsLong(view, entry, little); break;
              case 0x829D: exif.aperture     = entryValueAsRational(view, entry, little); break;
              case 0x829A: exif.shutter      = entryValueAsRational(view, entry, little); break;
              case 0x920A: exif.focalLength  = entryValueAsRational(view, entry, little); break;
            }
          } catch (e) {}
        }

        if (jpegOffset && jpegLength) candidates.push({ offset: jpegOffset, length: jpegLength });
        if (stripOffset && stripLength && (compression === 6 || compression === 7)) {
          candidates.push({ offset: stripOffset, length: stripLength });
        }

        if (ifd.nextIFDOffset) queue.push(ifd.nextIFDOffset);
      }
      return { candidates, exif };
    }

    function scanForJpegs(buffer) {
      const bytes = new Uint8Array(buffer);
      const found = [];
      for (let i = 0; i < bytes.length - 3; i++) {
        if (bytes[i] === 0xFF && bytes[i + 1] === 0xD8 && bytes[i + 2] === 0xFF) {
          for (let j = i + 2; j < bytes.length - 1; j++) {
            if (bytes[j] === 0xFF && bytes[j + 1] === 0xD9) {
              found.push({ offset: i, length: j + 2 - i });
              i = j;
              break;
            }
          }
        }
      }
      return found;
    }
  `;

  /* ─── الدالة الرئيسية المستدعاة في واجهة التطبيق ─── */
  async function extract(file) {
    const buffer = await file.arrayBuffer();

    return new Promise((resolve, reject) => {
      // إنشاء الـ Worker برمجياً من النص أعلاه لحماية الـ Main Thread
      const workerBlob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
      const workerURL = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerURL);

      worker.onmessage = async (e) => {
        // تنظيف الذاكرة فوراً بعد انتهاء العمل
        URL.revokeObjectURL(workerURL);
        worker.terminate();

        if (e.data.error) {
          reject(new Error(e.data.error));
          return;
        }

        const { previewBuffer, exif } = e.data;
        const blob = new Blob([previewBuffer], { type: 'image/jpeg' });

        // تحويل النتيجة لـ DataURL ورسمها (هذه الخطوات الخفيفة فقط تتم بالواجهة)
        const dataURL = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });

        const dims = await new Promise((res) => {
          const img = new Image();
          img.onload = () => res({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => res({ width: 0, height: 0 });
          img.src = dataURL;
        });

        if (!dims.width) {
          reject(new Error('PREVIEW_DECODE_FAILED'));
          return;
        }

        resolve({
          dataURL,
          width: dims.width,
          height: dims.height,
          exif: formatExif(exif),
          sourceFormat: getExt(file.name).toUpperCase(),
        });
      };

      worker.onerror = (err) => {
        URL.revokeObjectURL(workerURL);
        worker.terminate();
        reject(err);
      };

      // تمرير الـ Buffer للـ Worker عبر تقنية Transferables لمنع النسخ البطيء بالذاكرة
      worker.postMessage(buffer, [buffer]);
    });
  }

  window.RawPreview = { isRawFile, isRawExtension, extract };

})(window);
