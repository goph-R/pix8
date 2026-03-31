import { BaseTool } from './BaseTool.js';
import { bresenhamLine } from '../util/math.js';

export class BrushTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Brush';
        this.shortcut = 'B';
        this.icon = `<svg viewBox="0 0 20 20"><path d="M3 17l4-1-3-3-1 4zm4.5-1.5l8-8-3-3-8 8 3 3zm9-9l1-1a1.4 1.4 0 00-2-2l-1 1 2 2z"/></svg>`;
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
        this.stampBrush(layer, x, y);
    }

    onPointerMove(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked || this._lastX === null) return;

        // Interpolate from last position to current using Bresenham
        bresenhamLine(this._lastX, this._lastY, x, y, (px, py) => {
            this.stampBrush(layer, px, py);
        });

        this._lastX = x;
        this._lastY = y;
    }

    onPointerUp(x, y, e) {
        this._lastX = null;
        this._lastY = null;
    }
}
