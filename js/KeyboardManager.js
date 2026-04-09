import { ZOOM_LEVELS } from './constants.js';
import { Brush } from './model/Brush.js';

/**
 * Keyboard shortcut setup and zoom stepping.
 * Methods are mixed into App.prototype — `this` refers to the App instance.
 */

export function _setupKeyboardShortcuts(tools) {
    const shortcutMap = {};
    const shiftShortcutMap = {};
    const ctrlShortcutMap = {};
    for (const tool of tools) {
        if (tool.shortcut && tool.shortcut.length === 1) {
            shortcutMap[tool.shortcut.toLowerCase()] = tool.name;
        } else if (tool.shortcut && tool.shortcut.startsWith('Shift+')) {
            shiftShortcutMap[tool.shortcut.slice(6).toLowerCase()] = tool.name;
        } else if (tool.shortcut && tool.shortcut.startsWith('Ctrl+')) {
            ctrlShortcutMap[tool.shortcut.slice(5).toLowerCase()] = tool.name;
        }
    }

    document.addEventListener('keydown', (e) => {
        // Don't handle if typing in an input or a dialog is open
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.target.closest('.palette-dialog-overlay')) return;

        // Tool shortcuts
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            if (e.shiftKey) {
                const toolName = shiftShortcutMap[e.key.toLowerCase()];
                if (toolName && !this.toolbar._disabledTools.has(toolName)) {
                    this.bus.emit('switch-tool', toolName);
                    return;
                }
            }
            const toolName = shortcutMap[e.key.toLowerCase()];
            if (toolName && !this.toolbar._disabledTools.has(toolName)) {
                this.bus.emit('switch-tool', toolName);
                return;
            }

            // X = swap colors
            if (e.key.toLowerCase() === 'x') {
                this.doc.swapColors();
                this.bus.emit('fg-color-changed');
                this.bus.emit('bg-color-changed');
                return;
            }

            // +/= zoom in, - zoom out
            if (e.key === '=' || e.key === '+') {
                this._zoomStep(1);
                return;
            }
            if (e.key === '-') {
                this._zoomStep(-1);
                return;
            }

            // Escape / Enter during Free Transform
            if (this._freeTransformTool && this._freeTransformTool.isTransformActive) {
                if (e.key === 'Escape') {
                    this.toolbar.setLocked(false);
                    this._freeTransformTool.cancel();
                    return;
                }
                if (e.key === 'Enter') {
                    this.toolbar.setLocked(false);
                    this._freeTransformTool.commit();
                    return;
                }
            }

            // Escape = deselect
            if (e.key === 'Escape') {
                const sel = this.doc.selection;
                if (sel.active) {
                    if (sel.hasFloating()) {
                        this.undoManager.beginOperation();
                        sel.commitFloating(this.doc.getActiveLayer());
                        this.undoManager.endOperation();
                    }
                    sel.clear();
                    this.bus.emit('selection-changed');
                }
                return;
            }

            // Delete = clear selection
            if (e.key === 'Delete') {
                this._clearSelection();
                return;
            }

            // 1 = reset brush to default
            if (e.key === '1') {
                this.doc.activeBrush = Brush.default();
                this.bus.emit('brush-changed');
                return;
            }
        }

        // Ctrl+key tool shortcuts
        if (e.ctrlKey && !e.shiftKey && !e.altKey) {
            const ctrlTool = ctrlShortcutMap[e.key.toLowerCase()];
            if (ctrlTool && !this.toolbar._disabledTools.has(ctrlTool)) {
                e.preventDefault();
                this.bus.emit('switch-tool', ctrlTool);
                return;
            }
        }

        // Ctrl+A = select all
        if (e.ctrlKey && !e.shiftKey && e.key === 'a') {
            e.preventDefault();
            const sel = this.doc.selection;
            if (sel.hasFloating()) {
                sel.commitFloating(this.doc.getActiveLayer());
            }
            sel.selectAll();
            this.bus.emit('selection-changed');
            return;
        }

        // Ctrl+D = deselect
        if (e.ctrlKey && !e.shiftKey && e.key === 'd') {
            e.preventDefault();
            const sel = this.doc.selection;
            if (sel.active) {
                if (sel.hasFloating()) {
                    this.undoManager.beginOperation();
                    sel.commitFloating(this.doc.getActiveLayer());
                    this.undoManager.endOperation();
                }
                sel.clear();
                this.bus.emit('selection-changed');
            }
            return;
        }

        // Ctrl+Shift+C = copy merged
        if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
            e.preventDefault();
            this._copyMerged();
            return;
        }

        // Ctrl+Shift+V = paste in place
        if (e.ctrlKey && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
            e.preventDefault();
            this._pasteInPlace();
            return;
        }

        // Ctrl+C = copy
        if (e.ctrlKey && !e.shiftKey && e.key === 'c') {
            e.preventDefault();
            this._copy();
            return;
        }

        // Ctrl+X = cut
        if (e.ctrlKey && !e.shiftKey && e.key === 'x') {
            e.preventDefault();
            this._cut();
            return;
        }

        // Ctrl+V = paste
        if (e.ctrlKey && !e.shiftKey && e.key === 'v') {
            e.preventDefault();
            if (this._clipboard) {
                this._paste();
            } else {
                this._pasteFromClipboard();
            }
            return;
        }

        // Ctrl+Z = undo (blocked during free transform)
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
            if (this._freeTransformTool && this._freeTransformTool.isTransformActive) return;
            this.undoManager.undo();
            e.preventDefault();
            return;
        }

        // Ctrl+Shift+Z or Ctrl+Y = redo (blocked during free transform)
        if ((e.ctrlKey && e.shiftKey && e.key === 'Z') ||
            (e.ctrlKey && e.key === 'y')) {
            if (this._freeTransformTool && this._freeTransformTool.isTransformActive) return;
            this.undoManager.redo();
            e.preventDefault();
            return;
        }


        // Ctrl+B = set brush from selection
        if (e.ctrlKey && !e.shiftKey && e.key === 'b') {
            e.preventDefault();
            this._setBrushFromSelection();
            return;
        }

        // Ctrl+S = save project
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this._saveProject();
            return;
        }

        // Ctrl+O = open file
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            this._openFile();
            return;
        }

        // Ctrl+Shift+E = export
        if (e.ctrlKey && e.shiftKey && e.key === 'E') {
            e.preventDefault();
            this._showExportDialog();
            return;
        }

        // Ctrl+' = toggle grid
        if (e.ctrlKey && !e.shiftKey && e.key === "'") {
            e.preventDefault();
            this.canvasView.gridVisible = !this.canvasView.gridVisible;
            this.canvasView.render();
            return;
        }

        // Ctrl+Shift+' = toggle snap
        if (e.ctrlKey && e.shiftKey && e.key === "'") {
            e.preventDefault();
            this.canvasView.snapToGrid = !this.canvasView.snapToGrid;
            return;
        }

        // Alt+R = toggle rulers
        if (e.altKey && e.key === 'r') {
            e.preventDefault();
            this.canvasView.setRulersVisible(!this.canvasView.rulersVisible);
            return;
        }

        // Ctrl+; = toggle guides
        if (e.ctrlKey && e.key === ';') {
            e.preventDefault();
            this.canvasView.guides.visible = !this.canvasView.guides.visible;
            this.canvasView.render();
            return;
        }
    });
}

export function _zoomStep(dir) {
    const cv = this.canvasView;
    const cw = cv.container.clientWidth;
    const ch = cv.container.clientHeight;
    const centerDocX = (cw / 2 - cv.panX) / cv.zoom;
    const centerDocY = (ch / 2 - cv.panY) / cv.zoom;

    cv.zoomIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, cv.zoomIndex + dir));
    cv.zoom = ZOOM_LEVELS[cv.zoomIndex];

    cv.panX = Math.round(cw / 2 - centerDocX * cv.zoom);
    cv.panY = Math.round(ch / 2 - centerDocY * cv.zoom);

    this.bus.emit('zoom-changed', cv.zoom);
    cv.render();
}
