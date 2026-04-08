import { BaseTool } from './BaseTool.js';
import { rectOutline } from '../util/math.js';

export class RectTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Rectangle';
        this.shortcut = 'U';
        this.icon = 'images/icon-rect.svg';
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
        rectOutline(this._startX, this._startY, x, y, (px, py) => {
            this.previewBrush(px, py);
        });
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;
        if (e.shiftKey) ({ x, y } = this._constrain(x, y));
        const layer = this.doc.getActiveLayer();
        if (!layer.locked) {
            rectOutline(this._startX, this._startY, x, y, (px, py) => {
                this.stampBrush(layer, px, py);
            });
        }
        this._startX = null;
        this._startY = null;
        this.canvasView.clearOverlay();
    }
}
