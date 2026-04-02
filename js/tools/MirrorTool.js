import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';

export class MirrorTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Mirror';
        this.shortcut = '';
        this.icon = `<svg viewBox="0 0 20 20"><line x1="10" y1="2" x2="10" y2="18" stroke="currentColor" stroke-width="1" stroke-dasharray="2,1"/><polygon points="3,7 7,4 7,10" fill="currentColor"/><polygon points="17,7 13,4 13,10" fill="currentColor"/></svg>`;
        this._shiftDown = false;
        this._onKeyDown = (e) => { if (e.key === 'Shift') { this._shiftDown = true; this._updateCursor(); } };
        this._onKeyUp = (e) => { if (e.key === 'Shift') { this._shiftDown = false; this._updateCursor(); } };
    }

    activate() {
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        this._shiftDown = false;
    }

    deactivate() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        this._shiftDown = false;
    }

    getCursor() {
        return this._shiftDown ? 'ns-resize' : 'ew-resize';
    }

    _updateCursor() {
        this.canvasView.container.style.cursor = this.getCursor();
    }

    onPointerDown(x, y, e) {
        const vertical = this._shiftDown;
        const sel = this.doc.selection;
        const layer = this.doc.getActiveLayer();
        if (!layer) return;

        if (sel.active) {
            this._mirrorSelection(layer, sel, vertical);
        } else {
            this._mirrorFullImage(vertical);
        }

        this.bus.emit('layer-changed');
        this.bus.emit('selection-changed');
    }

    _mirrorSelection(layer, sel, vertical) {
        // Commit any existing floating selection first
        if (sel.hasFloating()) {
            sel.commitFloating(layer);
        }

        const bounds = sel.getBounds();
        if (!bounds) return;
        const { minX, minY, maxX, maxY } = bounds;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;

        // Mirror pixels within selection bounds on the active layer
        if (vertical) {
            for (let row = 0; row < Math.floor(h / 2); row++) {
                for (let col = 0; col < w; col++) {
                    const dx = minX + col;
                    const topY = minY + row;
                    const botY = maxY - row;
                    if (!sel.isSelected(dx, topY) && !sel.isSelected(dx, botY)) continue;
                    const topPx = sel.isSelected(dx, topY) ? layer.getPixelDoc(dx, topY) : TRANSPARENT;
                    const botPx = sel.isSelected(dx, botY) ? layer.getPixelDoc(dx, botY) : TRANSPARENT;
                    if (sel.isSelected(dx, topY)) layer.setPixelAutoExtend(dx, topY, botPx);
                    if (sel.isSelected(dx, botY)) layer.setPixelAutoExtend(dx, botY, topPx);
                }
            }
        } else {
            for (let row = 0; row < h; row++) {
                for (let col = 0; col < Math.floor(w / 2); col++) {
                    const dy = minY + row;
                    const leftX = minX + col;
                    const rightX = maxX - col;
                    if (!sel.isSelected(leftX, dy) && !sel.isSelected(rightX, dy)) continue;
                    const leftPx = sel.isSelected(leftX, dy) ? layer.getPixelDoc(leftX, dy) : TRANSPARENT;
                    const rightPx = sel.isSelected(rightX, dy) ? layer.getPixelDoc(rightX, dy) : TRANSPARENT;
                    if (sel.isSelected(leftX, dy)) layer.setPixelAutoExtend(leftX, dy, rightPx);
                    if (sel.isSelected(rightX, dy)) layer.setPixelAutoExtend(rightX, dy, leftPx);
                }
            }
        }

        // Mirror the selection mask itself
        this._mirrorMask(sel, bounds, vertical);
    }

    _mirrorMask(sel, bounds, vertical) {
        const { minX, minY, maxX, maxY } = bounds;
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const docW = sel.width;

        if (vertical) {
            for (let row = 0; row < Math.floor(h / 2); row++) {
                for (let col = 0; col < w; col++) {
                    const dx = minX + col;
                    const topY = minY + row;
                    const botY = maxY - row;
                    const topIdx = topY * docW + dx;
                    const botIdx = botY * docW + dx;
                    const tmp = sel.mask[topIdx];
                    sel.mask[topIdx] = sel.mask[botIdx];
                    sel.mask[botIdx] = tmp;
                }
            }
        } else {
            for (let row = 0; row < h; row++) {
                for (let col = 0; col < Math.floor(w / 2); col++) {
                    const dy = minY + row;
                    const leftX = minX + col;
                    const rightX = maxX - col;
                    const leftIdx = dy * docW + leftX;
                    const rightIdx = dy * docW + rightX;
                    const tmp = sel.mask[leftIdx];
                    sel.mask[leftIdx] = sel.mask[rightIdx];
                    sel.mask[rightIdx] = tmp;
                }
            }
        }
        sel._pureShape = null;
        sel._resizeSource = null;
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
