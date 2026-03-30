import { BaseTool } from './BaseTool.js';
import { ellipseFilled } from '../util/math.js';

export class FilledEllipseTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Filled Ellipse';
        this.shortcut = 'Shift+O';
        this.icon = `<svg viewBox="0 0 20 20"><ellipse cx="10" cy="10" rx="8" ry="6" fill="currentColor" stroke="none"/></svg>`;
        this._startX = null;
        this._startY = null;
    }

    onPointerDown(x, y, e) {
        this._startX = x;
        this._startY = y;
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;
        this.canvasView.clearOverlay();
        const cx = Math.round((this._startX + x) / 2);
        const cy = Math.round((this._startY + y) / 2);
        const rx = Math.abs(x - this._startX) / 2;
        const ry = Math.abs(y - this._startY) / 2;
        this.canvasView.drawOverlayEllipse(cx, cy, rx, ry, 'rgba(255,255,255,0.4)');
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;
        const layer = this.doc.getActiveLayer();
        if (!layer.locked) {
            const cx = Math.round((this._startX + x) / 2);
            const cy = Math.round((this._startY + y) / 2);
            const rx = Math.round(Math.abs(x - this._startX) / 2);
            const ry = Math.round(Math.abs(y - this._startY) / 2);
            ellipseFilled(cx, cy, rx, ry, (px, py) => {
                this.stampBrush(layer, px, py);
            });
        }
        this._startX = null;
        this._startY = null;
        this.canvasView.clearOverlay();
    }
}
