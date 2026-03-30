import { ZOOM_LEVELS } from '../constants.js';
import { Renderer } from '../render/Renderer.js';
import { GridOverlay } from '../render/GridOverlay.js';

export class CanvasView {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;

        this.container = document.getElementById('canvas-area');
        this.workCanvas = document.getElementById('work-canvas');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.gridCanvas = document.getElementById('grid-canvas');
        this.checkerboard = document.getElementById('checkerboard');

        this.workCtx = this.workCanvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');

        this.renderer = new Renderer(doc);
        this.gridOverlay = new GridOverlay(this.gridCanvas);

        // Offscreen canvas at 1:1 document resolution
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = doc.width;
        this.offscreen.height = doc.height;
        this.offscreenCtx = this.offscreen.getContext('2d');

        // Zoom & pan
        this.zoomIndex = 2; // start at 4x
        this.zoom = ZOOM_LEVELS[this.zoomIndex];
        this.panX = 0;
        this.panY = 0;

        // Interaction state
        this._isPanning = false;
        this._panStartX = 0;
        this._panStartY = 0;
        this._panStartPanX = 0;
        this._panStartPanY = 0;
        this._spaceDown = false;
        this._pointerDown = false;

        this._setupResize();
        this._setupEvents();
        this._resize();
        this._centerDocument();
        this.render();
    }

    get activeTool() {
        return this._activeTool;
    }

    set activeTool(tool) {
        this._activeTool = tool;
        this._updateCursor();
    }

    _setupResize() {
        const ro = new ResizeObserver(() => this._resize());
        ro.observe(this.container);
    }

    _updateCursor() {
        if (this._activeTool) {
            this.container.style.cursor = this._activeTool.getCursor();
        }
    }

    _resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        for (const c of [this.workCanvas, this.overlayCanvas, this.gridCanvas]) {
            c.width = w;
            c.height = h;
            c.style.width = w + 'px';
            c.style.height = h + 'px';
        }

        this.render();
    }

    _centerDocument() {
        const cw = this.container.clientWidth;
        const ch = this.container.clientHeight;
        this.panX = Math.round((cw - this.doc.width * this.zoom) / 2);
        this.panY = Math.round((ch - this.doc.height * this.zoom) / 2);
    }

    _setupEvents() {
        this.container.addEventListener('pointerdown', (e) => this._onPointerDown(e));
        this.container.addEventListener('pointermove', (e) => this._onPointerMove(e));
        this.container.addEventListener('pointerup', (e) => this._onPointerUp(e));
        this.container.addEventListener('pointerleave', (e) => this._onPointerUp(e));
        this.container.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());

        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && !e.repeat) {
                this._spaceDown = true;
                this.container.style.cursor = 'grab';
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this._spaceDown = false;
                this._updateCursor();
            }
        });
    }

    screenToDoc(screenX, screenY) {
        const rect = this.container.getBoundingClientRect();
        const cx = screenX - rect.left;
        const cy = screenY - rect.top;
        const docX = Math.floor((cx - this.panX) / this.zoom);
        const docY = Math.floor((cy - this.panY) / this.zoom);
        return { x: docX, y: docY };
    }

    _onPointerDown(e) {
        // Middle mouse button or space+left click = pan
        if (e.button === 1 || (e.button === 0 && this._spaceDown)) {
            this._isPanning = true;
            this._panStartX = e.clientX;
            this._panStartY = e.clientY;
            this._panStartPanX = this.panX;
            this._panStartPanY = this.panY;
            this.container.style.cursor = 'grabbing';
            this.container.setPointerCapture(e.pointerId);
            return;
        }

        if ((e.button === 0 || e.button === 2) && this._activeTool) {
            this._pointerDown = true;
            const pos = this.screenToDoc(e.clientX, e.clientY);
            this._activeTool.onPointerDown(pos.x, pos.y, e);
            this.render();
            this.container.setPointerCapture(e.pointerId);
        }
    }

    _onPointerMove(e) {
        const pos = this.screenToDoc(e.clientX, e.clientY);

        // Update status bar position
        this.bus.emit('cursor-move', pos);

        if (this._isPanning) {
            this.panX = this._panStartPanX + (e.clientX - this._panStartX);
            this.panY = this._panStartPanY + (e.clientY - this._panStartY);
            this.render();
            return;
        }

        if (this._pointerDown && this._activeTool) {
            this._activeTool.onPointerMove(pos.x, pos.y, e);
            this.render();
        }
    }

    _onPointerUp(e) {
        if (this._isPanning) {
            this._isPanning = false;
            this.container.style.cursor = this._spaceDown ? 'grab' : (this._activeTool ? this._activeTool.getCursor() : 'crosshair');
            return;
        }

        if (this._pointerDown && this._activeTool) {
            const pos = this.screenToDoc(e.clientX, e.clientY);
            this._activeTool.onPointerUp(pos.x, pos.y, e);
            this._pointerDown = false;
            this.render();
            this.bus.emit('layer-changed');
        }
    }

    _onWheel(e) {
        e.preventDefault();

        const rect = this.container.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Document point under cursor before zoom
        const docX = (mx - this.panX) / this.zoom;
        const docY = (my - this.panY) / this.zoom;

        if (e.deltaY < 0) {
            this.zoomIndex = Math.min(this.zoomIndex + 1, ZOOM_LEVELS.length - 1);
        } else {
            this.zoomIndex = Math.max(this.zoomIndex - 1, 0);
        }

        this.zoom = ZOOM_LEVELS[this.zoomIndex];

        // Adjust pan so the same doc point stays under cursor
        this.panX = Math.round(mx - docX * this.zoom);
        this.panY = Math.round(my - docY * this.zoom);

        this.bus.emit('zoom-changed', this.zoom);
        this.render();
    }

    clearOverlay() {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }

    /**
     * Draw a preview line on the overlay canvas in screen coordinates.
     */
    drawOverlayLine(x0, y0, x1, y1, color = 'rgba(255,255,255,0.6)') {
        const ctx = this.overlayCtx;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(this.panX + (x0 + 0.5) * this.zoom, this.panY + (y0 + 0.5) * this.zoom);
        ctx.lineTo(this.panX + (x1 + 0.5) * this.zoom, this.panY + (y1 + 0.5) * this.zoom);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    /**
     * Draw a preview rect outline on the overlay canvas.
     */
    drawOverlayRect(x0, y0, x1, y1, color = 'rgba(255,255,255,0.6)') {
        const ctx = this.overlayCtx;
        const minX = Math.min(x0, x1);
        const minY = Math.min(y0, y1);
        const w = Math.abs(x1 - x0) + 1;
        const h = Math.abs(y1 - y0) + 1;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(
            this.panX + minX * this.zoom + 0.5,
            this.panY + minY * this.zoom + 0.5,
            w * this.zoom - 1,
            h * this.zoom - 1
        );
        ctx.setLineDash([]);
    }

    /**
     * Draw a preview ellipse outline on the overlay.
     */
    drawOverlayEllipse(cx, cy, rx, ry, color = 'rgba(255,255,255,0.6)') {
        const ctx = this.overlayCtx;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.ellipse(
            this.panX + (cx + 0.5) * this.zoom,
            this.panY + (cy + 0.5) * this.zoom,
            rx * this.zoom,
            ry * this.zoom,
            0, 0, Math.PI * 2
        );
        ctx.stroke();
        ctx.setLineDash([]);
    }

    render() {
        const { doc, workCtx, zoom, panX, panY } = this;
        const cw = this.workCanvas.width;
        const ch = this.workCanvas.height;

        // Composite document
        const imageData = this.renderer.composite();
        this.offscreenCtx.putImageData(imageData, 0, 0);

        // Draw to visible canvas
        workCtx.clearRect(0, 0, cw, ch);
        workCtx.imageSmoothingEnabled = false;
        workCtx.drawImage(
            this.offscreen,
            0, 0, doc.width, doc.height,
            panX, panY,
            doc.width * zoom,
            doc.height * zoom
        );

        // Update checkerboard
        const cbSize = 8 * zoom;
        this.checkerboard.style.left = panX + 'px';
        this.checkerboard.style.top = panY + 'px';
        this.checkerboard.style.width = (doc.width * zoom) + 'px';
        this.checkerboard.style.height = (doc.height * zoom) + 'px';
        this.checkerboard.style.backgroundSize = `${cbSize}px ${cbSize}px`;

        // Draw grid overlay
        this.gridOverlay.draw(doc.width, doc.height, zoom, panX, panY);
    }
}
