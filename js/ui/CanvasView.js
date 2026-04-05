import { ZOOM_LEVELS, TRANSPARENT } from '../constants.js';
import { Renderer } from '../render/Renderer.js';
import { GridOverlay } from '../render/GridOverlay.js';

export class CanvasView {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;

        this.container = document.getElementById('canvas-area');
        this.workCanvas = document.getElementById('work-canvas');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.selectionCanvas = document.getElementById('selection-canvas');
        this.gridCanvas = document.getElementById('grid-canvas');
        this.checkerboard = document.getElementById('checkerboard');

        this.workCtx = this.workCanvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.selectionCtx = this.selectionCanvas.getContext('2d');

        this.renderer = new Renderer(doc);
        this.gridOverlay = new GridOverlay(this.gridCanvas);

        // Offscreen canvas at 1:1 document resolution
        this.offscreen = document.createElement('canvas');
        this.offscreen.width = doc.width;
        this.offscreen.height = doc.height;
        this.offscreenCtx = this.offscreen.getContext('2d');

        // Zoom & pan
        this.zoomIndex = 1; // start at 2x (200%)
        this.zoom = ZOOM_LEVELS[this.zoomIndex];
        this.panX = 0;
        this.panY = 0;

        // Marching ants state
        this._marchingAntsOffset = 0;
        this._marchingAntsRAF = null;
        this._selectionEdges = null;

        // Interaction state
        this._isPanning = false;
        this._panStartX = 0;
        this._panStartY = 0;
        this._panStartPanX = 0;
        this._panStartPanY = 0;
        this._spaceDown = false;
        this._pointerDown = false;
        this._lastDocX = 0;
        this._lastDocY = 0;
        this._lastScreenX = 0;
        this._lastScreenY = 0;
        this._lastMoveEvent = null;

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
        if (tool && tool.onHover) {
            tool.onHover(this._lastDocX, this._lastDocY);
        } else {
            this.clearOverlay();
        }
        this._updateCursor();
    }

    _setupResize() {
        const ro = new ResizeObserver(() => this._resize());
        ro.observe(this.container);
    }

    _replayLastMove(keyEvent) {
        const pos = this.screenToDoc(this._lastMoveEvent.clientX, this._lastMoveEvent.clientY);
        this._activeTool.onPointerMove(pos.x, pos.y, keyEvent);
        this.render();
    }

    _updateCursor() {
        if (this._activeTool) {
            this.container.style.cursor = this._activeTool.getCursor();
        }
    }

    _resize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        for (const c of [this.workCanvas, this.overlayCanvas, this.selectionCanvas, this.gridCanvas]) {
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
        this.container.addEventListener('pointerleave', (e) => {
            this._onPointerUp(e);
            this.clearOverlay();
        });
        this.container.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
        this.container.addEventListener('contextmenu', (e) => e.preventDefault());

        document.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            if (e.code === 'Space' && !e.repeat && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
                this._spaceDown = true;
                this.container.style.cursor = 'grab';
                e.preventDefault();
            }
            if (e.key === 'Shift' && this._lastMoveEvent) {
                this._replayLastMove(e);
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.code === 'Space') {
                this._spaceDown = false;
                this._updateCursor();
            }
            if (e.key === 'Shift' && this._lastMoveEvent) {
                this._replayLastMove(e);
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
        this._lastDocX = pos.x;
        this._lastDocY = pos.y;
        const rect = this.container.getBoundingClientRect();
        this._lastScreenX = e.clientX - rect.left;
        this._lastScreenY = e.clientY - rect.top;

        // Update status bar position
        this.bus.emit('cursor-move', pos);

        if (this._isPanning) {
            this.panX = this._panStartPanX + (e.clientX - this._panStartX);
            this.panY = this._panStartPanY + (e.clientY - this._panStartY);
            this.render();
            return;
        }

        if (this._pointerDown && this._activeTool) {
            this._lastMoveEvent = e;
            this._activeTool.onPointerMove(pos.x, pos.y, e);
            this.render();
        } else if (!this._spaceDown && this._activeTool && this._activeTool.onHover) {
            this._activeTool.onHover(pos.x, pos.y);
            this.container.style.cursor = this._activeTool.getCursor();
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
            this._lastMoveEvent = null;
            this._updateCursor();
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

    drawBrushPreview(docX, docY) {
        this.clearOverlay();
        const brush = this.doc.activeBrush;
        const { zoom, panX, panY } = this;
        const ctx = this.overlayCtx;
        const ox = brush.originX;
        const oy = brush.originY;

        for (let by = 0; by < brush.height; by++) {
            for (let bx = 0; bx < brush.width; bx++) {
                const idx = brush.data[by * brush.width + bx];
                if (idx === TRANSPARENT) continue;
                const dx = docX + bx - ox;
                const dy = docY + by - oy;
                if (dx < 0 || dx >= this.doc.width || dy < 0 || dy >= this.doc.height) continue;
                const colorIndex = brush.isCaptured ? idx : this.doc.fgColorIndex;
                const [r, g, b] = this.doc.palette.getColor(colorIndex);
                ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
                ctx.fillRect(panX + dx * zoom, panY + dy * zoom, zoom, zoom);
            }
        }
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

        // Update offscreen canvas if document dimensions changed
        if (this.offscreen.width !== doc.width || this.offscreen.height !== doc.height) {
            this.offscreen.width = doc.width;
            this.offscreen.height = doc.height;
        }

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

        // Redraw marching ants or transform box
        if (this._activeTool && this._activeTool.isTransformActive) {
            // Draw transform box instead of marching ants
            const ctx = this.selectionCtx;
            ctx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
            this._activeTool.drawTransformBox(ctx, zoom, panX, panY);
        } else if (this.doc.selection.active) {
            this._drawMarchingAnts();
        }

        // Redraw brush preview if the active tool supports it
        if (this._activeTool && this._activeTool.onHover && !this._pointerDown) {
            this._activeTool.onHover(this._lastDocX, this._lastDocY);
        }
    }

    // --- Marching ants selection overlay ---

    invalidateSelectionEdges() {
        this._selectionEdges = null;
    }

    startMarchingAnts() {
        if (this._marchingAntsRAF) return;
        let lastTime = 0;
        const animate = (time) => {
            if (time - lastTime >= 100) { // ~10fps for smooth march
                this._marchingAntsOffset = (this._marchingAntsOffset + 1) % 16;
                this._drawMarchingAnts();
                lastTime = time;
            }
            this._marchingAntsRAF = requestAnimationFrame(animate);
        };
        this._marchingAntsRAF = requestAnimationFrame(animate);
    }

    stopMarchingAnts() {
        if (this._marchingAntsRAF) {
            cancelAnimationFrame(this._marchingAntsRAF);
            this._marchingAntsRAF = null;
        }
        const ctx = this.selectionCtx;
        ctx.clearRect(0, 0, this.selectionCanvas.width, this.selectionCanvas.height);
    }

    _computeSelectionEdges() {
        const sel = this.doc.selection;
        if (!sel.active) return [];

        const w = sel.width;
        const h = sel.height;
        const mask = sel.mask;
        const edges = [];

        // For floating selection, compute edges from floating bounds
        if (sel.hasFloating()) {
            const f = sel.floating;
            for (let fy = 0; fy < f.height; fy++) {
                for (let fx = 0; fx < f.width; fx++) {
                    if (!f.mask[fy * f.width + fx]) continue;
                    const docX = f.originX + fx;
                    const docY = f.originY + fy;
                    // Check 4 neighbors in floating mask space
                    const hasTop = (fy > 0 && f.mask[(fy - 1) * f.width + fx]);
                    const hasBottom = (fy < f.height - 1 && f.mask[(fy + 1) * f.width + fx]);
                    const hasLeft = (fx > 0 && f.mask[fy * f.width + fx - 1]);
                    const hasRight = (fx < f.width - 1 && f.mask[fy * f.width + fx + 1]);
                    if (!hasTop) edges.push(docX, docY, docX + 1, docY);           // top
                    if (!hasBottom) edges.push(docX, docY + 1, docX + 1, docY + 1); // bottom
                    if (!hasLeft) edges.push(docX, docY, docX, docY + 1);           // left
                    if (!hasRight) edges.push(docX + 1, docY, docX + 1, docY + 1);  // right
                }
            }
            return edges;
        }

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (!mask[y * w + x]) continue;
                // Check 4 neighbors
                const hasTop = (y > 0 && mask[(y - 1) * w + x]);
                const hasBottom = (y < h - 1 && mask[(y + 1) * w + x]);
                const hasLeft = (x > 0 && mask[y * w + x - 1]);
                const hasRight = (x < w - 1 && mask[y * w + x + 1]);
                if (!hasTop) edges.push(x, y, x + 1, y);
                if (!hasBottom) edges.push(x, y + 1, x + 1, y + 1);
                if (!hasLeft) edges.push(x, y, x, y + 1);
                if (!hasRight) edges.push(x + 1, y, x + 1, y + 1);
            }
        }
        return edges;
    }

    _mergeEdges(edges) {
        // Separate into horizontal (same y) and vertical (same x) edges
        const hEdges = []; // [x1, y, x2] where x1 < x2
        const vEdges = []; // [x, y1, y2] where y1 < y2
        for (let i = 0; i < edges.length; i += 4) {
            const x1 = edges[i], y1 = edges[i + 1], x2 = edges[i + 2], y2 = edges[i + 3];
            if (y1 === y2) {
                hEdges.push([Math.min(x1, x2), y1, Math.max(x1, x2)]);
            } else {
                vEdges.push([x1, Math.min(y1, y2), Math.max(y1, y2)]);
            }
        }
        // Merge horizontal: sort by y then x, merge contiguous
        hEdges.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        const merged = [];
        for (let i = 0; i < hEdges.length; i++) {
            let [x1, y, x2] = hEdges[i];
            while (i + 1 < hEdges.length && hEdges[i + 1][1] === y && hEdges[i + 1][0] === x2) {
                x2 = hEdges[++i][2];
            }
            merged.push(x1, y, x2, y);
        }
        // Merge vertical: sort by x then y, merge contiguous
        vEdges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        for (let i = 0; i < vEdges.length; i++) {
            let [x, y1, y2] = vEdges[i];
            while (i + 1 < vEdges.length && vEdges[i + 1][0] === x && vEdges[i + 1][1] === y2) {
                y2 = vEdges[++i][2];
            }
            merged.push(x, y1, x, y2);
        }
        return merged;
    }

    _drawMarchingAnts() {
        const ctx = this.selectionCtx;
        const cw = this.selectionCanvas.width;
        const ch = this.selectionCanvas.height;
        ctx.clearRect(0, 0, cw, ch);

        // Don't draw ants during free transform — render() draws the transform box
        if (this._activeTool && this._activeTool.isTransformActive) {
            this._activeTool.drawTransformBox(ctx, this.zoom, this.panX, this.panY);
            return;
        }

        const sel = this.doc.selection;
        if (!sel.active) return;

        if (!this._selectionEdges) {
            this._selectionEdges = this._mergeEdges(this._computeSelectionEdges());
        }

        const edges = this._selectionEdges;
        if (edges.length === 0) return;

        const { zoom, panX, panY } = this;

        // Draw black dashes then white dashes offset
        for (let pass = 0; pass < 2; pass++) {
            ctx.strokeStyle = pass === 0 ? '#000' : '#fff';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.lineDashOffset = pass === 0 ? -this._marchingAntsOffset : -(this._marchingAntsOffset + 4);
            ctx.beginPath();
            for (let i = 0; i < edges.length; i += 4) {
                const sx = panX + edges[i] * zoom;
                const sy = panY + edges[i + 1] * zoom;
                const ex = panX + edges[i + 2] * zoom;
                const ey = panY + edges[i + 3] * zoom;
                ctx.moveTo(sx + 0.5, sy + 0.5);
                ctx.lineTo(ex + 0.5, ey + 0.5);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Draw resize handles if active tool supports them
        if (this._activeTool && this._activeTool.showsResizeHandles) {
            this._drawResizeHandles();
        }
    }

    _getResizeHandlePositions() {
        const sel = this.doc.selection;
        if (!sel.active || sel.hasFloating()) return null;
        const bounds = sel.getBounds();
        if (!bounds) return null;

        const { minX, minY, maxX, maxY } = bounds;
        const { zoom, panX, panY } = this;

        const left = panX + minX * zoom;
        const top = panY + minY * zoom;
        const right = panX + (maxX + 1) * zoom;
        const bottom = panY + (maxY + 1) * zoom;
        const midX = (left + right) / 2;
        const midY = (top + bottom) / 2;

        return [
            { id: 'nw', x: left, y: top },
            { id: 'n',  x: midX, y: top },
            { id: 'ne', x: right, y: top },
            { id: 'e',  x: right, y: midY },
            { id: 'se', x: right, y: bottom },
            { id: 's',  x: midX, y: bottom },
            { id: 'sw', x: left, y: bottom },
            { id: 'w',  x: left, y: midY },
        ];
    }

    hitTestResizeHandle() {
        const handles = this._getResizeHandlePositions();
        if (!handles) return null;

        const screenX = this._lastScreenX;
        const screenY = this._lastScreenY;
        const halfSize = 5;

        for (const h of handles) {
            if (Math.abs(screenX - h.x) <= halfSize && Math.abs(screenY - h.y) <= halfSize) {
                return h.id;
            }
        }
        return null;
    }

    _drawResizeHandles() {
        const handles = this._getResizeHandlePositions();
        if (!handles) return;

        const ctx = this.selectionCtx;
        const size = 7;
        const half = Math.floor(size / 2);

        for (const h of handles) {
            ctx.fillStyle = '#fff';
            ctx.fillRect(h.x - half, h.y - half, size, size);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.strokeRect(h.x - half + 0.5, h.y - half + 0.5, size - 1, size - 1);
        }
    }
}
