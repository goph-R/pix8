import { BaseTool } from './BaseTool.js';

export class MoveTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Move';
        this.shortcut = 'V';
        this.icon = `<svg viewBox="0 0 20 20"><path d="M10 2l3 3h-2v4h4V7l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H5v2l-3-3 3-3v2h4V5H7l3-3z"/></svg>`;
        this._startX = null;
        this._startY = null;
        this._origOffsets = [];
        this._movingSelection = false;
    }

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
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;
        const dx = x - this._startX;
        const dy = y - this._startY;

        if (this._movingSelection) {
            const sel = this.doc.selection;
            if (!sel.hasFloating()) return;
            sel.moveFloating(this._origOffsets[0].ox + dx, this._origOffsets[0].oy + dy);
            this.canvasView.invalidateSelectionEdges();
            return;
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
    }
}
