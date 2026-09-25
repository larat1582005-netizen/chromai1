/* ════════════════════════════════════════════════════════════════
   ChromaIQ — Reusable Crop Tool (crop-tool.js)
   ════════════════════════════════════════════════════════════════
   A dependency-free, Promise-based crop modal used across Object
   Remover, Sticker Maker, and Image Enhancer. Operates at full
   image resolution (not display resolution) so exported crops stay
   sharp regardless of screen size.

   Usage:
     ChromaCrop.open(srcDataURL).then(result => {
       if (!result) return; // user cancelled
       // result = { dataURL, sx, sy, sw, sh, sourceW, sourceH }
       // dataURL is the cropped PNG, ready to use directly.
     });
   ════════════════════════════════════════════════════════════════ */

(function (window) {
  'use strict';

  const ASPECTS = [
    { id: 'free', labelKey: 'cropTool.free',    ratio: null },
    { id: '1x1',  labelKey: 'cropTool.square',  ratio: 1 },
    { id: '4x5',  labelKey: 'cropTool.portrait',ratio: 4 / 5 },
    { id: '9x16', labelKey: 'cropTool.story',   ratio: 9 / 16 },
    { id: '4x3',  labelKey: 'cropTool.classic', ratio: 4 / 3 },
    { id: '16x9', labelKey: 'cropTool.wide',    ratio: 16 / 9 },
    { id: '4x6',  labelKey: 'cropTool.print',   ratio: 4 / 6 },
  ];

  const MIN_BOX_PX = 40; // minimum crop box size on screen, in display pixels

  let modal, stage, imgEl, boxEl, maskTop, maskBottom, maskLeft, maskRight;
  let aspectRow, applyBtn, cancelBtn, dimsLabel;
  let resolveFn = null;
  let natW = 0, natH = 0;      // natural (full) image pixel dimensions
  let dispW = 0, dispH = 0;    // displayed (on-screen) image dimensions
  let box = { x: 0, y: 0, w: 0, h: 0 }; // crop box in DISPLAY coordinates
  let activeRatio = null;
  let drag = null; // { mode, startX, startY, startBox }

  function t(key, fallback) {
    return (window.i18n && window.i18n.t) ? window.i18n.t(key) : fallback;
  }

  function buildModalIfNeeded() {
    if (document.getElementById('chroma-crop-modal')) {
      cacheRefs();
      return;
    }
    const div = document.createElement('div');
    div.innerHTML = `
      <div class="crop-modal" id="chroma-crop-modal">
        <div class="crop-modal-inner">
          <div class="crop-modal-header">
            <h3 data-i18n="cropTool.title">Crop Image</h3>
            <button class="crop-close-btn" id="crop-close-btn" aria-label="Close" data-i18n-aria="accessibility.closeModal">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>

          <div class="crop-aspect-row" id="crop-aspect-row"></div>

          <div class="crop-stage" id="crop-stage">
            <img id="crop-img" alt="" draggable="false">
            <div class="crop-mask crop-mask-top"></div>
            <div class="crop-mask crop-mask-bottom"></div>
            <div class="crop-mask crop-mask-left"></div>
            <div class="crop-mask crop-mask-right"></div>
            <div class="crop-box" id="crop-box">
              <div class="crop-grid-line crop-grid-v1"></div>
              <div class="crop-grid-line crop-grid-v2"></div>
              <div class="crop-grid-line crop-grid-h1"></div>
              <div class="crop-grid-line crop-grid-h2"></div>
              <div class="crop-handle crop-h-nw" data-mode="nw"></div>
              <div class="crop-handle crop-h-ne" data-mode="ne"></div>
              <div class="crop-handle crop-h-sw" data-mode="sw"></div>
              <div class="crop-handle crop-h-se" data-mode="se"></div>
              <div class="crop-handle crop-h-n"  data-mode="n"></div>
              <div class="crop-handle crop-h-s"  data-mode="s"></div>
              <div class="crop-handle crop-h-e"  data-mode="e"></div>
              <div class="crop-handle crop-h-w"  data-mode="w"></div>
            </div>
          </div>

          <div class="crop-footer">
            <span class="crop-dims" id="crop-dims-label">— × —</span>
            <div class="crop-footer-btns">
              <button class="btn-preset" id="crop-cancel-btn" data-i18n="common.cancel">Cancel</button>
              <button class="btn-remove" id="crop-apply-btn"><i class="fa-solid fa-crop-simple"></i> <span data-i18n="cropTool.apply">Apply Crop</span></button>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(div.firstElementChild);
    cacheRefs();
    buildAspectButtons();
    wireEvents();
  }

  function cacheRefs() {
    modal       = document.getElementById('chroma-crop-modal');
    stage       = document.getElementById('crop-stage');
    imgEl       = document.getElementById('crop-img');
    boxEl       = document.getElementById('crop-box');
    maskTop     = stage.querySelector('.crop-mask-top');
    maskBottom  = stage.querySelector('.crop-mask-bottom');
    maskLeft    = stage.querySelector('.crop-mask-left');
    maskRight   = stage.querySelector('.crop-mask-right');
    aspectRow   = document.getElementById('crop-aspect-row');
    applyBtn    = document.getElementById('crop-apply-btn');
    cancelBtn   = document.getElementById('crop-cancel-btn');
    dimsLabel   = document.getElementById('crop-dims-label');
  }

  function buildAspectButtons() {
    aspectRow.innerHTML = '';
    ASPECTS.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.className = 'crop-aspect-btn' + (i === 0 ? ' active' : '');
      btn.dataset.id = a.id;
      btn.setAttribute('data-i18n', a.labelKey);
      btn.textContent = t(a.labelKey, a.id);
      btn.addEventListener('click', () => selectAspect(a));
      aspectRow.appendChild(btn);
    });
  }

  function selectAspect(a) {
    activeRatio = a.ratio;
    aspectRow.querySelectorAll('.crop-aspect-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.id === a.id));
    if (activeRatio) {
      const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
      let w = box.w, h = w / activeRatio;
      if (h > dispH) { h = dispH; w = h * activeRatio; }
      if (w > dispW) { w = dispW; h = w / activeRatio; }
      box = clampBox({ x: cx - w / 2, y: cy - h / 2, w, h });
      renderBox();
    }
  }

  function wireEvents() {
    document.getElementById('crop-close-btn').addEventListener('click', () => finish(null));
    cancelBtn.addEventListener('click', () => finish(null));
    applyBtn.addEventListener('click', applyCrop);
    modal.addEventListener('click', e => { if (e.target === modal) finish(null); });

    // [تعديل للموبايل]: منع المتصفح من سحب الصفحة وعمل سكرول عند تحريك صندوق القص
    boxEl.style.touchAction = 'none';

    boxEl.addEventListener('pointerdown', e => {
      const mode = e.target.dataset.mode || 'move';
      drag = { mode, startX: e.clientX, startY: e.clientY, startBox: { ...box } };
      e.target.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    
    window.addEventListener('pointermove', onDrag);
    window.addEventListener('pointerup', () => { drag = null; });
    
    // [تعديل للموبايل]: تصفير حالة السحب إذا تداخل نظام الهاتف (مثل الإيماءات الجانبية) لمنع تعليق الأداة
    window.addEventListener('pointercancel', () => { drag = null; }); 
  }

  function onDrag(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    let { x, y, w, h } = drag.startBox;

    if (drag.mode === 'move') {
      x += dx; y += dy;
    } else {
      if (drag.mode.includes('e')) w += dx;
      if (drag.mode.includes('s')) h += dy;
      if (drag.mode.includes('w')) { x += dx; w -= dx; }
      if (drag.mode.includes('n')) { y += dy; h -= dy; }

      if (activeRatio) {
        if (drag.mode === 'n' || drag.mode === 's') {
          w = h * activeRatio;
          x = drag.startBox.x + (drag.startBox.w - w) / 2;
        } else if (drag.mode === 'e' || drag.mode === 'w') {
          h = w / activeRatio;
          y = drag.startBox.y + (drag.startBox.h - h) / 2;
        } else {
          h = w / activeRatio;
          if (drag.mode.includes('n')) y = drag.startBox.y + drag.startBox.h - h;
        }
      }
    }

    if (w < MIN_BOX_PX) { if (drag.mode.includes('w')) x -= (MIN_BOX_PX - w); w = MIN_BOX_PX; }
    if (h < MIN_BOX_PX) { if (drag.mode.includes('n')) y -= (MIN_BOX_PX - h); h = MIN_BOX_PX; }

    box = clampBox({ x, y, w, h });
    renderBox();
  }

  function clampBox(b) {
    let { x, y, w, h } = b;
    w = Math.min(w, dispW);
    h = Math.min(h, dispH);
    x = Math.max(0, Math.min(x, dispW - w));
    y = Math.max(0, Math.min(y, dispH - h));
    return { x, y, w, h };
  }

  function renderBox() {
    boxEl.style.left   = box.x + 'px';
    boxEl.style.top    = box.y + 'px';
    boxEl.style.width  = box.w + 'px';
    boxEl.style.height = box.h + 'px';

    maskTop.style.height    = box.y + 'px';
    maskBottom.style.top    = (box.y + box.h) + 'px';
    maskBottom.style.height = (dispH - box.y - box.h) + 'px';
    maskLeft.style.top      = box.y + 'px';
    maskLeft.style.height   = box.h + 'px';
    maskLeft.style.width    = box.x + 'px';
    maskRight.style.top     = box.y + 'px';
    maskRight.style.height  = box.h + 'px';
    maskRight.style.left    = (box.x + box.w) + 'px';
    maskRight.style.width   = (dispW - box.x - box.w) + 'px';

    const scale = natW / dispW;
    const outW = Math.round(box.w * scale);
    const outH = Math.round(box.h * scale);
    dimsLabel.textContent = `${outW} \u00d7 ${outH}`;
  }

  function applyCrop() {
    const scale = natW / dispW;
    const sx = Math.round(box.x * scale);
    const sy = Math.round(box.y * scale);
    const sw = Math.round(box.w * scale);
    const sh = Math.round(box.h * scale);

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, sw, sh);

    finish({
      dataURL: canvas.toDataURL('image/png'),
      sx, sy, sw, sh,
      sourceW: natW, sourceH: natH,
    });
  }

  function finish(result) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    if (resolveFn) { resolveFn(result); resolveFn = null; }
  }

  function open(src, options = {}) {
    buildModalIfNeeded();
    if (window.i18n && window.i18n.translateDOM) window.i18n.translateDOM(modal);

    return new Promise(resolve => {
      resolveFn = resolve;
      activeRatio = null;
      aspectRow.querySelectorAll('.crop-aspect-btn').forEach((b, i) =>
        b.classList.toggle('active', i === 0));

      imgEl.onload = () => {
        natW = imgEl.naturalWidth;
        natH = imgEl.naturalHeight;

        const stageRect = stage.getBoundingClientRect();
        const maxW = stageRect.width  || 640;
        const maxH = Math.min(window.innerHeight * 0.55, 520);
        const fitScale = Math.min(maxW / natW, maxH / natH, 1);
        dispW = Math.round(natW * fitScale);
        dispH = Math.round(natH * fitScale);
        imgEl.style.width  = dispW + 'px';
        imgEl.style.height = dispH + 'px';
        stage.style.width  = dispW + 'px';
        stage.style.height = dispH + 'px';
        
        // [تعديل للموبايل]: إيقاف حركات السحب والإيماءات الافتراضية للمتصفح داخل مسرح القص بالكامل
        stage.style.touchAction = 'none'; 

        const initRatio = options.initialRatio || null;
        let w = dispW * 0.85, h = dispH * 0.85;
        if (initRatio) { h = w / initRatio; if (h > dispH * 0.9) { h = dispH * 0.9; w = h * initRatio; } }
        box = clampBox({ x: (dispW - w) / 2, y: (dispH - h) / 2, w, h });
        renderBox();

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
      };
      imgEl.src = src;
    });
  }

  window.ChromaCrop = { open };

})(window);
