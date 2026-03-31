import { BaseTool } from './BaseTool.js';
import { bresenhamLine } from '../util/math.js';

export class LineTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Line';
        this.shortcut = 'L';
        this.icon = `<svg viewBox="0 0 20 20"><line x1="3" y1="17" x2="17" y2="3"/></svg>`;
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

    onPointerMove(x, y, e) {
        if (this._startX === null) return;
        this.canvasView.clearOverlay();
        bresenhamLine(this._startX, this._startY, x, y, (px, py) => {
            this.previewBrush(px, py);
        });
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;
        const layer = this.doc.getActiveLayer();
        if (!layer.locked) {
            bresenhamLine(this._startX, this._startY, x, y, (px, py) => {
                this.stampBrush(layer, px, py);
            });
        }
        this._startX = null;
        this._startY = null;
        this.canvasView.clearOverlay();
    }
}
