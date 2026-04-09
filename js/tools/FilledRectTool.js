import { BaseShapeTool } from './BaseShapeTool.js';
import { rectFilled } from '../util/math.js';

export class FilledRectTool extends BaseShapeTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Filled Rect';
        this.shortcut = 'Shift+U';
        this.icon = 'images/icon-filledrect.svg';
    }

    _drawShape(startX, startY, x, y, callback) {
        rectFilled(startX, startY, x, y, callback);
    }
}
