document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const fileInput = document.getElementById('file-input');
    const canvas = document.getElementById('dni-canvas');
    const displayContext = canvas.getContext('2d');

    // Tools
    const btnBw = document.getElementById('btn-bw');
    const btnClear = document.getElementById('btn-clear');
    const btnWatermark = document.getElementById('btn-watermark');
    const inputWatermark = document.getElementById('watermark-text');
    const btnDownload = document.getElementById('btn-download');
    const btnNew = document.getElementById('btn-new');

    // Sliders & Pickers
    const waveSlider = document.getElementById('wave-slider');
    const angleSlider = document.getElementById('angle-slider');
    const sizeSlider = document.getElementById('size-slider');
    const opacitySlider = document.getElementById('opacity-slider');
    const lineHeightSlider = document.getElementById('lineheight-slider');
    // const colorPicker = document.getElementById('color-picker'); // Removed native picker

    // State
    let originalImage = null;
    let redactions = []; // {x, y, w, h, rotation (rad)}
    let isDragging = false;
    let dragMode = null;
    let isBlackAndWhite = false;
    let watermarkText = '';

    // Interaction State
    let selectedIndex = -1;
    let startPos = { x: 0, y: 0 };
    let initialRectState = null;

    // Config
    let waveAmplitude = parseInt(waveSlider.value);
    let textIncline = parseInt(angleSlider.value);
    let fontSize = parseInt(sizeSlider.value);
    let textOpacity = parseInt(opacitySlider.value) / 100;
    let textLineSpacing = parseInt(lineHeightSlider.value);
    let textColor = document.querySelector('.color-option.active') ? document.querySelector('.color-option.active').getAttribute('data-color') : '#ffffff';

    // Virtual canvas
    const processingCanvas = document.createElement('canvas');
    const ctx = processingCanvas.getContext('2d');

    // --- Helpers ---
    const toRad = deg => deg * Math.PI / 180;
    const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    const rotatePoint = (x, y, cx, cy, angle) => {
        const dx = x - cx;
        const dy = y - cy;
        return {
            x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
            y: cy + dx * Math.sin(angle) + dy * Math.cos(angle)
        };
    };

    const getLocalPoint = (px, py, rect) => {
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        return rotatePoint(px, py, cx, cy, -rect.rotation);
    };

    // --- Upload Handlers ---
    const handleFile = (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                canvas.width = img.width;
                canvas.height = img.height;
                processingCanvas.width = img.width;
                processingCanvas.height = img.height;
                uploadSection.classList.add('hidden');
                editorSection.classList.remove('hidden');
                render();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    };

    uploadSection.addEventListener('click', () => fileInput.click());
    uploadSection.addEventListener('dragover', (e) => { e.preventDefault(); uploadSection.classList.add('dragover'); });
    uploadSection.addEventListener('dragleave', () => uploadSection.classList.remove('dragover'));
    uploadSection.addEventListener('drop', (e) => { e.preventDefault(); uploadSection.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

    // --- Interaction Logic ---

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        // Handle touch vs mouse
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleX // Assume uniform scaling for simplicity in coord mapping
        };
    };

    // Hit Testing
    const HANDLE_RADIUS = 10;
    const ROTATION_OFFSET = 35; // Distance of rotation handle from top
    const hitTest = (pos) => {

        // Check selection handles first
        if (selectedIndex !== -1) {
            const r = redactions[selectedIndex];
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;

            // Rotation Handle (Curved Arrow area) = Top center + offset
            // We'll treat the rotation handle as a hit area above the box
            const rotHandlePos = rotatePoint(cx, r.y - ROTATION_OFFSET, cx, cy, r.rotation);
            if (dist(pos, rotHandlePos) < HANDLE_RADIUS * 2) return 'rotate';

            // Resize Handles (Local coords relative to rect)
            const localPos = getLocalPoint(pos.x, pos.y, r);

            // Check corners in local space
            if (Math.abs(localPos.x - r.x) < HANDLE_RADIUS && Math.abs(localPos.y - r.y) < HANDLE_RADIUS) return 'resize-tl';
            if (Math.abs(localPos.x - (r.x + r.w)) < HANDLE_RADIUS && Math.abs(localPos.y - r.y) < HANDLE_RADIUS) return 'resize-tr';
            if (Math.abs(localPos.x - r.x) < HANDLE_RADIUS && Math.abs(localPos.y - (r.y + r.h)) < HANDLE_RADIUS) return 'resize-bl';
            if (Math.abs(localPos.x - (r.x + r.w)) < HANDLE_RADIUS && Math.abs(localPos.y - (r.y + r.h)) < HANDLE_RADIUS) return 'resize-br';

            // Check Inside Rect
            if (localPos.x >= r.x && localPos.x <= r.x + r.w && localPos.y >= r.y && localPos.y <= r.y + r.h) return 'move';
        }

        // Check other rects (Hit body only)
        for (let i = redactions.length - 1; i >= 0; i--) {
            if (i === selectedIndex) continue; // Already checked
            const r = redactions[i];
            const localPos = getLocalPoint(pos.x, pos.y, r);
            if (localPos.x >= r.x && localPos.x <= r.x + r.w && localPos.y >= r.y && localPos.y <= r.y + r.h) {
                return { type: 'select', index: i };
            }
        }

        return 'create';
    };

    // const dist = (p1, p2) => Math.hypot(p1.x - p2.x, p1.y - p2.y); // Removed duplicate

    const startDraw = (e) => {
        e.preventDefault();
        const pos = getPos(e);
        const hit = hitTest(pos);

        startPos = pos;
        isDragging = true;

        if (typeof hit === 'object' && hit.type === 'select') {
            selectedIndex = hit.index;
            dragMode = 'move';
            initialRectState = { ...redactions[selectedIndex] };
        } else if (hit === 'create') {
            selectedIndex = -1; // Deselect
            dragMode = 'create';
        } else {
            // Did hit a handle of the selection
            dragMode = hit;
            initialRectState = { ...redactions[selectedIndex] };
        }
        render();
    };

    const moveDraw = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        const pos = getPos(e);

        if (dragMode === 'create') {
            render(); // Clear
            displayContext.fillStyle = 'rgba(0,0,0,0.5)';
            displayContext.fillRect(startPos.x, startPos.y, pos.x - startPos.x, pos.y - startPos.y);
            return;
        }

        const r = redactions[selectedIndex];

        if (dragMode === 'move') {
            const dx = pos.x - startPos.x;
            const dy = pos.y - startPos.y;
            r.x = initialRectState.x + dx;
            r.y = initialRectState.y + dy;
        } else if (dragMode === 'rotate') {
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            const angle = Math.atan2(pos.y - cy, pos.x - cx);
            r.rotation = angle + Math.PI / 2;
        } else if (dragMode.startsWith('resize')) {
            // Complex resize with rotation is hard.
            // Easier approach: Transform current mouse to local space of Initial Rect logic
            // But simplest UX: Resize unrotated width/height, but that looks weird if rotated.
            // Correct way:
            // 1. Un-rotate current mouse pos to local axis aligned space
            const cx = initialRectState.x + initialRectState.w / 2;
            const cy = initialRectState.y + initialRectState.h / 2;

            // We need to calculate new bounds in local space
            const localMouse = getLocalPoint(pos.x, pos.y, initialRectState);
            const localStart = getLocalPoint(startPos.x, startPos.y, initialRectState);

            const dx = localMouse.x - localStart.x;
            const dy = localMouse.y - localStart.y;

            if (dragMode === 'resize-br') {
                r.w = Math.max(10, initialRectState.w + dx);
                r.h = Math.max(10, initialRectState.h + dy);
            } else if (dragMode === 'resize-tl') {
                const newW = Math.max(10, initialRectState.w - dx);
                const newH = Math.max(10, initialRectState.h - dy);
                r.x = initialRectState.x + (initialRectState.w - newW);
                r.y = initialRectState.y + (initialRectState.h - newH);
                r.w = newW; r.h = newH;
            }
            // ... Similar for TR and BL (omitted for brevity but logic implies shifts)
            // Implementing Full standard behavior:
            else if (dragMode === 'resize-tr') {
                r.w = Math.max(10, initialRectState.w + dx);
                const newH = Math.max(10, initialRectState.h - dy);
                r.y = initialRectState.y + (initialRectState.h - newH);
                r.h = newH;
            } else if (dragMode === 'resize-bl') {
                const newW = Math.max(10, initialRectState.w - dx);
                r.x = initialRectState.x + (initialRectState.w - newW);
                r.w = newW;
                r.h = Math.max(10, initialRectState.h + dy);
            }
        }

        render();
    };

    const endDraw = (e) => {
        if (!isDragging) return;
        isDragging = false;

        if (dragMode === 'create') {
            // Handle creation logic
            // (We need to handle Touch End pos carefully as before, but keeping this simple structure)
            // Re-implementing simplified create for "Mouse Up" context mainly:
            let pos = getPos(e);
            if (e.type === 'touchend') {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                if (e.changedTouches.length > 0) {
                    pos.x = (e.changedTouches[0].clientX - rect.left) * scaleX;
                    pos.y = (e.changedTouches[0].clientY - rect.top) * scaleX;
                } else { pos = startPos; } // Fallback
            }

            const w = pos.x - startPos.x;
            const h = pos.y - startPos.y;
            if (Math.abs(w) > 5 && Math.abs(h) > 5) {
                const newRect = {
                    x: w < 0 ? pos.x : startPos.x,
                    y: h < 0 ? pos.y : startPos.y,
                    w: Math.abs(w),
                    h: Math.abs(h),
                    rotation: 0
                };
                redactions.push(newRect);
                selectedIndex = redactions.length - 1;
            }
        }
        render();
    };

    // Events
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    window.addEventListener('mouseup', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    window.addEventListener('touchend', endDraw); // Window to catch release outside

    // --- Rendering ---

    const render = () => {
        if (!originalImage) return;

        // 1. Draw Image
        ctx.drawImage(originalImage, 0, 0);

        // 2. Filters
        if (isBlackAndWhite) {
            const imageData = ctx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);
            const data = imageData.data;
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                data[i] = avg; data[i + 1] = avg; data[i + 2] = avg;
            }
            ctx.putImageData(imageData, 0, 0);
        }

        // 3. Watermark (Wave V3 - Tangent)
        if (watermarkText) {
            drawWatermark(ctx, processingCanvas.width, processingCanvas.height, watermarkText);
        }

        // 4. Redactions
        redactions.forEach((r, i) => {
            ctx.save();
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            ctx.translate(cx, cy);
            ctx.rotate(r.rotation);
            ctx.fillStyle = 'black';
            ctx.fillRect(-r.w / 2, -r.h / 2, r.w, r.h);
            ctx.restore();
        });

        // Blit
        displayContext.clearRect(0, 0, canvas.width, canvas.height);
        displayContext.drawImage(processingCanvas, 0, 0);

        // 5. Draw UI (Handles) on Display Canvas ONLY
        if (selectedIndex !== -1) {
            drawHandles(displayContext, redactions[selectedIndex]);
        }
    };

    const drawHandles = (c, r) => {
        c.save();
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        c.translate(cx, cy);
        c.rotate(r.rotation);

        // Rect Border
        c.strokeStyle = '#9d4edd';
        c.lineWidth = 2;
        c.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);

        // Corners
        c.fillStyle = 'white';
        const corners = [
            [-r.w / 2, -r.h / 2], [r.w / 2, -r.h / 2],
            [r.w / 2, r.h / 2], [-r.w / 2, r.h / 2]
        ];
        corners.forEach(([x, y]) => {
            c.beginPath();
            c.arc(x, y, 6, 0, Math.PI * 2);
            c.fill();
            c.stroke();
        });

        // Rotation Handle (Double Arrow Curve)
        c.strokeStyle = 'white';
        c.lineWidth = 3;
        c.beginPath();
        // Draw an arc at top
        c.arc(0, -r.h / 2 - 25, 12, Math.PI, 0); // Upper half circle
        c.stroke();

        // Arrowheads
        // Left
        c.beginPath();
        c.moveTo(-12, -r.h / 2 - 25);
        c.lineTo(-8, -r.h / 2 - 20);
        c.lineTo(-16, -r.h / 2 - 20);
        c.closePath();
        c.fillStyle = 'white';
        c.fill();

        // Right
        c.beginPath();
        c.moveTo(12, -r.h / 2 - 25);
        c.lineTo(8, -r.h / 2 - 20);
        c.lineTo(16, -r.h / 2 - 20);
        c.closePath();
        c.fill();

        // Hit Area hint (invisible but logic knows)
        // c.fillStyle = 'rgba(255,0,0,0.3)'; c.fill_arc... for debug

        c.restore();
    };

    const drawWatermark = (c, w, h, text) => {
        c.save();
        c.globalAlpha = textOpacity;
        c.font = `bold ${fontSize}px sans-serif`;
        c.fillStyle = textColor;

        // Prepare the paragraph phrase: "text. text. text. ..."
        const phrase = text + ". ";

        const size = Math.max(w, h) * 1.5;
        c.translate(w / 2, h / 2);
        c.rotate(toRad(textIncline));
        c.translate(-size / 2, -size / 2);

        // textLineSpacing is an additive value from slider (10-100), plus base font size
        const lineHeight = fontSize + textLineSpacing;
        const waveFreq = 0.02;

        for (let lineIdx = 0; lineIdx < size / lineHeight; lineIdx++) {
            const baseY = lineIdx * lineHeight;
            // No phase offset - lines should be parallel waves ("in harmony")
            const phaseOffset = 0;

            // Randomize start X slightly just so text doesn't align perfectly in a grid (paragraph look)
            // But the WAVE form must be consistent based on X.
            // We shift X for text content, but we must use the VISUAL X for the wave.
            // Let's just start 'x' at a consistent offset or slight randomness for 'text flow'
            // but keep the wave math dependent on the absolute coords.

            let x = -200; // Start widely outside to cover rotation

            // Should we offset the text itself? The user wants "paragraph format".
            // A paragraph flows. If we just repeat text, it looks like a repeating pattern.
            // If we offset each line's text start position, it looks more like a wrapping paragraph.
            // Let's create a "flow" offset for the text content.
            let textStartOffset = (lineIdx * 50) % 200;
            x -= textStartOffset;

            while (x < size + 200) {
                // Render phrase character by character
                for (let i = 0; i < phrase.length; i++) {
                    const char = phrase[i];
                    const charWidth = c.measureText(char).width;
                    const currentX = x + charWidth / 2;

                    // Wave Y position - Depends ONLY on currentX (Absolute X) to make waves vertically aligned
                    // y_wave = sin(x)
                    const sineVal = Math.sin(currentX * waveFreq);
                    const yShift = sineVal * waveAmplitude;

                    // Tangent rotation
                    const cosVal = Math.cos(currentX * waveFreq);
                    const slope = cosVal * waveAmplitude * waveFreq;
                    const rotation = Math.atan(slope);

                    c.save();
                    c.translate(currentX, baseY + yShift); // Use absolute X for position
                    c.rotate(rotation);
                    c.fillText(char, -charWidth / 2, 0); // Draw centered at currentX
                    c.restore();

                    x += charWidth;
                    if (x > size + 200) break;
                }
            }
        }
        c.restore();
    };

    // --- Controls ---
    btnBw.addEventListener('click', () => { isBlackAndWhite = !isBlackAndWhite; render(); });
    btnClear.addEventListener('click', () => { redactions = []; selectedIndex = -1; render(); });
    btnWatermark.addEventListener('click', () => { watermarkText = inputWatermark.value.trim(); render(); });
    inputWatermark.addEventListener('keyup', (e) => { if (e.key === 'Enter') btnWatermark.click(); });

    // Color Palette Logic
    document.querySelectorAll('.color-option').forEach(option => {
        option.addEventListener('click', () => {
            // Debug log
            console.log('Color clicked:', option.getAttribute('data-color'));

            // Remove active class
            document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
            // Add active
            option.classList.add('active');
            // Set Color
            textColor = option.getAttribute('data-color');
            render();
        });
    });

    waveSlider.addEventListener('input', (e) => { waveAmplitude = parseInt(e.target.value); render(); });
    angleSlider.addEventListener('input', (e) => { textIncline = parseInt(e.target.value); render(); });
    sizeSlider.addEventListener('input', (e) => { fontSize = parseInt(e.target.value); render(); });
    opacitySlider.addEventListener('input', (e) => { textOpacity = parseInt(e.target.value) / 100; render(); });
    lineHeightSlider.addEventListener('input', (e) => { textLineSpacing = parseInt(e.target.value); render(); });
    // colorPicker.addEventListener('input', (e) => { textColor = e.target.value; render(); }); // Removed native picker listener
    btnDownload.addEventListener('click', () => {
        if (!originalImage) return;
        const prevSel = selectedIndex;
        selectedIndex = -1; // Hide handles
        render();

        const link = document.createElement('a');
        link.download = 'dni-protegido.png';
        link.href = processingCanvas.toDataURL('image/png');
        link.click();

        selectedIndex = prevSel;
        render();
    });

    btnNew.addEventListener('click', () => location.reload());
});
