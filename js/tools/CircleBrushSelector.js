import { BaseTool } from './BaseTool.js';

const HANDLE_CURSORS = {
    'nw': 'nwse-resize', 'se': 'nwse-resize',
    'ne': 'nesw-resize', 'sw': 'nesw-resize',
    'n': 'ns-resize', 's': 'ns-resize',
    'e': 'ew-resize', 'w': 'ew-resize',
};

export class CircleBrushSelector extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Ellipse Select';
        this.shortcut = '';
        this.icon = `<svg viewBox="0 0 20 20"><ellipse cx="10" cy="10" rx="8" ry="5" fill="none" stroke-dasharray="2,2"/></svg>`;
        this.showsResizeHandles = true;
        this._startX = null;
        this._startY = null;
        this._moving = false;
        this._resizing = false;
        this._resizeHandle = null;
        this._resizeBounds = null;
        this._hoveringSelection = false;
        this._hoverHandle = null;
    }

    getCursor() {
        const handle = this._resizeHandle || this._hoverHandle;
        if (handle) return HANDLE_CURSORS[handle];
        return this._hoveringSelection || this._moving ? 'move' : 'crosshair';
    }

    onHover(x, y) {
        const sel = this.doc.selection;
        const handle = this.canvasView.hitTestResizeHandle();
        this._hoverHandle = handle;
        this._hoveringSelection = !handle && sel.active && !sel.hasFloating() && sel.isSelected(x, y);
    }

    onPointerDown(x, y, e) {
        const sel = this.doc.selection;
        if (sel.hasFloating()) {
            sel.commitFloating(this.doc.getActiveLayer());
        }

        const handle = this.canvasView.hitTestResizeHandle();
        if (handle) {
            this._resizing = true;
            this._resizeHandle = handle;
            this._resizeBounds = sel.getBounds();
            this._startX = x;
            this._startY = y;
            return;
        }

        if (sel.active && sel.isSelected(x, y)) {
            this._moving = true;
        }
        this._startX = x;
        this._startY = y;
    }

    _constrain(x, y, e) {
        if (!e.shiftKey) return { x, y };
        const dx = x - this._startX;
        const dy = y - this._startY;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        return { x: this._startX + side * Math.sign(dx || 1), y: this._startY + side * Math.sign(dy || 1) };
    }

    _computeResizeBounds(x, y) {
        const b = this._resizeBounds;
        const h = this._resizeHandle;
        const dx = x - this._startX;
        const dy = y - this._startY;
        let minX = b.minX, minY = b.minY, maxX = b.maxX, maxY = b.maxY;
        if (h.includes('w')) minX = b.minX + dx;
        if (h.includes('e')) maxX = b.maxX + dx;
        if (h.includes('n')) minY = b.minY + dy;
        if (h.includes('s')) maxY = b.maxY + dy;
        const x0 = Math.min(minX, maxX);
        const y0 = Math.min(minY, maxY);
        const x1 = Math.max(minX, maxX);
        const y1 = Math.max(minY, maxY);
        return { x0, y0, x1, y1 };
    }

    _drawEllipsePreview(x0, y0, x1, y1) {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const rx = (x1 - x0) / 2;
        const ry = (y1 - y0) / 2;
        if (rx > 0 && ry > 0) {
            this.canvasView.drawOverlayEllipse(cx, cy, rx, ry, 'rgba(0, 200, 255, 0.8)');
        }
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;

        if (this._resizing) {
            const { x0, y0, x1, y1 } = this._computeResizeBounds(x, y);
            this.canvasView.clearOverlay();
            this._drawEllipsePreview(x0, y0, x1, y1);
            return;
        }

        if (this._moving) {
            const dx = x - this._startX;
            const dy = y - this._startY;
            if (dx !== 0 || dy !== 0) {
                this.doc.selection.moveMask(dx, dy);
                this._startX = x;
                this._startY = y;
                this.canvasView.invalidateSelectionEdges();
                this.bus.emit('selection-changed');
            }
            return;
        }
        const c = this._constrain(x, y, e);
        this.canvasView.clearOverlay();
        const minX = Math.min(this._startX, c.x);
        const minY = Math.min(this._startY, c.y);
        const maxX = Math.max(this._startX, c.x);
        const maxY = Math.max(this._startY, c.y);
        this._drawEllipsePreview(minX, minY, maxX, maxY);
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;

        if (this._resizing) {
            const { x0, y0, x1, y1 } = this._computeResizeBounds(x, y);
            this._resizing = false;
            this._resizeHandle = null;
            this._resizeBounds = null;
            this._startX = null;
            this._startY = null;
            this.canvasView.clearOverlay();
            if (x1 >= x0 && y1 >= y0) {
                this.doc.selection.selectEllipse(x0, y0, x1, y1);
                this.canvasView.invalidateSelectionEdges();
                this.bus.emit('selection-changed');
            }
            return;
        }

        if (this._moving) {
            this._moving = false;
            this._startX = null;
            this._startY = null;
            return;
        }

        this.canvasView.clearOverlay();

        const x0 = this._startX;
        const y0 = this._startY;
        this._startX = null;
        this._startY = null;

        // Click with no drag = deselect
        if (x0 === x && y0 === y) {
            const sel = this.doc.selection;
            if (sel.active) {
                if (sel.hasFloating()) sel.commitFloating(this.doc.getActiveLayer());
                sel.clear();
                this.bus.emit('selection-changed');
            }
            return;
        }

        const c = this._constrain(x, y, e);
        this.doc.selection.selectEllipse(x0, y0, c.x, c.y);
        this.bus.emit('selection-changed');
    }
}
