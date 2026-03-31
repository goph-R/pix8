import { BaseTool } from './BaseTool.js';
import { rectFilled } from '../util/math.js';

export class FilledRectTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Filled Rect';
        this.shortcut = 'Shift+U';
        this.icon = `<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" fill="currentColor" stroke="none"/></svg>`;
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
        rectFilled(this._startX, this._startY, x, y, (px, py) => {
            this.previewBrush(px, py);
        });
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;
        const layer = this.doc.getActiveLayer();
        if (!layer.locked) {
            rectFilled(this._startX, this._startY, x, y, (px, py) => {
                this.stampBrush(layer, px, py);
            });
        }
        this._startX = null;
        this._startY = null;
        this.canvasView.clearOverlay();
    }
}
