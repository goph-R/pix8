import { BaseTool } from './BaseTool.js';

export class TextTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Text';
        this.shortcut = 'W';
        this.icon = 'images/icon-text.svg';
    }

    onPointerDown(x, y, e) {
        if (e.button !== 0) return;
        const layer = this.doc.getActiveLayer();
        if (layer.type === 'text') {
            this.bus.emit('open-text-dialog', { layer, isNew: false });
        } else {
            this.bus.emit('open-text-dialog', { x, y, isNew: true });
        }
    }

    onHover() {} // no brush preview

    getCursor() { return 'text'; }
}
