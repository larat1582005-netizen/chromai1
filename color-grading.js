/* ════════════════════════════════════════════════════════════════
   ChromaIQ — Professional Color Grading Engine (color-grading.js)
   ════════════════════════════════════════════════════════════════
   DaVinci Resolve–style color wheels (Lift, Gamma, Gain, Offset),
   real-time pixel processing, before/after split view, scopes
   (Histogram / RGB Parade / Vectorscope), film-look presets,
   and undo/redo history.

   Namespace: window.ChromaGrading.init()
   ════════════════════════════════════════════════════════════════ */

(function (window) {
  'use strict';

  /* ── HSV → RGB helper ─────────────────────────────────────── */
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if      (h < 60)  { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else              { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }

  /* ── Wheel position → tint color [0..1] ─────────────────── */
  function wheelTint(wx, wy) {
    const dist = Math.sqrt(wx * wx + wy * wy);
    if (dist < 0.008) return [0.5, 0.5, 0.5];
    const angle = (((Math.atan2(wy, wx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI)) * 360;
    const sat   = Math.min(1, dist);
    const [r, g, b] = hsvToRgb(angle, sat, 1);
    return [r / 255, g / 255, b / 255];
  }

  /* ── Clamp helper ─────────────────────────────────────────── */
  const clamp01 = v => Math.max(0, Math.min(1, v));

  /* ════════════════════════════════════════════════════════════
     STATE
     ════════════════════════════════════════════════════════════ */
  const ST = {
    /* source canvases / data */
    srcCanvas:  null,   // full-res original (OffscreenCanvas or hidden canvas)
    prevCanvas: null,   // downscaled preview source
    prevW: 0, prevH: 0,

    /* grade parameters */
    wheels: {
      lift:   { x: 0, y: 0, str: 0 },
      gamma:  { x: 0, y: 0, str: 0 },
      gain:   { x: 0, y: 0, str: 0 },
      offset: { x: 0, y: 0, str: 0 },
    },
    tone: {
      contrast:    0,   // −1..+1
      saturation:  0,
      temperature: 0,
      tint:        0,
      exposure:    0,   // −2..+2
      shadows:     0,
      highlights:  0,
      vibrance:    0,
    },

    /* UI state */
    compareMode: 'off',  // 'off' | 'split' | 'before'
    splitPos:    0.5,
    scopeMode:   'histogram',
    activePreset: null,

    /* history */
    history: [], histIdx: -1,

    /* RAF */
    rafId: null,
    processPending: false,

    /* active wheel drag */
    dragWheel: null,
    zoom: 1.0,
    panX: 0, panY: 0,
    isPanning: false,
  };

  /* ════════════════════════════════════════════════════════════
     FILM-LOOK PRESETS
     (x,y are wheel pointer coords in −1..+1; str = strength 0..1)
     ════════════════════════════════════════════════════════════ */
  const PRESETS = {
    cinematic: {
      label: 'Cinematic',
      wheels: {
        lift:   { x: -0.28, y: 0.08,  str: 0.38 },  // cool teal shadows
        gamma:  { x:  0,    y: 0,     str: 0    },
        gain:   { x:  0.34, y: 0.22,  str: 0.30 },  // warm orange highlights
        offset: { x:  0,    y: 0,     str: 0    },
      },
      tone: { contrast: 0.18, saturation: -0.12, temperature: 0.06, tint: 0, exposure: -0.08, shadows: -0.06, highlights: -0.04, vibrance: 0 },
    },
    tealOrange: {
      label: 'Teal & Orange',
      wheels: {
        lift:   { x: -0.55, y: 0.05,  str: 0.52 },  // strong teal shadows
        gamma:  { x:  0,    y: 0,     str: 0    },
        gain:   { x:  0.50, y: 0.28,  str: 0.55 },  // strong orange highlights
        offset: { x:  0,    y: 0,     str: 0    },
      },
      tone: { contrast: 0.22, saturation: 0.14, temperature: 0.18, tint: 0, exposure: 0, shadows: -0.1, highlights: 0.05, vibrance: 0.1 },
    },
    goldenHour: {
      label: 'Golden Hour',
      wheels: {
        lift:   { x:  0.18, y: 0.26,  str: 0.28 },  // warm amber shadows
        gamma:  { x:  0.22, y: 0.14,  str: 0.20 },  // golden midtones
        gain:   { x:  0.40, y: 0.20,  str: 0.35 },  // rich orange highlights
        offset: { x:  0.05, y: 0.05,  str: 0.08 },
      },
      tone: { contrast: 0.10, saturation: 0.20, temperature: 0.30, tint: -0.04, exposure: 0.12, shadows: 0, highlights: 0.06, vibrance: 0.15 },
    },
    moody: {
      label: 'Moody',
      wheels: {
        lift:   { x: -0.15, y: -0.08, str: 0.30 },  // blue-grey shadows
        gamma:  { x: -0.08, y: -0.05, str: 0.18 },
        gain:   { x:  0,    y: 0,     str: 0    },
        offset: { x: -0.05, y: 0,     str: 0.10 },
      },
      tone: { contrast: 0.30, saturation: -0.25, temperature: -0.10, tint: 0.02, exposure: -0.20, shadows: -0.15, highlights: -0.08, vibrance: 0 },
    },
    kodakPortra: {
      label: 'Kodak Portra',
      wheels: {
        lift:   { x:  0.08, y: 0.12,  str: 0.18 },  // slightly warm shadows
        gamma:  { x:  0.05, y: 0.08,  str: 0.12 },  // skin-tone midtones
        gain:   { x:  0.12, y: 0.05,  str: 0.15 },
        offset: { x:  0,    y: 0,     str: 0    },
      },
      tone: { contrast: -0.05, saturation: 0.08, temperature: 0.12, tint: -0.02, exposure: 0.05, shadows: 0.04, highlights: -0.02, vibrance: 0.10 },
    },
    fujiFuture: {
      label: 'Fuji Vivid',
      wheels: {
        lift:   { x: -0.08, y: 0.05,  str: 0.20 },
        gamma:  { x: -0.05, y: 0,     str: 0.12 },
        gain:   { x:  0.08, y: -0.12, str: 0.18 },  // magenta-cool highlights
        offset: { x:  0,    y: 0,     str: 0    },
      },
      tone: { contrast: 0.12, saturation: 0.30, temperature: -0.06, tint: 0.04, exposure: 0.05, shadows: 0, highlights: 0, vibrance: 0.20 },
    },
    hollywoodBlockbuster: {
      label: 'Hollywood',
      wheels: {
        lift:   { x: -0.22, y: 0.10,  str: 0.42 },
        gamma:  { x:  0,    y: 0,     str: 0    },
        gain:   { x:  0.35, y: 0.18,  str: 0.38 },
        offset: { x:  0,    y: 0.02,  str: 0.05 },
      },
      tone: { contrast: 0.28, saturation: 0.08, temperature: 0.10, tint: 0, exposure: -0.05, shadows: -0.12, highlights: 0.04, vibrance: 0.08 },
    },
    vintageFilm: {
      label: 'Vintage',
      wheels: {
        lift:   { x:  0.16, y: 0.24,  str: 0.35 },  // warm greenish shadows
        gamma:  { x:  0.10, y: 0.05,  str: 0.20 },
        gain:   { x:  0.20, y: 0.10,  str: 0.25 },
        offset: { x:  0.05, y: 0.10,  str: 0.12 },
      },
      tone: { contrast: -0.10, saturation: -0.18, temperature: 0.22, tint: -0.06, exposure: -0.04, shadows: 0.08, highlights: -0.06, vibrance: -0.05 },
    },
    kodakEktar: {
      label: 'Kodak Ektar',
      wheels: {
        lift:   { x: -0.05, y: 0.02,  str: 0.12 },  // very subtle cool shadows
        gamma:  { x:  0,    y: 0,     str: 0    },
        gain:   { x:  0.10, y: 0.08,  str: 0.15 },  // clean punchy highlights
        offset: { x:  0,    y: 0,     str: 0    },
      },
      tone: { contrast: 0.20, saturation: 0.28, temperature: 0.04, tint: 0, exposure: 0.02, shadows: -0.05, highlights: 0.02, vibrance: 0.22 },
    },
    kodachrome: {
      label: 'Kodachrome',
      wheels: {
        lift:   { x: -0.05, y: -0.05, str: 0.15 },  // deep punchy blacks
        gamma:  { x:  0.10, y: 0.06,  str: 0.15 },
        gain:   { x:  0.25, y: 0.10,  str: 0.28 },  // warm punchy highlights
        offset: { x:  0,    y: 0,     str: 0    },
      },
      tone: { contrast: 0.26, saturation: 0.30, temperature: 0.14, tint: 0.02, exposure: 0.02, shadows: -0.10, highlights: 0.03, vibrance: 0.18 },
    },
    cinestill800t: {
      label: 'CineStill 800T',
      wheels: {
        lift:   { x: -0.30, y: 0.10,  str: 0.35 },  // cool teal night shadows
        gamma:  { x: -0.15, y: 0.05,  str: 0.20 },
        gain:   { x:  0.30, y: -0.05, str: 0.30 },  // warm halation glow in highlights
        offset: { x: -0.05, y: 0,     str: 0.08 },
      },
      tone: { contrast: 0.15, saturation: 0.05, temperature: -0.15, tint: 0.03, exposure: -0.05, shadows: -0.08, highlights: 0.10, vibrance: 0.05 },
    },
    ilfordNoir: {
      label: 'Ilford Noir',
      wheels: {
        lift:   { x: 0, y: 0, str: 0 },
        gamma:  { x: 0, y: 0, str: 0 },
        gain:   { x: 0, y: 0, str: 0 },
        offset: { x: 0, y: 0, str: 0 },
      },
      tone: { contrast: 0.35, saturation: -1.0, temperature: 0, tint: 0, exposure: -0.02, shadows: -0.15, highlights: 0.05, vibrance: 0 },
    },
    polaroid: {
      label: 'Polaroid',
      wheels: {
        lift:   { x: 0.10, y: -0.05, str: 0.30 },  // warm, faded lifted shadows
        gamma:  { x: 0.05, y: 0,     str: 0.10 },
        gain:   { x: 0.08, y: 0,     str: 0.12 },
        offset: { x: 0.10, y: -0.08, str: 0.15 },  // overall washed-out lift
      },
      tone: { contrast: -0.20, saturation: -0.10, temperature: 0.10, tint: -0.02, exposure: 0.05, shadows: 0.15, highlights: -0.05, vibrance: 0.05 },
    },
    bleachBypass: {
      label: 'Bleach Bypass',
      wheels: {
        lift:   { x: -0.05, y: 0, str: 0.15 },  // steely shadows
        gamma:  { x: 0,     y: 0, str: 0    },
        gain:   { x: -0.05, y: 0, str: 0.10 },  // steely highlights
        offset: { x: 0,     y: 0, str: 0    },
      },
      tone: { contrast: 0.40, saturation: -0.45, temperature: -0.05, tint: 0, exposure: 0, shadows: -0.20, highlights: 0.10, vibrance: -0.10 },
    },
    dayForNight: {
      label: 'Day for Night',
      wheels: {
        lift:   { x: -0.35, y: 0.05, str: 0.40 },  // strong blue shadows
        gamma:  { x: -0.25, y: 0.05, str: 0.30 },
        gain:   { x: -0.15, y: 0,    str: 0.20 },
        offset: { x: -0.10, y: 0,    str: 0.15 },
      },
      tone: { contrast: 0.15, saturation: -0.20, temperature: -0.30, tint: 0, exposure: -0.25, shadows: -0.10, highlights: -0.05, vibrance: 0 },
    },
    neonNights: {
      label: 'Neon Nights',
      wheels: {
        lift:   { x: -0.45, y: 0.15,  str: 0.45 },  // cyan shadows
        gamma:  { x: 0,     y: -0.10, str: 0.15 },
        gain:   { x: 0.10,  y: -0.35, str: 0.40 },  // magenta highlights
        offset: { x: 0,     y: 0,     str: 0    },
      },
      tone: { contrast: 0.25, saturation: 0.35, temperature: -0.05, tint: 0.05, exposure: -0.05, shadows: -0.10, highlights: 0.08, vibrance: 0.30 },
    },
    desertWestern: {
      label: 'Desert Western',
      wheels: {
        lift:   { x: 0.20, y: 0.10,  str: 0.30 },  // dusty warm shadows
        gamma:  { x: 0.15, y: 0.08,  str: 0.20 },
        gain:   { x: 0.30, y: 0.12,  str: 0.30 },  // dusty warm highlights
        offset: { x: 0.08, y: 0.05,  str: 0.10 },
      },
      tone: { contrast: 0.12, saturation: -0.15, temperature: 0.28, tint: 0, exposure: 0.05, shadows: 0.05, highlights: -0.02, vibrance: -0.05 },
    },
    pastelFade: {
      label: 'Pastel Fade',
      wheels: {
        lift:   { x: 0.08, y: -0.05, str: 0.20 },
        gamma:  { x: 0.05, y: -0.05, str: 0.12 },
        gain:   { x: 0.05, y: -0.05, str: 0.10 },
        offset: { x: 0.05, y: 0,     str: 0.08 },
      },
      tone: { contrast: -0.25, saturation: -0.12, temperature: 0.06, tint: -0.03, exposure: 0.08, shadows: 0.20, highlights: -0.08, vibrance: 0.05 },
    },
    cleanBright: {
      label: 'Clean & Bright',
      wheels: {
        lift:   { x: 0.03, y: 0, str: 0.08 },
        gamma:  { x: 0,    y: 0, str: 0    },
        gain:   { x: 0.05, y: 0, str: 0.10 },
        offset: { x: 0,    y: 0, str: 0    },
      },
      tone: { contrast: 0.08, saturation: 0.06, temperature: 0.04, tint: 0, exposure: 0.10, shadows: 0.05, highlights: 0.03, vibrance: 0.08 },
    },
  };

  /* ════════════════════════════════════════════════════════════
     PIXEL PROCESSING
     ════════════════════════════════════════════════════════════ */
  function applyGrade(srcData) {
    const src = srcData.data;
    const out = new Uint8ClampedArray(src.length);

    /* precompute tint colors */
    const lt = wheelTint(ST.wheels.lift.x,   ST.wheels.lift.y);
    const gm = wheelTint(ST.wheels.gamma.x,  ST.wheels.gamma.y);
    const gn = wheelTint(ST.wheels.gain.x,   ST.wheels.gain.y);
    const of = wheelTint(ST.wheels.offset.x, ST.wheels.offset.y);

    const lStr = ST.wheels.lift.str;
    const gStr = ST.wheels.gamma.str;
    const hStr = ST.wheels.gain.str;
    const oStr = ST.wheels.offset.str;

    const { contrast, saturation, temperature, tint: tintVal,
            exposure, shadows, highlights, vibrance } = ST.tone;
    const expMult = Math.pow(2, exposure);
    const contMult = 1 + contrast;
    const satMult  = 1 + saturation;

    for (let i = 0; i < src.length; i += 4) {
      let R = src[i]   / 255;
      let G = src[i+1] / 255;
      let B = src[i+2] / 255;

      /* luminance */
      const lum = 0.2126 * R + 0.7152 * G + 0.0722 * B;

      /* tonal weights — smooth falloffs */
      const shadowW    = Math.max(0, 1 - lum / 0.38)   * lStr;
      const midW       = Math.max(0, 1 - Math.abs(lum - 0.5) * 3.8) * gStr;
      const highlightW = Math.max(0, (lum - 0.62) / 0.38)  * hStr;

      /* color wheel tints: shift each channel toward the selected hue */
      R += shadowW    * (lt[0] - 0.5) * 1.8;
      G += shadowW    * (lt[1] - 0.5) * 1.8;
      B += shadowW    * (lt[2] - 0.5) * 1.8;

      R += midW       * (gm[0] - 0.5) * 1.6;
      G += midW       * (gm[1] - 0.5) * 1.6;
      B += midW       * (gm[2] - 0.5) * 1.6;

      R += highlightW * (gn[0] - 0.5) * 1.8;
      G += highlightW * (gn[1] - 0.5) * 1.8;
      B += highlightW * (gn[2] - 0.5) * 1.8;

      /* offset: uniform color push across the whole image */
      R += oStr * (of[0] - 0.5) * 0.6;
      G += oStr * (of[1] - 0.5) * 0.6;
      B += oStr * (of[2] - 0.5) * 0.6;

      /* shadows / highlights luminance lift/pull */
      const sW2 = Math.max(0, 1 - lum / 0.4);
      const hW2 = Math.max(0, (lum - 0.6) / 0.4);
      const lumaShift = sW2 * shadows * 0.25 + hW2 * highlights * 0.25;
      R += lumaShift; G += lumaShift; B += lumaShift;

      /* exposure */
      R *= expMult; G *= expMult; B *= expMult;

      /* temperature (warm/cool) */
      R += temperature * 0.10;
      B -= temperature * 0.10;
      G += temperature * 0.025;

      /* tint (green ↔ magenta) */
      G += tintVal * 0.08;
      R -= tintVal * 0.04;
      B -= tintVal * 0.04;

      /* contrast */
      R = (R - 0.5) * contMult + 0.5;
      G = (G - 0.5) * contMult + 0.5;
      B = (B - 0.5) * contMult + 0.5;

      /* saturation */
      const newLum = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      R = newLum + (R - newLum) * satMult;
      G = newLum + (G - newLum) * satMult;
      B = newLum + (B - newLum) * satMult;

      /* vibrance: boosts less-saturated colors more */
      const sat2 = Math.max(R, G, B) - Math.min(R, G, B);
      const vibBoost = vibrance * (1 - sat2) * 0.6;
      R = newLum + (R - newLum) * (1 + vibBoost);
      G = newLum + (G - newLum) * (1 + vibBoost);
      B = newLum + (B - newLum) * (1 + vibBoost);

      out[i]   = clamp01(R) * 255 + 0.5;
      out[i+1] = clamp01(G) * 255 + 0.5;
      out[i+2] = clamp01(B) * 255 + 0.5;
      out[i+3] = src[i+3];
    }
    return new ImageData(out, srcData.width, srcData.height);
  }

  /* ════════════════════════════════════════════════════════════
     SCOPES
     ════════════════════════════════════════════════════════════ */
  function drawHistogram(ctx, imageData) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    /* dark bg */
    ctx.fillStyle = 'rgba(4,5,10,0.96)'; ctx.fillRect(0, 0, W, H);
    const d = imageData.data;

    /* separate R G B and lum bins */
    const bins = { r: new Float32Array(256), g: new Float32Array(256), b: new Float32Array(256), lum: new Float32Array(256) };
    for (let i = 0; i < d.length; i += 4) {
      bins.r[d[i]]++;
      bins.g[d[i+1]]++;
      bins.b[d[i+2]]++;
      bins.lum[Math.round(0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2])]++;
    }
    const maxV = Math.max(...bins.lum, ...bins.r, ...bins.g, ...bins.b) || 1;

    const channels = [
      { data: bins.r,   color: 'rgba(239,68,68,0.55)'  },
      { data: bins.g,   color: 'rgba(34,197,94,0.55)'  },
      { data: bins.b,   color: 'rgba(59,130,246,0.55)' },
      { data: bins.lum, color: 'rgba(200,200,220,0.35)'},
    ];

    /* subtle zone ticks */
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5;
    [64,128,192].forEach(x => {
      const px = (x / 255) * W;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
    });

    channels.forEach(({ data, color }) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x < 256; x++) {
        ctx.lineTo((x / 255) * W, H - (data[x] / maxV) * H * 0.95);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    });

    /* zone labels */
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '8px Orbitron,monospace';
    ctx.fillText('SHADOWS', 3, H - 3);
    ctx.fillText('HIGHLIGHTS', W - 58, H - 3);
  }

  function drawRGBParade(ctx, imageData) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.fillStyle = 'rgba(4,5,10,0.96)'; ctx.fillRect(0, 0, W, H);
    const d = imageData.data;

    const bR = new Float32Array(256), bG = new Float32Array(256), bB = new Float32Array(256);
    for (let i = 0; i < d.length; i += 4) { bR[d[i]]++; bG[d[i+1]]++; bB[d[i+2]]++; }

    const maxV = Math.max(...bR, ...bG, ...bB) || 1;
    const col = (W / 3 - 4);
    const channels = [
      { data: bR, stroke: '#ef4444', fill: 'rgba(239,68,68,0.4)',   x: 0 },
      { data: bG, stroke: '#22c55e', fill: 'rgba(34,197,94,0.4)',   x: W/3 + 2 },
      { data: bB, stroke: '#3b82f6', fill: 'rgba(59,130,246,0.4)',  x: 2*W/3 + 4 },
    ];
    const labels = ['R', 'G', 'B'];

    channels.forEach(({ data, stroke, fill, x }, ci) => {
      ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(x, 0, col, H);
      ctx.fillStyle = fill;
      ctx.beginPath(); ctx.moveTo(x, H);
      for (let n = 0; n < 256; n++) {
        ctx.lineTo(x + (n / 255) * col, H - (data[n] / maxV) * H * 0.92);
      }
      ctx.lineTo(x + col, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let n = 0; n < 256; n++) {
        const px = x + (n / 255) * col, py = H - (data[n] / maxV) * H * 0.92;
        n === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.fillStyle = stroke; ctx.font = 'bold 10px Orbitron,monospace';
      ctx.fillText(labels[ci], x + 4, 12);
    });
  }

  function drawVectorscope(ctx, imageData) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    /* dark background */
    ctx.fillStyle = 'rgba(4,5,10,0.96)';
    ctx.fillRect(0, 0, W, H);

    /* use a square area centered in the canvas */
    const size   = Math.min(W, H) - 24;
    const cx     = W / 2, cy = H / 2;
    const radius = size / 2;

    /* outer circle bg */
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(12,14,22,0.9)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.stroke();

    /* inner rings */
    [0.33, 0.66].forEach(f => {
      ctx.beginPath(); ctx.arc(cx, cy, radius * f, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5; ctx.stroke();
    });

    /* crosshairs */
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius); ctx.stroke();

    /* color target markers */
    const targets = [
      { h: 0,   label: 'R'  }, { h: 60,  label: 'Yl' },
      { h: 120, label: 'G'  }, { h: 180, label: 'Cy' },
      { h: 240, label: 'B'  }, { h: 300, label: 'Mg' },
    ];
    targets.forEach(({ h, label }) => {
      const a  = (h / 360) * 2 * Math.PI - Math.PI / 2;
      const tx = cx + Math.cos(a) * radius * 0.78;
      const ty = cy + Math.sin(a) * radius * 0.78;
      const [tr, tg, tb] = hsvToRgb(h, 1, 1);
      ctx.beginPath(); ctx.arc(tx, ty, 4, 0, 2 * Math.PI);
      ctx.strokeStyle = `rgb(${tr|0},${tg|0},${tb|0})`; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fill();
      ctx.fillStyle = `rgba(${tr|0},${tg|0},${tb|0},0.9)`;
      ctx.font = 'bold 8px Orbitron,monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, tx, ty - 9);
    });
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';

    /* plot pixels (subsample for speed) */
    const d    = imageData.data;
    const step = Math.max(1, Math.floor(d.length / (4 * 8000)));
    ctx.globalAlpha = 0.65;
    for (let i = 0; i < d.length; i += 4 * step) {
      const r = d[i] / 255, g = d[i+1] / 255, b = d[i+2] / 255;
      /* Cb/Cr chroma — scaled to fit radius */
      const u = (-0.147 * r - 0.289 * g + 0.436 * b);
      const v = ( 0.615 * r - 0.515 * g - 0.1  * b);
      const px = cx + u * radius * 2.2;
      const py = cy - v * radius * 2.2;
      if (px < cx - radius || px > cx + radius || py < cy - radius || py > cy + radius) continue;
      ctx.fillStyle = `rgb(${d[i]},${d[i+1]},${d[i+2]})`;
      ctx.fillRect(px, py, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;

    /* label */
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.font = '8px Orbitron,monospace';
    ctx.fillText('VECTORSCOPE', cx - radius, cy + radius + 12);
  }

  /* ════════════════════════════════════════════════════════════
     RENDER LOOP
     ════════════════════════════════════════════════════════════ */
  let mainCanvas, scopeCanvas;

  function scheduleRender() {
    if (ST.processPending) return;
    ST.processPending = true;
    requestAnimationFrame(doRender);
  }

  function doRender() {
    ST.processPending = false;
    if (!ST.prevCanvas) return;

    /* grade the preview */
    const pCtx = ST.prevCanvas.getContext('2d');
    const srcData = pCtx.getImageData(0, 0, ST.prevW, ST.prevH);
    const graded  = applyGrade(srcData);

    /* paint to main canvas */
    const mCtx = mainCanvas.getContext('2d');
    const mW = mainCanvas.width, mH = mainCanvas.height;

    if (ST.compareMode === 'before') {
      mCtx.putImageData(srcData, 0, 0);
    } else if (ST.compareMode === 'split') {
      mCtx.putImageData(graded, 0, 0);
      const splitX = Math.round(ST.splitPos * mW);
      mCtx.save();
      mCtx.beginPath(); mCtx.rect(0, 0, splitX, mH);
      mCtx.clip();
      mCtx.putImageData(srcData, 0, 0);
      mCtx.restore();
    } else {
      mCtx.putImageData(graded, 0, 0);
    }

    /* scopes */
    const sCtx = scopeCanvas.getContext('2d');
    if (ST.scopeMode === 'histogram')   drawHistogram(sCtx, graded);
    else if (ST.scopeMode === 'parade') drawRGBParade(sCtx, graded);
    else                                drawVectorscope(sCtx, graded);
  }

  /* ════════════════════════════════════════════════════════════
     IMAGE LOADING
     ════════════════════════════════════════════════════════════ */
  function loadImage(src) {
    const img = new Image();
    img.onload = () => {
      const MAX = 1200;
      const scale = Math.min(1, MAX / img.naturalWidth, MAX / img.naturalHeight);
      ST.prevW = Math.round(img.naturalWidth  * scale);
      ST.prevH = Math.round(img.naturalHeight * scale);

      /* downscaled source canvas (permanent, never graded) */
      ST.prevCanvas = document.createElement('canvas');
      ST.prevCanvas.width  = ST.prevW;
      ST.prevCanvas.height = ST.prevH;
      ST.prevCanvas.getContext('2d').drawImage(img, 0, 0, ST.prevW, ST.prevH);

      /* store original img element for full-res export */
      ST.originalImg = img;

      /* size the main display canvas to match */
      mainCanvas.width  = ST.prevW;
      mainCanvas.height = ST.prevH;

      /* size scope canvas — fixed size avoids issues when tab is hidden */
      scopeCanvas.width  = 600;
      scopeCanvas.height = 180;

      /* update file-info label */
      const fi = document.getElementById('cg-file-info');
      if (fi) fi.textContent = `${img.naturalWidth} \u00d7 ${img.naturalHeight}`;

      /* reset state and render */
      ST.zoom = 1.0; ST.panX = 0; ST.panY = 0; applyZoom();
      resetGrade();
      showWorkspace();
    };
    img.src = src;
  }

  /* ════════════════════════════════════════════════════════════
     GRADE RESET & HISTORY
     ════════════════════════════════════════════════════════════ */
  function resetGrade() {
    const zero = { x: 0, y: 0, str: 0 };
    ST.wheels = {
      lift:   { ...zero }, gamma: { ...zero },
      gain:   { ...zero }, offset:{ ...zero },
    };
    ST.tone = { contrast:0, saturation:0, temperature:0, tint:0, exposure:0, shadows:0, highlights:0, vibrance:0 };
    ST.compareMode = 'off'; ST.splitPos = 0.5;
    ST.activePreset = null;

    syncWheelPointers();
    syncToneSliders();
    syncCompareBtns();
    highlightPreset(null);
    saveHistory();
    scheduleRender();
  }

  function saveHistory() {
    const snap = {
      wheels: JSON.parse(JSON.stringify(ST.wheels)),
      tone:   JSON.parse(JSON.stringify(ST.tone)),
    };
    ST.history = ST.history.slice(0, ST.histIdx + 1);
    ST.history.push(snap);
    if (ST.history.length > 30) ST.history.shift();
    ST.histIdx = ST.history.length - 1;
    updateUndoRedo();
  }

  function undo() {
    if (ST.histIdx <= 0) return;
    ST.histIdx--;
    restoreHistory(ST.histIdx);
  }
  function redo() {
    if (ST.histIdx >= ST.history.length - 1) return;
    ST.histIdx++;
    restoreHistory(ST.histIdx);
  }
  function restoreHistory(idx) {
    const snap = ST.history[idx];
    if (!snap) return;
    ST.wheels = JSON.parse(JSON.stringify(snap.wheels));
    ST.tone   = JSON.parse(JSON.stringify(snap.tone));
    syncWheelPointers(); syncToneSliders();
    updateUndoRedo();
    scheduleRender();
  }

  /* ════════════════════════════════════════════════════════════
     UI SYNC HELPERS
     ════════════════════════════════════════════════════════════ */
  function syncWheelPointers() {
    ['lift','gamma','gain','offset'].forEach(key => {
      const disc = document.getElementById(`cg-disc-${key}`);
      const ptr  = document.getElementById(`cg-ptr-${key}`);
      const sld  = document.getElementById(`cg-str-${key}`);
      const val  = document.getElementById(`cg-strval-${key}`);
      if (!disc || !ptr) return;
      const w = ST.wheels[key];
      const rad = disc.offsetWidth / 2;
      ptr.style.left = `${50 + w.x * 50}%`;
      ptr.style.top  = `${50 + w.y * 50}%`;
      const [r,g,b] = wheelTint(w.x, w.y);
      const dist = Math.sqrt(w.x*w.x + w.y*w.y);
      ptr.style.background = dist < 0.02
        ? 'rgba(255,255,255,0.5)'
        : `rgb(${r*255|0},${g*255|0},${b*255|0})`;
      if (sld) { sld.value = w.str * 100; }
      if (val) { val.textContent = Math.round(w.str * 100); }
    });
  }

  function syncToneSliders() {
    const map = {
      'cg-tone-contrast':    ['contrast',    -1, 1],
      'cg-tone-saturation':  ['saturation',  -1, 1],
      'cg-tone-temperature': ['temperature', -1, 1],
      'cg-tone-tint':        ['tint',        -1, 1],
      'cg-tone-exposure':    ['exposure',    -2, 2],
      'cg-tone-shadows':     ['shadows',     -1, 1],
      'cg-tone-highlights':  ['highlights',  -1, 1],
      'cg-tone-vibrance':    ['vibrance',    -1, 1],
    };
    Object.entries(map).forEach(([id, [key]]) => {
      const el = document.getElementById(id);
      const vl = document.getElementById(id + '-val');
      if (el) el.value = ST.tone[key] * (key === 'exposure' ? 50 : 100);
      if (vl) vl.textContent = (ST.tone[key] > 0 ? '+' : '') + Math.round(ST.tone[key] * 100);
    });
  }

  function syncCompareBtns() {
    ['cg-btn-split', 'cg-btn-before'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.toggle('on', el.id.includes(ST.compareMode));
    });
    const isSplit = ST.compareMode === 'split';
    const wrap = document.getElementById('cg-split-wrap');
    if (wrap) wrap.classList.toggle('active', isSplit);
    /* show / hide before-after labels */
    const lbB = document.getElementById('cg-lbl-before');
    const lbA = document.getElementById('cg-lbl-after');
    if (lbB) lbB.style.display = isSplit ? '' : 'none';
    if (lbA) lbA.style.display = isSplit ? '' : 'none';
    /* hint: show when split is on but no grade has been applied */
    const hint = document.getElementById('cg-split-hint');
    if (hint) {
      const hasGrade = Object.values(ST.wheels).some(w => w.str > 0.01) ||
                       Object.values(ST.tone).some(v => Math.abs(v) > 0.01);
      hint.classList.toggle('show', isSplit && !hasGrade);
    }
  }

  function updateUndoRedo() {
    const u = document.getElementById('cg-undo-btn');
    const r = document.getElementById('cg-redo-btn');
    if (u) u.disabled = ST.histIdx <= 0;
    if (r) r.disabled = ST.histIdx >= ST.history.length - 1;
  }

  function highlightPreset(key) {
    document.querySelectorAll('.cg-preset-card').forEach(c => {
      c.classList.toggle('active', c.dataset.preset === key);
    });
  }

  /* ════════════════════════════════════════════════════════════
     WHEEL DRAG INTERACTION
     ════════════════════════════════════════════════════════════ */
  function setupWheel(key) {
    const disc = document.getElementById(`cg-disc-${key}`);
    if (!disc) return;
    disc.addEventListener('pointerdown', e => {
      ST.dragWheel = key;
      disc.setPointerCapture(e.pointerId);
      moveWheel(disc, key, e);
      e.preventDefault();
    });
    disc.addEventListener('pointermove', e => {
      if (ST.dragWheel !== key) return;
      moveWheel(disc, key, e);
    });
    disc.addEventListener('pointerup',    () => { if (ST.dragWheel === key) { ST.dragWheel = null; saveHistory(); } });
    disc.addEventListener('pointercancel', () => { ST.dragWheel = null; });

    /* double-click to reset wheel */
    disc.addEventListener('dblclick', () => {
      ST.wheels[key] = { x: 0, y: 0, str: ST.wheels[key].str };
      syncWheelPointers(); scheduleRender();
    });
  }

  function moveWheel(disc, key, e) {
    const rect = disc.getBoundingClientRect();
    const cx = rect.left + rect.width  / 2;
    const cy = rect.top  + rect.height / 2;
    const radius = rect.width / 2;
    let dx = (e.clientX - cx) / radius;
    let dy = (e.clientY - cy) / radius;
    const d = Math.sqrt(dx*dx + dy*dy);
    if (d > 1) { dx /= d; dy /= d; }
    ST.wheels[key].x = dx;
    ST.wheels[key].y = dy;
    syncWheelPointers();
    scheduleRender();
  }

  /* ════════════════════════════════════════════════════════════
     TONE SLIDER WIRING
     ════════════════════════════════════════════════════════════ */
  function setupToneSlider(id, key, scale) {
    const el = document.getElementById(id);
    const vl = document.getElementById(id + '-val');
    if (!el) return;
    el.addEventListener('input', () => {
      ST.tone[key] = parseFloat(el.value) / scale;
      if (vl) vl.textContent = (ST.tone[key] > 0 ? '+' : '') + Math.round(ST.tone[key] * 100);
      scheduleRender();
    });
    el.addEventListener('change', saveHistory);
  }

  /* ════════════════════════════════════════════════════════════
     PRESET APPLICATION
     ════════════════════════════════════════════════════════════ */
  function applyPreset(key) {
    const p = PRESETS[key];
    if (!p) return;
    Object.keys(ST.wheels).forEach(w => { ST.wheels[w] = { ...p.wheels[w] }; });
    Object.keys(ST.tone).forEach(k => { ST.tone[k] = p.tone[k] ?? 0; });
    ST.activePreset = key;
    syncWheelPointers(); syncToneSliders(); highlightPreset(key);
    saveHistory(); scheduleRender();
  }

  /* ════════════════════════════════════════════════════════════
     EXPORT (full resolution)
     ════════════════════════════════════════════════════════════ */
  async function exportGraded() {
    if (!ST.originalImg) return;
    const btn = document.getElementById('cg-btn-export');
    if (btn) btn.textContent = 'Processing…';

    const w = ST.originalImg.naturalWidth, h = ST.originalImg.naturalHeight;
    const offscreen = document.createElement('canvas');
    offscreen.width = w; offscreen.height = h;
    offscreen.getContext('2d').drawImage(ST.originalImg, 0, 0);
    const full = offscreen.getContext('2d').getImageData(0, 0, w, h);

    /* use a Web Worker for heavy exports (>3MP) */
    if (w * h > 3_000_000) {
      await new Promise(r => setTimeout(r, 0)); // yield to paint
    }

    const graded = applyGrade(full);
    offscreen.getContext('2d').putImageData(graded, 0, 0);

    const link = document.createElement('a');
    link.download = 'chromaiq-graded.png';
    link.href = offscreen.toDataURL('image/png');
    link.click();
    if (btn) btn.innerHTML = '<i class="fa-solid fa-download"></i> Export';
  }

  /* ════════════════════════════════════════════════════════════
     SHOW / HIDE WORKSPACE
     ════════════════════════════════════════════════════════════ */
  function showWorkspace() {
    document.getElementById('cg-upload-step')?.style.setProperty('display','none');
    const ws = document.getElementById('cg-workspace');
    if (ws) { ws.style.display = 'block'; }
    scheduleRender();
  }

  /* ════════════════════════════════════════════════════════════
     BUILD PRESET CARDS (after image is loaded, use first frame as thumbnail)
     ════════════════════════════════════════════════════════════ */
  function buildPresetCards() {
    const bar = document.getElementById('cg-presets-scroll');
    if (!bar) return;
    bar.innerHTML = '';
    Object.entries(PRESETS).forEach(([key, p]) => {
      const card = document.createElement('div');
      card.className = 'cg-preset-card'; card.dataset.preset = key;

      /* generate a thumbnail preview sized to match the card (2x for crispness) */
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 256; thumbCanvas.height = 184;
      const thumbCtx = thumbCanvas.getContext('2d');
      thumbCtx.drawImage(ST.prevCanvas, 0, 0, ST.prevW, ST.prevH, 0, 0, 256, 184);

      /* apply preset to thumbnail */
      const saved = JSON.parse(JSON.stringify({ w: ST.wheels, t: ST.tone }));
      Object.keys(ST.wheels).forEach(w => { ST.wheels[w] = { ...p.wheels[w] }; });
      Object.keys(ST.tone).forEach(k => { ST.tone[k] = p.tone[k] ?? 0; });
      const tData = thumbCtx.getImageData(0, 0, 256, 184);
      const tGraded = applyGrade(tData);
      thumbCtx.putImageData(tGraded, 0, 0);
      ST.wheels = saved.w; ST.tone = saved.t;

      const img = document.createElement('img');
      img.src = thumbCanvas.toDataURL('image/jpeg', 0.6);

      const swatch = document.createElement('div'); swatch.className = 'cg-preset-swatch';
      swatch.appendChild(img);
      const check = document.createElement('div'); check.className = 'cg-preset-check'; check.textContent = '✓';
      const label = document.createElement('div');
      label.className = 'cg-preset-name';
      label.textContent = p.label;

      card.appendChild(swatch); card.appendChild(check); card.appendChild(label);
      card.addEventListener('click', () => applyPreset(key));
      bar.appendChild(card);
    });

    /* Reset card */
    const reset = document.createElement('div');
    reset.className = 'cg-preset-card';
    const rs = document.createElement('div');
    rs.className = 'cg-preset-swatch';
    rs.style.cssText = 'background:rgba(239,68,68,0.08);display:flex;align-items:center;justify-content:center;font-size:22px;';
    rs.textContent = '↺';
    const rl = document.createElement('div'); rl.className = 'cg-preset-name'; rl.textContent = 'Reset';
    reset.appendChild(rs); reset.appendChild(rl);
    reset.addEventListener('click', resetGrade);
    bar.appendChild(reset);

    updatePresetsNav();
  }

  /* ════════════════════════════════════════════════════════════
     PRESETS CAROUSEL NAV (prev/next arrows + edge fade masks)
     Scales to any number of presets — arrows appear only when the
     strip actually overflows, and hide again at each scroll end.
     ════════════════════════════════════════════════════════════ */
  function updatePresetsNav() {
    const scroll = document.getElementById('cg-presets-scroll');
    const wrap = document.getElementById('cg-presets-wrap');
    const prevBtn = document.getElementById('cg-presets-prev');
    const nextBtn = document.getElementById('cg-presets-next');
    if (!scroll || !wrap || !prevBtn || !nextBtn) return;

    const cards = scroll.querySelectorAll('.cg-preset-card');
    if (!cards.length) {
      prevBtn.classList.add('is-hidden');
      nextBtn.classList.add('is-hidden');
      wrap.classList.remove('can-scroll-prev', 'can-scroll-next');
      return;
    }

    /* Checked via actual rendered position (getBoundingClientRect), not
       scrollLeft arithmetic — some browsers use a negative scrollLeft
       range in RTL, which silently breaks a 0..max assumption. Comparing
       real box positions has no such sign dependency in either direction. */
    const scrollRect = scroll.getBoundingClientRect();
    const firstRect = cards[0].getBoundingClientRect();
    const lastRect = cards[cards.length - 1].getBoundingClientRect();
    const TOL = 2;
    const atStart = firstRect.left >= scrollRect.left - TOL && firstRect.right <= scrollRect.right + TOL;
    const atEnd = lastRect.left >= scrollRect.left - TOL && lastRect.right <= scrollRect.right + TOL;
    const overflows = !(atStart && atEnd);

    prevBtn.classList.toggle('is-hidden', !overflows || atStart);
    nextBtn.classList.toggle('is-hidden', !overflows || atEnd);
    wrap.classList.toggle('can-scroll-prev', overflows && !atStart);
    wrap.classList.toggle('can-scroll-next', overflows && !atEnd);
  }

  function setupPresetsNav() {
    const scroll = document.getElementById('cg-presets-scroll');
    const prevBtn = document.getElementById('cg-presets-prev');
    const nextBtn = document.getElementById('cg-presets-next');
    if (!scroll || !prevBtn || !nextBtn) {
      console.warn('[ChromaGrading] presets nav setup skipped — missing element(s):',
        { scroll: !!scroll, prevBtn: !!prevBtn, nextBtn: !!nextBtn });
      return;
    }

    /* Scrolls by targeting an actual card element with scrollIntoView
       instead of scrollBy(scrollLeft ± delta). scrollLeft's sign in
       RTL has historically differed across browsers, but
       scrollIntoView's `inline` alignment is direction-aware by spec,
       so this works correctly regardless of ltr/rtl or which browser. */
    function step(dir) { // dir: 'prev' or 'next'
      const cards = Array.from(scroll.querySelectorAll('.cg-preset-card'));
      if (!cards.length) return;

      const scrollRect = scroll.getBoundingClientRect();
      const cardWidth = cards[0].getBoundingClientRect().width || 128;
      const perView = Math.max(1, Math.floor(scroll.clientWidth / (cardWidth + 12)));

      // index of the card currently nearest the reading-start edge of the viewport
      let currentIndex = cards.findIndex(c => {
        const r = c.getBoundingClientRect();
        return r.right > scrollRect.left + 1 && r.left < scrollRect.right - 1;
      });
      if (currentIndex === -1) currentIndex = 0;

      const targetIndex = dir === 'next'
        ? Math.min(cards.length - 1, currentIndex + perView)
        : Math.max(0, currentIndex - perView);

      console.log('[ChromaGrading] presets', dir, 'clicked → scrolling to card index', targetIndex, 'of', cards.length);
      cards[targetIndex].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }

    prevBtn.addEventListener('click', () => step('prev'));
    nextBtn.addEventListener('click', () => step('next'));

    scroll.addEventListener('scroll', () => updatePresetsNav(), { passive: true });
    window.addEventListener('resize', () => updatePresetsNav());
    console.log('[ChromaGrading] presets nav wired successfully ✓');
  }

  /* ════════════════════════════════════════════════════════════
     SPLIT-VIEW DRAG
     ════════════════════════════════════════════════════════════ */
  function setupSplitDrag() {
    const wrap = document.getElementById('cg-split-wrap');
    const line = document.getElementById('cg-split-line');
    const knob = document.getElementById('cg-split-knob');
    if (!wrap || !knob) return;

    let dragging = false;
    knob.addEventListener('pointerdown', e => { dragging = true; knob.setPointerCapture(e.pointerId); e.preventDefault(); });
    wrap.addEventListener('pointermove', e => {
      if (!dragging) return;
      const rect = mainCanvas.getBoundingClientRect();
      ST.splitPos = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
      const pct = ST.splitPos * 100 + '%';
      if (line) line.style.left = pct;
      if (knob) knob.style.left = pct;
      scheduleRender();
    });
    wrap.addEventListener('pointerup', () => { dragging = false; });
  }


  /* ════════════════════════════════════════════════════════════
     ZOOM + PAN  (Photoshop / Lightroom style)
     ════════════════════════════════════════════════════════════ */
  const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];

  /* Apply current zoom+pan to the canvas-wrap element */
  function applyZoom() {
    const wrap  = document.querySelector('.cg-canvas-wrap');
    const outer = document.querySelector('.cg-canvas-outer');
    if (wrap) {
      wrap.style.transform       = `translate(${ST.panX}px, ${ST.panY}px) scale(${ST.zoom})`;
      wrap.style.transformOrigin = 'center center';
    }
    if (outer) {
      /* touch-action:none prevents page-scroll interfering with pan/pinch */
      outer.style.touchAction = ST.zoom > 1.0 ? 'none' : 'auto';
      if (!ST.isPanning) outer.style.cursor = ST.zoom > 1.0 ? 'grab' : 'default';
    }
    const val = document.getElementById('cg-zoom-val');
    if (val) val.textContent = Math.round(ST.zoom * 100) + '%';
  }

  /* Clamp pan so image never drifts fully off-screen */
  function clampPan() {
    const outer = document.querySelector('.cg-canvas-outer');
    if (!outer || !mainCanvas) { ST.panX = 0; ST.panY = 0; return; }
    const outerW = outer.clientWidth;
    const outerH = outer.clientHeight;
    /* canvas display size BEFORE zoom */
    const cssW = mainCanvas.offsetWidth  || ST.prevW;
    const cssH = mainCanvas.offsetHeight || ST.prevH;
    /* how far can we pan before the image edge hits the viewport edge */
    const maxX = Math.max(0, (cssW  * ST.zoom - outerW) / 2);
    const maxY = Math.max(0, (cssH  * ST.zoom - outerH) / 2);
    ST.panX = Math.max(-maxX, Math.min(maxX, ST.panX));
    ST.panY = Math.max(-maxY, Math.min(maxY, ST.panY));
  }

  function zoomIn() {
    const next = ZOOM_STEPS.find(s => s > ST.zoom + 0.01);
    if (next) { ST.zoom = next; clampPan(); applyZoom(); }
  }

  function zoomOut() {
    const prev = [...ZOOM_STEPS].reverse().find(s => s < ST.zoom - 0.01);
    if (prev) {
      ST.zoom = prev;
      if (ST.zoom <= 1.0) { ST.panX = 0; ST.panY = 0; }
      else clampPan();
      applyZoom();
    }
  }

  /* ── Photoshop + Lightroom style: Pan (drag) + Pinch-to-Zoom ── */
  function setupPan() {
    const outer = document.querySelector('.cg-canvas-outer');
    if (!outer) return;

    /* active pointer tracking (supports multi-touch) */
    const ptrs = new Map();   // pointerId → {x, y}
    let lastPinchDist = 0;
    let lastPinchZoom = 1;
    let startClientX = 0, startClientY = 0;
    let startPanX    = 0, startPanY    = 0;

    /* ── Smooth pinch-zoom (continuous, not discrete steps) ── */
    function getPinchDist() {
      const pts = [...ptrs.values()];
      return Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    }

    /* ── Double-tap to reset zoom ── */
    let lastTap = 0;
    outer.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      outer.setPointerCapture(e.pointerId);
      e.preventDefault();

      if (ptrs.size === 1) {
        /* Single touch / mouse — check double-tap */
        const now = Date.now();
        if (now - lastTap < 300) {
          /* Double-tap: toggle 100% ↔ 200% */
          ST.zoom   = ST.zoom > 1.0 ? 1.0 : 2.0;
          ST.panX   = 0; ST.panY = 0;
          clampPan(); applyZoom();
          lastTap = 0; return;
        }
        lastTap = now;

        /* Start pan (single finger/mouse) */
        if (!ST.prevCanvas) return;
        ST.isPanning  = true;
        startClientX  = e.clientX; startClientY = e.clientY;
        startPanX     = ST.panX;   startPanY    = ST.panY;
        if (ST.zoom > 1.0) outer.style.cursor = 'grabbing';

      } else if (ptrs.size === 2) {
        /* Second touch — switch to pinch mode */
        ST.isPanning  = false;
        lastPinchDist = getPinchDist();
        lastPinchZoom = ST.zoom;
        outer.style.cursor = 'zoom-in';
      }
    });

    outer.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (ptrs.size === 2) {
        /* ── PINCH TO ZOOM ── */
        const dist = getPinchDist();
        if (lastPinchDist > 0) {
          const newZoom = Math.max(0.25, Math.min(4.0, lastPinchZoom * (dist / lastPinchDist)));
          ST.zoom = Math.round(newZoom * 100) / 100;  /* avoid float drift */
          if (ST.zoom <= 1.0) { ST.panX = 0; ST.panY = 0; }
          else clampPan();
          applyZoom();
        }
        return;
      }

      /* ── PAN (single touch / mouse drag) ── */
      if (!ST.isPanning || ST.zoom <= 1.0) return;
      ST.panX = startPanX + (e.clientX - startClientX);
      ST.panY = startPanY + (e.clientY - startClientY);
      clampPan();
      applyZoom();
    });

    ['pointerup', 'pointercancel'].forEach(evt =>
      outer.addEventListener(evt, e => {
        ptrs.delete(e.pointerId);
        if (ptrs.size < 2) {
          lastPinchDist = 0;
          /* snap to nearest zoom step after pinch ends */
          if (!ST.isPanning) {
            const nearest = ZOOM_STEPS.reduce((a, b) =>
              Math.abs(b - ST.zoom) < Math.abs(a - ST.zoom) ? b : a);
            ST.zoom = nearest;
            if (ST.zoom <= 1.0) { ST.panX = 0; ST.panY = 0; }
            else clampPan();
            applyZoom();
          }
        }
        if (ptrs.size === 0) {
          ST.isPanning = false;
          outer.style.cursor = ST.zoom > 1.0 ? 'grab' : 'default';
        }
      })
    );
  }

  /* ════════════════════════════════════════════════════════════
     INIT
     ════════════════════════════════════════════════════════════ */
  function init() {
    /* Wired first and independently — this only needs the static
       prev/next buttons + scroll strip, not the canvas, so it must
       never be skipped by an early return further down. */
    try { setupPresetsNav(); } catch (err) { console.error('[ChromaGrading] setupPresetsNav failed:', err); }

    mainCanvas  = document.getElementById('cg-main-canvas');
    scopeCanvas = document.getElementById('cg-scope-canvas');
    if (!mainCanvas || !scopeCanvas) return;

    /* ── File upload wiring ──────────────────────────────── */
    const dropZone = document.getElementById('cg-drop-zone');
    const fileInput = document.getElementById('cg-file-input');

    if (dropZone && fileInput) {
      dropZone.addEventListener('click',     () => fileInput.click());
      dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
      dropZone.addEventListener('drop', e => {
        e.preventDefault(); dropZone.classList.remove('drag-over');
        const f = e.dataTransfer.files[0];
        if (f && f.type.startsWith('image/')) handleFile(f);
      });
      fileInput.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) handleFile(f);
        e.target.value = '';
      });
    }

    /* handle paste */
    document.addEventListener('paste', e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) { handleFile(item.getAsFile()); break; }
      }
    });

    /* ── Wheels ───────────────────────────────────────────── */
    ['lift','gamma','gain','offset'].forEach(key => {
      setupWheel(key);
      const sld = document.getElementById(`cg-str-${key}`);
      const val = document.getElementById(`cg-strval-${key}`);
      if (sld) {
        sld.addEventListener('input', () => {
          ST.wheels[key].str = parseInt(sld.value) / 100;
          if (val) val.textContent = sld.value;
          scheduleRender();
        });
        sld.addEventListener('change', saveHistory);
      }
    });

    /* ── Tone sliders ─────────────────────────────────────── */
    setupToneSlider('cg-tone-contrast',    'contrast',    100);
    setupToneSlider('cg-tone-saturation',  'saturation',  100);
    setupToneSlider('cg-tone-temperature', 'temperature', 100);
    setupToneSlider('cg-tone-tint',        'tint',        100);
    setupToneSlider('cg-tone-exposure',    'exposure',     50);
    setupToneSlider('cg-tone-shadows',     'shadows',     100);
    setupToneSlider('cg-tone-highlights',  'highlights',  100);
    setupToneSlider('cg-tone-vibrance',    'vibrance',    100);

    /* ── Compare buttons ──────────────────────────────────── */
    document.getElementById('cg-btn-split')?.addEventListener('click', () => {
      ST.compareMode = ST.compareMode === 'split' ? 'off' : 'split';
      syncCompareBtns(); scheduleRender();
    });
    document.getElementById('cg-btn-before')?.addEventListener('click', () => {
      ST.compareMode = ST.compareMode === 'before' ? 'off' : 'before';
      syncCompareBtns(); scheduleRender();
    });

    /* ── Undo / redo ──────────────────────────────────────── */
    document.getElementById('cg-undo-btn')?.addEventListener('click', undo);
    document.getElementById('cg-redo-btn')?.addEventListener('click', redo);
    document.addEventListener('keydown', e => {
      if (!ST.prevCanvas) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { undo(); e.preventDefault(); }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { redo(); e.preventDefault(); }
    });

    /* ── Export ───────────────────────────────────────────── */
    document.getElementById('cg-btn-export')?.addEventListener('click', exportGraded);

    /* ── New image ────────────────────────────────────────── */
    document.getElementById('cg-btn-new')?.addEventListener('click', () => {
      ST.prevCanvas = null;
      document.getElementById('cg-workspace').style.display = 'none';
      document.getElementById('cg-upload-step').style.display = '';
    });

    /* ── Reset all ────────────────────────────────────────── */
    document.getElementById('cg-reset-all')?.addEventListener('click', resetGrade);

    /* ── Scopes ───────────────────────────────────────────── */
    document.querySelectorAll('.cg-scope-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        ST.scopeMode = btn.dataset.scope;
        document.querySelectorAll('.cg-scope-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        scheduleRender();
      });
    });

    /* ── Zoom + Pan ──────────────────────────────────────────── */
    document.getElementById('cg-zoom-in')?.addEventListener('click', zoomIn);
    document.getElementById('cg-zoom-out')?.addEventListener('click', zoomOut);
    setupPan();
    /* Mouse wheel zoom on canvas */
    document.getElementById('cg-main-canvas')?.addEventListener('wheel', e => {
      e.preventDefault();
      e.deltaY < 0 ? zoomIn() : zoomOut();
    }, { passive: false });

    /* ── Split drag ───────────────────────────────────────── */
    setupSplitDrag();

    updateUndoRedo();
  }

  /* ── File handler ────────────────────────────────────────── */
  function handleFile(file) {
    if (file.name && window.RawPreview?.isRawExtension(file)) {
      window.RawPreview.extract(file).then(r => { loadImage(r.dataURL); buildPresetCards(); }).catch(() => {});
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      loadImage(e.target.result);
      /* short delay to allow canvas sizing before building thumbnails */
      setTimeout(buildPresetCards, 100);
    };
    reader.readAsDataURL(file);
  }

  /* ── Public API ──────────────────────────────────────────── */
  window.ChromaGrading = { init, loadImage, applyPreset, resetGrade, updatePresetsNav };

})(window);
