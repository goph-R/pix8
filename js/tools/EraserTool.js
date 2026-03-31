import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';
import { bresenhamLine } from '../util/math.js';

export class EraserTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Eraser';
        this.shortcut = 'E';
        this.icon = `<svg viewBox="0 0 20 20"><path d="M6 17h11M8.5 17l-5-5a2 2 0 010-2.8l7.2-7.2a2 2 0 012.8 0l3.5 3.5a2 2 0 010 2.8L10.5 15"/></svg>`;
        this._lastX = null;
        this._lastY = null;
    }

    onHover(x, y) {
        this.canvasView.drawBrushPreview(x, y);
    }

    onPointerDown(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked) return;
        this._lastX = x;
        this._lastY = y;
        this._eraseBrush(layer, x, y);
    }

    onPointerMove(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked || this._lastX === null) return;

        bresenhamLine(this._lastX, this._lastY, x, y, (px, py) => {
            this._eraseBrush(layer, px, py);
        });

        this._lastX = x;
        this._lastY = y;
    }

    onPointerUp(x, y, e) {
        this._lastX = null;
        this._lastY = null;
    }

    /**
     * Erase using the current brush shape — anywhere the brush has a non-transparent
     * cell, set the layer pixel to TRANSPARENT.
     */
    _eraseBrush(layer, x, y) {
        const brush = this.doc.activeBrush;
        const ox = brush.originX;
        const oy = brush.originY;
        const docW = this.doc.width;
        const docH = this.doc.height;

        // Clamp brush footprint to document bounds
        const startBx = Math.max(0, -x + ox);
        const startBy = Math.max(0, -y + oy);
        const endBx = Math.min(brush.width, docW - x + ox);
        const endBy = Math.min(brush.height, docH - y + oy);

        for (let by = startBy; by < endBy; by++) {
            for (let bx = startBx; bx < endBx; bx++) {
                const idx = brush.data[by * brush.width + bx];
                if (idx === TRANSPARENT) continue;
                const docX = x + bx - ox;
                const docY = y + by - oy;
                if (this.doc.selection.active && !this.doc.selection.isSelected(docX, docY)) continue;
                // Translate doc coords to layer-local
                const lx = docX - layer.offsetX;
                const ly = docY - layer.offsetY;
                layer.setPixel(lx, ly, TRANSPARENT);
            }
        }
    }
}
