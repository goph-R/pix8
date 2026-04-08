import { BaseTool } from './BaseTool.js';
import { ellipseOutline } from '../util/math.js';

export class EllipseTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Ellipse';
        this.shortcut = 'O';
        this.icon = 'images/icon-ellipse.svg';
        this._startX = null;
        this._startY = null;
    }

    onPointerDown(x, y, e) {
        this._startX = x;
        this._startY = y;
    }

    onHover(x, y) {
        this.canvasView.drawBrushPreview(x, y);
    }

    _constrain(x, y) {
        const dx = x - this._startX;
        const dy = y - this._startY;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        return { x: this._startX + side * Math.sign(dx || 1), y: this._startY + side * Math.sign(dy || 1) };
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;
        if (e.shiftKey) ({ x, y } = this._constrain(x, y));
        this.canvasView.clearOverlay();
        const cx = Math.round((this._startX + x) / 2);
        const cy = Math.round((this._startY + y) / 2);
        const rx = Math.round(Math.abs(x - this._startX) / 2);
        const ry = Math.round(Math.abs(y - this._startY) / 2);
        ellipseOutline(cx, cy, rx, ry, (px, py) => {
            this.previewBrush(px, py);
        });
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;
        if (e.shiftKey) ({ x, y } = this._constrain(x, y));
        const layer = this.doc.getActiveLayer();
        if (!layer.locked) {
            const cx = Math.round((this._startX + x) / 2);
            const cy = Math.round((this._startY + y) / 2);
            const rx = Math.round(Math.abs(x - this._startX) / 2);
            const ry = Math.round(Math.abs(y - this._startY) / 2);
            ellipseOutline(cx, cy, rx, ry, (px, py) => {
                this.stampBrush(layer, px, py);
            });
        }
        this._startX = null;
        this._startY = null;
        this.canvasView.clearOverlay();
    }
}
