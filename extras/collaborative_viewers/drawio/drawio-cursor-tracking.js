(function () {
    const container = document.querySelector('.geDiagramContainer');
    const canvas = document.querySelector('.geBackgroundPage');

    if (!container || !canvas) {
        console.warn('[Drawio Cursor] Container or canvas not found');
        return;
    }

    let lastPosition = null;
    const remoteCursors = new Map();

    function getCanvasScale() {
        const transform = window.getComputedStyle(canvas).transform;
        if (transform && transform !== 'none') {
            const matrix = transform.match(/matrix\(([^)]+)\)/);
            if (matrix) {
                const values = matrix[1].split(',').map(v => parseFloat(v.trim()));
                return values[0];
            }
        }
        return 1;
    }

    function getCanvasPosition(e) {
        const canvasRect = canvas.getBoundingClientRect();
        const scale = getCanvasScale();

        const scaledOffsetX = e.clientX - canvasRect.left;
        const scaledOffsetY = e.clientY - canvasRect.top;

        const unscaledOffsetX = scaledOffsetX / scale;
        const unscaledOffsetY = scaledOffsetY / scale;

        const unscaledWidth = canvasRect.width / scale;
        const unscaledHeight = canvasRect.height / scale;

        const normalizedX = unscaledOffsetX / unscaledWidth;
        const normalizedY = unscaledOffsetY / unscaledHeight;

        return {
            normalizedX: normalizedX,
            normalizedY: normalizedY,
            timestamp: Date.now()
        };
    }

    container.addEventListener('mousemove', function (e) {
        const canvasRect = canvas.getBoundingClientRect();
        const isOverCanvas = e.clientX >= canvasRect.left &&
            e.clientX <= canvasRect.right &&
            e.clientY >= canvasRect.top &&
            e.clientY <= canvasRect.bottom;

        if (!isOverCanvas) {
            if (lastPosition !== null) {
                lastPosition = null;
                window.parent.postMessage(JSON.stringify({
                    event: 'cursorPosition',
                    position: null
                }), '*');
            }
            return;
        }

        const pos = getCanvasPosition(e);
        if (!lastPosition ||
            Math.abs(pos.normalizedX - lastPosition.normalizedX) > 0.005 ||
            Math.abs(pos.normalizedY - lastPosition.normalizedY) > 0.005) {
            lastPosition = pos;
            window.parent.postMessage(JSON.stringify({
                event: 'cursorPosition',
                position: pos
            }), '*');
        }
    });

    container.addEventListener('mouseleave', function () {
        if (lastPosition !== null) {
            lastPosition = null;
            window.parent.postMessage(JSON.stringify({
                event: 'cursorPosition',
                position: null
            }), '*');
        }
    });

    window.addEventListener('message', function (e) {
        try {
            const msg = JSON.parse(e.data);
            if (msg.action === 'updateRemoteCursors') {
                updateRemoteCursors(msg.cursors);
            }
        } catch (err) {
        }
    });

    function createCursorElement(user) {
        const cursor = document.createElement('div');
        cursor.className = 'remote-cursor';
        cursor.style.cssText = `
            position: fixed;
            pointer-events: none;
            z-index: 10000;
            transition: transform 0.1s ease-out;
            transform-origin: 0 0;
            left: 0;
            top: 0;
        `;

        cursor.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
                <path d="M5 3 L5 17 L8 14 L11 20 L13 19 L10 13 L15 13 Z" 
                      fill="${user.color || '#4A90E2'}" 
                      stroke="white" 
                      stroke-width="1"/>
            </svg>
            <div style="
                position: absolute;
                left: 20px;
                top: 0;
                background: ${user.color || '#4A90E2'};
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 12px;
                white-space: nowrap;
                font-family: system-ui, -apple-system, sans-serif;
            ">${user.username}</div>
        `;

        document.body.appendChild(cursor);
        return cursor;
    }

    function updateRemoteCursors(cursors) {
        const activeCursors = new Set();
        const canvas = document.querySelector('.geBackgroundPage');
        const localCanvasRect = canvas.getBoundingClientRect();
        const localScale = getCanvasScale();

        const localUnscaledWidth = localCanvasRect.width / localScale;
        const localUnscaledHeight = localCanvasRect.height / localScale;

        cursors.forEach(cursor => {
            activeCursors.add(cursor.clientId);

            let cursorElement = remoteCursors.get(cursor.clientId);
            if (!cursorElement) {
                cursorElement = createCursorElement(cursor.user);
                remoteCursors.set(cursor.clientId, cursorElement);
            }

            if (cursor.position) {
                const unscaledOffsetX = cursor.position.normalizedX * localUnscaledWidth;
                const unscaledOffsetY = cursor.position.normalizedY * localUnscaledHeight;

                const scaledOffsetX = unscaledOffsetX * localScale;
                const scaledOffsetY = unscaledOffsetY * localScale;

                const x = scaledOffsetX + localCanvasRect.left;
                const y = scaledOffsetY + localCanvasRect.top;

                cursorElement.style.transform = `translate(${x}px, ${y}px)`;
                cursorElement.style.display = 'block';
            } else {
                cursorElement.style.display = 'none';
            }
        });

        remoteCursors.forEach((element, clientId) => {
            if (!activeCursors.has(clientId)) {
                element.remove();
                remoteCursors.delete(clientId);
            }
        });
    }
})();