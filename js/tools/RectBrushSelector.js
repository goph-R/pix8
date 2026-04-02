import { BaseTool } from './BaseTool.js';

const HANDLE_CURSORS = {
    'nw': 'nwse-resize', 'se': 'nwse-resize',
    'ne': 'nesw-resize', 'sw': 'nesw-resize',
    'n': 'ns-resize', 's': 'ns-resize',
    'e': 'ew-resize', 'w': 'ew-resize',
};

export class RectBrushSelector extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Rect Select';
        this.shortcut = 'M';
        this.icon = `<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" fill="none" stroke-dasharray="2,2"/></svg>`;
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

    onPointerMove(x, y, e) {
        if (this._startX === null) return;

        if (this._resizing) {
            const { x0, y0, x1, y1 } = this._computeResizeBounds(x, y);
            this.canvasView.clearOverlay();
            this.canvasView.drawOverlayRect(x0, y0, x1, y1, 'rgba(0, 200, 255, 0.8)');
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
        this.canvasView.drawOverlayRect(this._startX, this._startY, c.x, c.y, 'rgba(0, 200, 255, 0.8)');
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
                this.doc.selection.selectRect(x0, y0, x1, y1);
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

        // Click with no drag = deselect
        if (x === this._startX && y === this._startY) {
            this._startX = null;
            this._startY = null;
            const sel = this.doc.selection;
            if (sel.active) {
                if (sel.hasFloating()) sel.commitFloating(this.doc.getActiveLayer());
                sel.clear();
                this.bus.emit('selection-changed');
            }
            return;
        }

        const c = this._constrain(x, y, e);
        const minX = Math.max(0, Math.min(this._startX, c.x));
        const minY = Math.max(0, Math.min(this._startY, c.y));
        const maxX = Math.min(this.doc.width - 1, Math.max(this._startX, c.x));
        const maxY = Math.min(this.doc.height - 1, Math.max(this._startY, c.y));

        this._startX = null;
        this._startY = null;

        if (maxX - minX < 0 || maxY - minY < 0) return;

        this.doc.selection.selectRect(minX, minY, maxX, maxY);
        this.bus.emit('selection-changed');
    }
}
