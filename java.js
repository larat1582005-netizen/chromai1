
        /* ============================================================
           Existing Code: Color Grading & Harmony
           ============================================================ */
        function toggleLoader(show, text = i18n.t('common.processing')) {
            document.getElementById('spectrum-loader').style.display = show ? 'flex' : 'none';
            document.getElementById('loader-text').innerText = text;
        }
        function makeWheelInteractive(wheelId, pointerId, textId) {
            const wheel = document.getElementById(wheelId);
            const pointer = document.getElementById(pointerId);
            const textDisplay = document.getElementById(textId);
            let isDragging = false;
            function updatePointerPosition(e) {
                const rect = wheel.getBoundingClientRect();
                let clientX = e.touches ? e.touches[0].clientX : e.clientX;
                let clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;
                let x = clientX - centerX;
                let y = clientY - centerY;
                const radius = rect.width / 2;
                const distance = Math.sqrt(x*x + y*y);
                if (distance > radius) { x = (x / distance) * radius; y = (y / distance) * radius; }
                pointer.style.left = `${((x + radius) / (radius * 2)) * 100}%`;
                pointer.style.top = `${((y + radius) / (radius * 2)) * 100}%`;
                let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
                if (angle < 0) angle += 360;
                const saturation = (distance / radius) * 100;
                const lightness = 100 - (saturation / 2);
                const hexColor = hslToHex(angle, saturation, lightness);
                textDisplay.innerText = hexColor;
                textDisplay.style.color = hexColor;
            }
            wheel.addEventListener('mousedown', (e) => { isDragging = true; updatePointerPosition(e); });
            window.addEventListener('mousemove', (e) => { if(isDragging) updatePointerPosition(e); });
            window.addEventListener('mouseup', () => { isDragging = false; });
            wheel.addEventListener('touchstart', (e) => { isDragging = true; updatePointerPosition(e); }, {passive: false});
            window.addEventListener('touchmove', (e) => { if(isDragging) { e.preventDefault(); updatePointerPosition(e); } }, {passive: false});
            window.addEventListener('touchend', () => { isDragging = false; });
        }
        makeWheelInteractive('wheel-shadows', 'ptr-shadows', 'val-shadows');
        makeWheelInteractive('wheel-midtones', 'ptr-midtones', 'val-midtones');
        makeWheelInteractive('wheel-highlights', 'ptr-highlights', 'val-highlights');

        const imageInput = document.getElementById('image-input');
        const targetImage = document.getElementById('target-image');
        const imgPreviewWrapper = document.getElementById('img-preview-wrapper');

        function _loadGradingImage(srcDataURL) {
            targetImage.src = srcDataURL;
            imgPreviewWrapper.style.display = 'flex';
            targetImage.style.filter = 'none';
            targetImage.onload = () => {
                analyzeImageLuminance();
                SA.init(srcDataURL);
                Histogram.update(targetImage);
            };
        }

        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (RawPreview.isRawExtension(file)) {
                toggleLoader(true, i18n.t('rawSupport.extracting'));
                RawPreview.extract(file)
                    .then(r  => _loadGradingImage(r.dataURL))
                    .catch(() => { toggleLoader(false); alert(i18n.t('rawSupport.extractError')); });
                return;
            }
            const reader = new FileReader();
            toggleLoader(true, i18n.t('colorGrading.analyzingColors'));
            reader.onload = ev => _loadGradingImage(ev.target.result);
            reader.readAsDataURL(file);
        });

        /* Drag-and-drop on Color Grading upload zone */
        const gradDropZone = document.getElementById('drop-zone');
        if (gradDropZone) {
            gradDropZone.addEventListener('dragover', e => { e.preventDefault(); gradDropZone.classList.add('drag-over'); });
            gradDropZone.addEventListener('dragleave', () => gradDropZone.classList.remove('drag-over'));
            gradDropZone.addEventListener('drop', e => {
                e.preventDefault(); gradDropZone.classList.remove('drag-over');
                const f = e.dataTransfer.files[0];
                if (f) { const dt = new DataTransfer(); dt.items.add(f); imageInput.files = dt.files; imageInput.dispatchEvent(new Event('change')); }
            });
        }

        function analyzeImageLuminance() {
            const canvas = document.getElementById('analysis-canvas');
            const ctx = canvas.getContext('2d');
            const scaleWidth = 150;
            const scaleHeight = (targetImage.naturalHeight / targetImage.naturalWidth) * scaleWidth;
            canvas.width = scaleWidth; canvas.height = scaleHeight;
            ctx.drawImage(targetImage, 0, 0, scaleWidth, scaleHeight);
            try {
                const data = ctx.getImageData(0, 0, scaleWidth, scaleHeight).data;
                let s = { r: 0, g: 0, b: 0, c: 0 }, m = { r: 0, g: 0, b: 0, c: 0 }, h = { r: 0, g: 0, b: 0, c: 0 };
                for (let i = 0; i < data.length; i += 4) {
                    const lum = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
                    if (lum < 85) { s.r+=data[i]; s.g+=data[i+1]; s.b+=data[i+2]; s.c++; }
                    else if (lum <= 170) { m.r+=data[i]; m.g+=data[i+1]; m.b+=data[i+2]; m.c++; }
                    else { h.r+=data[i]; h.g+=data[i+1]; h.b+=data[i+2]; h.c++; }
                }
                const hexS = s.c > 0 ? rgbToHex(Math.round(s.r/s.c), Math.round(s.g/s.c), Math.round(s.b/s.c)) : "#222222";
                const hexM = m.c > 0 ? rgbToHex(Math.round(m.r/m.c), Math.round(m.g/m.c), Math.round(m.b/m.c)) : "#888888";
                const hexH = h.c > 0 ? rgbToHex(Math.round(h.r/h.c), Math.round(h.g/h.c), Math.round(h.b/h.c)) : "#DDDDDD";
                setPointerFromHex('wheel-shadows', 'ptr-shadows', 'val-shadows', hexS);
                setPointerFromHex('wheel-midtones', 'ptr-midtones', 'val-midtones', hexM);
                setPointerFromHex('wheel-highlights', 'ptr-highlights', 'val-highlights', hexH);
                toggleLoader(false);
            } catch (error) { console.error(error); toggleLoader(false); }
        }
        function setPointerFromHex(wheelId, pointerId, textId, hex) {
            const hsl = hexToHSL(hex);
            const pointer = document.getElementById(pointerId);
            const angleRad = (hsl.h - 90) * (Math.PI / 180);
            const radiusPercent = hsl.s / 100;
            const xPercent = (radiusPercent * Math.cos(angleRad) + 1) / 2 * 100;
            const yPercent = (radiusPercent * Math.sin(angleRad) + 1) / 2 * 100;
            pointer.style.left = `${xPercent}%`;
            pointer.style.top = `${yPercent}%`;
            const display = document.getElementById(textId);
            display.innerText = hex;
            display.style.color = hex;
        }
        function rgbToHex(r, g, b) {
            return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
        }
        function hslToHex(h, s, l) {
            s /= 100; l /= 100;
            let c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r=0, g=0, b=0;
            if (0<=h && h<60){r=c;g=x;b=0;}else if(60<=h && h<120){r=x;g=c;b=0;}
            else if(120<=h && h<180){r=0;g=c;b=x;}else if(180<=h && h<240){r=0;g=x;b=c;}
            else if(240<=h && h<300){r=x;g=0;b=c;}else if(300<=h && h<360){r=c;g=0;b=x;}
            r=Math.round((r+m)*255).toString(16).padStart(2,'0');
            g=Math.round((g+m)*255).toString(16).padStart(2,'0');
            b=Math.round((b+m)*255).toString(16).padStart(2,'0');
            return ("#"+r+g+b).toUpperCase();
        }
        function hexToHSL(H) {
            let r=0,g=0,b=0;
            if(H.length==7){r=parseInt(H.substr(1,2),16)/255;g=parseInt(H.substr(3,2),16)/255;b=parseInt(H.substr(5,2),16)/255;}
            let cmin=Math.min(r,g,b),cmax=Math.max(r,g,b),delta=cmax-cmin,h=0,s=0,l=0;
            if(delta==0)h=0;else if(cmax==r)h=((g-b)/delta)%6;else if(cmax==g)h=(b-r)/delta+2;else h=(r-g)/delta+4;
            h=Math.round(h*60);if(h<0)h+=360;
            l=(cmax+cmin)/2;s=delta==0?0:delta/(1-Math.abs(2*l-1));
            s=+(s*100).toFixed(1);l=+(l*100).toFixed(1);
            return{h,s,l};
        }
        /* ════════════════════════════════════════════════════════════════
           PROFESSIONAL HISTOGRAM ENGINE
           Real-time tonal distribution display with RGB/Lum channel modes,
           clipping detection, hover tooltips, and smooth animation.
           ════════════════════════════════════════════════════════════════ */
        const Histogram = (() => {
            'use strict';

            const BINS = 256;
            const SHADOW_THRESHOLD    = 8;   // bins 0-7 = shadow clip
            const HIGHLIGHT_THRESHOLD = 248; // bins 248-255 = highlight clip

            let channel = 'rgb';   // 'rgb' | 'lum' | 'r' | 'g' | 'b'
            let animFrame = null;
            let currentData = null; // { r, g, b, lum } arrays of BINS length
            let rendered = null;    // same shape, what's currently drawn (for animation)
            const ANIM_SPEED = 0.18;

            // Channel colour definitions
            const CHANNEL_COLORS = {
                rgb: [
                    { fill: 'rgba(239,68,68,0.55)',   stroke: '#ef4444' },
                    { fill: 'rgba(34,197,94,0.55)',   stroke: '#22c55e' },
                    { fill: 'rgba(59,130,246,0.55)',  stroke: '#3b82f6' },
                ],
                lum: [{ fill: 'rgba(255,255,255,0.35)', stroke: 'rgba(255,255,255,0.7)' }],
                r:   [{ fill: 'rgba(239,68,68,0.6)',   stroke: '#f87171' }],
                g:   [{ fill: 'rgba(34,197,94,0.6)',   stroke: '#4ade80' }],
                b:   [{ fill: 'rgba(59,130,246,0.6)',  stroke: '#60a5fa' }],
            };

            /* Compute histograms for all channels at once from ImageData */
            function compute(imgData) {
                const d = imgData.data;
                const r = new Float32Array(BINS);
                const g = new Float32Array(BINS);
                const b = new Float32Array(BINS);
                const lum = new Float32Array(BINS);

                for (let i = 0; i < d.length; i += 4) {
                    r[d[i]]++;
                    g[d[i+1]]++;
                    b[d[i+2]]++;
                    // ITU-R BT.709 luminance
                    lum[Math.round(0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2])]++;
                }
                // Normalise to 0-1 (log scale for perceptual quality, then linear)
                const norm = arr => {
                    const mx = Math.max(...arr, 1);
                    const out = new Float32Array(BINS);
                    // log compression: prevents single spike dominating the view
                    for (let i = 0; i < BINS; i++) {
                        out[i] = arr[i] > 0 ? Math.log1p(arr[i]) / Math.log1p(mx) : 0;
                    }
                    return out;
                };
                return { r: norm(r), g: norm(g), b: norm(b), lum: norm(lum), raw_r: r, raw_g: g, raw_b: b, raw_lum: lum };
            }

            /* Check clipping: returns { shadow: bool, highlight: bool } */
            function detectClipping(data) {
                const check = arr => {
                    let shadowPx = 0, highlightPx = 0, total = 0;
                    for (let i = 0; i < BINS; i++) { total += arr[i]; }
                    for (let i = 0; i <= SHADOW_THRESHOLD; i++) shadowPx += arr[i];
                    for (let i = HIGHLIGHT_THRESHOLD; i < BINS; i++) highlightPx += arr[i];
                    const pct = total > 0 ? 1 / total : 0;
                    return { shadow: shadowPx * pct > 0.002, highlight: highlightPx * pct > 0.002 };
                };

                if (channel === 'r') return check(data.raw_r);
                if (channel === 'g') return check(data.raw_g);
                if (channel === 'b') return check(data.raw_b);
                if (channel === 'lum') return check(data.raw_lum);
                // RGB: max across channels
                const cr = check(data.raw_r), cg = check(data.raw_g), cb = check(data.raw_b);
                return {
                    shadow:    cr.shadow    || cg.shadow    || cb.shadow,
                    highlight: cr.highlight || cg.highlight || cb.highlight,
                };
            }

            /* Draw one histogram layer onto ctx */
            function drawLayer(ctx, W, H, bins, fillStyle, strokeStyle) {
                const padL = 0, padR = 0, padB = 2;
                const drawH = H - padB;
                ctx.beginPath();
                ctx.moveTo(padL, H);
                for (let i = 0; i < BINS; i++) {
                    const x = padL + (i / (BINS - 1)) * (W - padL - padR);
                    const y = drawH - bins[i] * drawH;
                    if (i === 0) ctx.lineTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.lineTo(W - padR, H);
                ctx.closePath();
                ctx.fillStyle = fillStyle;
                ctx.fill();
                // Stroke (top edge only, gives that sharp premium look)
                ctx.beginPath();
                for (let i = 0; i < BINS; i++) {
                    const x = padL + (i / (BINS - 1)) * (W - padL - padR);
                    const y = drawH - bins[i] * drawH;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            /* Interpolate rendered → currentData for smooth animation */
            function lerp(a, b, t) {
                const out = new Float32Array(BINS);
                for (let i = 0; i < BINS; i++) out[i] = a[i] + (b[i] - a[i]) * t;
                return out;
            }

            function render(canvas, data) {
                const ctx = canvas.getContext('2d');
                const W = canvas.width, H = canvas.height;
                ctx.clearRect(0, 0, W, H);

                // Subtle zone tint background
                const grad = ctx.createLinearGradient(0, 0, W, 0);
                grad.addColorStop(0,    'rgba(59,130,246,0.04)');
                grad.addColorStop(0.33, 'rgba(255,255,255,0.02)');
                grad.addColorStop(0.66, 'rgba(255,255,255,0.02)');
                grad.addColorStop(1,    'rgba(245,158,11,0.04)');
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, W, H);

                // Zone dividers
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = 1;
                [0.333, 0.666].forEach(f => {
                    ctx.beginPath(); ctx.moveTo(f * W, 0); ctx.lineTo(f * W, H); ctx.stroke();
                });

                // Draw layers
                const cols = CHANNEL_COLORS[channel];
                if (channel === 'rgb') {
                    // Blend r, g, b with screen-like composite
                    ctx.globalCompositeOperation = 'screen';
                    drawLayer(ctx, W, H, data.r, cols[0].fill, cols[0].stroke);
                    drawLayer(ctx, W, H, data.g, cols[1].fill, cols[1].stroke);
                    drawLayer(ctx, W, H, data.b, cols[2].fill, cols[2].stroke);
                    ctx.globalCompositeOperation = 'source-over';
                } else {
                    const src = data[channel === 'lum' ? 'lum' : channel];
                    drawLayer(ctx, W, H, src, cols[0].fill, cols[0].stroke);
                }

                // Clipping markers (red/orange tint at edges)
                const clip = detectClipping(data);
                if (clip.shadow) {
                    const sg = ctx.createLinearGradient(0, 0, W * 0.08, 0);
                    sg.addColorStop(0, 'rgba(59,130,246,0.25)');
                    sg.addColorStop(1, 'transparent');
                    ctx.fillStyle = sg;
                    ctx.fillRect(0, 0, W * 0.08, H);
                }
                if (clip.highlight) {
                    const hg = ctx.createLinearGradient(W * 0.92, 0, W, 0);
                    hg.addColorStop(0, 'transparent');
                    hg.addColorStop(1, 'rgba(245,158,11,0.25)');
                    ctx.fillStyle = hg;
                    ctx.fillRect(W * 0.92, 0, W * 0.08, H);
                }

                // Update clipping badges
                const shadowBadge    = document.getElementById('hist-clip-shadow');
                const highlightBadge = document.getElementById('hist-clip-highlight');
                if (shadowBadge)    shadowBadge.style.display    = clip.shadow    ? 'block' : 'none';
                if (highlightBadge) highlightBadge.style.display = clip.highlight ? 'block' : 'none';
            }

            /* Animate smoothly from rendered → currentData */
            function animate(canvas) {
                if (animFrame) cancelAnimationFrame(animFrame);
                if (!currentData) return;

                if (!rendered) {
                    rendered = {
                        r: new Float32Array(BINS), g: new Float32Array(BINS),
                        b: new Float32Array(BINS), lum: new Float32Array(BINS),
                        raw_r: currentData.raw_r, raw_g: currentData.raw_g,
                        raw_b: currentData.raw_b, raw_lum: currentData.raw_lum,
                    };
                }

                let done = false;
                function step() {
                    done = true;
                    ['r','g','b','lum'].forEach(k => {
                        rendered[k] = lerp(rendered[k], currentData[k], ANIM_SPEED);
                        for (let i = 0; i < BINS; i++) {
                            if (Math.abs(rendered[k][i] - currentData[k][i]) > 0.002) done = false;
                        }
                    });
                    // Copy raw counts (instant, not animated)
                    rendered.raw_r   = currentData.raw_r;
                    rendered.raw_g   = currentData.raw_g;
                    rendered.raw_b   = currentData.raw_b;
                    rendered.raw_lum = currentData.raw_lum;

                    render(canvas, rendered);
                    if (!done) animFrame = requestAnimationFrame(step);
                    else animFrame = null;
                }
                step();
            }

            /* Resize the canvas to match its CSS pixel size (for sharpness) */
            function resizeCanvas(canvas) {
                const rect = canvas.parentElement.getBoundingClientRect();
                const dpr  = window.devicePixelRatio || 1;
                const W = Math.round(rect.width * dpr);
                const H = Math.round(80 * dpr);
                if (canvas.width !== W || canvas.height !== H) {
                    canvas.width  = W;
                    canvas.height = H;
                    canvas.style.width  = rect.width + 'px';
                    canvas.style.height = '80px';
                }
            }

            /* Public: update histogram from an image element */
            function update(imgEl) {
                if (!imgEl || !imgEl.src || imgEl.src === window.location.href) return;
                const canvas = document.getElementById('hist-canvas');
                const panel  = document.getElementById('hist-panel');
                if (!canvas || !panel) return;

                panel.style.display = '';
                resizeCanvas(canvas);

                // Sample at reduced resolution for performance
                const sampleW = 320;
                const sampleH = Math.round((imgEl.naturalHeight / imgEl.naturalWidth) * sampleW) || 240;
                const offscreen = document.createElement('canvas');
                offscreen.width = sampleW; offscreen.height = sampleH;
                const ctx = offscreen.getContext('2d');
                ctx.drawImage(imgEl, 0, 0, sampleW, sampleH);
                try {
                    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
                    currentData = compute(imgData);
                    rendered = null; // force restart of animation
                    animate(canvas);
                } catch (e) { /* tainted canvas — cross-origin, skip */ }
            }

            /* Public: force-redraw with current data + channel (after channel switch) */
            function redraw() {
                const canvas = document.getElementById('hist-canvas');
                if (!canvas || !currentData) return;
                resizeCanvas(canvas);
                rendered = null;
                animate(canvas);
            }

            /* Wire channel buttons and hover tooltip */
            (function wire() {
                function ready(fn) {
                    if (document.readyState !== 'loading') fn();
                    else document.addEventListener('DOMContentLoaded', fn);
                }
                ready(() => {
                    // Channel buttons
                    document.querySelectorAll('.hist-ch-btn').forEach(btn => {
                        btn.addEventListener('click', () => {
                            document.querySelectorAll('.hist-ch-btn').forEach(b => b.classList.remove('active'));
                            btn.classList.add('active');
                            channel = btn.dataset.ch;
                            redraw();
                        });
                    });

                    // Hover tooltip
                    const wrap    = document.getElementById('hist-canvas-wrap');
                    const tooltip = document.getElementById('hist-tooltip');
                    const ttVal   = document.getElementById('hist-tt-val');
                    const ttCount = document.getElementById('hist-tt-count');
                    const ttZone  = document.getElementById('hist-tt-zone');

                    if (!wrap || !tooltip) return;

                    wrap.addEventListener('mousemove', e => {
                        if (!currentData) return;
                        const rect = wrap.getBoundingClientRect();
                        const x    = e.clientX - rect.left;
                        const bin  = Math.min(BINS - 1, Math.max(0, Math.round((x / rect.width) * (BINS - 1))));

                        let count = 0;
                        if (channel === 'rgb') count = Math.round((currentData.raw_r[bin] + currentData.raw_g[bin] + currentData.raw_b[bin]) / 3);
                        else if (channel === 'lum') count = Math.round(currentData.raw_lum[bin]);
                        else count = Math.round(currentData['raw_' + channel][bin]);

                        const zone = bin < 85 ? (window.i18n ? i18n.t('histogram.shadows') : 'Shadows')
                                   : bin < 170 ? (window.i18n ? i18n.t('histogram.midtones') : 'Midtones')
                                   : (window.i18n ? i18n.t('histogram.highlights') : 'Highlights');

                        ttVal.textContent   = bin;
                        ttCount.textContent = count.toLocaleString() + ' px';
                        ttZone.textContent  = zone;
                        tooltip.style.display = 'flex';

                        // Keep tooltip inside bounds
                        const tipW = tooltip.offsetWidth;
                        const pct  = x / rect.width;
                        tooltip.style.left      = '';
                        tooltip.style.transform = '';
                        if (pct < 0.25) {
                            tooltip.style.left = '6px';
                        } else if (pct > 0.75) {
                            tooltip.style.left = `calc(100% - ${tipW + 6}px)`;
                        } else {
                            tooltip.style.left      = x + 'px';
                            tooltip.style.transform = 'translateX(-50%)';
                        }
                    });
                    wrap.addEventListener('mouseleave', () => {
                        if (tooltip) tooltip.style.display = 'none';
                    });

                    // Redraw on window resize
                    window.addEventListener('resize', () => {
                        if (currentData) redraw();
                    });
                });
            })();

            return { update };
        })();

        /* ════════════════════════════════════════════════════════════════
           SELECTIVE ADJUSTMENT ENGINE (SA)
           Paints a floating-point alpha mask on a canvas overlay, then
           blends pixel-level grading into ONLY the painted region.
           ════════════════════════════════════════════════════════════════ */
        const SA = (() => {
            let maskCanvas, maskCtx;
            let active = false;
            let brushMode = 'paint';
            let brushSize = 30;
            let softness = 0.4;
            let isDrawing = false, lastX = 0, lastY = 0;
            let undoStack = [], redoStack = [];
            let _originalSrc = null;   // clean dataURL before any grading

            function saveUndo() {
                if (!maskCanvas) return;
                undoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                if (undoStack.length > 30) undoStack.shift();
                redoStack = [];
            }

            function dab(x, y) {
                const r = brushSize / 2;
                const g = maskCtx.createRadialGradient(x, y, r * (1 - softness), x, y, r);
                if (brushMode === 'paint') {
                    g.addColorStop(0, 'rgba(255,80,80,0.35)');
                    g.addColorStop(1, 'rgba(255,80,80,0)');
                    maskCtx.globalCompositeOperation = 'source-over';
                } else {
                    g.addColorStop(0, 'rgba(0,0,0,1)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    maskCtx.globalCompositeOperation = 'destination-out';
                }
                maskCtx.fillStyle = g;
                maskCtx.beginPath();
                maskCtx.arc(x, y, r, 0, Math.PI * 2);
                maskCtx.fill();
                maskCtx.globalCompositeOperation = 'source-over';
            }

            function onPointerDown(e) {
                if (!active) return;
                isDrawing = true; saveUndo();
                const rect = maskCanvas.getBoundingClientRect();
                lastX = e.clientX - rect.left; lastY = e.clientY - rect.top;
                dab(lastX, lastY);
                e.preventDefault();
            }
            function onPointerMove(e) {
                if (!active) return;
                const rect = maskCanvas.getBoundingClientRect();
                const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
                const cur = document.getElementById('sa-brush-cursor');
                if (cur) { cur.style.left = e.clientX+'px'; cur.style.top = e.clientY+'px'; cur.style.width = brushSize+'px'; cur.style.height = brushSize+'px'; cur.style.display = 'block'; }
                if (!isDrawing) return;
                const dist = Math.hypot(cx - lastX, cy - lastY);
                const step = Math.max(2, brushSize * 0.15);
                const steps = Math.ceil(dist / step);
                for (let i = 0; i <= steps; i++) dab(lastX + (cx-lastX)*(i/steps), lastY + (cy-lastY)*(i/steps));
                lastX = cx; lastY = cy;
            }
            function onPointerUp()    { isDrawing = false; }
            function onPointerLeave() { isDrawing = false; const c = document.getElementById('sa-brush-cursor'); if (c) c.style.display = 'none'; }

           function syncSize() {
    maskCanvas = document.getElementById('sa-mask-canvas');
    if (!maskCanvas) return;
    maskCtx = maskCanvas.getContext('2d');

    // استخدم موضع الصورة نفسها نسبةً للحاوية
    const containerRect = targetImage.parentElement.getBoundingClientRect();
    const imgRect = targetImage.getBoundingClientRect();

    const W = Math.round(imgRect.width);
    const H = Math.round(imgRect.height);
    const left = Math.round(imgRect.left - containerRect.left);
    const top  = Math.round(imgRect.top  - containerRect.top);

    if (maskCanvas.width !== W || maskCanvas.height !== H) {
        const saved = maskCanvas.width > 0
            ? maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height)
            : null;
        maskCanvas.width  = W;
        maskCanvas.height = H;
        if (saved) maskCtx.putImageData(saved, 0, 0);
    }

    // ضبط الكانفاس ليطابق الصورة بالضبط داخل الحاوية
    maskCanvas.style.width  = W + 'px';
    maskCanvas.style.height = H + 'px';
    maskCanvas.style.left   = left + 'px';
    maskCanvas.style.top    = top  + 'px';
}

            function clearMask() { if (maskCtx) maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height); }

            function hasMask() {
                if (!maskCanvas || !active) return false;
                const d = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height).data;
                for (let i = 3; i < d.length; i += 4) { if (d[i] > 5) return true; }
                return false;
            }

            function setActive(on) {
                active = on;
                maskCanvas = document.getElementById('sa-mask-canvas');
                if (!maskCanvas) return;
                maskCanvas.style.display = on ? 'block' : 'none';
                const cur = document.getElementById('sa-brush-cursor');
                if (cur) cur.style.display = 'none';
                if (on) {
                    syncSize();
                    maskCanvas.addEventListener('pointerdown', onPointerDown);
                    maskCanvas.addEventListener('pointermove', onPointerMove);
                    maskCanvas.addEventListener('pointerup',   onPointerUp);
                    maskCanvas.addEventListener('pointerleave',onPointerLeave);
                } else {
                    maskCanvas.removeEventListener('pointerdown', onPointerDown);
                    maskCanvas.removeEventListener('pointermove', onPointerMove);
                    maskCanvas.removeEventListener('pointerup',   onPointerUp);
                    maskCanvas.removeEventListener('pointerleave',onPointerLeave);
                }
            }

            function updateUI(on) {
                const btn   = document.getElementById('sa-toggle-btn');
                const ctrl  = document.getElementById('sa-controls');
                const badge = document.getElementById('sa-active-badge');
                if (!btn) return;
                btn.classList.toggle('active', on);
                if (ctrl)  ctrl.style.display  = on ? 'flex' : 'none';
                if (badge) badge.style.display  = on ? 'block' : 'none';
            }

            /* Core blending: apply CSS filterStr only inside the mask region */
            function applySelectively(filterStr, onDone) {
                if (!_originalSrc) return;
                const origImg = new Image();
                origImg.onload = () => {
                    const natW = origImg.naturalWidth, natH = origImg.naturalHeight;

                    // Render original
                    const origC = document.createElement('canvas');
                    origC.width = natW; origC.height = natH;
                    const origCtx = origC.getContext('2d');
                    origCtx.drawImage(origImg, 0, 0, natW, natH);
                    const origData = origCtx.getImageData(0, 0, natW, natH);

                    // Render filtered
                    const filtC = document.createElement('canvas');
                    filtC.width = natW; filtC.height = natH;
                    const filtCtx = filtC.getContext('2d');
                    filtCtx.filter = filterStr;
                    filtCtx.drawImage(origImg, 0, 0, natW, natH);
                    filtCtx.filter = 'none';
                    const filtData = filtCtx.getImageData(0, 0, natW, natH);

                    // Scale display-res mask to natural res
                    const nmC = document.createElement('canvas');
                    nmC.width = natW; nmC.height = natH;
                    nmC.getContext('2d').drawImage(maskCanvas, 0, 0, natW, natH);
                    const maskData = nmC.getContext('2d').getImageData(0, 0, natW, natH).data;

                    // Blend orig + filtered using mask alpha
                    const result = origData;
                    for (let i = 0; i < result.data.length; i += 4) {
                        const a = maskData[i + 3] / 255;
                        if (a === 0) continue;
                        result.data[i]   = Math.round(origData.data[i]   * (1-a) + filtData.data[i]   * a);
                        result.data[i+1] = Math.round(origData.data[i+1] * (1-a) + filtData.data[i+1] * a);
                        result.data[i+2] = Math.round(origData.data[i+2] * (1-a) + filtData.data[i+2] * a);
                    }
                    origCtx.putImageData(result, 0, 0);

                    const blended = origC.toDataURL('image/jpeg', 0.95);
                    targetImage.src = blended;
                    targetImage.style.filter = 'none';
                    _originalSrc = blended;
                    clearMask();
                    setTimeout(() => {
                        toggleLoader(false);
                        if (typeof onDone === 'function') onDone();
                    }, 80);
                };
                origImg.src = _originalSrc;
            }

            /* Public init: called every time a new image loads */
            function init(dataURL) {
                _originalSrc = dataURL;
                undoStack = []; redoStack = [];
                clearMask();
                const toolbar = document.getElementById('sa-toolbar');
                if (toolbar) toolbar.style.display = '';
                updateUI(false);
                if (active) setActive(false);
            }

            /* Wire controls (runs once at page load) */
            (function wireControls() {
                function ready(fn) {
                    if (document.readyState !== 'loading') fn();
                    else document.addEventListener('DOMContentLoaded', fn);
                }
                ready(() => {
                    const saToggle = document.getElementById('sa-toggle-btn');
                    if (!saToggle) return;

                    saToggle.addEventListener('click', () => {
                        const on = !active;
                        setActive(on);
                        updateUI(on);
                        if (!on) clearMask();
                    });
                    document.getElementById('sa-paint-btn').addEventListener('click', () => {
                        brushMode = 'paint';
                        document.getElementById('sa-paint-btn').classList.add('active');
                        document.getElementById('sa-erase-btn').classList.remove('active');
                    });
                    document.getElementById('sa-erase-btn').addEventListener('click', () => {
                        brushMode = 'erase';
                        document.getElementById('sa-erase-btn').classList.add('active');
                        document.getElementById('sa-paint-btn').classList.remove('active');
                    });
                    document.getElementById('sa-brush-size').addEventListener('input', e => { brushSize = +e.target.value; });
                    document.getElementById('sa-softness').addEventListener('input',    e => { softness = e.target.value / 100; });
                    document.getElementById('sa-clear-btn').addEventListener('click', () => { saveUndo(); clearMask(); });
                    document.getElementById('sa-fill-btn').addEventListener('click', () => {
                        syncSize(); saveUndo();
                        maskCtx.fillStyle = 'rgba(255,80,80,0.6)';
                        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
                    });
                    document.getElementById('sa-invert-btn').addEventListener('click', () => {
                        syncSize(); saveUndo();
                        const d = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
                        for (let i = 3; i < d.data.length; i += 4) d.data[i] = 255 - d.data[i];
                        maskCtx.putImageData(d, 0, 0);
                    });
                    document.getElementById('sa-undo-btn').addEventListener('click', () => {
                        if (!undoStack.length) return;
                        redoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                        maskCtx.putImageData(undoStack.pop(), 0, 0);
                    });
                    document.getElementById('sa-redo-btn').addEventListener('click', () => {
                        if (!redoStack.length) return;
                        undoStack.push(maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                        maskCtx.putImageData(redoStack.pop(), 0, 0);
                    });

                    // Resize mask canvas when window resizes
                    window.addEventListener('resize', () => { if (active) syncSize(); });
                });
            })();

            return { init, hasMask, applySelectively };
        })();

        function applyCinemaLook(preset) {
            const img = document.getElementById('target-image');
            if (!img.src || img.src.includes(window.location.href)) return alert(i18n.t('common.uploadFirstError'));

            const filters = {
                'teal-orange': 'contrast(1.15) saturate(1.2) hue-rotate(-10deg) brightness(0.95)',
                'golden':      'sepia(0.4) saturate(1.4) contrast(1.05)',
                'cyber':       'hue-rotate(90deg) saturate(1.5) contrast(1.2)',
            };

            if (preset === 'reset') {
                img.style.filter = 'none';
                Histogram.update(img);
                return;
            }
            const filterStr = filters[preset];
            if (!filterStr) return;

            toggleLoader(true, i18n.t('colorGrading.applyingCinemaFilter'));

            if (SA.hasMask()) {
                // Selective mode: pixel-blend into painted region only
                SA.applySelectively(filterStr, () => {
                    // SA calls this callback when blending is done
                    Histogram.update(document.getElementById('target-image'));
                });
            } else {
                // Global mode: apply CSS filter then sample pixels for histogram
                setTimeout(() => {
                    img.style.filter = filterStr;
                    // Draw filtered image to offscreen canvas to get real pixel data
                    requestAnimationFrame(() => {
                        const off = document.createElement('canvas');
                        off.width  = img.naturalWidth;
                        off.height = img.naturalHeight;
                        const ctx = off.getContext('2d');
                        ctx.filter = filterStr;
                        ctx.drawImage(img, 0, 0);
                        ctx.filter = 'none';
                        // Temporarily swap src so Histogram.update() reads filtered pixels
                        const filteredSrc = off.toDataURL('image/jpeg', 0.92);
                        const tmp = new Image();
                        tmp.onload = () => Histogram.update(tmp);
                        tmp.src = filteredSrc;
                        toggleLoader(false);
                    });
                }, 400);
            }
        }

        function calculateHarmonyColors() {
            const baseHex = document.getElementById('base-color-picker').value;
            const mode = document.getElementById('harmony-mode-select').value;
            const outputGrid = document.getElementById('harmony-palette-output');
            outputGrid.innerHTML = "";
            let hsl = hexToHSL(baseHex);
            let colors = [];
            if(mode==='complementary'){colors.push(baseHex);colors.push(hslToHex((hsl.h+180)%360,hsl.s,hsl.l));}
            else if(mode==='analogous'){colors.push(hslToHex((hsl.h+330)%360,hsl.s,hsl.l));colors.push(baseHex);colors.push(hslToHex((hsl.h+30)%360,hsl.s,hsl.l));}
            else if(mode==='triadic'){colors.push(baseHex);colors.push(hslToHex((hsl.h+120)%360,hsl.s,hsl.l));colors.push(hslToHex((hsl.h+240)%360,hsl.s,hsl.l));}
            colors.forEach(color => {
                const swatch = document.createElement('div');
                swatch.className = "color-swatch"; swatch.style.backgroundColor = color; swatch.innerText = color;
                swatch.onclick = () => { navigator.clipboard.writeText(color); alert(i18n.t('common.copiedColor') + color); };
                outputGrid.appendChild(swatch);
            });
        }
        calculateHarmonyColors();


        /* ================================================================
           New Code: AI Object Remover
           ================================================================ */
        (function () {
            'use strict';

            /* ----------- State ----------- */
            const S = {
                originalSrc:  null,   // DataURL of the original image
                processedSrc: null,   // DataURL after removal
                zoom:         1.0,
                brushSize:    30,
                brushMode:    'draw', // 'draw' | 'erase'
                isDrawing:    false,
                lastX:        0,
                lastY:        0,
                undoStack:    [],
                redoStack:    [],
                versions:     [],     // [{src, label}]
                activeVer:    -1,
            };

            /* ----------- DOM Refs ----------- */
            const uploadStep   = document.getElementById('rem-upload-step');
            const editorStep   = document.getElementById('rem-editor-step');
            const resultStep   = document.getElementById('rem-result-step');
            const dropZone     = document.getElementById('remover-drop-zone');
            const fileInput    = document.getElementById('remover-file-input');
            const remCanvas    = document.getElementById('remover-canvas');
            const maskCanvas   = document.getElementById('mask-canvas');
            const rCtx         = remCanvas.getContext('2d');
            const mCtx         = maskCanvas.getContext('2d');
            const canvasInner  = document.getElementById('rem-canvas-inner');
            const canvasWrap   = document.getElementById('rem-canvas-wrapper');
            const brushCursor  = document.getElementById('brush-cursor');
            const toast        = document.getElementById('remover-toast');

            /* ----------- File Upload ----------- */
            fileInput.addEventListener('change', e => {
                const f = e.target.files[0];
                if (f) loadFile(f);
            });

            dropZone.addEventListener('dragover', e => {
                e.preventDefault();
                dropZone.classList.add('drag-over');
            });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
            dropZone.addEventListener('drop', e => {
                e.preventDefault();
                dropZone.classList.remove('drag-over');
                const f = e.dataTransfer.files[0];
                if (f) loadFile(f);
            });

            function isAcceptedFile(f) {
                return f.type.startsWith('image/') || RawPreview.isRawExtension(f);
            }

            function loadFile(file) {
                if (RawPreview.isRawExtension(file)) {
                    showRawLoadingToast();
                    RawPreview.extract(file)
                        .then(result => {
                            hideRawLoadingToast();
                            showRawBadge(result);
                            const img = new Image();
                            img.onload = () => initEditor(img, result.dataURL);
                            img.src = result.dataURL;
                        })
                        .catch(() => {
                            hideRawLoadingToast();
                            showToast(i18n.t('rawSupport.extractError'));
                        });
                    return;
                }
                const reader = new FileReader();
                reader.onload = ev => {
                    const img = new Image();
                    img.onload = () => initEditor(img, ev.target.result);
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }

            function showRawLoadingToast() {
                const t = document.getElementById('remover-toast');
                t.textContent = i18n.t('rawSupport.extracting');
                t.style.display = 'flex';
            }
            function hideRawLoadingToast() {
                document.getElementById('remover-toast').style.display = 'none';
            }
            function showRawBadge(result) {
                const existing = document.getElementById('raw-badge-remover');
                if (existing) existing.remove();
                const badge = document.createElement('div');
                badge.id = 'raw-badge-remover';
                badge.className = 'raw-preview-badge';
                badge.innerHTML = `<i class="fa-solid fa-microchip"></i> ${result.sourceFormat} ${i18n.t('rawSupport.previewLabel')}
                    ${result.exif.camera ? `· ${result.exif.camera}` : ''}
                    ${result.exif.shutter ? `· ${result.exif.shutter}` : ''}
                    ${result.exif.aperture ? `· ${result.exif.aperture}` : ''}
                    ${result.exif.iso ? `· ISO ${result.exif.iso}` : ''}
                    ${result.exif.focalLength ? `· ${result.exif.focalLength}` : ''}`;
                dropZone.parentElement.insertBefore(badge, dropZone.nextSibling);
            }

            /* ----------- Init Editor ----------- */
            function initEditor(img, src) {
                S.originalSrc = src;
                S.processedSrc = null;
                S.zoom = 1;
                S.undoStack = [];
                S.redoStack = [];
                S.versions = [];
                S.activeVer = -1;

                // Set canvas logical size = image pixel size
                remCanvas.width  = img.width;
                remCanvas.height = img.height;
                maskCanvas.width  = img.width;
                maskCanvas.height = img.height;

                rCtx.drawImage(img, 0, 0);
                mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

                fitCanvas();
                showStep('editor');
                updateZoomLabel();
            }

            /* ----------- Fit Canvas to Container ----------- */
            function fitCanvas() {
                const W = remCanvas.width;
                const H = remCanvas.height;
                const maxW = canvasWrap.clientWidth  - 24;
                const maxH = 540;

                const baseScale = Math.min(maxW / W, maxH / H, 1);
                const dispW = Math.round(W * baseScale * S.zoom);
                const dispH = Math.round(H * baseScale * S.zoom);

                remCanvas.style.width   = dispW + 'px';
                remCanvas.style.height  = dispH + 'px';
                maskCanvas.style.width  = dispW + 'px';
                maskCanvas.style.height = dispH + 'px';
                maskCanvas.style.position = 'absolute';
                maskCanvas.style.top  = '0';
                maskCanvas.style.left = '0';

                canvasInner.style.width  = dispW + 'px';
                canvasInner.style.height = dispH + 'px';
            }

            /* ----------- Canvas Coordinate Helper ----------- */
            function canvasPos(e) {
                const rect = remCanvas.getBoundingClientRect();
                const sx = remCanvas.width  / rect.width;
                const sy = remCanvas.height / rect.height;
                const cx = e.touches ? e.touches[0].clientX : e.clientX;
                const cy = e.touches ? e.touches[0].clientY : e.clientY;
                return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
            }

            /* ----------- Draw Brush Stroke ----------- */
            function stroke(x, y, lx, ly) {
                mCtx.globalCompositeOperation = S.brushMode === 'erase'
                    ? 'destination-out' : 'source-over';
                const color = 'rgba(239,70,70,0.72)';
                mCtx.fillStyle   = color;
                mCtx.strokeStyle = color;
                mCtx.lineWidth   = S.brushSize;
                mCtx.lineCap     = 'round';
                mCtx.lineJoin    = 'round';

                mCtx.beginPath();
                mCtx.arc(x, y, S.brushSize / 2, 0, Math.PI * 2);
                mCtx.fill();

                if (lx !== null) {
                    mCtx.beginPath();
                    mCtx.moveTo(lx, ly);
                    mCtx.lineTo(x, y);
                    mCtx.stroke();
                }
            }

            /* ----------- Mouse Events ----------- */
            remCanvas.addEventListener('mousedown', e => {
                S.isDrawing = true;
                const p = canvasPos(e);
                saveUndo();
                S.lastX = p.x; S.lastY = p.y;
                stroke(p.x, p.y, null, null);
            });

            window.addEventListener('mousemove', e => {
                // Update custom cursor
                if (document.getElementById('rem-editor-step').style.display !== 'none') {
                    const rect = remCanvas.getBoundingClientRect();
                    const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                                   e.clientY >= rect.top  && e.clientY <= rect.bottom;
                    if (inside) {
                        const dpx = S.brushSize * (rect.width / remCanvas.width);
                        brushCursor.style.display = 'block';
                        brushCursor.style.width   = dpx + 'px';
                        brushCursor.style.height  = dpx + 'px';
                        brushCursor.style.left    = e.clientX + 'px';
                        brushCursor.style.top     = e.clientY + 'px';
                        brushCursor.style.border  = '2px solid ' +
                            (S.brushMode === 'erase' ? 'rgba(99,102,241,0.85)' : 'rgba(239,68,68,0.85)');
                        brushCursor.style.background = S.brushMode === 'erase'
                            ? 'rgba(99,102,241,0.1)' : 'rgba(239,68,68,0.1)';
                    } else {
                        brushCursor.style.display = 'none';
                    }
                }

                if (!S.isDrawing) return;
                const p = canvasPos(e);
                stroke(p.x, p.y, S.lastX, S.lastY);
                S.lastX = p.x; S.lastY = p.y;
            });

            window.addEventListener('mouseup', () => { S.isDrawing = false; });

            /* Touch Events */
            remCanvas.addEventListener('touchstart', e => {
                e.preventDefault();
                S.isDrawing = true;
                const p = canvasPos(e);
                saveUndo();
                S.lastX = p.x; S.lastY = p.y;
                stroke(p.x, p.y, null, null);
            }, { passive: false });

            remCanvas.addEventListener('touchmove', e => {
                e.preventDefault();
                if (!S.isDrawing) return;
                const p = canvasPos(e);
                stroke(p.x, p.y, S.lastX, S.lastY);
                S.lastX = p.x; S.lastY = p.y;
            }, { passive: false });

            remCanvas.addEventListener('touchend', () => { S.isDrawing = false; });

            /* ----------- Scroll-to-zoom ----------- */
            canvasWrap.addEventListener('wheel', e => {
                e.preventDefault();
                S.zoom = Math.max(0.2, Math.min(5, S.zoom * (e.deltaY < 0 ? 1.12 : 0.9)));
                fitCanvas();
                updateZoomLabel();
            }, { passive: false });

            /* ----------- Zoom Buttons ----------- */
            document.getElementById('btn-zoom-in').addEventListener('click', () => {
                S.zoom = Math.min(5, S.zoom * 1.3);
                fitCanvas(); updateZoomLabel();
            });
            document.getElementById('btn-zoom-out').addEventListener('click', () => {
                S.zoom = Math.max(0.2, S.zoom / 1.3);
                fitCanvas(); updateZoomLabel();
            });
            function updateZoomLabel() {
                document.getElementById('zoom-label').textContent = Math.round(S.zoom * 100) + '%';
            }

            /* ----------- Brush Size ----------- */
            document.getElementById('brush-size-range').addEventListener('input', e => {
                S.brushSize = +e.target.value;
                document.getElementById('brush-size-label').textContent = S.brushSize;
            });

            /* ----------- Tool Toggle ----------- */
            document.getElementById('tool-brush').addEventListener('click', () => {
                S.brushMode = 'draw';
                document.getElementById('tool-brush').classList.add('active');
                document.getElementById('tool-eraser').classList.remove('active');
            });
            document.getElementById('tool-eraser').addEventListener('click', () => {
                S.brushMode = 'erase';
                document.getElementById('tool-eraser').classList.add('active');
                document.getElementById('tool-brush').classList.remove('active');
            });

            /* ----------- Undo / Redo ----------- */
            function saveUndo() {
                if (S.undoStack.length >= 40) S.undoStack.shift();
                S.undoStack.push(mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                S.redoStack = [];
            }
            function undo() {
                if (!S.undoStack.length) return;
                S.redoStack.push(mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                mCtx.putImageData(S.undoStack.pop(), 0, 0);
            }
            function redo() {
                if (!S.redoStack.length) return;
                S.undoStack.push(mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height));
                mCtx.putImageData(S.redoStack.pop(), 0, 0);
            }
            document.getElementById('btn-undo').addEventListener('click', undo);
            document.getElementById('btn-redo').addEventListener('click', redo);
            document.addEventListener('keydown', e => {
                if (!e.ctrlKey) return;
                if (e.key === 'z') { e.preventDefault(); undo(); }
                if (e.key === 'y') { e.preventDefault(); redo(); }
            });

            /* ----------- Reset Mask ----------- */
            document.getElementById('btn-reset-mask').addEventListener('click', () => {
                saveUndo();
                mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
            });

            /* ----------- Crop ----------- */
            document.getElementById('btn-crop-remover').addEventListener('click', () => {
                const src = remCanvas.toDataURL('image/png');
                ChromaCrop.open(src).then(result => {
                    if (!result) return; // cancelled
                    const img = new Image();
                    img.onload = () => initEditor(img, result.dataURL);
                    img.src = result.dataURL;
                });
            });

            /* ----------- Navigation buttons ----------- */
            document.getElementById('btn-change-img').addEventListener('click', resetToUpload);
            document.getElementById('btn-new-img-editor').addEventListener('click', resetToUpload);
            document.getElementById('btn-new-image-result').addEventListener('click', resetToUpload);

            function resetToUpload() {
                brushCursor.style.display = 'none';
                fileInput.value = '';
                showStep('upload');
            }

            /* ----------- Remove Object ----------- */
            document.getElementById('btn-remove-object').addEventListener('click', () => {
                const maskData = mCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

                // Check mask is drawn
                let hasMask = false;
                for (let i = 3; i < maskData.data.length; i += 4) {
                    if (maskData.data[i] > 15) { hasMask = true; break; }
                }
                if (!hasMask) {
                    const btn = document.getElementById('btn-remove-object');
                    btn.style.animation = 'none';
                    void btn.offsetHeight;
                    btn.style.animation = 'shake 0.4s ease';
                    showToast(i18n.t('objectRemoval.drawSelectionFirst'));
                    return;
                }

                // Show processing overlay
                const overlay = createOverlay();
                canvasInner.appendChild(overlay);

                // Animate progress
                let prog = 0;
                const stages = [
                    i18n.t('objectRemoval.stageAnalyzingMask'),
                    i18n.t('objectRemoval.stageExtracting'),
                    i18n.t('objectRemoval.stageRebuilding'),
                    i18n.t('objectRemoval.stageRefiningColors'),
                    i18n.t('common.finalTouches')
                ];
                let si = 0;
                const progInterval = setInterval(() => {
                    prog = Math.min(92, prog + Math.random() * 7 + 2);
                    const bar = document.getElementById('proc-bar');
                    if (bar) bar.style.width = prog + '%';
                    const nsi = Math.floor((prog / 100) * stages.length);
                    if (nsi !== si && nsi < stages.length) {
                        si = nsi;
                        const el = document.getElementById('proc-stage-el');
                        if (el) el.textContent = stages[si];
                    }
                }, 180);

                // Run inpainting asynchronously (give overlay time to render)
                setTimeout(() => {
                    try {
                        const imgData = rCtx.getImageData(0, 0, remCanvas.width, remCanvas.height);

                        // Optionally downscale large images for speed
                        const MAX_PX = 2200;
                        let procCanvas = remCanvas, procMask = maskCanvas;
                        let downscale = 1;

                        if (Math.max(remCanvas.width, remCanvas.height) > MAX_PX) {
                            downscale = MAX_PX / Math.max(remCanvas.width, remCanvas.height);
                            procCanvas = document.createElement('canvas');
                            procMask   = document.createElement('canvas');
                            procCanvas.width  = Math.round(remCanvas.width  * downscale);
                            procCanvas.height = Math.round(remCanvas.height * downscale);
                            procMask.width    = procCanvas.width;
                            procMask.height   = procCanvas.height;
                            procCanvas.getContext('2d').drawImage(remCanvas,   0, 0, procCanvas.width, procCanvas.height);
                            procMask.getContext('2d').drawImage(maskCanvas, 0, 0, procMask.width,   procMask.height);
                        }

                        const pCtx  = procCanvas.getContext('2d');
                        const pmCtx = procMask.getContext('2d');
                        const W = procCanvas.width, H = procCanvas.height;

                        const pixData  = pCtx.getImageData(0, 0, W, H);
                        const maskPix  = pmCtx.getImageData(0, 0, W, H);
                        const result   = inpaint(pixData.data, maskPix.data, W, H);

                        pCtx.putImageData(new ImageData(result, W, H), 0, 0);

                        // If downscaled, draw result back at original size
                        if (downscale < 1) {
                            rCtx.drawImage(procCanvas, 0, 0, remCanvas.width, remCanvas.height);
                        } else {
                            rCtx.putImageData(new ImageData(result, W, H), 0, 0);
                        }

                        // Clear mask
                        mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

                        const resultSrc = remCanvas.toDataURL('image/png');
                        S.processedSrc = resultSrc;

                        clearInterval(progInterval);
                        const bar2 = document.getElementById('proc-bar');
                        if (bar2) bar2.style.width = '100%';

                        setTimeout(() => {
                            overlay.remove();
                            addVersion(resultSrc, i18n.t('common.versionLabel') + (S.versions.length + 1));
                            showResultStep();
                        }, 300);

                    } catch (err) {
                        console.error(err);
                        clearInterval(progInterval);
                        overlay.remove();
                        showToast(i18n.t('common.processingError'));
                    }
                }, 60);
            });

            function createOverlay() {
                const el = document.createElement('div');
                el.className = 'canvas-processing';
                el.style.borderRadius = 'var(--radius-custom)';
                el.innerHTML = `
                    <div class="proc-spinner"></div>
                    <div class="proc-text">${i18n.t('common.aiWorkingOnPhoto')}</div>
                    <div class="proc-bar-wrap"><div class="proc-bar" id="proc-bar"></div></div>
                    <div class="proc-stage" id="proc-stage-el">${i18n.t('objectRemoval.stageAnalyzingMask')}</div>
                `;
                return el;
            }

            /* ================================================================
               INPAINTING ALGORITHM - Background Reconstruction Algorithm
               BFS Wavefront Fill + Edge Smoothing
               ================================================================ */
            function inpaint(pixels, maskPix, W, H) {
                const data    = new Uint8ClampedArray(pixels);
                const hasMask = new Uint8Array(W * H);

                // Build mask array
                for (let i = 0; i < W * H; i++) {
                    hasMask[i] = maskPix[i * 4 + 3] > 12 ? 1 : 0;
                }

                // Find boundary pixels (masked + adjacent to unmasked)
                const queue  = [];
                const inQ    = new Uint8Array(W * H);

                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const idx = y * W + x;
                        if (!hasMask[idx]) continue;
                        if ((x > 0   && !hasMask[idx - 1]) ||
                            (x < W-1 && !hasMask[idx + 1]) ||
                            (y > 0   && !hasMask[idx - W]) ||
                            (y < H-1 && !hasMask[idx + W])) {
                            queue.push(idx);
                            inQ[idx] = 1;
                        }
                    }
                }

                const R = 16, R2 = R * R;
                let qi = 0;

                while (qi < queue.length) {
                    const idx = queue[qi++];
                    if (!hasMask[idx]) continue;

                    const x = idx % W;
                    const y = (idx / W) | 0;
                    const x0 = Math.max(0, x - R), x1 = Math.min(W - 1, x + R);
                    const y0 = Math.max(0, y - R), y1 = Math.min(H - 1, y + R);

                    let r = 0, g = 0, b = 0, w = 0;

                    for (let ny = y0; ny <= y1; ny++) {
                        for (let nx = x0; nx <= x1; nx++) {
                            if (hasMask[ny * W + nx]) continue;
                            const dx = nx - x, dy = ny - y;
                            const d2 = dx * dx + dy * dy;
                            if (d2 > R2) continue;
                            const wt = 1 / (d2 + 1);
                            const ni = (ny * W + nx) * 4;
                            r += data[ni]     * wt;
                            g += data[ni + 1] * wt;
                            b += data[ni + 2] * wt;
                            w += wt;
                        }
                    }

                    if (w > 0) {
                        const pi = idx * 4;
                        data[pi]     = (r / w) | 0;
                        data[pi + 1] = (g / w) | 0;
                        data[pi + 2] = (b / w) | 0;
                        data[pi + 3] = 255;
                        hasMask[idx] = 0;

                        // Push 4-connected masked neighbors
                        if (x > 0)   { const ni = idx - 1; if (hasMask[ni] && !inQ[ni]) { queue.push(ni); inQ[ni] = 1; } }
                        if (x < W-1) { const ni = idx + 1; if (hasMask[ni] && !inQ[ni]) { queue.push(ni); inQ[ni] = 1; } }
                        if (y > 0)   { const ni = idx - W; if (hasMask[ni] && !inQ[ni]) { queue.push(ni); inQ[ni] = 1; } }
                        if (y < H-1) { const ni = idx + W; if (hasMask[ni] && !inQ[ni]) { queue.push(ni); inQ[ni] = 1; } }
                    }
                }

                // Second pass: handle isolated / large filled areas with wider radius
                const BR = 45, BR2 = BR * BR;
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        const idx = y * W + x;
                        if (!hasMask[idx]) continue;
                        const x0 = Math.max(0, x-BR), x1 = Math.min(W-1, x+BR);
                        const y0 = Math.max(0, y-BR), y1 = Math.min(H-1, y+BR);
                        let r = 0, g = 0, b = 0, w = 0;
                        for (let ny = y0; ny <= y1; ny++) {
                            for (let nx = x0; nx <= x1; nx++) {
                                if (hasMask[ny * W + nx]) continue;
                                const dx = nx-x, dy = ny-y;
                                const d2 = dx*dx+dy*dy;
                                if (d2 > BR2) continue;
                                const wt = 1/(d2+1);
                                const ni = (ny*W+nx)*4;
                                r += data[ni]*wt; g += data[ni+1]*wt; b += data[ni+2]*wt; w += wt;
                            }
                        }
                        if (w > 0) {
                            const pi = idx*4;
                            data[pi]=(r/w)|0; data[pi+1]=(g/w)|0; data[pi+2]=(b/w)|0; data[pi+3]=255;
                        }
                    }
                }

                // Edge smoothing: box blur on the filled region boundaries
                return edgeSmooth(data, maskPix, W, H);
            }

            function edgeSmooth(data, origMask, W, H) {
                const out = new Uint8ClampedArray(data);
                for (let y = 1; y < H - 1; y++) {
                    for (let x = 1; x < W - 1; x++) {
                        if (origMask[(y*W+x)*4+3] <= 12) continue;
                        let r=0,g=0,b=0;
                        for (let dy=-1;dy<=1;dy++) {
                            for (let dx=-1;dx<=1;dx++) {
                                const ni=(y+dy)*W+(x+dx);
                                r+=data[ni*4]; g+=data[ni*4+1]; b+=data[ni*4+2];
                            }
                        }
                        const pi=(y*W+x)*4;
                        out[pi]=(r/9)|0; out[pi+1]=(g/9)|0; out[pi+2]=(b/9)|0; out[pi+3]=255;
                    }
                }
                return out;
            }

            /* ----------- Show Result Step ----------- */
            function showResultStep() {
                const before = S.originalSrc;
                const after  = S.processedSrc;

                document.getElementById('comp-before').src = before;
                document.getElementById('comp-after').src  = after;
                document.getElementById('sbs-before').src  = before;
                document.getElementById('sbs-after').src   = after;

                showStep('result');
                initCompSlider();
            }

            /* ----------- Comparison Slider ----------- */
            function initCompSlider() {
                const container = document.getElementById('comp-container');
                const afterImg  = document.getElementById('comp-after');
                const divider   = document.getElementById('comp-divider');
                const handle    = document.getElementById('comp-handle');

                let dragging = false;
                let pos = 0.5;

                function setPos(p) {
                    pos = Math.max(0.02, Math.min(0.98, p));
                    const pct = pos * 100;
                    afterImg.style.clipPath = `inset(0 ${(100-pct).toFixed(1)}% 0 0)`;
                    divider.style.left = pct + '%';
                    handle.style.left  = pct + '%';
                }

                function fromEvent(e) {
                    const rect = container.getBoundingClientRect();
                    const cx   = e.touches ? e.touches[0].clientX : e.clientX;
                    return (cx - rect.left) / rect.width;
                }

                container.addEventListener('mousedown',  e => { dragging = true; setPos(fromEvent(e)); });
                window.addEventListener('mousemove',      e => { if (dragging) setPos(fromEvent(e)); });
                window.addEventListener('mouseup',        ()=> { dragging = false; });
                container.addEventListener('touchstart',  e => { dragging = true; setPos(fromEvent(e)); }, { passive: false });
                container.addEventListener('touchmove',   e => { e.preventDefault(); if (dragging) setPos(fromEvent(e)); }, { passive: false });
                container.addEventListener('touchend',    ()=> { dragging = false; });

                setPos(0.5);
            }

            /* ----------- View Toggle (global) ----------- */
            window.remSetView = function (mode) {
                const isSlider = mode === 'slider';
                document.getElementById('view-slider').style.display = isSlider ? 'block' : 'none';
                document.getElementById('view-sbs').style.display    = isSlider ? 'none'  : 'block';
                document.getElementById('tab-slider').classList.toggle('active', isSlider);
                document.getElementById('tab-sbs').classList.toggle('active', !isSlider);
            };

            /* ----------- Download ----------- */
            document.getElementById('btn-download').addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = S.processedSrc;
                a.download = 'ChromaIQ_Removed_' + Date.now() + '.png';
                a.click();
            });

            /* ----------- Edit More ----------- */
            document.getElementById('btn-edit-more').addEventListener('click', () => {
                const img = new Image();
                img.onload = () => {
                    rCtx.clearRect(0, 0, remCanvas.width, remCanvas.height);
                    rCtx.drawImage(img, 0, 0);
                    mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                    S.undoStack = []; S.redoStack = [];
                    showStep('editor');
                };
                img.src = S.processedSrc;
            });

            /* ----------- Revert to Original ----------- */
            document.getElementById('btn-revert').addEventListener('click', () => {
                const img = new Image();
                img.onload = () => {
                    rCtx.clearRect(0, 0, remCanvas.width, remCanvas.height);
                    rCtx.drawImage(img, 0, 0);
                    mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                    S.processedSrc = null;
                    S.undoStack = []; S.redoStack = [];
                    showStep('editor');
                    showToast(i18n.t('objectRemoval.originalRestored'));
                };
                img.src = S.originalSrc;
            });

            /* ----------- Version History ----------- */
            function addVersion(src, label) {
                S.versions.push({ src, label });
                S.activeVer = S.versions.length - 1;
                renderHistory();
            }

            function renderHistory() {
                const container = document.getElementById('history-thumbs');
                container.innerHTML = '';

                // Original thumb
                const origEl = buildThumb(S.originalSrc, i18n.t('common.original'), false, () => {
                    S.processedSrc = S.originalSrc;
                    document.getElementById('comp-after').src = S.originalSrc;
                    document.getElementById('sbs-after').src  = S.originalSrc;
                });
                container.appendChild(origEl);

                // Version thumbs
                S.versions.forEach((v, i) => {
                    const el = buildThumb(v.src, v.label, i === S.activeVer, () => {
                        S.activeVer = i;
                        S.processedSrc = v.src;
                        document.getElementById('comp-after').src = v.src;
                        document.getElementById('sbs-after').src  = v.src;
                        document.querySelectorAll('.hist-thumb').forEach(t => t.classList.remove('active'));
                        el.classList.add('active');
                    });
                    container.appendChild(el);
                });
            }

            function buildThumb(src, label, isActive, onClick) {
                const el = document.createElement('div');
                el.className = 'hist-thumb' + (isActive ? ' active' : '');
                el.innerHTML = `<img src="${src}" alt="${label}"><div class="hist-label">${label}</div>`;
                el.addEventListener('click', onClick);
                return el;
            }

            /* ----------- Step Navigation ----------- */
            function showStep(step) {
                uploadStep.style.display = step === 'upload' ? 'block' : 'none';
                editorStep.style.display = step === 'editor' ? 'block' : 'none';
                resultStep.style.display = step === 'result' ? 'block' : 'none';

                const map = { upload: 1, editor: 2, result: 3 };
                const active = map[step] || 1;
                for (let i = 1; i <= 3; i++) {
                    const el = document.getElementById('step-ind-' + i);
                    if (!el) continue;
                    el.classList.remove('active', 'done');
                    if (i < active) el.classList.add('done');
                    else if (i === active) el.classList.add('active');
                }

                if (step !== 'editor') brushCursor.style.display = 'none';
            }

            /* ----------- Toast ----------- */
            function showToast(msg) {
                toast.textContent = msg;
                toast.classList.add('show');
                clearTimeout(toast._t);
                toast._t = setTimeout(() => toast.classList.remove('show'), 3000);
            }

        })(); // end IIFE


        /* ================================================================
           AI STICKER MAKER LOGIC
           ================================================================ */
        (function () {
            'use strict';

            /* -------- State -------- */
            const SS = {
                originalSrc:    null,
                originalPixels: null,   // Uint8ClampedArray from uploaded image
                W: 0, H: 0,
                cutoutAlpha:    null,   // Float32Array [0..1] from BG removal
                refineMask:     null,   // Float32Array [0..1] user corrections
                edgeSoftness:   1,
                effectCanvas:   null,   // current effect result
                activeEffect:   'none',
                zoom:           1,
                brushSize:      20,
                brushMode:      'erase', // 'erase' | 'restore'
                isDrawing:      false,
                lastX: 0, lastY: 0,
                undoStack: [],
                redoStack: [],
                showingOriginal: false,
            };

            /* -------- DOM -------- */
            const uploadStep  = document.getElementById('stk-upload-step');
            const procStep    = document.getElementById('stk-process-step');
            const editorStep  = document.getElementById('stk-editor-step');
            const dropZone    = document.getElementById('stk-drop-zone');
            const fileInput   = document.getElementById('stk-file-input');
            const stkCanvas   = document.getElementById('stk-canvas');
            const sCtx        = stkCanvas.getContext('2d');
            const canvasWrap  = document.getElementById('stk-canvas-wrap');
            const canvasInner = document.getElementById('stk-canvas-inner');
            const bCursor     = document.getElementById('brush-cursor'); // reuse existing cursor el

            /* Create sticker-specific brush cursor */
            const sCursor = document.createElement('div');
            sCursor.id = 'stk-brush-cursor';
            document.body.appendChild(sCursor);

            /* -------- Upload -------- */
            fileInput.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });
            dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
            dropZone.addEventListener('drop', e => {
                e.preventDefault(); dropZone.classList.remove('drag-over');
                const f = e.dataTransfer.files[0];
                if (f) loadFile(f);
            });

            function loadFile(file) {
                if (RawPreview.isRawExtension(file)) {
                    document.getElementById('stk-proc-stage').textContent = i18n.t('rawSupport.extracting');
                    showStkStep('process'); stkSetStepIndicator(2);
                    RawPreview.extract(file)
                        .then(result => {
                            showRawBadge(result);
                            const img = new Image();
                            img.onload = () => startProcessing(img, result.dataURL);
                            img.src = result.dataURL;
                        })
                        .catch(() => {
                            showStkStep('upload'); stkSetStepIndicator(1);
                            alert(i18n.t('rawSupport.extractError'));
                        });
                    return;
                }
                const reader = new FileReader();
                reader.onload = ev => {
                    const img = new Image();
                    img.onload = () => startProcessing(img, ev.target.result);
                    img.src = ev.target.result;
                };
                reader.readAsDataURL(file);
            }

            function showRawBadge(result) {
                const existing = document.getElementById('raw-badge-sticker');
                if (existing) existing.remove();
                const badge = document.createElement('div');
                badge.id = 'raw-badge-sticker';
                badge.className = 'raw-preview-badge';
                badge.innerHTML = `<i class="fa-solid fa-microchip"></i> ${result.sourceFormat} ${i18n.t('rawSupport.previewLabel')}
                    ${result.exif.camera ? `· ${result.exif.camera}` : ''}
                    ${result.exif.shutter ? `· ${result.exif.shutter}` : ''}
                    ${result.exif.aperture ? `· ${result.exif.aperture}` : ''}
                    ${result.exif.iso ? `· ISO ${result.exif.iso}` : ''}
                    ${result.exif.focalLength ? `· ${result.exif.focalLength}` : ''}`;
                editorStep.insertBefore(badge, editorStep.firstChild);
            }

            /* -------- Processing Pipeline -------- */
            function startProcessing(img, src) {
                SS.originalSrc = src;
                SS.W = img.width; SS.H = img.height;

                // Show processing screen
                showStkStep('process');
                stkSetStepIndicator(2);

                // Extract pixel data
                const offscreen = document.createElement('canvas');
                offscreen.width  = SS.W; offscreen.height = SS.H;
                const octx = offscreen.getContext('2d');
                octx.drawImage(img, 0, 0);
                const imgData = octx.getImageData(0, 0, SS.W, SS.H);
                SS.originalPixels = new Uint8ClampedArray(imgData.data);

                // Run AI in stages with animated progress
                animateProgress([i18n.t('stickerMaker.stageAnalyzing'), i18n.t('stickerMaker.stageExtractingColors'), i18n.t('stickerMaker.stageComputingMask'), i18n.t('stickerMaker.stageRefiningEdges'), i18n.t('common.finalTouches')], () => {
                    SS.cutoutAlpha = removeBackground(SS.originalPixels, SS.W, SS.H);
                    SS.refineMask  = new Float32Array(SS.W * SS.H).fill(1);
                    SS.edgeSoftness = 1;

                    stkCanvas.width  = SS.W;
                    stkCanvas.height = SS.H;

                    fitStkCanvas();
                    renderCutout();
                    buildEffectCards();

                    showStkStep('editor');
                    stkSetStepIndicator(3);
                });
            }

            function animateProgress(stages, onComplete) {
                let prog = 0, si = 0;
                const bar   = document.getElementById('stk-proc-bar');
                const label = document.getElementById('stk-proc-stage');
                if (label) label.textContent = stages[0];

                const iv = setInterval(() => {
                    prog = Math.min(96, prog + Math.random() * 9 + 3);
                    if (bar) bar.style.width = prog + '%';
                    const nsi = Math.min(stages.length - 1, Math.floor(prog / 100 * stages.length));
                    if (nsi !== si) { si = nsi; if (label) label.textContent = stages[si]; }
                }, 160);

                setTimeout(() => {
                    clearInterval(iv);
                    if (bar) bar.style.width = '100%';
                    setTimeout(onComplete, 250);
                }, stages.length * 290 + 200);
            }

            /* ================================================================
               BG REMOVAL
               Border sampling → K-means → Distance map → Flood fill → Blur
               ================================================================ */
            function removeBackground(pixels, W, H) {
                /* 1 – sample border pixels */
                const bgSamples = [];
                const B = Math.max(5, Math.min(30, Math.floor(Math.min(W, H) * 0.04)));
                for (let x = 0; x < W; x++) {
                    for (let b = 0; b < B; b++) {
                        const i1 = (b * W + x) * 4, i2 = ((H-1-b) * W + x) * 4;
                        bgSamples.push([pixels[i1], pixels[i1+1], pixels[i1+2]]);
                        bgSamples.push([pixels[i2], pixels[i2+1], pixels[i2+2]]);
                    }
                }
                for (let y = B; y < H - B; y++) {
                    for (let b = 0; b < B; b++) {
                        const i1 = (y * W + b) * 4, i2 = (y * W + W-1-b) * 4;
                        bgSamples.push([pixels[i1], pixels[i1+1], pixels[i1+2]]);
                        bgSamples.push([pixels[i2], pixels[i2+1], pixels[i2+2]]);
                    }
                }

                /* 2 – K-means to get dominant BG colours */
                const K = Math.min(6, Math.max(2, Math.floor(bgSamples.length / 80)));
                const clusters = kmeans(bgSamples, K, 12);

                /* 3 – Per-pixel distance map */
                const distMap = new Float32Array(W * H);
                for (let i = 0; i < W * H; i++) {
                    const pi = i * 4;
                    const r = pixels[pi], g = pixels[pi+1], b = pixels[pi+2];
                    let minD = Infinity;
                    for (const c of clusters) {
                        const d = redmean(r, g, b, c[0], c[1], c[2]);
                        if (d < minD) minD = d;
                    }
                    distMap[i] = minD;
                }

                /* 4 – Soft threshold → initial alpha */
                const HARD = 38, SOFT = 48;
                const alpha = new Float32Array(W * H);
                for (let i = 0; i < W * H; i++) {
                    const d = distMap[i];
                    alpha[i] = d <= HARD ? 0 : d >= HARD + SOFT ? 1 : (d - HARD) / SOFT;
                }

                /* 5 – BFS flood fill from borders (remove connected BG) */
                const visited = new Uint8Array(W * H);
                const queue = [];

                function enqueue(idx) {
                    if (idx < 0 || idx >= W * H || visited[idx]) return;
                    if (alpha[idx] > 0.35) return;
                    visited[idx] = 1; alpha[idx] = 0; queue.push(idx);
                }

                for (let x = 0; x < W; x++) { enqueue(x); enqueue((H-1)*W+x); }
                for (let y = 1; y < H-1; y++) { enqueue(y*W); enqueue(y*W+W-1); }

                let qi = 0;
                while (qi < queue.length) {
                    const idx = queue[qi++];
                    const x = idx % W, y = (idx / W) | 0;
                    if (x > 0)   enqueue(idx-1);
                    if (x < W-1) enqueue(idx+1);
                    if (y > 0)   enqueue(idx-W);
                    if (y < H-1) enqueue(idx+W);
                }

                /* 6 – Gaussian blur for smooth edges */
                return gaussBlur(alpha, W, H, 1.2);
            }

            /* -------- K-means (3D RGB) -------- */
            function kmeans(samples, k, iters) {
                if (!samples.length) return [[128,128,128]];
                k = Math.min(k, samples.length);
                const step = Math.max(1, Math.floor(samples.length / k));
                let cents = Array.from({length: k}, (_, i) => [...samples[Math.min(i*step, samples.length-1)]]);
                for (let it = 0; it < iters; it++) {
                    const sums = Array.from({length:k}, () => [0,0,0,0]);
                    for (const s of samples) {
                        let mD = Infinity, mI = 0;
                        for (let i = 0; i < k; i++) {
                            const d = redmean(s[0],s[1],s[2],cents[i][0],cents[i][1],cents[i][2]);
                            if (d < mD) { mD = d; mI = i; }
                        }
                        sums[mI][0]+=s[0]; sums[mI][1]+=s[1]; sums[mI][2]+=s[2]; sums[mI][3]++;
                    }
                    let changed = false;
                    for (let i = 0; i < k; i++) {
                        if (!sums[i][3]) continue;
                        const nr = sums[i][0]/sums[i][3], ng = sums[i][1]/sums[i][3], nb = sums[i][2]/sums[i][3];
                        if (Math.abs(nr-cents[i][0])>0.8) changed=true;
                        cents[i] = [nr,ng,nb];
                    }
                    if (!changed) break;
                }
                return cents;
            }

            /* Redmean perceptual colour distance */
            function redmean(r1,g1,b1,r2,g2,b2) {
                const rm = (r1+r2)/2, dr=r1-r2, dg=g1-g2, db=b1-b2;
                return Math.sqrt((2+rm/256)*dr*dr + 4*dg*dg + (2+(255-rm)/256)*db*db);
            }

            /* Separable Gaussian blur on Float32Array */
            function gaussBlur(data, W, H, sigma) {
                const kR = Math.max(1, Math.ceil(sigma * 2.8));
                const kern = []; let kSum = 0;
                for (let i = -kR; i <= kR; i++) { const v = Math.exp(-(i*i)/(2*sigma*sigma)); kern.push(v); kSum+=v; }
                for (let i = 0; i < kern.length; i++) kern[i] /= kSum;

                const tmp = new Float32Array(W * H);
                for (let y = 0; y < H; y++) {
                    for (let x = 0; x < W; x++) {
                        let v = 0;
                        for (let k = -kR; k <= kR; k++) { v += data[y*W + Math.max(0,Math.min(W-1,x+k))] * kern[k+kR]; }
                        tmp[y*W+x] = v;
                    }
                }
                const out = new Float32Array(W * H);
                for (let x = 0; x < W; x++) {
                    for (let y = 0; y < H; y++) {
                        let v = 0;
                        for (let k = -kR; k <= kR; k++) { v += tmp[Math.max(0,Math.min(H-1,y+k))*W+x] * kern[k+kR]; }
                        out[y*W+x] = v;
                    }
                }
                return out;
            }

            /* -------- Render cutout to stkCanvas -------- */
            function renderCutout(softness) {
                const s = softness !== undefined ? softness : SS.edgeSoftness;
                const effAlpha = s > 0.15 ? gaussBlur(SS.cutoutAlpha, SS.W, SS.H, s) : SS.cutoutAlpha;
                const result = new Uint8ClampedArray(SS.W * SS.H * 4);
                for (let i = 0; i < SS.W * SS.H; i++) {
                    const pi = i * 4;
                    result[pi]   = SS.originalPixels[pi];
                    result[pi+1] = SS.originalPixels[pi+1];
                    result[pi+2] = SS.originalPixels[pi+2];
                    result[pi+3] = Math.round(Math.min(1, effAlpha[i]) * SS.refineMask[i] * 255);
                }
                sCtx.putImageData(new ImageData(result, SS.W, SS.H), 0, 0);
                SS.effectCanvas = null;   // invalidate effect cache
                refreshEffectPreviews();
            }

            /* -------- Fit canvas to container -------- */
            function fitStkCanvas() {
                const maxW = canvasWrap.clientWidth  - 20;
                const maxH = 520;
                const base = Math.min(maxW / SS.W, maxH / SS.H, 1);
                const disp = base * SS.zoom;
                const dW = Math.round(SS.W * disp), dH = Math.round(SS.H * disp);
                stkCanvas.style.width  = dW + 'px';
                stkCanvas.style.height = dH + 'px';
                canvasInner.style.width  = dW + 'px';
                canvasInner.style.height = dH + 'px';
            }

            function updateZoomLabel() {
                document.getElementById('stk-zoom-label').textContent = Math.round(SS.zoom * 100) + '%';
            }

            function canvasCoords(e) {
                const rect = stkCanvas.getBoundingClientRect();
                const sx = SS.W / rect.width, sy = SS.H / rect.height;
                const cx = e.touches ? e.touches[0].clientX : e.clientX;
                const cy = e.touches ? e.touches[0].clientY : e.clientY;
                return { x: (cx - rect.left) * sx, y: (cy - rect.top) * sy };
            }

            /* -------- Brush Painting -------- */
            function brushStroke(x, y, lx, ly) {
                const R = SS.brushSize / 2;
                const pts = [[x, y]];
                if (lx !== null) {
                    const steps = Math.ceil(Math.hypot(x - lx, y - ly) / (R * 0.5));
                    for (let i = 1; i < steps; i++) {
                        pts.push([lx + (x - lx) * i / steps, ly + (y - ly) * i / steps]);
                    }
                }
                for (const [px, py] of pts) applyBrushAt(px, py);
            }

            function applyBrushAt(cx, cy) {
                const R = SS.brushSize / 2;
                const x0 = Math.max(0, Math.floor(cx - R));
                const x1 = Math.min(SS.W - 1, Math.ceil(cx + R));
                const y0 = Math.max(0, Math.floor(cy - R));
                const y1 = Math.min(SS.H - 1, Math.ceil(cy + R));
                const pw = x1 - x0 + 1, ph = y1 - y0 + 1;
                const patch = new Uint8ClampedArray(pw * ph * 4);
                const R2 = R * R;
                const s  = SS.edgeSoftness > 0.15 ? gaussBlur(SS.cutoutAlpha, SS.W, SS.H, SS.edgeSoftness) : SS.cutoutAlpha;

                for (let py = y0; py <= y1; py++) {
                    for (let px = x0; px <= x1; px++) {
                        const dx = px - cx, dy = py - cy;
                        if (dx*dx + dy*dy <= R2) {
                            SS.refineMask[py * SS.W + px] = SS.brushMode === 'erase' ? 0 : 1;
                        }
                        const si  = py * SS.W + px;
                        const di  = ((py - y0) * pw + (px - x0)) * 4;
                        const oi  = si * 4;
                        patch[di]   = SS.originalPixels[oi];
                        patch[di+1] = SS.originalPixels[oi+1];
                        patch[di+2] = SS.originalPixels[oi+2];
                        patch[di+3] = Math.round(Math.min(1, s[si]) * SS.refineMask[si] * 255);
                    }
                }
                sCtx.putImageData(new ImageData(patch, pw, ph), x0, y0);
            }

            /* -------- Canvas Events -------- */
            stkCanvas.addEventListener('mousedown', e => {
                SS.isDrawing = true;
                const p = canvasCoords(e); saveUndo();
                SS.lastX = p.x; SS.lastY = p.y; brushStroke(p.x, p.y, null, null);
            });

            window.addEventListener('mousemove', e => {
                const rect = stkCanvas.getBoundingClientRect();
                const inside = e.clientX >= rect.left && e.clientX <= rect.right &&
                               e.clientY >= rect.top  && e.clientY <= rect.bottom;

                if (editorStep.style.display !== 'none') {
                    if (inside) {
                        const dpx = SS.brushSize * (rect.width / SS.W);
                        sCursor.style.cssText = `position:fixed;border-radius:50%;pointer-events:none;
                            transform:translate(-50%,-50%);z-index:99998;display:block;
                            width:${dpx}px;height:${dpx}px;
                            border:2px solid ${SS.brushMode==='erase'?'rgba(239,68,68,0.85)':'rgba(99,102,241,0.85)'};
                            background:${SS.brushMode==='erase'?'rgba(239,68,68,0.1)':'rgba(99,102,241,0.1)'};
                            left:${e.clientX}px;top:${e.clientY}px;`;
                    } else { sCursor.style.display = 'none'; }
                }

                if (!SS.isDrawing) return;
                const p = canvasCoords(e);
                brushStroke(p.x, p.y, SS.lastX, SS.lastY);
                SS.lastX = p.x; SS.lastY = p.y;
            });
            window.addEventListener('mouseup', () => { if (SS.isDrawing) { SS.isDrawing = false; SS.effectCanvas = null; refreshEffectPreviews(); } });

            stkCanvas.addEventListener('touchstart', e => {
                e.preventDefault(); SS.isDrawing = true;
                const p = canvasCoords(e); saveUndo();
                SS.lastX = p.x; SS.lastY = p.y; brushStroke(p.x, p.y, null, null);
            }, { passive: false });
            stkCanvas.addEventListener('touchmove', e => {
                e.preventDefault(); if (!SS.isDrawing) return;
                const p = canvasCoords(e); brushStroke(p.x, p.y, SS.lastX, SS.lastY);
                SS.lastX = p.x; SS.lastY = p.y;
            }, { passive: false });
            stkCanvas.addEventListener('touchend', () => { SS.isDrawing = false; SS.effectCanvas = null; refreshEffectPreviews(); });

            /* -------- Zoom -------- */
            canvasWrap.addEventListener('wheel', e => {
                e.preventDefault();
                SS.zoom = Math.max(0.2, Math.min(5, SS.zoom * (e.deltaY < 0 ? 1.12 : 0.9)));
                fitStkCanvas(); updateZoomLabel();
            }, { passive: false });
            document.getElementById('stk-zoom-in').addEventListener('click', () => { SS.zoom = Math.min(5, SS.zoom * 1.3); fitStkCanvas(); updateZoomLabel(); });
            document.getElementById('stk-zoom-out').addEventListener('click', () => { SS.zoom = Math.max(0.2, SS.zoom / 1.3); fitStkCanvas(); updateZoomLabel(); });

            /* -------- Tool Toggle -------- */
            document.getElementById('stk-tool-erase').addEventListener('click', () => {
                SS.brushMode = 'erase';
                document.getElementById('stk-tool-erase').classList.add('active');
                document.getElementById('stk-tool-restore').classList.remove('active');
            });
            document.getElementById('stk-tool-restore').addEventListener('click', () => {
                SS.brushMode = 'restore';
                document.getElementById('stk-tool-restore').classList.add('active');
                document.getElementById('stk-tool-erase').classList.remove('active');
            });

            /* -------- Brush Size -------- */
            document.getElementById('stk-brush-range').addEventListener('input', e => {
                SS.brushSize = +e.target.value;
                document.getElementById('stk-brush-label').textContent = SS.brushSize;
            });

            /* -------- Undo / Redo -------- */
            function saveUndo() {
                if (SS.undoStack.length >= 35) SS.undoStack.shift();
                SS.undoStack.push(new Float32Array(SS.refineMask));
                SS.redoStack = [];
            }
            document.getElementById('stk-undo').addEventListener('click', () => {
                if (!SS.undoStack.length) return;
                SS.redoStack.push(new Float32Array(SS.refineMask));
                SS.refineMask = SS.undoStack.pop();
                renderCutout();
            });
            document.getElementById('stk-redo').addEventListener('click', () => {
                if (!SS.redoStack.length) return;
                SS.undoStack.push(new Float32Array(SS.refineMask));
                SS.refineMask = SS.redoStack.pop();
                renderCutout();
            });
            document.addEventListener('keydown', e => {
                if (!e.ctrlKey || editorStep.style.display === 'none') return;
                if (e.key === 'z') { e.preventDefault(); document.getElementById('stk-undo').click(); }
                if (e.key === 'y') { e.preventDefault(); document.getElementById('stk-redo').click(); }
            });

            /* -------- Crop -------- */
            function cropTypedArrays(sx, sy, sw, sh) {
                const newPixels = new Uint8ClampedArray(sw * sh * 4);
                const newAlpha  = new Float32Array(sw * sh);
                const newRefine = new Float32Array(sw * sh);
                for (let row = 0; row < sh; row++) {
                    const srcRowStart = (sy + row) * SS.W + sx;
                    const dstRowStart = row * sw;
                    for (let col = 0; col < sw; col++) {
                        const srcI = srcRowStart + col;
                        const dstI = dstRowStart + col;
                        const sp = srcI * 4, dp = dstI * 4;
                        newPixels[dp]   = SS.originalPixels[sp];
                        newPixels[dp+1] = SS.originalPixels[sp+1];
                        newPixels[dp+2] = SS.originalPixels[sp+2];
                        newPixels[dp+3] = SS.originalPixels[sp+3];
                        newAlpha[dstI]  = SS.cutoutAlpha[srcI];
                        newRefine[dstI] = SS.refineMask[srcI];
                    }
                }
                SS.originalPixels = newPixels;
                SS.cutoutAlpha    = newAlpha;
                SS.refineMask     = newRefine;
                SS.W = sw; SS.H = sh;
            }

            document.getElementById('btn-crop-sticker').addEventListener('click', () => {
                const src = stkCanvas.toDataURL('image/png');
                ChromaCrop.open(src).then(result => {
                    if (!result) return; // cancelled
                    cropTypedArrays(result.sx, result.sy, result.sw, result.sh);
                    stkCanvas.width  = SS.W;
                    stkCanvas.height = SS.H;
                    SS.zoom = 1;
                    SS.undoStack = []; // old snapshots are sized for the pre-crop dimensions
                    SS.redoStack = [];
                    fitStkCanvas();
                    updateZoomLabel();
                    renderCutout();
                });
            });


            document.getElementById('stk-reset-mask').addEventListener('click', () => {
                saveUndo();
                SS.refineMask.fill(1);
                renderCutout();
            });

            /* -------- Show Original (compare) -------- */
            document.getElementById('stk-compare-btn').addEventListener('click', () => {
                SS.showingOriginal = !SS.showingOriginal;
                const btn = document.getElementById('stk-compare-btn');
                const lbl = document.getElementById('stk-compare-label');
                if (SS.showingOriginal) {
                    const img = new Image(); img.src = SS.originalSrc;
                    img.onload = () => { sCtx.drawImage(img, 0, 0); };
                    btn.classList.add('active'); lbl.textContent = i18n.t('stickerMaker.viewSticker');
                } else {
                    renderCutout();
                    btn.classList.remove('active'); lbl.textContent = i18n.t('stickerMaker.viewOriginal');
                }
            });

            /* -------- New Image -------- */
            document.getElementById('stk-new-img').addEventListener('click', () => {
                sCursor.style.display = 'none';
                fileInput.value = '';
                showStkStep('upload'); stkSetStepIndicator(1);
            });

            /* -------- Edge Refinement -------- */
            let edgeTimer;
            document.getElementById('stk-edge-slider').addEventListener('input', e => {
                SS.edgeSoftness = +e.target.value;
                clearTimeout(edgeTimer);
                edgeTimer = setTimeout(() => renderCutout(), 220);
            });

            /* -------- Background Toggle (global) -------- */
            window.stkSetBg = function(mode) {
                const wrap = document.getElementById('stk-canvas-wrap');
                wrap.classList.remove('checker-bg', 'checker-bg-white', 'checker-bg-dark');
                if (mode === 'white') wrap.classList.add('checker-bg-white');
                else if (mode === 'dark') wrap.classList.add('checker-bg-dark');
                else wrap.classList.add('checker-bg');
                ['bg-checker','bg-white','bg-dark'].forEach(id => document.getElementById(id).classList.remove('active'));
                document.getElementById('bg-' + mode).classList.add('active');
            };

            /* ================================================================
               STICKER EFFECTS
               ================================================================ */
            function getEffects() {
                return [
                    { id: 'none',          label: i18n.t('stickerMaker.effectNone'),         icon: 'fa-solid fa-ban' },
                    { id: 'outline-white', label: i18n.t('stickerMaker.effectOutlineWhite'), icon: 'fa-regular fa-circle' },
                    { id: 'outline-black', label: i18n.t('stickerMaker.effectOutlineBlack'), icon: 'fa-solid fa-circle' },
                    { id: 'shadow',        label: i18n.t('stickerMaker.effectShadow'),       icon: 'fa-solid fa-circle-half-stroke' },
                    { id: 'glow',          label: i18n.t('stickerMaker.effectGlow'),         icon: 'fa-solid fa-star' },
                    { id: 'pop3d',         label: i18n.t('stickerMaker.effectPop3d'),        icon: 'fa-solid fa-layer-group' },
                    { id: 'cartoon',       label: i18n.t('stickerMaker.effectCartoon'),      icon: 'fa-solid fa-pen-nib' },
                ];
            }

            function buildEffectCards() {
                const grid = document.getElementById('effects-grid');
                grid.innerHTML = '';
                getEffects().forEach(eff => {
                    const card = document.createElement('div');
                    card.className = 'effect-card' + (eff.id === 'none' ? ' active' : '');
                    card.dataset.eff = eff.id;
                    card.innerHTML = `
                        <div class="effect-preview" id="eff-prev-${eff.id}">
                            <span class="eff-placeholder"><i class="${eff.icon}"></i></span>
                        </div>
                        <div class="effect-label">${eff.label}</div>`;
                    card.addEventListener('click', () => applyEffect(eff.id));
                    grid.appendChild(card);
                });
                setTimeout(refreshEffectPreviews, 100);
            }

            function refreshEffectPreviews() {
                getEffects().forEach(eff => {
                    const container = document.getElementById('eff-prev-' + eff.id);
                    if (!container) return;
                    const prev = buildEffectCanvas(eff.id, true);
                    container.innerHTML = '';
                    prev.style.maxWidth = '100%'; prev.style.maxHeight = '100%';
                    container.appendChild(prev);
                });
            }

            function applyEffect(effId) {
                SS.activeEffect = effId;
                document.querySelectorAll('.effect-card').forEach(c => {
                    c.classList.toggle('active', c.dataset.eff === effId);
                });
                const result = buildEffectCanvas(effId, false);
                SS.effectCanvas = result;

                // Show effect on main canvas (scale to fit)
                const MAX = Math.max(stkCanvas.width, stkCanvas.height);
                const scale = MAX / Math.max(result.width, result.height);
                stkCanvas.width  = result.width;
                stkCanvas.height = result.height;
                sCtx.clearRect(0, 0, result.width, result.height);
                sCtx.drawImage(result, 0, 0);
                fitStkCanvas();
            }

            function buildEffectCanvas(effId, small) {
                // Build source canvas (current cutout at reduced res if small)
                const src = document.createElement('canvas');
                const scale = small ? Math.min(0.25, 90 / Math.max(SS.W, SS.H)) : 1;
                src.width  = Math.round(SS.W * scale);
                src.height = Math.round(SS.H * scale);
                src.getContext('2d').drawImage(stkCanvas, 0, 0, src.width, src.height);

                // Need to re-render at small scale using actual alpha
                if (small) {
                    const ctx2 = src.getContext('2d');
                    ctx2.clearRect(0, 0, src.width, src.height);
                    ctx2.drawImage(stkCanvas, 0, 0, src.width, src.height);
                }

                switch (effId) {
                    case 'none':          return src;
                    case 'outline-white': return outlineEffect(src, '#ffffff', Math.max(2, Math.round(8 * scale)));
                    case 'outline-black': return outlineEffect(src, '#1a1a1a', Math.max(2, Math.round(8 * scale)));
                    case 'shadow':        return shadowEffect(src, scale);
                    case 'glow':          return glowEffect(src, '#a855f7', Math.max(3, Math.round(18 * scale)));
                    case 'pop3d':         return pop3dEffect(src, scale);
                    case 'cartoon':       return cartoonEffect(src, scale);
                    default:              return src;
                }
            }

            /* ---- Outline Effect ---- */
            function outlineEffect(src, color, thickness) {
                const pad = thickness + 2;
                const out = document.createElement('canvas');
                out.width = src.width + pad*2; out.height = src.height + pad*2;
                const ctx = out.getContext('2d');

                // Coloured mask of subject
                const mask = document.createElement('canvas');
                mask.width = src.width; mask.height = src.height;
                const mCtx = mask.getContext('2d');
                mCtx.drawImage(src, 0, 0);
                mCtx.globalCompositeOperation = 'source-in';
                mCtx.fillStyle = color; mCtx.fillRect(0, 0, mask.width, mask.height);

                // Draw at many angles around the outline thickness
                const steps = Math.max(8, Math.ceil(thickness * Math.PI * 1.5));
                for (let i = 0; i < steps; i++) {
                    const a = (i / steps) * Math.PI * 2;
                    ctx.drawImage(mask, pad + Math.round(Math.cos(a)*thickness), pad + Math.round(Math.sin(a)*thickness));
                }
                ctx.drawImage(src, pad, pad);
                return out;
            }

            /* ---- Shadow Effect ---- */
            function shadowEffect(src, scale) {
                const blur = Math.max(3, Math.round(12 * scale));
                const ox = Math.max(2, Math.round(8 * scale));
                const oy = Math.max(2, Math.round(8 * scale));
                const pad = blur * 2 + Math.max(ox, oy);
                const out = document.createElement('canvas');
                out.width = src.width + pad*2; out.height = src.height + pad*2;
                const ctx = out.getContext('2d');

                const shad = document.createElement('canvas');
                shad.width = src.width; shad.height = src.height;
                const sCtxE = shad.getContext('2d');
                sCtxE.drawImage(src, 0, 0);
                sCtxE.globalCompositeOperation = 'source-in';
                sCtxE.fillStyle = 'rgba(0,0,0,0.55)'; sCtxE.fillRect(0, 0, shad.width, shad.height);

                ctx.filter = `blur(${blur}px)`;
                ctx.drawImage(shad, pad + ox, pad + oy);
                ctx.filter = 'none';
                ctx.drawImage(src, pad, pad);
                return out;
            }

            /* ---- Glow Effect ---- */
            function glowEffect(src, color, blurAmt) {
                const pad = blurAmt * 2 + 2;
                const out = document.createElement('canvas');
                out.width = src.width + pad*2; out.height = src.height + pad*2;
                const ctx = out.getContext('2d');

                const glow = document.createElement('canvas');
                glow.width = src.width; glow.height = src.height;
                const gCtx = glow.getContext('2d');
                gCtx.drawImage(src, 0, 0);
                gCtx.globalCompositeOperation = 'source-in';
                gCtx.fillStyle = color; gCtx.fillRect(0, 0, glow.width, glow.height);

                ctx.filter = `blur(${blurAmt}px)`;
                ctx.globalAlpha = 0.85;
                ctx.drawImage(glow, pad, pad);
                ctx.drawImage(glow, pad, pad);  // double for intensity
                ctx.filter = 'none'; ctx.globalAlpha = 1;
                ctx.drawImage(src, pad, pad);
                return out;
            }

            /* ---- 3D Pop Effect ---- */
            function pop3dEffect(src, scale) {
                const depth = Math.max(4, Math.round(14 * scale));
                const pad = depth + 4;
                const out = document.createElement('canvas');
                out.width = src.width + pad*2; out.height = src.height + pad*2;
                const ctx = out.getContext('2d');

                const layer = document.createElement('canvas');
                layer.width = src.width; layer.height = src.height;
                const lCtx = layer.getContext('2d');
                lCtx.drawImage(src, 0, 0);
                lCtx.globalCompositeOperation = 'source-in';
                lCtx.fillStyle = 'rgba(0,0,0,0.65)'; lCtx.fillRect(0, 0, layer.width, layer.height);

                for (let d = depth; d >= 1; d--) {
                    ctx.globalAlpha = 0.06 + (depth - d) * 0.022;
                    ctx.drawImage(layer, pad + d, pad + d);
                }
                ctx.globalAlpha = 1;
                ctx.drawImage(src, pad, pad);
                return out;
            }

            /* ---- Cartoon Effect ---- */
            function cartoonEffect(src, scale) {
                const thick = Math.max(2, Math.round(4 * scale));
                const out = document.createElement('canvas');
                out.width = src.width + thick*2; out.height = src.height + thick*2;
                const ctx = out.getContext('2d');

                // Bold dark outline
                const mask = document.createElement('canvas');
                mask.width = src.width; mask.height = src.height;
                const mCtx = mask.getContext('2d');
                mCtx.drawImage(src, 0, 0);
                mCtx.globalCompositeOperation = 'source-in';
                mCtx.fillStyle = '#111'; mCtx.fillRect(0, 0, mask.width, mask.height);

                const steps = Math.max(8, Math.ceil(thick * Math.PI * 1.5));
                for (let i = 0; i < steps; i++) {
                    const a = (i / steps) * Math.PI * 2;
                    ctx.drawImage(mask, thick + Math.round(Math.cos(a)*thick), thick + Math.round(Math.sin(a)*thick));
                }

                // Enhanced saturation + contrast
                const vivid = document.createElement('canvas');
                vivid.width = src.width; vivid.height = src.height;
                const vCtx = vivid.getContext('2d');
                vCtx.filter = 'saturate(1.9) contrast(1.3) brightness(1.05)';
                vCtx.drawImage(src, 0, 0);
                vCtx.filter = 'none';

                ctx.drawImage(vivid, thick, thick);
                return out;
            }

            /* ================================================================
               EXPORT
               ================================================================ */
            function getExportCanvas() {
                if (SS.effectCanvas) return SS.effectCanvas;
                // Return a fresh canvas from current stkCanvas data
                const exp = document.createElement('canvas');
                exp.width = SS.W; exp.height = SS.H;
                exp.getContext('2d').drawImage(stkCanvas, 0, 0, SS.W, SS.H);
                return exp;
            }

            document.getElementById('stk-dl-png').addEventListener('click', () => {
                const a = document.createElement('a');
                a.download = 'ChromaIQ_Sticker_' + Date.now() + '.png';
                a.href = getExportCanvas().toDataURL('image/png');
                a.click();
            });

            document.getElementById('stk-dl-webp').addEventListener('click', () => {
                const a = document.createElement('a');
                a.download = 'ChromaIQ_Sticker_' + Date.now() + '.webp';
                a.href = getExportCanvas().toDataURL('image/webp', 0.92);
                a.click();
            });

            document.getElementById('stk-dl-orig').addEventListener('click', () => {
                // Download clean cutout without effect
                const exp = document.createElement('canvas');
                exp.width = SS.W; exp.height = SS.H;
                exp.getContext('2d').drawImage(stkCanvas, 0, 0, SS.W, SS.H);
                const a = document.createElement('a');
                a.download = 'ChromaIQ_Cutout_' + Date.now() + '.png';
                a.href = exp.toDataURL('image/png');
                a.click();
            });

            document.getElementById('stk-copy-clip').addEventListener('click', async () => {
                try {
                    const canvas = getExportCanvas();
                    const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    const badge = document.getElementById('stk-clip-badge');
                    badge.classList.add('show');
                    setTimeout(() => badge.classList.remove('show'), 2500);
                } catch {
                    // Fallback: show data URL for manual copy
                    stkShowToast(i18n.t('stickerMaker.clipboardNotSupported'));
                }
            });

            /* -------- Step Navigation -------- */
            function showStkStep(step) {
                uploadStep.style.display = step === 'upload'  ? 'block' : 'none';
                procStep.style.display   = step === 'process' ? 'block' : 'none';
                editorStep.style.display = step === 'editor'  ? 'block' : 'none';
                if (step !== 'editor') sCursor.style.display = 'none';
            }

            function stkSetStepIndicator(active) {
                for (let i = 1; i <= 3; i++) {
                    const el = document.getElementById('stk-si-' + i);
                    if (!el) continue;
                    el.classList.remove('active', 'done');
                    if (i < active) el.classList.add('done');
                    else if (i === active) el.classList.add('active');
                }
            }

            /* -------- Toast -------- */
            function stkShowToast(msg) {
                const t = document.getElementById('remover-toast'); // reuse existing toast
                t.textContent = msg; t.classList.add('show');
                clearTimeout(t._st); t._st = setTimeout(() => t.classList.remove('show'), 3000);
            }

        })(); // end Sticker Maker IIFE


        /* ================================================================
           AI IMAGE ENHANCER LOGIC
           ================================================================ */
        (function () {
            'use strict';

            /* -------- State -------- */
            const EH = {
                queue:      [],    // [{file,name,originalSrc,resultSrc,status,W,H}]
                activeIdx:  -1,
                upscale:    1,
                format:     'png',
                quality:    0.92,
                zoom:       1,
                settings: { denoise:0.3, sharpen:0.5, clarity:0.3, face:false, restore:false },
            };

            /* -------- DOM -------- */
            const uploadStep  = document.getElementById('enh-upload-step');
            const procStep    = document.getElementById('enh-process-step');
            const resultStep  = document.getElementById('enh-result-step');
            const dropZone    = document.getElementById('enh-drop-zone');
            const fileInput   = document.getElementById('enh-file-input');

            /* -------- Upload handlers -------- */
            fileInput.addEventListener('change', e => {
                if (e.target.files.length) startQueue([...e.target.files]);
            });
            dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
            dropZone.addEventListener('drop', e => {
                e.preventDefault(); dropZone.classList.remove('drag-over');
                const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/') || RawPreview.isRawExtension(f));
                if (files.length) startQueue(files);
            });

            /* Paste from clipboard */
            document.addEventListener('paste', e => {
                if (uploadStep.style.display === 'none') return;
                const items = [...(e.clipboardData?.items || [])];
                const img   = items.find(i => i.type.startsWith('image/'));
                if (img) startQueue([img.getAsFile()]);
            });

            document.getElementById('enh-new-upload').addEventListener('click', () => {
                fileInput.value = ''; showEnhStep('upload'); enhSetStep(1);
            });

            /* -------- Build queue and start processing -------- */
            function startQueue(files) {
                EH.queue = files.map(f => ({
                    file: f, name: f.name || i18n.t('common.image'),
                    originalSrc: null, resultSrc: null, status: 'pending', W: 0, H: 0,
                }));
                EH.activeIdx = 0;
                processQueue(0);
            }

            async function processQueue(startIdx) {
                for (let i = startIdx; i < EH.queue.length; i++) {
                    EH.activeIdx = i;
                    const item = EH.queue[i];
                    item.status = 'active';
                    updateBatchUI();

                    const title = EH.queue.length > 1
                        ? i18n.t('imageEnhancer.processingBatch', { current: i+1, total: EH.queue.length })
                        : i18n.t('imageEnhancer.processingDefault');
                    document.getElementById('enh-proc-title').textContent = title;
                    document.getElementById('enh-queue-info').textContent =
                        EH.queue.length > 1 ? `${item.name}` : '';

                    showEnhStep('process'); enhSetStep(2);

                    try {
                        item.originalSrc = await fileToDataURL(item.file);
                        item.resultSrc   = await runEnhancePipeline(item.originalSrc, EH.settings, EH.upscale);
                        item.status      = 'done';
                    } catch (err) {
                        console.error(err);
                        item.status = 'error';
                    }
                    updateBatchUI();
                }

                // Show results for the first (or active) completed item
                const firstDone = EH.queue.find(q => q.status === 'done');
                if (firstDone) {
                    EH.activeIdx = EH.queue.indexOf(firstDone);
                    showResult(firstDone);
                }
            }

            /* -------- Core Enhancement Pipeline -------- */
            async function runEnhancePipeline(src, settings, upscale) {
                const stages = buildStages(settings, upscale);
                const total  = stages.length;

                const img = await loadImage(src);
                let MAX = 2200;
                let scale = Math.min(1, MAX / Math.max(img.width, img.height));
                let W = Math.round(img.width * scale), H = Math.round(img.height * scale);

                const canvas = document.createElement('canvas');
                canvas.width = W; canvas.height = H;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, W, H);

                for (let i = 0; i < stages.length; i++) {
                    const stage = stages[i];
                    updateProgress((i / total) * 85, stage.label);
                    await yieldFrame();
                    let imgData = ctx.getImageData(0, 0, W, H);
                    const result = stage.fn(imgData, W, H);
                    if (result instanceof ImageData) {
                        if (result.width !== W || result.height !== H) {
                            W = result.width; H = result.height;
                            canvas.width = W; canvas.height = H;
                        }
                        canvas.getContext('2d').putImageData(result, 0, 0);
                    }
                }
                updateProgress(100, i18n.t('common.processingComplete'));
                await yieldFrame();
                return canvas.toDataURL('image/png');
            }

            function buildStages(s, upscale) {
                const stages = [];
                stages.push({ label: i18n.t('imageEnhancer.stageAutoLevels'), fn: (d) => autoLevels(d, 0.6) });
                if (s.denoise > 0.05)  stages.push({ label: i18n.t('imageEnhancer.stageDenoising'), fn: (d,W,H) => denoiseFn(d,W,H, s.denoise) });
                if (s.sharpen > 0.05)  stages.push({ label: i18n.t('imageEnhancer.stageSharpening'), fn: (d,W,H) => sharpenFn(d,W,H, s.sharpen) });
                if (s.clarity > 0.05)  stages.push({ label: i18n.t('imageEnhancer.stageClarity'), fn: (d,W,H) => clarityFn(d,W,H, s.clarity) });
                if (s.face)            stages.push({ label: i18n.t('imageEnhancer.stageFaceEnhance'), fn: (d,W,H) => faceFn(d,W,H) });
                if (s.restore)         stages.push({ label: i18n.t('imageEnhancer.stageRestoring'), fn: (d,W,H) => restoreFn(d,W,H) });
                if (upscale > 1)       stages.push({ label: i18n.t('imageEnhancer.stageUpscaling', { scale: upscale }), fn: (d,W,H) => upscaleFn(d,W,H, upscale) });
                return stages;
            }

            /* ================================================================
               ALGORITHMS - Enhancement Algorithms
               ================================================================ */

            /* Auto Levels — percentile stretch */
            function autoLevels(imgData, strength) {
                const d = imgData.data, n = d.length / 4;
                const rH=new Int32Array(256), gH=new Int32Array(256), bH=new Int32Array(256);
                for (let i=0;i<d.length;i+=4){ rH[d[i]]++; gH[d[i+1]]++; bH[d[i+2]]++; }
                const cut = n * 0.008;
                function pcLo(h){let s=0;for(let i=0;i<256;i++){s+=h[i];if(s>=cut)return i;}return 0;}
                function pcHi(h){let s=0;for(let i=255;i>=0;i--){s+=h[i];if(s>=cut)return i;}return 255;}
                const [rLo,rHi,gLo,gHi,bLo,bHi]=[pcLo(rH),pcHi(rH),pcLo(gH),pcHi(gH),pcLo(bH),pcHi(bH)];
                const res = new Uint8ClampedArray(d.length);
                for (let i=0;i<d.length;i+=4){
                    const sr = rHi>rLo ? Math.round((d[i]  -rLo)*255/(rHi-rLo)) : d[i];
                    const sg = gHi>gLo ? Math.round((d[i+1]-gLo)*255/(gHi-gLo)) : d[i+1];
                    const sb = bHi>bLo ? Math.round((d[i+2]-bLo)*255/(bHi-bLo)) : d[i+2];
                    res[i]  =Math.max(0,Math.min(255, d[i]  +strength*(sr-d[i])));
                    res[i+1]=Math.max(0,Math.min(255, d[i+1]+strength*(sg-d[i+1])));
                    res[i+2]=Math.max(0,Math.min(255, d[i+2]+strength*(sb-d[i+2])));
                    res[i+3]=d[i+3];
                }
                return new ImageData(res, imgData.width, imgData.height);
            }

            /* Denoise — canvas blur + edge-aware blend */
            function denoiseFn(imgData, W, H, strength) {
                const sigma   = strength * 2.5;
                const blurred = blurViaCanvas(imgData, W, H, sigma);
                const orig = imgData.data, blur = blurred.data;
                const res  = new Uint8ClampedArray(orig.length);
                for (let y=0;y<H;y++){
                    for (let x=0;x<W;x++){
                        const i = (y*W+x)*4;
                        const ir=Math.max(0,(x-1))*4+y*W*4, il=Math.min(W-1,x+1)*4+y*W*4;
                        const iu=(Math.max(0,y-1)*W+x)*4,   id=(Math.min(H-1,y+1)*W+x)*4;
                        const gx=Math.abs(orig[ir]-orig[il])+Math.abs(orig[ir+1]-orig[il+1])+Math.abs(orig[ir+2]-orig[il+2]);
                        const gy=Math.abs(orig[iu]-orig[id])+Math.abs(orig[iu+1]-orig[id+1])+Math.abs(orig[iu+2]-orig[id+2]);
                        const edge = Math.min(1, Math.hypot(gx,gy) / 180);
                        const bl   = strength * (1 - edge * 0.85);
                        for (let c=0;c<3;c++) res[i+c]=Math.round(orig[i+c]*(1-bl)+blur[i+c]*bl);
                        res[i+3]=orig[i+3];
                    }
                }
                return new ImageData(res, W, H);
            }

            /* Sharpen — unsharp mask via canvas blur */
            function sharpenFn(imgData, W, H, strength) {
                const sigma   = 0.7 + strength * 0.5;
                const blurred = blurViaCanvas(imgData, W, H, sigma);
                return unsharpBlend(imgData.data, blurred.data, strength * 1.4, W, H);
            }

            /* Clarity — large-radius unsharp for mid-tone contrast */
            function clarityFn(imgData, W, H, strength) {
                const blurred = blurViaCanvas(imgData, W, H, 6 + strength * 4);
                return unsharpBlend(imgData.data, blurred.data, strength * 0.55, W, H);
            }

            /* Face Enhancement — skin-tone aware brightness/contrast lift */
            function faceFn(imgData, W, H) {
                const d = imgData.data;
                const res = new Uint8ClampedArray(d);
                for (let i=0;i<d.length;i+=4){
                    const r=d[i],g=d[i+1],b=d[i+2];
                    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), rng=mx-mn;
                    const isSkin = r>80 && g>40 && b>20 && rng>15 && Math.abs(r-g)>10 && r>g && r>b;
                    if (isSkin){
                        res[i]  =Math.min(255,Math.round(r*1.04+4));
                        res[i+1]=Math.min(255,Math.round(g*1.02+2));
                        res[i+2]=Math.min(255,Math.round(b*1.01));
                    }
                }
                /* Gentle sharpen on the result */
                const tmp  = new ImageData(res, W, H);
                const blur = blurViaCanvas(tmp, W, H, 0.5);
                return unsharpBlend(res, blur.data, 0.4, W, H);
            }

            /* Old Photo Restoration — levels + contrast + saturation + sharpen */
            function restoreFn(imgData, W, H) {
                let result = autoLevels(imgData, 0.95);
                /* S-curve for contrast */
                const d   = result.data, res = new Uint8ClampedArray(d);
                const lut = buildSCurveLUT(30);
                for (let i=0;i<d.length;i+=4){
                    res[i]  =lut[d[i]]; res[i+1]=lut[d[i+1]]; res[i+2]=lut[d[i+2]]; res[i+3]=d[i+3];
                }
                /* Saturation boost */
                const satResult = adjustSaturation(new ImageData(res,W,H), 0.25);
                /* Final sharpen */
                const blur = blurViaCanvas(satResult, W, H, 0.8);
                return unsharpBlend(satResult.data, blur.data, 0.7, W, H);
            }

            /* Upscale — stepped 2× bicubic via canvas */
            function upscaleFn(imgData, W, H, scale) {
                const src = document.createElement('canvas');
                src.width=W; src.height=H;
                src.getContext('2d').putImageData(imgData,0,0);
                let cur=src, cW=W, cH=H;
                const tW=W*scale, tH=H*scale;
                while (cW<tW||cH<tH){
                    const nW=Math.min(cW*2,tW), nH=Math.min(cH*2,tH);
                    const next=document.createElement('canvas');
                    next.width=nW; next.height=nH;
                    const ctx=next.getContext('2d');
                    ctx.imageSmoothingEnabled=true;
                    ctx.imageSmoothingQuality='high';
                    ctx.drawImage(cur,0,0,nW,nH);
                    cur=next; cW=nW; cH=nH;
                }
                return cur.getContext('2d').getImageData(0,0,tW,tH);
            }

            /* -------- Helpers -------- */
            function blurViaCanvas(imgData, W, H, sigma) {
                const src=document.createElement('canvas'); src.width=W; src.height=H;
                src.getContext('2d').putImageData(imgData,0,0);
                const dst=document.createElement('canvas'); dst.width=W; dst.height=H;
                const ctx=dst.getContext('2d');
                ctx.filter=`blur(${sigma.toFixed(2)}px)`;
                ctx.drawImage(src,0,0); ctx.filter='none';
                return ctx.getImageData(0,0,W,H);
            }

            function unsharpBlend(orig, blur, amount, W, H) {
                const res=new Uint8ClampedArray(orig.length);
                for (let i=0;i<orig.length;i+=4){
                    for(let c=0;c<3;c++) res[i+c]=Math.max(0,Math.min(255, orig[i+c]+amount*(orig[i+c]-blur[i+c])));
                    res[i+3]=orig[i+3];
                }
                return new ImageData(res,W,H);
            }

            function buildSCurveLUT(strength){
                const lut=new Uint8Array(256);
                for(let i=0;i<256;i++){
                    const x=i/255;
                    const y=x+strength/100*Math.sin(2*Math.PI*x)*0.5;
                    lut[i]=Math.max(0,Math.min(255,Math.round(y*255)));
                }
                return lut;
            }

            function adjustSaturation(imgData, amount) {
                const d=imgData.data, res=new Uint8ClampedArray(d);
                for (let i=0;i<d.length;i+=4){
                    const r=d[i],g=d[i+1],b=d[i+2];
                    const gray=0.299*r+0.587*g+0.114*b;
                    res[i]  =Math.max(0,Math.min(255,Math.round(gray+( r-gray)*(1+amount))));
                    res[i+1]=Math.max(0,Math.min(255,Math.round(gray+(g-gray)*(1+amount))));
                    res[i+2]=Math.max(0,Math.min(255,Math.round(gray+(b-gray)*(1+amount))));
                    res[i+3]=d[i+3];
                }
                return new ImageData(res,imgData.width,imgData.height);
            }

            function fileToDataURL(file) {
                if (RawPreview.isRawExtension(file)) {
                    return RawPreview.extract(file).then(result => {
                        // Store RAW metadata on the queue item for badge display
                        const qItem = EH.queue.find(q => q.file === file);
                        if (qItem) qItem._rawMeta = result;
                        return result.dataURL;
                    });
                }
                return new Promise(res => { const r=new FileReader(); r.onload=e=>res(e.target.result); r.readAsDataURL(file); });
            }
            function loadImage(src) {
                return new Promise(res => { const i=new Image(); i.onload=()=>res(i); i.src=src; });
            }
            function yieldFrame() { return new Promise(res => setTimeout(res, 16)); }
            function updateProgress(pct, stage) {
                const bar=document.getElementById('enh-proc-fill');
                const lbl=document.getElementById('enh-proc-stage');
                if(bar) bar.style.width=pct+'%';
                if(lbl) lbl.textContent=stage||'';
            }

            /* -------- Show Result -------- */
            function showResult(item) {
                document.getElementById('enh-before-img').src = item.originalSrc;
                document.getElementById('enh-after-img').src  = item.resultSrc;
                document.getElementById('enh-sbs-before').src = item.originalSrc;
                document.getElementById('enh-sbs-after').src  = item.resultSrc;

                // Dimension info
                const img = new Image();
                img.onload = () => {
                    const note  = document.getElementById('enh-dims-info');
                    const origW = item.W || img.width, origH = item.H || img.height;
                    const newW  = Math.round(origW * EH.upscale), newH = Math.round(origH * EH.upscale);
                    note.innerHTML = `<span>${i18n.t('imageEnhancer.originalDims')}${origW}×${origH}px</span>
                        ${EH.upscale>1?`<i class="fa-solid fa-arrow-left" style="color:var(--indigo-light)"></i><span>${i18n.t('imageEnhancer.enhancedDims')}${newW}×${newH}px</span>`:''}`;
                };
                img.src = item.originalSrc;

                // Show RAW badge if this was a RAW file
                const existing = document.getElementById('raw-badge-enhancer');
                if (existing) existing.remove();
                if (item._rawMeta) {
                    const r = item._rawMeta;
                    const badge = document.createElement('div');
                    badge.id = 'raw-badge-enhancer';
                    badge.className = 'raw-preview-badge';
                    badge.innerHTML = `<i class="fa-solid fa-microchip"></i> ${r.sourceFormat} ${i18n.t('rawSupport.previewLabel')}
                        ${r.exif.camera ? `· ${r.exif.camera}` : ''}
                        ${r.exif.shutter ? `· ${r.exif.shutter}` : ''}
                        ${r.exif.aperture ? `· ${r.exif.aperture}` : ''}
                        ${r.exif.iso ? `· ISO ${r.exif.iso}` : ''}
                        ${r.exif.focalLength ? `· ${r.exif.focalLength}` : ''}`;
                    resultStep.insertBefore(badge, resultStep.firstChild);
                }

                showEnhStep('result'); enhSetStep(3);
                initEnhSlider();
                updateBatchUI();

                // Show batch download button if multiple done
                const doneCnt = EH.queue.filter(q=>q.status==='done').length;
                document.getElementById('enh-dl-all-btn').style.display = doneCnt > 1 ? 'flex' : 'none';
            }

            /* -------- Comparison Slider -------- */
            function initEnhSlider() {
                const box   = document.getElementById('enh-slider-box');
                const after = document.getElementById('enh-after-img');
                const line  = document.getElementById('enh-slider-line');
                const knob  = document.getElementById('enh-slider-knob');
                let drag=false;

                function setPos(p){
                    const pct=Math.max(2,Math.min(98,p))*1;
                    after.style.clipPath=`inset(0 ${(100-pct).toFixed(1)}% 0 0)`;
                    line.style.left=pct+'%'; knob.style.left=pct+'%';
                }
                function fromE(e){ const r=box.getBoundingClientRect(); return ((e.touches?e.touches[0].clientX:e.clientX)-r.left)/r.width*100; }

                box.addEventListener('mousedown', e=>{drag=true; setPos(fromE(e));});
                window.addEventListener('mousemove', e=>{if(drag)setPos(fromE(e));});
                window.addEventListener('mouseup', ()=>{drag=false;});
                box.addEventListener('touchstart', e=>{drag=true; setPos(fromE(e));},{passive:false});
                box.addEventListener('touchmove', e=>{e.preventDefault(); if(drag)setPos(fromE(e));},{passive:false});
                box.addEventListener('touchend', ()=>{drag=false;});
                setPos(50);
            }

            window.enhSetView = function(mode){
                const isSlider=mode==='slider';
                document.getElementById('enh-view-slider').style.display=isSlider?'block':'none';
                document.getElementById('enh-view-sbs').style.display=isSlider?'none':'block';
                document.getElementById('enh-tab-slider').classList.toggle('active',isSlider);
                document.getElementById('enh-tab-sbs').classList.toggle('active',!isSlider);
            };

            /* -------- Batch UI -------- */
            function updateBatchUI(){
                const list  = document.getElementById('enh-batch-list');
                const panel = document.getElementById('enh-batch-panel');
                document.getElementById('enh-batch-count').textContent = EH.queue.length;
                panel.style.display = EH.queue.length <= 1 ? 'none' : 'block';
                list.innerHTML='';
                EH.queue.forEach((item,i)=>{
                    const el=document.createElement('div');
                    el.className='batch-item'+(i===EH.activeIdx?' active':'');
                    const statusMap={pending:'⏳ '+i18n.t('imageEnhancer.statusPending'),active:'⚡ '+i18n.t('imageEnhancer.statusActive'),done:'✅ '+i18n.t('imageEnhancer.statusDone'),error:'❌ '+i18n.t('imageEnhancer.statusError')};
                    const statusCls ={pending:'',active:'active',done:'done',error:'error'};
                    el.innerHTML=`
                        <div class="batch-thumb-wrap" style="width:40px;height:30px;background:#0b0f19;border-radius:5px;overflow:hidden;flex-shrink:0;">
                            ${item.originalSrc?`<img class="batch-thumb" src="${item.originalSrc}" style="width:100%;height:100%;object-fit:cover;">`:'<div style="width:100%;height:100%;background:rgba(79,70,229,.1);"></div>'}
                        </div>
                        <div class="batch-info">
                            <div class="batch-name">${item.name}</div>
                            <div class="batch-status ${statusCls[item.status]}">${statusMap[item.status]}</div>
                        </div>
                        <button class="batch-dl-btn" title="${i18n.t('common.download')}" ${item.status!=='done'?'disabled':''} data-idx="${i}">
                            <i class="fa-solid fa-download"></i>
                        </button>`;
                    el.addEventListener('click', e=>{
                        if(e.target.closest('.batch-dl-btn')) return;
                        if(item.status==='done'){ EH.activeIdx=i; showResult(item); }
                    });
                    const dlBtn=el.querySelector('.batch-dl-btn');
                    dlBtn.addEventListener('click', e=>{ e.stopPropagation(); downloadItem(i); });
                    list.appendChild(el);
                });
            }

            /* -------- Re-Enhance -------- */
            document.getElementById('btn-reenhance').addEventListener('click', async () => {
                const btn=document.getElementById('btn-reenhance');
                btn.disabled=true;
                for (const item of EH.queue) {
                    if (!item.originalSrc) continue;
                    item.status='active'; item.resultSrc=null; updateBatchUI();
                    showEnhStep('process'); enhSetStep(2);
                    item.resultSrc = await runEnhancePipeline(item.originalSrc, EH.settings, EH.upscale);
                    item.status='done'; updateBatchUI();
                }
                const firstDone=EH.queue.find(q=>q.status==='done');
                if(firstDone){ EH.activeIdx=EH.queue.indexOf(firstDone); showResult(firstDone); }
                btn.disabled=false;
            });

            /* -------- Upscale buttons -------- */
            document.querySelectorAll('.upscale-btn').forEach(btn=>{
                btn.addEventListener('click',()=>{
                    EH.upscale=+btn.dataset.scale;
                    document.querySelectorAll('.upscale-btn').forEach(b=>b.classList.toggle('active',b===btn));
                    const note=document.getElementById('enh-scale-note');
                    if(EH.upscale>1){
                        const item=EH.queue[EH.activeIdx]||EH.queue[0];
                        if(item?.W) note.textContent=`${item.W}×${item.H} → ${item.W*EH.upscale}×${item.H*EH.upscale} px`;
                    } else { note.textContent=''; }
                });
            });

            /* -------- Settings sliders -------- */
            ['denoise','sharpen','clarity'].forEach(id=>{
                const el=document.getElementById('enh-'+id);
                el.addEventListener('input',()=>{
                    EH.settings[id]=+el.value;
                    document.getElementById('enh-'+id+'-v').textContent=Math.round(el.value*100)+'%';
                });
            });
            document.getElementById('enh-face').addEventListener('change', e=>{ EH.settings.face=e.target.checked; });
            document.getElementById('enh-restore').addEventListener('change', e=>{ EH.settings.restore=e.target.checked; });

            /* -------- Zoom -------- */
            document.getElementById('enh-zoom-in').addEventListener('click',()=>{
                EH.zoom=Math.min(4,EH.zoom*1.3);
                applyEnhZoom();
            });
            document.getElementById('enh-zoom-out').addEventListener('click',()=>{
                EH.zoom=Math.max(0.2,EH.zoom/1.3);
                applyEnhZoom();
            });

            /* -------- Crop -------- */
            document.getElementById('btn-crop-enhancer').addEventListener('click', () => {
                const item = EH.queue[EH.activeIdx];
                if (!item || !item.resultSrc) return;
                ChromaCrop.open(item.resultSrc).then(result => {
                    if (!result) return; // cancelled
                    item.resultSrc = result.dataURL;
                    showResult(item);
                });
            });

            function applyEnhZoom(){
                document.getElementById('enh-slider-box').style.transform=`scale(${EH.zoom})`;
                document.getElementById('enh-slider-box').style.transformOrigin='top center';
                document.getElementById('enh-zoom-val').textContent=Math.round(EH.zoom*100)+'%';
            }

            /* -------- Format selector -------- */
            document.querySelectorAll('.enh-fmt-btn').forEach(btn=>{
                btn.addEventListener('click',()=>{
                    EH.format=btn.dataset.fmt;
                    document.querySelectorAll('.enh-fmt-btn').forEach(b=>b.classList.toggle('active',b===btn));
                    document.getElementById('enh-quality-row').style.display=(EH.format!=='png')?'flex':'none';
                });
            });
            document.getElementById('enh-quality').addEventListener('input',e=>{
                EH.quality=+e.target.value/100;
                document.getElementById('enh-quality-v').textContent=e.target.value+'%';
            });

            /* -------- Download single -------- */
            document.getElementById('enh-dl-btn').addEventListener('click',()=>downloadItem(EH.activeIdx));

            function downloadItem(idx){
                const item=EH.queue[idx];
                if(!item?.resultSrc) return;
                const a=document.createElement('a');
                a.download=`ChromaIQ_Enhanced_${idx+1}.${EH.format==='jpg'?'jpg':EH.format}`;
                if(EH.format==='png'){ a.href=item.resultSrc; }
                else {
                    const img=new Image(); img.src=item.resultSrc;
                    const c=document.createElement('canvas');
                    img.onload=()=>{
                        c.width=img.width; c.height=img.height;
                        c.getContext('2d').drawImage(img,0,0);
                        a.href=c.toDataURL('image/'+EH.format, EH.quality);
                        a.click();
                    };
                    return;
                }
                a.click();
            }

            /* -------- Download all as ZIP -------- */
            document.getElementById('enh-dl-all-btn').addEventListener('click', async ()=>{
                if(typeof JSZip==='undefined'){ enhToast(i18n.t('imageEnhancer.zipLibUnavailable')); return; }
                const zip=new JSZip();
                const done=EH.queue.filter(q=>q.status==='done');
                for (let i=0;i<done.length;i++){
                    const item=done[i];
                    const base64=item.resultSrc.split(',')[1];
                    const ext=EH.format==='jpg'?'jpg':EH.format;
                    zip.file(`ChromaIQ_Enhanced_${i+1}.${ext}`,base64,{base64:true});
                }
                const blob=await zip.generateAsync({type:'blob'});
                const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
                a.download='ChromaIQ_Enhanced_Photos.zip'; a.click();
            });

            /* -------- Step navigation -------- */
            function showEnhStep(step){
                uploadStep.style.display = step==='upload'  ?'block':'none';
                procStep.style.display   = step==='process' ?'block':'none';
                resultStep.style.display = step==='result'  ?'block':'none';
            }
            function enhSetStep(active){
                for(let i=1;i<=3;i++){
                    const el=document.getElementById('enh-si-'+i);
                    if(!el)continue;
                    el.classList.remove('active','done');
                    if(i<active)el.classList.add('done');
                    else if(i===active)el.classList.add('active');
                }
            }
            function enhToast(msg){
                const t=document.getElementById('remover-toast');
                t.textContent=msg; t.classList.add('show');
                clearTimeout(t._et); t._et=setTimeout(()=>t.classList.remove('show'),3000);
            }

        })(); // end Image Enhancer IIFE


        /* ================================================================
           RESPONSIVE SYSTEM JS
           ================================================================ */
        (function () {
            'use strict';

            /* -------- Mobile Navigation -------- */
            const hamburger = document.getElementById('nav-hamburger');
            const mobilePanel = document.getElementById('nav-mobile-panel');

            function openMobileNav() {
                hamburger.classList.add('is-open');
                mobilePanel.classList.add('is-open');
                hamburger.setAttribute('aria-expanded', 'true');
                document.body.style.overflow = 'hidden';
            }
            function _closeMobileNav() {
                hamburger.classList.remove('is-open');
                mobilePanel.classList.remove('is-open');
                hamburger.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            }
            window.closeMobileNav = _closeMobileNav;

            hamburger.addEventListener('click', e => {
                e.stopPropagation();
                hamburger.classList.contains('is-open') ? _closeMobileNav() : openMobileNav();
            });

            /* Close on outside click */
            document.addEventListener('click', e => {
                if (!hamburger.contains(e.target) && !mobilePanel.contains(e.target)) {
                    _closeMobileNav();
                }
            });

            /* Close on Escape */
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape') _closeMobileNav();
            });

            /* Close on resize to desktop */
            window.addEventListener('resize', () => {
                if (window.innerWidth >= 1024) _closeMobileNav();
            });

            /* -------- Smooth scroll with navbar offset -------- */
            document.querySelectorAll('a[href^="#"]').forEach(a => {
                a.addEventListener('click', e => {
                    const id = a.getAttribute('href');
                    if (!id || id === '#') return;
                    const target = document.querySelector(id);
                    if (!target) return;
                    e.preventDefault();
                    const navH = parseInt(
                        getComputedStyle(document.documentElement).getPropertyValue('--navbar-h')
                    ) || 64;
                    const top = target.getBoundingClientRect().top + window.scrollY - navH - 14;
                    window.scrollTo({ top, behavior: 'smooth' });
                });
            });

            /* -------- Pinch-to-zoom for canvas editors -------- */
            function addPinchZoom(wrapperId) {
                const el = document.getElementById(wrapperId);
                if (!el) return;
                let d0 = 0;
                el.addEventListener('touchstart', e => {
                    if (e.touches.length === 2) {
                        d0 = Math.hypot(
                            e.touches[0].clientX - e.touches[1].clientX,
                            e.touches[0].clientY - e.touches[1].clientY
                        );
                    }
                }, { passive: true });
                el.addEventListener('touchmove', e => {
                    if (e.touches.length !== 2 || !d0) return;
                    e.preventDefault();
                    const d1 = Math.hypot(
                        e.touches[0].clientX - e.touches[1].clientX,
                        e.touches[0].clientY - e.touches[1].clientY
                    );
                    const delta = d0 - d1;
                    if (Math.abs(delta) > 1) {
                        /* Dispatch synthetic wheel event to trigger existing zoom logic */
                        el.dispatchEvent(new WheelEvent('wheel', {
                            deltaY: delta * 1.5,
                            bubbles: true, cancelable: true,
                        }));
                        d0 = d1;
                    }
                }, { passive: false });
                el.addEventListener('touchend', () => { d0 = 0; }, { passive: true });
            }

            addPinchZoom('rem-canvas-wrapper');  /* Object Remover  */
            addPinchZoom('stk-canvas-wrap');      /* Sticker Maker   */
            addPinchZoom('enh-comp-wrap');        /* Image Enhancer  */

            /* -------- Viewport height fix (mobile browsers) -------- */
            function setRealVH() {
                document.documentElement.style.setProperty('--real-vh', (window.innerHeight * 0.01) + 'px');
            }
            setRealVH();
            window.addEventListener('resize', setRealVH);
            window.addEventListener('orientationchange', () => setTimeout(setRealVH, 150));

            /* -------- Re-fit canvases on resize -------- */
            let rfTimer;
            window.addEventListener('resize', () => {
                clearTimeout(rfTimer);
                rfTimer = setTimeout(() => {
                    /* Trigger re-fit for any active canvas by simulating a harmless event */
                    ['rem-canvas-wrapper', 'stk-canvas-wrap'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el && el.style.display !== 'none') {
                            window.dispatchEvent(new Event('canvas-refit'));
                        }
                    });
                }, 220);
            });

            /* -------- Lazy-load images (performance) -------- */
            if ('IntersectionObserver' in window) {
                const io = new IntersectionObserver((entries, obs) => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const img = entry.target;
                            if (img.dataset.src) { img.src = img.dataset.src; obs.unobserve(img); }
                        }
                    });
                }, { rootMargin: '200px' });
                document.querySelectorAll('img[data-src]').forEach(img => io.observe(img));
            }

            /* -------- Navbar active section highlight -------- */
            const sections = document.querySelectorAll('section[id]');
            const mobileLinks = document.querySelectorAll('.nav-mobile-panel a');

            if ('IntersectionObserver' in window) {
                const navIO = new IntersectionObserver(entries => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            const id = entry.target.id;
                            mobileLinks.forEach(a => {
                                const active = a.getAttribute('href') === '#' + id;
                                a.style.color = active ? 'var(--indigo-light)' : '';
                                a.style.background = active ? 'rgba(79,70,229,.08)' : '';
                            });
                        }
                    });
                }, { threshold: 0.3 });
                sections.forEach(s => navIO.observe(s));
            }

        })(); // end Responsive IIFE



