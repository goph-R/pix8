import { BaseTool } from './BaseTool.js';

/**
 * Base class for shape drawing tools (Rectangle, Filled Rect, Ellipse, Filled Ellipse).
 * Handles start/end tracking, Shift-to-constrain, and the preview/stamp lifecycle.
 * Subclasses override _drawShape(startX, startY, x, y, callback) to iterate pixels.
 */
export class BaseShapeTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this._startX = null;
        this._startY = null;
    }

    onPointerDown(x, y, e) {
        this._startX = x;
        this._startY = y;
    }

    _constrain(x, y) {
        const dx = x - this._startX;
        const dy = y - this._startY;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        return { x: this._startX + side * Math.sign(dx || 1), y: this._startY + side * Math.sign(dy || 1) };
    }

    /** Override in subclass: iterate shape pixels and call callback(px, py). */
    _drawShape(startX, startY, x, y, callback) {
        // subclass must implement
    }

    onPointerMove(x, y, e) {
        if (this._startX === null) return;
        if (e.shiftKey) ({ x, y } = this._constrain(x, y));
        this.canvasView.clearOverlay();
        this._drawShape(this._startX, this._startY, x, y, (px, py) => {
            this.previewBrush(px, py);
        });
    }

    onPointerUp(x, y, e) {
        if (this._startX === null) return;
        if (e.shiftKey) ({ x, y } = this._constrain(x, y));
        const layer = this.doc.getActiveLayer();
        if (!layer.locked) {
            this._drawShape(this._startX, this._startY, x, y, (px, py) => {
                this.stampBrush(layer, px, py);
            });
        }
        this._startX = null;
        this._startY = null;
        this.canvasView.clearOverlay();
    }
}
