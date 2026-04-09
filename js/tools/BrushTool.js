import { BaseTool } from './BaseTool.js';
import { bresenhamLine, snapEndpoint } from '../util/math.js';

export class BrushTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Brush';
        this.shortcut = 'B';
        this.icon = 'images/icon-brush.svg';
        this._startX = null;
        this._startY = null;
        this._lastX = null;
        this._lastY = null;
        this._lineMode = false;
        this._color = undefined;
    }

    onPointerDown(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked) return;
        this.canvasView.clearOverlay();
        this._lineMode = e.shiftKey;
        this._color = e.button === 2 ? this.doc.bgColorIndex : undefined;
        if (this._lineMode) {
            this._startX = x;
            this._startY = y;
        } else {
            this._lastX = x;
            this._lastY = y;            
            this.stampBrush(layer, x, y, this._color);
        }
    }

    _snapEnd(x, y, e) {
        if (e.ctrlKey) {
            return snapEndpoint(this._startX, this._startY, x, y);
        }
        return { x, y };
    }

    onPointerMove(x, y, e) {
        if (this._lineMode) {
            if (this._startX === null) return;
            const end = this._snapEnd(x, y, e);
            this.canvasView.clearOverlay();
            bresenhamLine(this._startX, this._startY, end.x, end.y, (px, py) => {
                this.previewBrush(px, py);
            });
            return;
        }
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
        if (this._lineMode && this._startX !== null) {
            if (this._startX === null) return;
            const end = this._snapEnd(x, y, e);
            const layer = this.doc.getActiveLayer();
            if (!layer.locked) {
                bresenhamLine(this._startX, this._startY, end.x, end.y, (px, py) => {
                    this.stampBrush(layer, px, py, this._color);
                });
            }
            this.canvasView.clearOverlay();
        }
        this._startX = null;
        this._startY = null;
        this._lastX = null;
        this._lastY = null;
        this._lineMode = false;
    }
}
