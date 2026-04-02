import { BaseTool } from './BaseTool.js';
import { TRANSPARENT } from '../constants.js';
import { bresenhamLine, snapEndpoint } from '../util/math.js';

export class EraserTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Eraser';
        this.shortcut = 'E';
        this.icon = `<svg viewBox="0 0 20 20"><path d="M6 17h11M8.5 17l-5-5a2 2 0 010-2.8l7.2-7.2a2 2 0 012.8 0l3.5 3.5a2 2 0 010 2.8L10.5 15"/></svg>`;
        this._lastX = null;
        this._lastY = null;
        this._lineMode = false;
        this._startX = null;
        this._startY = null;
    }

    onHover(x, y) {
        this.canvasView.drawBrushPreview(x, y);
    }

    onPointerDown(x, y, e) {
        const layer = this.doc.getActiveLayer();
        if (layer.locked) return;
        this._lineMode = e.shiftKey;
        if (this._lineMode) {
            this._startX = x;
            this._startY = y;
        } else {
            this._lastX = x;
            this._lastY = y;
            this._eraseBrush(layer, x, y);
        }
    }

    onPointerMove(x, y, e) {
        if (this._lineMode) {
            if (this._startX === null) return;
            const end = e.ctrlKey ? snapEndpoint(this._startX, this._startY, x, y) : { x, y };
            this.canvasView.clearOverlay();
            bresenhamLine(this._startX, this._startY, end.x, end.y, (px, py) => {
                this.previewBrush(px, py);
            });
            return;
        }
        const layer = this.doc.getActiveLayer();
        if (layer.locked || this._lastX === null) return;

        bresenhamLine(this._lastX, this._lastY, x, y, (px, py) => {
            this._eraseBrush(layer, px, py);
        });

        this._lastX = x;
        this._lastY = y;
    }

    onPointerUp(x, y, e) {
        if (this._lineMode && this._startX !== null) {
            const layer = this.doc.getActiveLayer();
            if (!layer.locked) {
                const end = e.ctrlKey ? snapEndpoint(this._startX, this._startY, x, y) : { x, y };
                bresenhamLine(this._startX, this._startY, end.x, end.y, (px, py) => {
                    this._eraseBrush(layer, px, py);
                });
            }
            this.canvasView.clearOverlay();
        }
        this._lastX = null;
        this._lastY = null;
        this._startX = null;
        this._startY = null;
        this._lineMode = false;
    }

    _eraseBrush(layer, x, y) {
        const brush = this.doc.activeBrush;
        const ox = brush.originX;
        const oy = brush.originY;
        const docW = this.doc.width;
        const docH = this.doc.height;

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
                const lx = docX - layer.offsetX;
                const ly = docY - layer.offsetY;
                layer.setPixel(lx, ly, TRANSPARENT);
            }
        }
    }
}
