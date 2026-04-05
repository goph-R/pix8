import { BaseTool } from './BaseTool.js';
import { bresenhamLine } from '../util/math.js';

export class BrushTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Brush';
        this.shortcut = 'B';
        this.icon = `<svg viewBox="0 0 20 20"><path d="M15 2l3 3-2 2-3-3 2-2zM5 12l8-8 3 3-8 8H5v-3z"/><path d="M2 18h5" stroke-width="1.5"/></svg>`;
        this._lastX = null;
        this._lastY = null;
        this._color = undefined;
    }

    onHover(x, y) {
        this.canvasView.drawBrushPreview(x, y);
    }

    onPointerDown(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked) return;
        this._lastX = x;
        this._lastY = y;
        this._color = e.button === 2 ? this.doc.bgColorIndex : undefined;
        this.stampBrush(layer, x, y, this._color);
    }

    onPointerMove(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked || this._lastX === null) return;

        // Interpolate from last position to current using Bresenham
        bresenhamLine(this._lastX, this._lastY, x, y, (px, py) => {
            this.stampBrush(layer, px, py, this._color);
        });

        this._lastX = x;
        this._lastY = y;
    }

    onPointerUp(x, y, e) {
        this._lastX = null;
        this._lastY = null;
    }
}
