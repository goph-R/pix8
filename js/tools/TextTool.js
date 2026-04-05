import { BaseTool } from './BaseTool.js';

export class TextTool extends BaseTool {
    constructor(doc, bus, canvasView) {
        super(doc, bus, canvasView);
        this.name = 'Text';
        this.shortcut = 'W';
        this.icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <text x="5" y="18" font-size="18" font-weight="bold" fill="currentColor" stroke="none">T</text>
        </svg>`;
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

    getCursor() { return 'text'; }

    previewBrush() {} // no brush preview
}
