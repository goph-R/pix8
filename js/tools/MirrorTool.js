import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';

export class MirrorTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Mirror';
        this.shortcut = 'Ctrl+M';
        this.icon = 'images/icon-mirror.svg';
        this._shiftDown = false;
        this._onKeyDown = (e) => { if (e.key === 'Shift') { this._shiftDown = true; this._updateCursor(); } };
        this._onKeyUp = (e) => { if (e.key === 'Shift') { this._shiftDown = false; this._updateCursor(); } };
    }

    onHover() {} // no brush preview

    activate() {
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        this._shiftDown = false;
    }

    deactivate() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        this._shiftDown = false;
        // Commit any pending floating mirror on tool switch
        this._commitFloating();
    }

    getCursor() {
        return this._shiftDown ? 'ns-resize' : 'ew-resize';
    }

    _updateCursor() {
        this.canvasView._updateCursor();
    }

    _commitFloating() {
        const sel = this.doc.selection;
        if (sel.hasFloating()) {
            sel.commitFloating(this.doc.getActiveLayer());
            this.canvasView.invalidateSelectionEdges();
            this.bus.emit('layer-changed');
            this.bus.emit('selection-changed');
        }
    }

    onPointerDown(x, y, e) {
        const vertical = this._shiftDown;
        const sel = this.doc.selection;
        const layer = this.doc.getActiveLayer();
        if (!layer) return;

        if (sel.active) {
            // Click outside selection → commit and done
            if (!sel.hasFloating() && !sel.isSelected(x, y)) {
                return;
            }
            if (sel.hasFloating()) {
                // Clicking outside floating → commit
                const f = sel.floating;
                const inFloating = x >= f.originX && x < f.originX + f.width &&
                                   y >= f.originY && y < f.originY + f.height;
                if (!inFloating) {
                    this._commitFloating();
                    return;
                }
                // Clicking inside floating → flip the existing floating again (no commit/re-lift)
                this._flipFloating(f, vertical);
                this.canvasView.invalidateSelectionEdges();
            } else {
                this._mirrorSelection(layer, sel, vertical);
            }
        } else {
            this._mirrorFullImage(vertical);
        }

        this.bus.emit('layer-changed');
        this.bus.emit('selection-changed');
    }

    _mirrorSelection(layer, sel, vertical) {
        // Lift pixels into floating selection, then flip
        sel.liftPixels(layer);
        if (!sel.hasFloating()) return;
        this._flipFloating(sel.floating, vertical);
        this.canvasView.invalidateSelectionEdges();
    }

    _flipFloating(f, vertical) {
        const w = f.width;
        const h = f.height;
        if (vertical) {
            for (let row = 0; row < Math.floor(h / 2); row++) {
                for (let col = 0; col < w; col++) {
                    const topIdx = row * w + col;
                    const botIdx = (h - 1 - row) * w + col;
                    const tmpD = f.data[topIdx]; f.data[topIdx] = f.data[botIdx]; f.data[botIdx] = tmpD;
                    const tmpM = f.mask[topIdx]; f.mask[topIdx] = f.mask[botIdx]; f.mask[botIdx] = tmpM;
                }
            }
        } else {
            for (let row = 0; row < h; row++) {
                for (let col = 0; col < Math.floor(w / 2); col++) {
                    const leftIdx = row * w + col;
                    const rightIdx = row * w + (w - 1 - col);
                    const tmpD = f.data[leftIdx]; f.data[leftIdx] = f.data[rightIdx]; f.data[rightIdx] = tmpD;
                    const tmpM = f.mask[leftIdx]; f.mask[leftIdx] = f.mask[rightIdx]; f.mask[rightIdx] = tmpM;
                }
            }
        }
    }

    _mirrorFullImage(vertical) {
        // Mirror all layers
        for (const layer of this.doc.layers) {
            const { width, height, data } = layer;
            if (vertical) {
                for (let row = 0; row < Math.floor(height / 2); row++) {
                    for (let col = 0; col < width; col++) {
                        const topIdx = row * width + col;
                        const botIdx = (height - 1 - row) * width + col;
                        const tmp = data[topIdx];
                        data[topIdx] = data[botIdx];
                        data[botIdx] = tmp;
                    }
                }
            } else {
                for (let row = 0; row < height; row++) {
                    for (let col = 0; col < Math.floor(width / 2); col++) {
                        const leftIdx = row * width + col;
                        const rightIdx = row * width + (width - 1 - col);
                        const tmp = data[leftIdx];
                        data[leftIdx] = data[rightIdx];
                        data[rightIdx] = tmp;
                    }
                }
            }
        }
    }
}
