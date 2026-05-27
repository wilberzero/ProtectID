document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const uploadSection = document.getElementById('upload-section');
    const editorSection = document.getElementById('editor-section');
    const fileInput = document.getElementById('file-input');
    const canvas = document.getElementById('dni-canvas');
    const displayContext = canvas.getContext('2d');

    // Tools
    const btnAddRect = document.getElementById('btn-add-rect');
    const btnBw = document.getElementById('btn-bw');
    const btnClear = document.getElementById('btn-clear');
    const btnDelete = document.getElementById('btn-delete');
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
    let lastPos = { x: 0, y: 0 }; // Track last position for touch events
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

        // 1. Create object URL from file
        const objectUrl = URL.createObjectURL(file);
        const tempImg = new Image();

        tempImg.onload = () => {
            URL.revokeObjectURL(objectUrl);

            // 2. Calculate new dimensions (Max 1920px due to mobile RAM limits)
            const MAX_DIM = 1920;
            let width = tempImg.width;
            let height = tempImg.height;

            if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) {
                    height = Math.round((height * MAX_DIM) / width);
                    width = MAX_DIM;
                } else {
                    width = Math.round((width * MAX_DIM) / height);
                    height = MAX_DIM;
                }
            }

            // 3. Resize using canvas
            processingCanvas.width = width;
            processingCanvas.height = height;
            ctx.drawImage(tempImg, 0, 0, width, height);

            // 4. Create optimized Image object for the app to use
            const optimizedImg = new Image();
            optimizedImg.onload = () => {
                originalImage = optimizedImg;

                // Set main canvas size
                canvas.width = width;
                canvas.height = height;

                // UI Transition
                uploadSection.classList.add('hidden');
                editorSection.classList.remove('hidden');

                // Reset State
                redactions = [];
                selectedIndex = -1;
                isBlackAndWhite = false;
                watermarkText = '';
                inputWatermark.value = '';

                render();
            };

            // Export from canvas to new image (High quality JPEG)
            optimizedImg.src = processingCanvas.toDataURL('image/jpeg', 0.85);
        };

        tempImg.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            alert('Error al cargar la imagen. Intenta usar una imagen de la galería.');
        };

        tempImg.src = objectUrl;
    };

    // Handle click on upload zone
    // Handle click on upload zone
    uploadSection.addEventListener('click', (e) => {
        // Prevent infinite loop if the click originated from the input itself
        if (e.target === fileInput) return;

        e.preventDefault();
        e.stopPropagation();
        fileInput.click();
    });

    uploadSection.addEventListener('dragover', (e) => { e.preventDefault(); uploadSection.classList.add('dragover'); });
    uploadSection.addEventListener('dragleave', () => uploadSection.classList.remove('dragover'));
    uploadSection.addEventListener('drop', (e) => { e.preventDefault(); uploadSection.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });

    // Important: Handle file input change with proper event handling for camera
    fileInput.addEventListener('change', (e) => {
        // e.preventDefault(); // Removed to allow default behavior
        const file = e.target.files[0];
        if (file) {
            handleFile(file);
        }
        // Reset input value to allow re-selecting the same file
        e.target.value = '';
    });

    // --- Interaction Logic ---

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX = 0;
        let clientY = 0;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            clientX = e.changedTouches[0].clientX;
            clientY = e.changedTouches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    };

    // Hit Testing
    const hitTest = (pos) => {
        const rect = canvas.getBoundingClientRect();
        const scaleFactor = canvas.width / rect.width;

        // Dynamic hit-test sizes in canvas pixels based on CSS-pixel touch sizes
        // Standard finger touch size is ~20px CSS radius (40px width)
        const hitThreshold = 20 * scaleFactor;
        const rotationOffset = 30 * scaleFactor;

        // Check selection handles first
        if (selectedIndex !== -1) {
            const r = redactions[selectedIndex];
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;

            // Rotation Handle
            const rotHandlePos = rotatePoint(cx, r.y - rotationOffset, cx, cy, r.rotation);
            if (dist(pos, rotHandlePos) < hitThreshold) return 'rotate';

            // Local coordinates
            const localPos = getLocalPoint(pos.x, pos.y, r);

            // Check corners
            if (dist(localPos, { x: r.x, y: r.y }) < hitThreshold) return 'resize-tl';
            if (dist(localPos, { x: r.x + r.w, y: r.y }) < hitThreshold) return 'resize-tr';
            if (dist(localPos, { x: r.x, y: r.y + r.h }) < hitThreshold) return 'resize-bl';
            if (dist(localPos, { x: r.x + r.w, y: r.y + r.h }) < hitThreshold) return 'resize-br';

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

    // Touch Handling State 
    let isScrolling = null; // null: unknown, true: scrolling, false: drawing/editing

    const startDraw = (e) => {
        // IMPORTANT: Do NOT preventDefault here to allow potential scrolling initialization
        const pos = getPos(e);
        const hit = hitTest(pos);
        isScrolling = null; // Reset gesture detection

        startPos = pos;
        lastPos = pos;
        isDragging = true;

        if ((typeof hit === 'object' && hit.type === 'select') || (hit !== 'create')) {
            // If hitting an element, we assume intent to edit -> Block scroll immediately
            isScrolling = false;
            selectedIndex = (typeof hit === 'object') ? hit.index : selectedIndex;
            dragMode = (typeof hit === 'object') ? 'move' : hit;
            initialRectState = { ...redactions[selectedIndex] };
        } else {
            // Hitting background -> Could be scroll OR create
            // We wait for moveDraw to decide based on direction
            selectedIndex = -1; // Deselect
            dragMode = 'create';
            isScrolling = null;
        }

        render(); // Update selection verify
    };

    const moveDraw = (e) => {
        const isMouseEvent = e.type === 'mousemove';

        // Hover cursor styling for desktop
        if (!isDragging && isMouseEvent) {
            const pos = getPos(e);
            const hit = hitTest(pos);

            if (hit === 'move' || (typeof hit === 'object' && hit.type === 'select')) {
                canvas.style.cursor = 'move';
            } else if (hit === 'rotate') {
                canvas.style.cursor = 'pointer';
            } else if (hit === 'resize-tl' || hit === 'resize-br') {
                canvas.style.cursor = 'nwse-resize';
            } else if (hit === 'resize-tr' || hit === 'resize-bl') {
                canvas.style.cursor = 'nesw-resize';
            } else {
                canvas.style.cursor = 'crosshair';
            }
        }

        if (!isDragging) return;

        const pos = getPos(e);
        const dx = pos.x - startPos.x;
        const dy = pos.y - startPos.y;

        // Disambiguate Scroll vs Draw
        if (isScrolling === null) {
            // Ignore tiny movements to avoid jitter
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

            // If movement is vertical, assume scroll
            if (Math.abs(dy) > Math.abs(dx)) {
                isScrolling = true;
                isDragging = false; // Stop internal drag logic
                if (isMouseEvent) canvas.style.cursor = 'default';
                return; // Allow native scroll
            } else {
                // Horizontal or Diagonal -> Draw
                isScrolling = false;
            }
        }

        if (isScrolling) return; // Let browser scroll

        e.preventDefault(); // Block scroll if we are drawing/editing
        lastPos = pos; // Update last known position for logic

        // Active drag cursor styling for desktop
        if (isMouseEvent) {
            if (dragMode === 'move') {
                canvas.style.cursor = 'grabbing';
            } else if (dragMode === 'rotate') {
                canvas.style.cursor = 'pointer';
            } else if (dragMode.startsWith('resize')) {
                if (dragMode === 'resize-tl' || dragMode === 'resize-br') {
                    canvas.style.cursor = 'nwse-resize';
                } else {
                    canvas.style.cursor = 'nesw-resize';
                }
            } else if (dragMode === 'create') {
                canvas.style.cursor = 'crosshair';
            }
        }

        if (dragMode === 'create') {
            render(); // Clear
            
            const x = Math.min(startPos.x, pos.x);
            const y = Math.min(startPos.y, pos.y);
            const w = Math.abs(pos.x - startPos.x);
            const h = Math.abs(pos.y - startPos.y);
            
            // Draw a premium gray semi-transparent preview rectangle
            displayContext.fillStyle = 'rgba(160, 160, 180, 0.4)';
            displayContext.fillRect(x, y, w, h);
            
            // Draw a beautiful dashed border to make it feel extremely premium
            displayContext.strokeStyle = '#a0a0b0';
            displayContext.lineWidth = 2;
            displayContext.setLineDash([6, 4]);
            displayContext.strokeRect(x, y, w, h);
            displayContext.setLineDash([]); // Reset line dash
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
            const theta = initialRectState.rotation;
            const cx_0 = initialRectState.x + initialRectState.w / 2;
            const cy_0 = initialRectState.y + initialRectState.h / 2;

            // Determine which corner is fixed (opposite of the dragged corner)
            let dx_local = 0;
            let dy_local = 0;

            if (dragMode === 'resize-tl') {
                dx_local = initialRectState.w / 2;
                dy_local = initialRectState.h / 2;
            } else if (dragMode === 'resize-tr') {
                dx_local = -initialRectState.w / 2;
                dy_local = initialRectState.h / 2;
            } else if (dragMode === 'resize-bl') {
                dx_local = initialRectState.w / 2;
                dy_local = -initialRectState.h / 2;
            } else if (dragMode === 'resize-br') {
                dx_local = -initialRectState.w / 2;
                dy_local = -initialRectState.h / 2;
            }

            // Calculate world coordinates of the fixed opposite corner
            const fixedWorld = rotatePoint(cx_0 + dx_local, cy_0 + dy_local, cx_0, cy_0, theta);

            // Transform current mouse to the initial rect's local space
            const localMouse = getLocalPoint(pos.x, pos.y, initialRectState);

            // Calculate new local dimensions relative to the initial unrotated tl
            let w_prime = 0;
            let h_prime = 0;

            if (dragMode === 'resize-br') {
                w_prime = localMouse.x - initialRectState.x;
                h_prime = localMouse.y - initialRectState.y;
            } else if (dragMode === 'resize-tl') {
                w_prime = (initialRectState.x + initialRectState.w) - localMouse.x;
                h_prime = (initialRectState.y + initialRectState.h) - localMouse.y;
            } else if (dragMode === 'resize-tr') {
                w_prime = localMouse.x - initialRectState.x;
                h_prime = (initialRectState.y + initialRectState.h) - localMouse.y;
            } else if (dragMode === 'resize-bl') {
                w_prime = (initialRectState.x + initialRectState.w) - localMouse.x;
                h_prime = localMouse.y - initialRectState.y;
            }

            // Clamp new dimensions to a minimum size (e.g., 15 canvas pixels)
            w_prime = Math.max(15, w_prime);
            h_prime = Math.max(15, h_prime);

            // Now compute the new local offset relative to new center
            let dx_local_prime = 0;
            let dy_local_prime = 0;

            if (dragMode === 'resize-tl') {
                dx_local_prime = w_prime / 2;
                dy_local_prime = h_prime / 2;
            } else if (dragMode === 'resize-tr') {
                dx_local_prime = -w_prime / 2;
                dy_local_prime = h_prime / 2;
            } else if (dragMode === 'resize-bl') {
                dx_local_prime = w_prime / 2;
                dy_local_prime = -h_prime / 2;
            } else if (dragMode === 'resize-br') {
                dx_local_prime = -w_prime / 2;
                dy_local_prime = -h_prime / 2;
            }

            const cx_prime = fixedWorld.x - (dx_local_prime * Math.cos(theta) - dy_local_prime * Math.sin(theta));
            const cy_prime = fixedWorld.y - (dx_local_prime * Math.sin(theta) + dy_local_prime * Math.cos(theta));

            r.w = w_prime;
            r.h = h_prime;
            r.x = cx_prime - w_prime / 2;
            r.y = cy_prime - h_prime / 2;
        }

        render();
    };

    const endDraw = (e) => {
        if (!isDragging) return;
        isDragging = false;

        // Reset cursor to default on drag end
        canvas.style.cursor = 'default';

        if (dragMode === 'create') {
            // Use lastPos which was tracked during move, or try to get from changedTouches
            let pos = lastPos;

            // For mouse events, try to get the final position
            if (e.type === 'mouseup') {
                pos = getPos(e);
            } else if (e.type === 'touchend' && e.changedTouches && e.changedTouches.length > 0) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                pos = {
                    x: (e.changedTouches[0].clientX - rect.left) * scaleX,
                    y: (e.changedTouches[0].clientY - rect.top) * scaleX
                };
            }
            // If pos is still at origin (no movement), use startPos as fallback
            if (pos.x === 0 && pos.y === 0) {
                pos = startPos;
            }

            const w = pos.x - startPos.x;
            const h = pos.y - startPos.y;
            if (Math.abs(w) > 5 && Math.abs(h) > 5) {
                const newRect = {
                    x: Math.min(pos.x, startPos.x),
                    y: Math.min(pos.y, startPos.y),
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

    let isRendering = false;
    const drawScene = () => {
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

    const updateUIState = () => {
        if (selectedIndex !== -1) {
            btnDelete.classList.remove('hidden');
        } else {
            btnDelete.classList.add('hidden');
        }
    };

    const render = () => {
        updateUIState();
        if (!isRendering) {
            isRendering = true;
            requestAnimationFrame(() => {
                drawScene();
                isRendering = false;
            });
        }
    };

    const drawHandles = (c, r) => {
        const rectLayout = canvas.getBoundingClientRect();
        const scaleFactor = canvas.width / rectLayout.width;

        // Custom scaled parameters so handles have a constant CSS layout size
        const borderLineWidth = 2 * scaleFactor;
        const handleRadius = 6 * scaleFactor;
        const handleBorderWidth = 1.5 * scaleFactor;
        
        const rotationOffset = 30 * scaleFactor;
        const rotationRadius = 12 * scaleFactor;
        const rotationLineWidth = 2.5 * scaleFactor;
        
        c.save();
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        c.translate(cx, cy);
        c.rotate(r.rotation);

        // Rect Border
        c.strokeStyle = '#9d4edd';
        c.lineWidth = borderLineWidth;
        c.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);

        // Corners
        c.fillStyle = 'white';
        c.strokeStyle = '#9d4edd';
        c.lineWidth = handleBorderWidth;
        const corners = [
            [-r.w / 2, -r.h / 2], [r.w / 2, -r.h / 2],
            [r.w / 2, r.h / 2], [-r.w / 2, r.h / 2]
        ];
        corners.forEach(([x, y]) => {
            c.beginPath();
            c.arc(x, y, handleRadius, 0, Math.PI * 2);
            c.fill();
            c.stroke();
        });

        // Rotation Handle (Curve)
        c.strokeStyle = 'white';
        c.lineWidth = rotationLineWidth;
        c.beginPath();
        c.arc(0, -r.h / 2 - rotationOffset, rotationRadius, Math.PI, 0); // Upper half circle
        c.stroke();

        // Arrowheads
        const arrowSize = 4 * scaleFactor;
        
        // Left arrowhead
        c.beginPath();
        c.moveTo(-rotationRadius, -r.h / 2 - rotationOffset);
        c.lineTo(-rotationRadius + arrowSize, -r.h / 2 - rotationOffset + arrowSize);
        c.lineTo(-rotationRadius - arrowSize, -r.h / 2 - rotationOffset + arrowSize);
        c.closePath();
        c.fillStyle = 'white';
        c.fill();

        // Right arrowhead
        c.beginPath();
        c.moveTo(rotationRadius, -r.h / 2 - rotationOffset);
        c.lineTo(rotationRadius - arrowSize, -r.h / 2 - rotationOffset + arrowSize);
        c.lineTo(rotationRadius + arrowSize, -r.h / 2 - rotationOffset + arrowSize);
        c.closePath();
        c.fill();

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

    // Add Rect Button logic
    btnAddRect.addEventListener('click', () => {
        if (!originalImage) return;
        
        // Add a default-sized box in the center of the canvas
        const boxWidth = Math.min(200, canvas.width * 0.3);
        const boxHeight = Math.min(100, canvas.height * 0.15);
        const boxX = (canvas.width - boxWidth) / 2;
        const boxY = (canvas.height - boxHeight) / 2;
        
        const newRect = {
            x: boxX,
            y: boxY,
            w: boxWidth,
            h: boxHeight,
            rotation: 0
        };
        
        redactions.push(newRect);
        selectedIndex = redactions.length - 1;
        render();
    });

    // Delete selected rect logic
    btnDelete.addEventListener('click', () => {
        if (selectedIndex !== -1) {
            redactions.splice(selectedIndex, 1);
            selectedIndex = -1;
            render();
        }
    });

    // Add keyboard shortcuts for deletion
    window.addEventListener('keydown', (e) => {
        if (selectedIndex !== -1 && (e.key === 'Delete' || e.key === 'Backspace')) {
            // Prevent browser back navigation on Backspace
            e.preventDefault();
            redactions.splice(selectedIndex, 1);
            selectedIndex = -1;
            render();
        }
    });

    btnNew.addEventListener('click', () => location.reload());
});
