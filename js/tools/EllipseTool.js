import { BaseShapeTool } from './BaseShapeTool.js';
import { ellipseOutline } from '../util/math.js';

export class EllipseTool extends BaseShapeTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Ellipse';
        this.shortcut = 'O';
        this.icon = 'images/icon-ellipse.svg';
    }

    _drawShape(startX, startY, x, y, callback) {
        const cx = Math.round((startX + x) / 2);
        const cy = Math.round((startY + y) / 2);
        const rx = Math.round(Math.abs(x - startX) / 2);
        const ry = Math.round(Math.abs(y - startY) / 2);
        ellipseOutline(cx, cy, rx, ry, callback);
    }
}
