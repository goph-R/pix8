import { BaseTool } from './BaseTool.js';

const HANDLE_CURSORS = {
    'nw': 'nwse-resize', 'se': 'nwse-resize',
    'ne': 'nesw-resize', 'sw': 'nesw-resize',
    'n': 'ns-resize', 's': 'ns-resize',
    'e': 'ew-resize', 'w': 'ew-resize',
};

export class EllipseSelector extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Ellipse Select';
        this.shortcut = 'Shift+M';
        this.icon = 'images/icon-ellipseselect.svg';
        this.showsResizeHandles = true;
        this._startX = null;
        this._startY = null;
        this._moving = false;
        this._resizing = false;
        this._resizeHandle = null;
        this._resizeBounds = null;
        this._selectionMode = 'replace';
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
                if (h.includes('e')) x1 = x0 + side; else x0 = x1 - side;
                if (h.includes('s')) y1 = y0 + side; else y0 = y1 - side;
            } else {
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

    _drawEllipsePreview(x0, y0, x1, y1) {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const rx = (x1 - x0) / 2;
        const ry = (y1 - y0) / 2;
        if (rx > 0 && ry > 0) {
            this.canvasView.drawOverlayEllipse(cx, cy, rx, ry, this._overlayColor());
        }
    }

    _overlayColor() {
        return this._selectionMode === 'subtract' ? 'rgba(255, 80, 80, 0.8)' : 'rgba(0, 200, 255, 0.8)';
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;

        if (this._resizing) {
            const { x0, y0, x1, y1 } = this._computeResizeBounds(x, y, e.shiftKey);
            this.canvasView.clearOverlay();
            // _computeResizeBounds returns inclusive; preview methods expect exclusive end
            if (this.doc.selection._pureShape === 'ellipse') {
                this._drawEllipsePreview(x0, y0, x1 + 1, y1 + 1);
            } else {
                this.canvasView.drawOverlayRect(x0, y0, x1 + 1, y1 + 1, this._overlayColor());
            }
            return;
        }

        if (this._moving) {
            let dx = x - this._startX;
            let dy = y - this._startY;
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
        const minX = Math.min(this._startX, x);
        const minY = Math.min(this._startY, y);
        const maxX = Math.max(this._startX, x);
        const maxY = Math.max(this._startY, y);
        this._drawEllipsePreview(minX, minY, maxX, maxY);
    }

    _constrainSquare(sx, sy, x, y) {
        const dx = x - sx;
        const dy = y - sy;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        return { x: sx + side * Math.sign(dx || 1), y: sy + side * Math.sign(dy || 1) };
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
        if (x0 === x && y0 === y) {
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

        // Edge-based: convert exclusive end to inclusive for Selection model
        const minX = Math.min(x0, x);
        const minY = Math.min(y0, y);
        const maxX = Math.max(x0, x) - 1;
        const maxY = Math.max(y0, y) - 1;
        if (maxX < minX || maxY < minY) return;

        const sel = this.doc.selection;
        if (this._selectionMode === 'add') {
            sel.addEllipse(minX, minY, maxX, maxY);
        } else if (this._selectionMode === 'subtract') {
            sel.subtractEllipse(minX, minY, maxX, maxY);
        } else {
            sel.selectEllipse(minX, minY, maxX, maxY);
        }
        this.canvasView.invalidateSelectionEdges();
        this.bus.emit('selection-changed');
    }
}
