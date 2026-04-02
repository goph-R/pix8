import { BaseTool } from './BaseTool.js';

const HANDLE_CURSORS = {
    'nw': 'nwse-resize', 'se': 'nwse-resize',
    'ne': 'nesw-resize', 'sw': 'nesw-resize',
    'n': 'ns-resize', 's': 'ns-resize',
    'e': 'ew-resize', 'w': 'ew-resize',
};

export class RectSelector extends BaseTool {
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
        this._selectionMode = 'replace'; // 'replace', 'add', 'subtract'
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

        // Determine selection mode from modifiers
        if (e.shiftKey) {
            this._selectionMode = 'add';
        } else if (e.altKey) {
            this._selectionMode = 'subtract';
        } else {
            this._selectionMode = 'replace';
        }

        if (sel.hasFloating()) {
            sel.commitFloating(this.doc.getActiveLayer());
        }

        // Resize handles only in replace mode
        if (this._selectionMode === 'replace') {
            const handle = this.canvasView.hitTestResizeHandle();
            if (handle) {
                this._resizing = true;
                this._resizeHandle = handle;
                this._resizeBounds = sel.getBounds();
                sel.saveResizeSource();
                this._startX = x;
                this._startY = y;
                return;
            }

            // Move only in replace mode
            if (sel.active && sel.isSelected(x, y)) {
                this._moving = true;
            }
        }

        this._startX = x;
        this._startY = y;
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

    _overlayColor() {
        return this._selectionMode === 'subtract' ? 'rgba(255, 80, 80, 0.8)' : 'rgba(0, 200, 255, 0.8)';
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;

        if (this._resizing) {
            const { x0, y0, x1, y1 } = this._computeResizeBounds(x, y);
            this.canvasView.clearOverlay();
            this.canvasView.drawOverlayRect(x0, y0, x1, y1, this._overlayColor());
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
        this.canvasView.clearOverlay();
        this.canvasView.drawOverlayRect(this._startX, this._startY, x, y, this._overlayColor());
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
                this.doc.selection.applyResize(x0, y0, x1, y1);
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

        // Click with no drag = deselect (only in replace mode)
        if (x === this._startX && y === this._startY) {
            this._startX = null;
            this._startY = null;
            if (this._selectionMode === 'replace') {
                const sel = this.doc.selection;
                if (sel.active) {
                    if (sel.hasFloating()) sel.commitFloating(this.doc.getActiveLayer());
                    sel.clear();
                    this.bus.emit('selection-changed');
                }
            }
            return;
        }

        const minX = Math.max(0, Math.min(this._startX, x));
        const minY = Math.max(0, Math.min(this._startY, y));
        const maxX = Math.min(this.doc.width - 1, Math.max(this._startX, x));
        const maxY = Math.min(this.doc.height - 1, Math.max(this._startY, y));

        this._startX = null;
        this._startY = null;

        if (maxX - minX < 0 || maxY - minY < 0) return;

        const sel = this.doc.selection;
        if (this._selectionMode === 'add') {
            sel.addRect(minX, minY, maxX, maxY);
        } else if (this._selectionMode === 'subtract') {
            sel.subtractRect(minX, minY, maxX, maxY);
        } else {
            sel.selectRect(minX, minY, maxX, maxY);
        }
        this.canvasView.invalidateSelectionEdges();
        this.bus.emit('selection-changed');
    }
}
