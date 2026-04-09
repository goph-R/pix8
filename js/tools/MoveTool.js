import { BaseTool } from './BaseTool.js';

export class MoveTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Move';
        this.shortcut = 'V';
        this.icon = 'images/icon-move.svg';
        this._startX = null;
        this._startY = null;
        this._origOffsets = [];
        this._movingSelection = false;
        this._contentBounds = null;
    }

    onHover() {} // no brush preview

    getCursor() {
        return 'grab';
    }

    onPointerDown(x, y, e) {
        const sel = this.doc.selection;
        const layer = this.doc.getActiveLayer();

        if (sel.active && this.doc.selectedLayerIndices.size < 2) {
            // Lift pixels if not already floating
            if (!sel.hasFloating()) {
                sel.liftPixels(layer);
                this.canvasView.invalidateSelectionEdges();
                this.bus.emit('selection-changed');
            }
            this._movingSelection = true;
            this._startX = x;
            this._startY = y;
            this._origOffsets = [{ ox: sel.floating.originX, oy: sel.floating.originY }];
            return;
        }

        this._movingSelection = false;
        this._startX = x;
        this._startY = y;

        // Store original offsets for all selected layers
        this._origOffsets = [];
        for (const idx of this.doc.selectedLayerIndices) {
            const l = this.doc.layers[idx];
            if (l && !l.locked) {
                this._origOffsets.push({ idx, ox: l.offsetX, oy: l.offsetY });
            }
        }

        // Compute merged content bounds for edge snapping
        this._contentBounds = null;
        if (this._origOffsets.length > 0) {
            let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
            for (const entry of this._origOffsets) {
                const bounds = this.doc.layers[entry.idx].getContentBounds();
                if (bounds) {
                    left = Math.min(left, bounds.left);
                    top = Math.min(top, bounds.top);
                    right = Math.max(right, bounds.right);
                    bottom = Math.max(bottom, bounds.bottom);
                }
            }
            if (left < Infinity) this._contentBounds = { left, top, right, bottom };
        }
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;
        let dx = x - this._startX;
        let dy = y - this._startY;

        if (this._movingSelection) {
            const sel = this.doc.selection;
            if (!sel.hasFloating()) return;
            sel.moveFloating(this._origOffsets[0].ox + dx, this._origOffsets[0].oy + dy);
            this.canvasView.invalidateSelectionEdges();
            return;
        }

        // Snap layer content edges to grid/guides
        if (this._contentBounds) {
            const snap = this.canvasView.snapEdges({
                left: this._contentBounds.left + dx,
                top: this._contentBounds.top + dy,
                right: this._contentBounds.right + dx,
                bottom: this._contentBounds.bottom + dy,
            });
            dx += snap.dx;
            dy += snap.dy;
        }

        for (const entry of this._origOffsets) {
            const l = this.doc.layers[entry.idx];
            if (l) {
                l.offsetX = entry.ox + dx;
                l.offsetY = entry.oy + dy;
            }
        }
    }

    onPointerUp(x, y, e) {
        if (this._movingSelection) {
            const sel = this.doc.selection;
            if (x < 0 || x >= this.doc.width || y < 0 || y >= this.doc.height) {
                if (sel.hasFloating()) {
                    sel.commitFloating(this.doc.getActiveLayer());
                    sel.clear();
                    this.canvasView.invalidateSelectionEdges();
                    this.bus.emit('selection-changed');
                }
            }
        }
        this._startX = null;
        this._startY = null;
        this._origOffsets = [];
        this._contentBounds = null;
    }
}
