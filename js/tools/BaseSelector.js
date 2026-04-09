import { BaseTool } from './BaseTool.js';

const HANDLE_CURSORS = {
    'nw': 'nwse-resize', 'se': 'nwse-resize',
    'ne': 'nesw-resize', 'sw': 'nesw-resize',
    'n': 'ns-resize', 's': 'ns-resize',
    'e': 'ew-resize', 'w': 'ew-resize',
};

/**
 * Base class for selection tools (RectSelector, EllipseSelector).
 * Handles resize handles, move, modifier keys, and constrain-to-square.
 * Subclasses override _drawPreview() and _applySelection().
 */
export class BaseSelector extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
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
        this._moveOrigBounds = null;
        this._moveAppliedDx = 0;
        this._moveAppliedDy = 0;
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
        if (e.ctrlKey) {
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
                const b = sel.getBounds();
                if (b) {
                    this._moveOrigBounds = { left: b.minX, top: b.minY, right: b.maxX + 1, bottom: b.maxY + 1 };
                }
                this._moveAppliedDx = 0;
                this._moveAppliedDy = 0;
            }
        }

        this._startX = x;
        this._startY = y;
    }

    _computeResizeBounds(x, y, shift) {
        const b = this._resizeBounds;
        const h = this._resizeHandle;
        const dx = x - this._startX;
        const dy = y - this._startY;
        let minX = b.minX, minY = b.minY, maxX = b.maxX, maxY = b.maxY;
        if (h.includes('w')) minX = b.minX + dx;
        if (h.includes('e')) maxX = b.maxX + dx;
        if (h.includes('n')) minY = b.minY + dy;
        if (h.includes('s')) maxY = b.maxY + dy;
        let x0 = Math.min(minX, maxX);
        let y0 = Math.min(minY, maxY);
        let x1 = Math.max(minX, maxX);
        let y1 = Math.max(minY, maxY);
        if (shift) {
            const w = x1 - x0;
            const ht = y1 - y0;
            const side = Math.max(w, ht);
            if (h.length === 2) {
                // Corner handle: anchor opposite corner
                if (h.includes('e')) x1 = x0 + side; else x0 = x1 - side;
                if (h.includes('s')) y1 = y0 + side; else y0 = y1 - side;
            } else {
                // Edge handle: match the other axis, centered
                if (h === 'n' || h === 's') {
                    const cx = (x0 + x1) / 2;
                    x0 = Math.round(cx - ht / 2);
                    x1 = Math.round(cx + ht / 2);
                } else {
                    const cy = (y0 + y1) / 2;
                    y0 = Math.round(cy - w / 2);
                    y1 = Math.round(cy + w / 2);
                }
            }
        }
        return { x0, y0, x1, y1 };
    }

    _overlayColor() {
        return this._selectionMode === 'subtract' ? 'rgba(255, 80, 80, 0.8)' : 'rgba(0, 200, 255, 0.8)';
    }

    _constrainSquare(sx, sy, x, y) {
        const dx = x - sx;
        const dy = y - sy;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        return { x: sx + side * Math.sign(dx || 1), y: sy + side * Math.sign(dy || 1) };
    }

    /** Override in subclass to draw the resize preview shape. */
    _drawResizePreview(x0, y0, x1, y1) {
        this.canvasView.drawOverlayRect(x0, y0, x1, y1, this._overlayColor());
    }

    /** Override in subclass to draw the drag preview shape. */
    _drawDragPreview(startX, startY, x, y) {
        this.canvasView.drawOverlayRect(startX, startY, x, y, this._overlayColor());
    }

    /** Override in subclass to apply the final selection. */
    _applySelection(sel, minX, minY, maxX, maxY) {
        // subclass must implement
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;

        if (this._resizing) {
            const { x0, y0, x1, y1 } = this._computeResizeBounds(x, y, e.shiftKey);
            this.canvasView.clearOverlay();
            // _computeResizeBounds returns inclusive; preview methods expect exclusive end
            this._drawResizePreview(x0, y0, x1 + 1, y1 + 1);
            return;
        }

        if (this._moving) {
            let dx = x - this._startX;
            let dy = y - this._startY;
            // Snap selection edges to grid/guides
            if (this._moveOrigBounds) {
                const snap = this.canvasView.snapEdges({
                    left: this._moveOrigBounds.left + dx,
                    top: this._moveOrigBounds.top + dy,
                    right: this._moveOrigBounds.right + dx,
                    bottom: this._moveOrigBounds.bottom + dy,
                });
                dx += snap.dx;
                dy += snap.dy;
            }
            const incDx = dx - this._moveAppliedDx;
            const incDy = dy - this._moveAppliedDy;
            if (incDx !== 0 || incDy !== 0) {
                this.doc.selection.moveMask(incDx, incDy);
                this._moveAppliedDx = dx;
                this._moveAppliedDy = dy;
                this.canvasView.invalidateSelectionEdges();
                this.bus.emit('selection-changed');
            }
            return;
        }
        this.canvasView.clearOverlay();
        if (e.shiftKey) {
            ({ x, y } = this._constrainSquare(this._startX, this._startY, x, y));
        }
        this._drawDragPreview(this._startX, this._startY, x, y);
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;

        if (this._resizing) {
            const { x0, y0, x1, y1 } = this._computeResizeBounds(x, y, e.shiftKey);
            this._resizing = false;
            this._resizeHandle = null;
            this._resizeBounds = null;
            this._startX = null;
            this._startY = null;
            this.canvasView.clearOverlay();
            if (x1 > x0 && y1 > y0) {
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

        const x0 = this._startX;
        const y0 = this._startY;
        this._startX = null;
        this._startY = null;

        // Click with no drag = deselect (only in replace mode)
        if (x === x0 && y === y0) {
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

        if (e.shiftKey) {
            ({ x, y } = this._constrainSquare(x0, y0, x, y));
        }

        this._finishSelection(x0, y0, x, y);
    }

    /** Convert drag coordinates to selection bounds and apply. Override for shape-specific bounds. */
    _finishSelection(x0, y0, x, y) {
        // Edge-based: coordinates are grid-line boundaries (exclusive end)
        const minX = Math.max(0, Math.min(x0, x));
        const minY = Math.max(0, Math.min(y0, y));
        const maxX = Math.min(this.doc.width, Math.max(x0, x));
        const maxY = Math.min(this.doc.height, Math.max(y0, y));

        // Convert exclusive end to inclusive for Selection model
        if (maxX - minX < 1 || maxY - minY < 1) return;

        const sel = this.doc.selection;
        this._applySelection(sel, minX, minY, maxX - 1, maxY - 1);
        this.canvasView.invalidateSelectionEdges();
        this.bus.emit('selection-changed');
    }
}
