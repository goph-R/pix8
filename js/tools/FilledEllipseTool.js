import { BaseShapeTool } from './BaseShapeTool.js';
import { ellipseFilled } from '../util/math.js';

export class FilledEllipseTool extends BaseShapeTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Filled Ellipse';
        this.shortcut = 'Shift+O';
        this.icon = 'images/icon-filledellipse.svg';
    }

    _drawShape(startX, startY, x, y, callback) {
        const cx = Math.round((startX + x) / 2);
        const cy = Math.round((startY + y) / 2);
        const rx = Math.round(Math.abs(x - startX) / 2);
        const ry = Math.round(Math.abs(y - startY) / 2);
        ellipseFilled(cx, cy, rx, ry, callback);
    }
}
