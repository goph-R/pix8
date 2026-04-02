import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';

const HANDLE_CURSORS = {
    'nw': 'nwse-resize', 'se': 'nwse-resize',
    'ne': 'nesw-resize', 'sw': 'nesw-resize',
    'n': 'ns-resize', 's': 'ns-resize',
    'e': 'ew-resize', 'w': 'ew-resize',
};

const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<path d='M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round'/>` +
    `<path d='M12 4c4.4 0 8 3.6 8 8s-3.6 8-8 8-8-3.6-8-8' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'/>` +
    `<path d='M12 1l3 3-3 3' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'/>` +
    `<path d='M12 1l3 3-3 3' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/>` +
    `</svg>`
)}") 12 12, crosshair`;

export class FreeTransformTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Free Transform';
        this.shortcut = 'T';
        this.icon = `<svg viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" fill="none" stroke-dasharray="2,2"/><rect x="1" y="1" width="3" height="3"/><rect x="8" y="1" width="3" height="3"/><rect x="16" y="1" width="3" height="3"/><rect x="16" y="8" width="3" height="3"/><rect x="16" y="16" width="3" height="3"/><rect x="8" y="16" width="3" height="3"/><rect x="1" y="16" width="3" height="3"/><rect x="1" y="8" width="3" height="3"/></svg>`;
        this._active = false;
        this._previousToolName = null;
        this._sourceFloating = null; // backup for cancel
        this._transform = null; // { tx, ty, sx, sy, rotation, cx, cy }
        this._dragMode = null; // 'move', 'resize', 'rotate'
        this._resizeHandle = null;
        this._startX = 0;
        this._startY = 0;
        this._startTransform = null;
        this._startAngle = 0;
        this._hoverMode = null; // 'move', handle id, 'rotate'
    }

    get isTransformActive() {
        return this._active;
    }

    getCursor() {
        if (this._dragMode === 'rotate' || this._hoverMode === 'rotate') return ROTATE_CURSOR;
        if (this._dragMode === 'move' || this._hoverMode === 'move') return 'move';
        const handle = this._resizeHandle || this._hoverMode;
        if (handle && HANDLE_CURSORS[handle]) return HANDLE_CURSORS[handle];
        return 'crosshair';
    }

    activate(previousToolName, undoManager) {
        const sel = this.doc.selection;
        if (!sel.active) return false;

        this._previousToolName = previousToolName;
        this._undoManager = undoManager;

        undoManager.beginOperation();

        // Lift to floating if not already
        if (!sel.hasFloating()) {
            sel.liftPixels(this.doc.getActiveLayer());
        }

        // Backup floating data for cancel
        const f = sel.floating;
        this._sourceFloating = {
            data: new Uint16Array(f.data),
            mask: new Uint8Array(f.mask),
            width: f.width, height: f.height,
            originX: f.originX, originY: f.originY,
        };

        // Initialize transform
        this._transform = {
            tx: 0, ty: 0,
            sx: 1, sy: 1,
            rotation: 0,
            cx: f.originX + f.width / 2,
            cy: f.originY + f.height / 2,
        };

        // Set transform on selection for renderer
        sel.floatingTransform = this._transform;

        this._active = true;
        this.bus.emit('selection-changed');
        return true;
    }

    commit() {
        if (!this._active) return;
        const sel = this.doc.selection;
        const t = this._transform;

        // Rasterize transformed pixels
        this._rasterize();

        // Clear transform and commit
        sel.floatingTransform = null;
        sel.commitFloating(this.doc.getActiveLayer());
        this._undoManager.endOperation();

        this._active = false;
        this._transform = null;
        this._sourceFloating = null;
        this.bus.emit('selection-changed');

        // Restore previous tool
        this.bus.emit('switch-tool', this._previousToolName);
    }

    cancel() {
        if (!this._active) return;
        const sel = this.doc.selection;

        // Restore original floating data
        const src = this._sourceFloating;
        sel.floating = {
            data: new Uint16Array(src.data),
            mask: new Uint8Array(src.mask),
            width: src.width, height: src.height,
            originX: src.originX, originY: src.originY,
        };
        sel.floatingTransform = null;
        sel.commitFloating(this.doc.getActiveLayer());
        this._undoManager.endOperation();

        this._active = false;
        this._transform = null;
        this._sourceFloating = null;
        this.bus.emit('selection-changed');

        this.bus.emit('switch-tool', this._previousToolName);
    }

    _rasterize() {
        const sel = this.doc.selection;
        const f = sel.floating;
        const t = this._transform;
        const src = this._sourceFloating;

        // Compute transformed corners of the source rect
        const corners = [
            [src.originX, src.originY],
            [src.originX + src.width, src.originY],
            [src.originX + src.width, src.originY + src.height],
            [src.originX, src.originY + src.height],
        ];

        const cos = Math.cos(t.rotation);
        const sin = Math.sin(t.rotation);

        const transformed = corners.map(([x, y]) => {
            const dx = (x - t.cx) * t.sx;
            const dy = (y - t.cy) * t.sy;
            return [
                t.cx + t.tx + dx * cos - dy * sin,
                t.cy + t.ty + dx * sin + dy * cos,
            ];
        });

        // Bounding box of transformed corners
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [x, y] of transformed) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
        minX = Math.floor(minX);
        minY = Math.floor(minY);
        maxX = Math.ceil(maxX);
        maxY = Math.ceil(maxY);

        const nw = maxX - minX;
        const nh = maxY - minY;
        if (nw <= 0 || nh <= 0) return;

        const newData = new Uint16Array(nw * nh);
        const newMask = new Uint8Array(nw * nh);
        newData.fill(TRANSPARENT);

        // Inverse transform: for each destination pixel, find source pixel
        const invCos = Math.cos(-t.rotation);
        const invSin = Math.sin(-t.rotation);
        const invSx = 1 / t.sx;
        const invSy = 1 / t.sy;

        for (let dy = 0; dy < nh; dy++) {
            for (let dx = 0; dx < nw; dx++) {
                const docX = minX + dx;
                const docY = minY + dy;

                // Undo translate
                const rx = docX - t.cx - t.tx;
                const ry = docY - t.cy - t.ty;

                // Undo rotate
                const urx = rx * invCos - ry * invSin;
                const ury = rx * invSin + ry * invCos;

                // Undo scale
                const srcX = urx * invSx + t.cx;
                const srcY = ury * invSy + t.cy;

                // Nearest-neighbor sample from source
                const sx = Math.round(srcX) - src.originX;
                const sy = Math.round(srcY) - src.originY;

                if (sx < 0 || sx >= src.width || sy < 0 || sy >= src.height) continue;
                if (!src.mask[sy * src.width + sx]) continue;

                newData[dy * nw + dx] = src.data[sy * src.width + sx];
                newMask[dy * nw + dx] = 1;
            }
        }

        // Replace floating with rasterized result
        sel.floating = {
            data: newData, mask: newMask,
            width: nw, height: nh,
            originX: minX, originY: minY,
        };
    }

    // --- Bounding box / handle computation ---

    _getTransformedCorners() {
        const src = this._sourceFloating;
        const t = this._transform;
        if (!src || !t) return null;

        const corners = [
            [src.originX, src.originY],
            [src.originX + src.width, src.originY],
            [src.originX + src.width, src.originY + src.height],
            [src.originX, src.originY + src.height],
        ];

        const cos = Math.cos(t.rotation);
        const sin = Math.sin(t.rotation);

        return corners.map(([x, y]) => {
            const dx = (x - t.cx) * t.sx;
            const dy = (y - t.cy) * t.sy;
            return [
                t.cx + t.tx + dx * cos - dy * sin,
                t.cy + t.ty + dx * sin + dy * cos,
            ];
        });
    }

    _getHandlePositions() {
        const c = this._getTransformedCorners();
        if (!c) return null;
        const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        return [
            { id: 'nw', pos: c[0] },
            { id: 'n',  pos: mid(c[0], c[1]) },
            { id: 'ne', pos: c[1] },
            { id: 'e',  pos: mid(c[1], c[2]) },
            { id: 'se', pos: c[2] },
            { id: 's',  pos: mid(c[2], c[3]) },
            { id: 'sw', pos: c[3] },
            { id: 'w',  pos: mid(c[3], c[0]) },
        ];
    }

    _hitTest(docX, docY) {
        const handles = this._getHandlePositions();
        if (!handles) return null;

        const { zoom, panX, panY } = this.canvasView;
        const screenX = this.canvasView._lastScreenX;
        const screenY = this.canvasView._lastScreenY;

        // Check resize handles first
        for (const h of handles) {
            const hx = panX + h.pos[0] * zoom;
            const hy = panY + h.pos[1] * zoom;
            if (Math.abs(screenX - hx) <= 5 && Math.abs(screenY - hy) <= 5) {
                return h.id;
            }
        }

        // Check rotation zones (near corners but outside)
        const cornerHandles = handles.filter(h => ['nw', 'ne', 'se', 'sw'].includes(h.id));
        for (const h of cornerHandles) {
            const hx = panX + h.pos[0] * zoom;
            const hy = panY + h.pos[1] * zoom;
            if (Math.abs(screenX - hx) <= 15 && Math.abs(screenY - hy) <= 15) {
                return 'rotate';
            }
        }

        // Check if inside the transformed box (point-in-polygon)
        const corners = this._getTransformedCorners();
        if (this._pointInQuad(docX, docY, corners)) {
            return 'move';
        }

        return null;
    }

    _pointInQuad(px, py, corners) {
        // Cross product test for convex quad
        let sign = 0;
        for (let i = 0; i < 4; i++) {
            const [x1, y1] = corners[i];
            const [x2, y2] = corners[(i + 1) % 4];
            const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
            if (cross !== 0) {
                if (sign === 0) sign = cross > 0 ? 1 : -1;
                else if ((cross > 0 ? 1 : -1) !== sign) return false;
            }
        }
        return true;
    }

    onHover(x, y) {
        if (!this._active) return;
        this._hoverMode = this._hitTest(x, y);
    }

    onPointerDown(x, y, e) {
        if (!this._active) return;
        const hit = this._hitTest(x, y);
        if (!hit) return;

        this._dragMode = hit === 'move' ? 'move' :
                         hit === 'rotate' ? 'rotate' : 'resize';
        this._resizeHandle = (this._dragMode === 'resize') ? hit : null;
        this._startX = x;
        this._startY = y;
        this._startTransform = { ...this._transform };

        if (this._dragMode === 'rotate') {
            const t = this._transform;
            this._startAngle = Math.atan2(y - (t.cy + t.ty), x - (t.cx + t.tx));
        }
    }

    onPointerMove(x, y, e) {
        if (!this._active || !this._dragMode) return;

        const t = this._transform;
        const st = this._startTransform;

        if (this._dragMode === 'move') {
            t.tx = st.tx + (x - this._startX);
            t.ty = st.ty + (y - this._startY);
        } else if (this._dragMode === 'rotate') {
            const angle = Math.atan2(y - (st.cy + st.ty), x - (st.cx + st.tx));
            t.rotation = st.rotation + (angle - this._startAngle);
        } else if (this._dragMode === 'resize') {
            this._applyResize(x, y, e);
        }

        this.doc.selection.floatingTransform = this._transform;
    }

    _applyResize(x, y, e) {
        const st = this._startTransform;
        const t = this._transform;
        const h = this._resizeHandle;
        const src = this._sourceFloating;

        // Work in the rotated coordinate frame
        const cos = Math.cos(-st.rotation);
        const sin = Math.sin(-st.rotation);
        const cx = st.cx + st.tx;
        const cy = st.cy + st.ty;

        // Current mouse in rotated frame
        const rdx = (x - cx) * cos - (y - cy) * sin;
        const rdy = (x - cx) * sin + (y - cy) * cos;

        // Start mouse in rotated frame
        const rsx = (this._startX - cx) * cos - (this._startY - cy) * sin;
        const rsy = (this._startX - cx) * sin + (this._startY - cy) * cos;

        // Half-dimensions in rotated frame
        const halfW = (src.width / 2) * st.sx;
        const halfH = (src.height / 2) * st.sy;

        let sx = st.sx;
        let sy = st.sy;

        if (h.includes('e')) {
            sx = st.sx * (halfW + (rdx - rsx)) / halfW;
        }
        if (h.includes('w')) {
            sx = st.sx * (halfW - (rdx - rsx)) / halfW;
        }
        if (h.includes('s')) {
            sy = st.sy * (halfH + (rdy - rsy)) / halfH;
        }
        if (h.includes('n')) {
            sy = st.sy * (halfH - (rdy - rsy)) / halfH;
        }

        // Prevent zero/negative scale
        if (Math.abs(sx) < 0.01) sx = 0.01 * Math.sign(sx || 1);
        if (Math.abs(sy) < 0.01) sy = 0.01 * Math.sign(sy || 1);

        if (e.shiftKey) {
            // Proportional scaling
            const avgScale = (Math.abs(sx) + Math.abs(sy)) / 2;
            sx = avgScale * Math.sign(sx);
            sy = avgScale * Math.sign(sy);
        }

        t.sx = sx;
        t.sy = sy;
    }

    onPointerUp(x, y, e) {
        this._dragMode = null;
        this._resizeHandle = null;
    }

    // --- Drawing ---

    drawTransformBox(ctx, zoom, panX, panY) {
        if (!this._active) return;

        const corners = this._getTransformedCorners();
        if (!corners) return;

        // Draw rotated bounding box
        ctx.strokeStyle = 'rgba(0, 200, 255, 0.9)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const [x, y] = corners[i];
            const sx = panX + x * zoom;
            const sy = panY + y * zoom;
            if (i === 0) ctx.moveTo(sx + 0.5, sy + 0.5);
            else ctx.lineTo(sx + 0.5, sy + 0.5);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw handles
        const handles = this._getHandlePositions();
        const size = 7;
        const half = Math.floor(size / 2);
        for (const h of handles) {
            const hx = panX + h.pos[0] * zoom;
            const hy = panY + h.pos[1] * zoom;
            ctx.fillStyle = '#fff';
            ctx.fillRect(hx - half, hy - half, size, size);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(hx - half + 0.5, hy - half + 0.5, size - 1, size - 1);
        }
    }
}
