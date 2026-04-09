import { BaseShapeTool } from './BaseShapeTool.js';
import { rectOutline } from '../util/math.js';

export class RectTool extends BaseShapeTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Rectangle';
        this.shortcut = 'U';
        this.icon = 'images/icon-rect.svg';
    }

    _drawShape(startX, startY, x, y, callback) {
        rectOutline(startX, startY, x, y, callback);
    }
}
