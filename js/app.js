import { EventBus } from './EventBus.js';
import { ImageDocument } from './model/ImageDocument.js';
import { Layer } from './model/Layer.js';
import { Brush } from './model/Brush.js';
import { DEFAULT_DOC_WIDTH, DEFAULT_DOC_HEIGHT, ZOOM_LEVELS, TRANSPARENT } from './constants.js';

import { CanvasView } from './ui/CanvasView.js';
import { Toolbar } from './ui/Toolbar.js';
import { ColorSelector } from './ui/ColorSelector.js';
import { PalettePanel } from './ui/PalettePanel.js';
import { LayersPanel } from './ui/LayersPanel.js';

import { UndoManager } from './history/UndoManager.js';

import { BrushTool } from './tools/BrushTool.js';
import { LineTool } from './tools/LineTool.js';
import { RectTool } from './tools/RectTool.js';
import { FilledRectTool } from './tools/FilledRectTool.js';
import { EllipseTool } from './tools/EllipseTool.js';
import { FilledEllipseTool } from './tools/FilledEllipseTool.js';
import { FillTool } from './tools/FillTool.js';
import { RectSelector } from './tools/RectSelector.js';
import { EllipseSelector } from './tools/EllipseSelector.js';
import { FreeTransformTool } from './tools/FreeTransformTool.js';
import { EraserTool } from './tools/EraserTool.js';
import { ColorPickerTool } from './tools/ColorPickerTool.js';
import { MoveTool } from './tools/MoveTool.js';
import { MirrorTool } from './tools/MirrorTool.js';

import {
    savePix8, loadPix8,
    exportBMP, importBMP,
    exportPCX, importPCX,
    exportPNG, downloadBlob
} from './util/io.js';

class App {
    constructor() {
        this.bus = new EventBus();
        this.doc = null;
        this.canvasView = null;
        this.toolbar = null;
        this.undoManager = null;

        this._showNewDocDialog();
    }

    _showNewDocDialog() {
        // Simple modal dialog for new document
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center; z-index: 1000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--bg-panel, #2d2d30); border: 1px solid var(--border, #3c3c3c);
            border-radius: 6px; padding: 24px; min-width: 300px; color: var(--text, #ccc);
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #fff;">New Document</h3>
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #aaa;">Width (px)</label>
                <input id="new-doc-w" type="number" value="64" min="1" max="1024"
                    style="width: 100%; padding: 6px; background: #3c3c3c; border: 1px solid #555;
                    border-radius: 3px; color: #ccc; font-size: 13px;">
            </div>
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #aaa;">Height (px)</label>
                <input id="new-doc-h" type="number" value="64" min="1" max="1024"
                    style="width: 100%; padding: 6px; background: #3c3c3c; border: 1px solid #555;
                    border-radius: 3px; color: #ccc; font-size: 13px;">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button class="preset-btn" data-w="32" data-h="32" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">32x32</button>
                <button class="preset-btn" data-w="64" data-h="64" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">64x64</button>
                <button class="preset-btn" data-w="128" data-h="128" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">128x128</button>
                <button class="preset-btn" data-w="256" data-h="256" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">256x256</button>
            </div>
            <button id="new-doc-ok" style="width: 100%; padding: 8px; background: #007acc;
                border: none; border-radius: 3px; color: #fff; cursor: pointer; font-size: 13px;">Create</button>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const wInput = dialog.querySelector('#new-doc-w');
        const hInput = dialog.querySelector('#new-doc-h');

        for (const btn of dialog.querySelectorAll('.preset-btn')) {
            btn.addEventListener('click', () => {
                wInput.value = btn.dataset.w;
                hInput.value = btn.dataset.h;
            });
        }

        dialog.querySelector('#new-doc-ok').addEventListener('click', () => {
            const w = Math.max(1, Math.min(1024, parseInt(wInput.value) || 64));
            const h = Math.max(1, Math.min(1024, parseInt(hInput.value) || 64));
            overlay.remove();
            this._init(w, h);
        });

        // Allow Enter to submit
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                dialog.querySelector('#new-doc-ok').click();
            }
        });

        wInput.focus();
        wInput.select();
    }

    _init(width, height) {
        this.doc = new ImageDocument(width, height);
        this.undoManager = new UndoManager(this.doc, this.bus);
        this._clipboard = null; // { data, mask, width, height }

        // Canvas view
        this.canvasView = new CanvasView(this.doc, this.bus);

        // Tools
        const tools = [
            new MoveTool(this.doc, this.bus, this.canvasView),
            new BrushTool(this.doc, this.bus, this.canvasView),
            new EraserTool(this.doc, this.bus, this.canvasView),
            new ColorPickerTool(this.doc, this.bus, this.canvasView),
            new LineTool(this.doc, this.bus, this.canvasView),
            new RectTool(this.doc, this.bus, this.canvasView),
            new FilledRectTool(this.doc, this.bus, this.canvasView),
            new EllipseTool(this.doc, this.bus, this.canvasView),
            new FilledEllipseTool(this.doc, this.bus, this.canvasView),
            new FillTool(this.doc, this.bus, this.canvasView),
            new RectSelector(this.doc, this.bus, this.canvasView),
            new EllipseSelector(this.doc, this.bus, this.canvasView),
            new FreeTransformTool(this.doc, this.bus, this.canvasView),
            new MirrorTool(this.doc, this.bus, this.canvasView),
        ];

        this._freeTransformTool = tools.find(t => t.name === 'Free Transform');

        // Toolbar
        this.toolbar = new Toolbar(tools, this.bus);

        // Wire active tool to canvas view (must be before setActiveTool)
        this.bus.on('tool-changed', (tool) => {
            // Commit free transform when switching away
            const ft = this._freeTransformTool;
            if (ft && ft.isTransformActive && tool !== ft) {
                ft.commit();
            }
            this.canvasView.activeTool = tool;
            document.getElementById('status-tool').textContent = tool.name;
            document.getElementById('status-hint').textContent = this._getToolHint(tool.name);
            if (tool.activate && tool !== ft) {
                tool.activate();
            }
            // Auto-activate free transform when selected from toolbar/shortcut
            if (tool === ft && !ft.isTransformActive) {
                const sel = this.doc.selection;
                if (!sel.active) {
                    alert('No selection');
                    const fallback = this._lastNonTransformTool || 'Rect Select';
                    this.toolbar.setActiveTool(fallback);
                    return;
                }
                const prev = this._lastNonTransformTool || 'Rect Select';
                ft.activate(prev, this.undoManager);
            }
            if (tool !== ft) {
                this._lastNonTransformTool = tool.name;
            }
        });

        this.toolbar.setActiveTool('Brush');

        // UI panels
        this.colorSelector = new ColorSelector(this.doc, this.bus);
        this.palettePanel = new PalettePanel(this.doc, this.bus, this.undoManager);
        this.layersPanel = new LayersPanel(this.doc, this.bus);

        // Undo integration: wrap tool pointer events
        this._wrapUndoIntoCanvasView();

        // Status bar updates
        this.bus.on('cursor-move', (pos) => {
            document.getElementById('status-pos').textContent = `${pos.x}, ${pos.y}`;
        });
        this.bus.on('zoom-changed', (zoom) => {
            document.getElementById('status-zoom').textContent = `${zoom * 100}%`;
        });
        document.getElementById('status-size').textContent = `${width} x ${height}`;
        document.getElementById('status-zoom').textContent = `${this.canvasView.zoom * 100}%`;

        // Re-render on palette/layer changes
        this.bus.on('palette-changed', () => this.canvasView.render());
        this.bus.on('layer-changed', () => this.canvasView.render());
        this.bus.on('document-changed', () => this.canvasView.render());

        // Selection events
        this.bus.on('selection-changed', () => {
            const sel = this.doc.selection;
            this.canvasView.invalidateSelectionEdges();
            const ftActive = this._freeTransformTool && this._freeTransformTool.isTransformActive;
            if (sel.active && !ftActive) {
                this.canvasView.startMarchingAnts();
            } else {
                this.canvasView.stopMarchingAnts();
            }
            this.canvasView.render();
        });

        // Keyboard shortcuts
        this._setupKeyboardShortcuts(tools);

        // Menu bar
        this._setupMenuBar();
    }

    _getToolHint(name) {
        const hints = {
            'Move':            'Drag to move layer',
            'Brush':           'Draw with brush  |  Right-click: BG color',
            'Eraser':          'Erase to transparent  |  Shift: line mode  |  Ctrl: snap angle',
            'Fill':            'Click to flood fill  |  Right-click: BG color',
            'Color Picker':    'Click to pick FG color  |  Right-click: BG color',
            'Line':            'Drag to draw line  |  Ctrl: snap angle',
            'Rectangle':       'Drag to draw rect',
            'Filled Rect':     'Drag to draw filled rect',
            'Ellipse':         'Drag to draw ellipse',
            'Filled Ellipse':  'Drag to draw filled ellipse',
            'Rect Select':     'Drag to select  |  Shift: add  |  Alt: subtract',
            'Ellipse Select':  'Drag to select  |  Shift: add  |  Alt: subtract',
            'Free Transform':  'Move, resize, or rotate selection  |  Shift: proportional  |  Ctrl: snap angle',
            'Mirror':          'Click to flip horizontal  |  Shift: flip vertical',
        };
        return hints[name] || '';
    }

    _wrapUndoIntoCanvasView() {
        const cv = this.canvasView;
        const origDown = cv._onPointerDown;
        const origUp = cv._onPointerUp;

        // The event listeners in CanvasView use arrow functions that call
        // this._onPointerDown(e) — so replacing the method on the instance works.
        cv._onPointerDown = (e) => {
            const isFreeTransform = cv._activeTool && cv._activeTool.isTransformActive;
            if (e.button === 0 && !cv._spaceDown && cv._activeTool && !isFreeTransform) {
                this.undoManager.beginOperation();
            }
            origDown.call(cv, e);
        };

        cv._onPointerUp = (e) => {
            origUp.call(cv, e);
            const isFreeTransform = cv._activeTool && cv._activeTool.isTransformActive;
            if (!isFreeTransform) {
                this.undoManager.endOperation();
            }
        };
    }

    _setupKeyboardShortcuts(tools) {
        const shortcutMap = {};
        for (const tool of tools) {
            if (tool.shortcut && tool.shortcut.length === 1) {
                shortcutMap[tool.shortcut.toLowerCase()] = tool.name;
            }
        }

        document.addEventListener('keydown', (e) => {
            // Don't handle if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Tool shortcuts
            if (!e.ctrlKey && !e.altKey && !e.metaKey) {
                const toolName = shortcutMap[e.key.toLowerCase()];
                if (toolName) {
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
                        this._freeTransformTool.cancel();
                        return;
                    }
                    if (e.key === 'Enter') {
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
                this._paste();
                return;
            }

            // Ctrl+Z = undo
            if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
                this.undoManager.undo();
                e.preventDefault();
                return;
            }

            // Ctrl+Shift+Z or Ctrl+Y = redo
            if ((e.ctrlKey && e.shiftKey && e.key === 'Z') ||
                (e.ctrlKey && e.key === 'y')) {
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
        });
    }

    _zoomStep(dir) {
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

    _setupMenuBar() {
        const menuItems = document.querySelectorAll('#menubar .menu-item');
        for (const item of menuItems) {
            item.addEventListener('click', () => {
                const menu = item.dataset.menu;
                this._handleMenu(menu);
            });
        }
    }

    _handleMenu(menu) {
        switch (menu) {
            case 'file':
                this._showFileMenu();
                break;
            case 'edit':
                this._showEditMenu();
                break;
            case 'view':
                this._showViewMenu();
                break;
            case 'image':
                this._showImageMenu();
                break;
            case 'layer':
                this._showLayerMenu();
                break;
        }
    }

    _showDropdown(anchorEl, items) {
        // Remove any existing dropdown
        document.querySelectorAll('.dropdown-menu').forEach(d => d.remove());

        const dropdown = document.createElement('div');
        dropdown.className = 'dropdown-menu';
        dropdown.style.cssText = `
            position: fixed; background: #2d2d30; border: 1px solid #555;
            border-radius: 4px; padding: 4px 0; min-width: 180px; z-index: 1000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        `;

        const rect = anchorEl.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = rect.bottom + 'px';

        for (const item of items) {
            if (item === '-') {
                const sep = document.createElement('div');
                sep.style.cssText = 'height: 1px; background: #555; margin: 4px 8px;';
                dropdown.appendChild(sep);
                continue;
            }

            const disabled = item.disabled === true;
            const el = document.createElement('div');
            el.style.cssText = `
                padding: 6px 16px; cursor: ${disabled ? 'default' : 'pointer'}; font-size: 12px;
                color: ${disabled ? '#666' : '#ccc'};
                display: flex; justify-content: space-between;
            `;
            el.innerHTML = `<span>${item.label}</span>${item.shortcut ? `<span style="color:#888; margin-left:24px">${item.shortcut}</span>` : ''}`;
            if (!disabled) {
                el.addEventListener('mouseenter', () => { el.style.background = '#007acc'; });
                el.addEventListener('mouseleave', () => { el.style.background = 'none'; });
                el.addEventListener('click', () => {
                    dropdown.remove();
                    item.action();
                });
            }
            dropdown.appendChild(el);
        }

        document.body.appendChild(dropdown);

        // Close on click outside
        const close = (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('pointerdown', close);
            }
        };
        setTimeout(() => document.addEventListener('pointerdown', close), 0);
    }

    _showFileMenu() {
        const anchor = document.querySelector('[data-menu="file"]');
        this._showDropdown(anchor, [
            { label: 'New...', shortcut: '', action: () => { location.reload(); } },
            { label: 'Open...', shortcut: 'Ctrl+O', action: () => this._openFile() },
            '-',
            { label: 'Save Project (.pix8)', shortcut: 'Ctrl+S', action: () => this._saveProject() },
            '-',
            { label: 'Import Image...', action: () => this._importFile() },
            { label: 'Import as Layer...', action: () => this._importAsLayer() },
            '-',
            { label: 'Export BMP', action: () => this._exportBMP() },
            { label: 'Export PCX', action: () => this._exportPCX() },
            { label: 'Export PNG', action: () => this._exportPNG() },
        ]);
    }

    _showEditMenu() {
        const anchor = document.querySelector('[data-menu="edit"]');
        this._showDropdown(anchor, [
            { label: 'Undo', shortcut: 'Ctrl+Z', action: () => this.undoManager.undo() },
            { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => this.undoManager.redo() },
            '-',
            { label: 'Cut', shortcut: 'Ctrl+X', action: () => this._cut() },
            { label: 'Copy', shortcut: 'Ctrl+C', action: () => this._copy() },
            { label: 'Copy Merged', shortcut: 'Ctrl+Shift+C', action: () => this._copyMerged() },
            { label: 'Paste', shortcut: 'Ctrl+V', action: () => this._paste() },
            { label: 'Paste in Place', shortcut: 'Ctrl+Shift+V', action: () => this._pasteInPlace() },
            '-',
            { label: 'Select All', shortcut: 'Ctrl+A', action: () => {
                const sel = this.doc.selection;
                if (sel.hasFloating()) sel.commitFloating(this.doc.getActiveLayer());
                sel.selectAll();
                this.bus.emit('selection-changed');
            }},
            { label: 'Deselect', shortcut: 'Ctrl+D', action: () => {
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
            }},
            '-',
            { label: 'Clear', shortcut: 'Delete', action: () => this._clearSelection() },
            '-',
            { label: 'Set Brush from Selection', shortcut: 'Ctrl+B', action: () => this._setBrushFromSelection() },
        ]);
    }

    _copy() {
        const sel = this.doc.selection;
        if (!sel.active) return;
        const copied = sel.copyPixels(this.doc.getActiveLayer());
        if (copied) this._clipboard = copied;
    }

    _copyMerged() {
        const sel = this.doc.selection;
        if (!sel.active) return;
        const copied = sel.copyPixelsMerged(this.doc.layers);
        if (copied) this._clipboard = copied;
    }

    _cut() {
        const sel = this.doc.selection;
        if (!sel.active) return;
        this.undoManager.beginOperation();
        const copied = sel.copyPixels(this.doc.getActiveLayer());
        if (copied) this._clipboard = copied;
        if (!sel.hasFloating()) {
            sel.liftPixels(this.doc.getActiveLayer());
        }
        sel.clear();
        this.undoManager.endOperation();
        this.bus.emit('selection-changed');
        this.bus.emit('layer-changed');
    }

    _pasteAsFloating(originX, originY) {
        if (!this._clipboard) return;
        const sel = this.doc.selection;
        const layer = this.doc.getActiveLayer();

        this.undoManager.beginOperation();
        if (sel.hasFloating()) {
            sel.commitFloating(layer);
        }

        const cb = this._clipboard;
        sel.mask.fill(0);
        sel.active = true;
        sel.floating = {
            data: new Uint16Array(cb.data),
            mask: new Uint8Array(cb.mask),
            width: cb.width,
            height: cb.height,
            originX, originY
        };

        this.undoManager.endOperation();
        this.bus.emit('selection-changed');
        this.bus.emit('layer-changed');
    }

    _paste() {
        if (!this._clipboard) return;
        const cb = this._clipboard;
        const ox = Math.round((this.doc.width - cb.width) / 2);
        const oy = Math.round((this.doc.height - cb.height) / 2);
        this._pasteAsFloating(ox, oy);
    }

    _pasteInPlace() {
        if (!this._clipboard) return;
        this._pasteAsFloating(this._clipboard.originX, this._clipboard.originY);
    }

    _clearSelection() {
        const sel = this.doc.selection;
        if (!sel.active) {
            alert('No selection');
            return;
        }
        this.undoManager.beginOperation();
        if (sel.hasFloating()) {
            sel.clear();
            this.bus.emit('selection-changed');
        } else {
            const layer = this.doc.getActiveLayer();
            for (let y = 0; y < sel.height; y++) {
                for (let x = 0; x < sel.width; x++) {
                    if (!sel.mask[y * sel.width + x]) continue;
                    const lx = x - layer.offsetX;
                    const ly = y - layer.offsetY;
                    if (lx >= 0 && lx < layer.width && ly >= 0 && ly < layer.height) {
                        layer.setPixel(lx, ly, TRANSPARENT);
                    }
                }
            }
        }
        this.undoManager.endOperation();
        this.bus.emit('layer-changed');
    }

    _setBrushFromSelection() {
        const sel = this.doc.selection;
        if (!sel.active) {
            alert('No selection');
            return;
        }
        const copied = sel.copyPixels(this.doc.getActiveLayer());
        if (!copied) return;

        const brush = new Brush(copied.width, copied.height, copied.data, true);
        // Find center of the mask for origin
        let cx = 0, cy = 0, count = 0;
        for (let y = 0; y < copied.height; y++) {
            for (let x = 0; x < copied.width; x++) {
                if (copied.mask[y * copied.width + x]) {
                    cx += x; cy += y; count++;
                }
            }
        }
        brush.originX = Math.round(cx / count);
        brush.originY = Math.round(cy / count);

        // Mark unselected pixels as TRANSPARENT in brush data
        for (let i = 0; i < copied.width * copied.height; i++) {
            if (!copied.mask[i]) brush.data[i] = TRANSPARENT;
        }

        this.doc.activeBrush = brush;
        this.bus.emit('brush-changed');
        this.bus.emit('switch-tool', 'Brush');
    }

    _showViewMenu() {
        const anchor = document.querySelector('[data-menu="view"]');
        this._showDropdown(anchor, [
            { label: 'Zoom In', shortcut: '+', action: () => this._zoomStep(1) },
            { label: 'Zoom Out', shortcut: '-', action: () => this._zoomStep(-1) },
            '-',
            { label: 'Reset Zoom', action: () => {
                this.canvasView.zoomIndex = 3;
                this.canvasView.zoom = ZOOM_LEVELS[2];
                this.canvasView._centerDocument();
                this.bus.emit('zoom-changed', this.canvasView.zoom);
                this.canvasView.render();
            }},
        ]);
    }

    _rotateImage(clockwise) {
        const doc = this.doc;
        const oldW = doc.width;
        const oldH = doc.height;

        this.undoManager.beginOperation();

        for (const layer of doc.layers) {
            const { width: lw, height: lh, data, offsetX, offsetY } = layer;
            const newLW = lh;
            const newLH = lw;
            const newData = new Uint16Array(newLW * newLH);
            newData.fill(TRANSPARENT);

            for (let row = 0; row < lh; row++) {
                for (let col = 0; col < lw; col++) {
                    const px = data[row * lw + col];
                    let newCol, newRow;
                    if (clockwise) {
                        newCol = lh - 1 - row;
                        newRow = col;
                    } else {
                        newCol = row;
                        newRow = lw - 1 - col;
                    }
                    newData[newRow * newLW + newCol] = px;
                }
            }

            let newOffX, newOffY;
            if (clockwise) {
                newOffX = oldH - 1 - (offsetY + lh - 1);
                newOffY = offsetX;
            } else {
                newOffX = offsetY;
                newOffY = oldW - 1 - (offsetX + lw - 1);
            }

            layer.data = newData;
            layer.width = newLW;
            layer.height = newLH;
            layer.offsetX = newOffX;
            layer.offsetY = newOffY;
        }

        doc.width = oldH;
        doc.height = oldW;
        doc.selection.resize(oldH, oldW);

        this.undoManager.endOperation();

        document.getElementById('status-size').textContent = `${doc.width} x ${doc.height}`;
        this.bus.emit('selection-changed');
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
    }

    _showImageMenu() {
        const anchor = document.querySelector('[data-menu="image"]');
        this._showDropdown(anchor, [
            { label: 'Resize...', action: () => this._showResizeDialog() },
            '-',
            { label: 'Rotate Left', action: () => this._rotateImage(false) },
            { label: 'Rotate Right', action: () => this._rotateImage(true) },
            '-',
            { label: 'Reset Brush', shortcut: '1', action: () => {
                this.doc.activeBrush = Brush.default();
                this.bus.emit('brush-changed');
            }},
        ]);
    }

    _showLayerMenu() {
        const anchor = document.querySelector('[data-menu="layer"]');
        const sel = this.doc.selectedLayerIndices;
        const multiSelected = sel.size >= 2;
        this._showDropdown(anchor, [
            { label: 'Merge Selected', disabled: !multiSelected, action: () => this._mergeSelectedLayers() },
            { label: 'Merge All', action: () => {
                this.undoManager.beginOperation();
                const flat = this.doc.flattenToLayer();
                this.doc.layers = [flat];
                this.doc.activeLayerIndex = 0;
                this.doc.selectedLayerIndices.clear();
                this.doc.selectedLayerIndices.add(0);
                this.undoManager.endOperation();
                this.bus.emit('layer-changed');
                this.bus.emit('document-changed');
            }},
        ]);
    }

    _mergeSelectedLayers() {
        const doc = this.doc;
        const sel = doc.selectedLayerIndices;
        if (sel.size < 2) return;

        const indices = [...sel].sort((a, b) => a - b);

        this.undoManager.beginOperation();

        // Composite selected layers bottom-to-top into a new layer
        const merged = new Layer('Merged', doc.width, doc.height);
        for (const idx of indices) {
            const layer = doc.layers[idx];
            if (!layer.visible) continue;
            const lx0 = Math.max(0, layer.offsetX);
            const ly0 = Math.max(0, layer.offsetY);
            const lx1 = Math.min(doc.width, layer.offsetX + layer.width);
            const ly1 = Math.min(doc.height, layer.offsetY + layer.height);
            for (let dy = ly0; dy < ly1; dy++) {
                for (let dx = lx0; dx < lx1; dx++) {
                    const val = layer.data[(dy - layer.offsetY) * layer.width + (dx - layer.offsetX)];
                    if (val !== TRANSPARENT) {
                        merged.data[dy * doc.width + dx] = val;
                    }
                }
            }
        }

        // Remove selected layers (from highest index first) and insert merged
        const lowestIdx = indices[0];
        for (let i = indices.length - 1; i >= 0; i--) {
            doc.layers.splice(indices[i], 1);
        }
        doc.layers.splice(lowestIdx, 0, merged);
        doc.activeLayerIndex = lowestIdx;
        sel.clear();
        sel.add(lowestIdx);

        this.undoManager.endOperation();
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
    }

    _showResizeDialog() {
        const doc = this.doc;
        const origW = doc.width;
        const origH = doc.height;
        const ratio = origW / origH;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center; z-index: 1000;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: var(--bg-panel, #2d2d30); border: 1px solid var(--border, #3c3c3c);
            border-radius: 6px; padding: 24px; min-width: 300px; color: var(--text, #ccc);
        `;

        const inputStyle = `width: 100%; padding: 6px; background: #3c3c3c; border: 1px solid #555;
            border-radius: 3px; color: #ccc; font-size: 13px; box-sizing: border-box;`;
        const checkStyle = `margin-right: 8px; accent-color: #007acc;`;
        const btnStyle = `padding: 8px 16px; border: none; border-radius: 3px; cursor: pointer; font-size: 13px;`;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #fff;">Resize Document</h3>
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #aaa;">Width (px)</label>
                <input id="resize-w" type="number" value="${origW}" min="1" max="4096" style="${inputStyle}">
            </div>
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #aaa;">Height (px)</label>
                <input id="resize-h" type="number" value="${origH}" min="1" max="4096" style="${inputStyle}">
            </div>
            <div style="margin-bottom: 8px;">
                <label style="font-size: 13px; color: #ccc; cursor: pointer;">
                    <input id="resize-aspect" type="checkbox" style="${checkStyle}">Keep aspect ratio
                </label>
            </div>
            <div style="margin-bottom: 12px;">
                <label style="font-size: 13px; color: #ccc; cursor: pointer;">
                    <input id="resize-content" type="checkbox" style="${checkStyle}">Resize content
                </label>
            </div>
            <div id="resize-anchor-group" style="margin-bottom: 16px;">
                <label style="display: block; font-size: 12px; margin-bottom: 6px; color: #aaa;">Anchor</label>
                <div style="display: inline-grid; grid-template-columns: repeat(3, 24px); gap: 2px;">
                    ${['nw','n','ne','w','c','e','sw','s','se'].map(id =>
                        `<label style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;
                            background:#3c3c3c;border:1px solid #555;border-radius:3px;cursor:pointer;">
                            <input type="radio" name="resize-anchor" value="${id}"${id === 'nw' ? ' checked' : ''}
                                style="margin:0;accent-color:#007acc;">
                        </label>`
                    ).join('')}
                </div>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="resize-cancel" style="${btnStyle} background: #3c3c3c; color: #ccc;">Cancel</button>
                <button id="resize-apply" style="${btnStyle} background: #007acc; color: #fff;">Apply</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const wInput = dialog.querySelector('#resize-w');
        const hInput = dialog.querySelector('#resize-h');
        const aspectCheck = dialog.querySelector('#resize-aspect');
        const contentCheck = dialog.querySelector('#resize-content');
        const anchorGroup = dialog.querySelector('#resize-anchor-group');

        const updateAnchorState = () => {
            const disabled = contentCheck.checked;
            anchorGroup.style.opacity = disabled ? '0.4' : '1';
            anchorGroup.style.pointerEvents = disabled ? 'none' : 'auto';
        };
        contentCheck.addEventListener('change', updateAnchorState);

        let updatingAspect = false;
        wInput.addEventListener('input', () => {
            if (aspectCheck.checked && !updatingAspect) {
                updatingAspect = true;
                hInput.value = Math.max(1, Math.round(parseInt(wInput.value) / ratio)) || 1;
                updatingAspect = false;
            }
        });
        hInput.addEventListener('input', () => {
            if (aspectCheck.checked && !updatingAspect) {
                updatingAspect = true;
                wInput.value = Math.max(1, Math.round(parseInt(hInput.value) * ratio)) || 1;
                updatingAspect = false;
            }
        });

        const close = () => overlay.remove();

        dialog.querySelector('#resize-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        dialog.querySelector('#resize-apply').addEventListener('click', () => {
            const newW = Math.max(1, Math.min(4096, parseInt(wInput.value) || origW));
            const newH = Math.max(1, Math.min(4096, parseInt(hInput.value) || origH));
            if (newW === origW && newH === origH) { close(); return; }
            const anchor = dialog.querySelector('input[name="resize-anchor"]:checked').value;
            close();
            this._applyResize(newW, newH, contentCheck.checked, anchor);
        });

        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') dialog.querySelector('#resize-apply').click();
            if (e.key === 'Escape') close();
            e.stopPropagation();
        });

        wInput.focus();
        wInput.select();
    }

    _applyResize(newW, newH, resizeContent, anchor = 'nw') {
        const doc = this.doc;
        const oldW = doc.width;
        const oldH = doc.height;

        // Snapshot all layers for undo
        const beforeLayers = doc.layers.map(l => ({
            data: l.snapshotData(),
            geometry: l.snapshotGeometry(),
        }));
        const beforeSelection = doc.selection.snapshot();
        const beforeDocSize = { width: oldW, height: oldH };

        // Clear selection
        if (doc.selection.active) {
            if (doc.selection.hasFloating()) {
                doc.selection.commitFloating(doc.getActiveLayer());
            }
            doc.selection.clear();
        }

        // Resize document dimensions
        doc.width = newW;
        doc.height = newH;

        if (resizeContent) {
            // Scale each layer's pixel data
            const sx = newW / oldW;
            const sy = newH / oldH;
            for (const layer of doc.layers) {
                const newLayerW = Math.max(1, Math.round(layer.width * sx));
                const newLayerH = Math.max(1, Math.round(layer.height * sy));
                const newData = new Uint16Array(newLayerW * newLayerH);
                newData.fill(TRANSPARENT);
                for (let y = 0; y < newLayerH; y++) {
                    for (let x = 0; x < newLayerW; x++) {
                        const srcX = Math.floor(x / sx);
                        const srcY = Math.floor(y / sy);
                        if (srcX < layer.width && srcY < layer.height) {
                            newData[y * newLayerW + x] = layer.data[srcY * layer.width + srcX];
                        }
                    }
                }
                layer.data = newData;
                layer.width = newLayerW;
                layer.height = newLayerH;
                layer.offsetX = Math.round(layer.offsetX * sx);
                layer.offsetY = Math.round(layer.offsetY * sy);
            }
        } else {
            // Shift layers based on anchor point
            const dx = anchor.includes('w') ? 0 : anchor.includes('e') ? newW - oldW : Math.round((newW - oldW) / 2);
            const dy = anchor.includes('n') ? 0 : anchor.includes('s') ? newH - oldH : Math.round((newH - oldH) / 2);
            if (dx !== 0 || dy !== 0) {
                for (const layer of doc.layers) {
                    layer.offsetX += dx;
                    layer.offsetY += dy;
                }
            }
        }

        // Resize selection mask
        doc.selection.resize(newW, newH);

        // Snapshot after for undo
        const afterLayers = doc.layers.map(l => ({
            data: l.snapshotData(),
            geometry: l.snapshotGeometry(),
        }));
        const afterSelection = doc.selection.snapshot();

        // Push a custom undo entry for the full resize
        this.undoManager.undoStack.push({
            type: 'resize',
            beforeDocSize,
            afterDocSize: { width: newW, height: newH },
            beforeLayers,
            afterLayers,
            beforeSelection,
            afterSelection,
        });
        this.undoManager.redoStack = [];

        // Update status bar and re-render
        document.getElementById('status-size').textContent = `${newW} x ${newH}`;
        this.bus.emit('selection-changed');
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
    }

    _saveProject() {
        const blob = savePix8(this.doc);
        downloadBlob(blob, 'untitled.pix8');
    }

    _openFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pix8,.bmp,.pcx';
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    let newDoc;
                    const ext = file.name.split('.').pop().toLowerCase();
                    if (ext === 'pix8') {
                        newDoc = loadPix8(reader.result);
                    } else if (ext === 'bmp') {
                        newDoc = importBMP(reader.result);
                    } else if (ext === 'pcx') {
                        newDoc = importPCX(reader.result);
                    } else {
                        alert('Unsupported file format');
                        return;
                    }
                    // Replace current doc — simplest approach: reload the app
                    this._replaceDocument(newDoc);
                } catch (err) {
                    alert('Error loading file: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        });
        input.click();
    }

    _replaceDocument(newDoc) {
        this.doc.width = newDoc.width;
        this.doc.height = newDoc.height;
        this.doc.layers = newDoc.layers;
        this.doc.activeLayerIndex = newDoc.activeLayerIndex;
        this.doc.palette = newDoc.palette;
        this.doc.fgColorIndex = newDoc.fgColorIndex;
        this.doc.bgColorIndex = newDoc.bgColorIndex;

        // Reset selection and layer selection for new document dimensions
        this.doc.selectedLayerIndices.clear();
        this.doc.selectedLayerIndices.add(this.doc.activeLayerIndex);
        this.doc.selection.resize(newDoc.width, newDoc.height);
        this.canvasView.stopMarchingAnts();

        // Recreate offscreen canvas
        this.canvasView.offscreen.width = newDoc.width;
        this.canvasView.offscreen.height = newDoc.height;
        this.canvasView.renderer = new (this.canvasView.renderer.constructor)(this.doc);
        this.canvasView._centerDocument();

        document.getElementById('status-size').textContent = `${newDoc.width} x ${newDoc.height}`;

        this.undoManager.undoStack = [];
        this.undoManager.redoStack = [];

        this.bus.emit('palette-changed');
        this.bus.emit('fg-color-changed');
        this.bus.emit('bg-color-changed');
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
    }

    _parseImageFile(file, callback, { askTransparency = true } = {}) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext !== 'bmp' && ext !== 'pcx') {
            alert('Unsupported format. Please use BMP or PCX files.');
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const doc = ext === 'bmp' ? importBMP(reader.result) : importPCX(reader.result);
                if (askTransparency) {
                    this._showTransparencyDialog((zeroIsTransparent) => {
                        if (zeroIsTransparent) {
                            this._convertZeroToTransparent(doc);
                        }
                        callback(doc, file);
                    });
                } else {
                    callback(doc, file);
                }
            } catch (err) {
                alert('Error importing file: ' + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    _convertZeroToTransparent(doc) {
        for (const layer of doc.layers) {
            for (let i = 0; i < layer.data.length; i++) {
                if (layer.data[i] === 0) layer.data[i] = TRANSPARENT;
            }
        }
    }

    _showTransparencyDialog(callback) {
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.7);
            display: flex; align-items: center; justify-content: center; z-index: 1000;
        `;

        const lastChoice = localStorage.getItem('pix8-zero-transparent') ?? 'no';

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #2d2d30; border: 1px solid #555; border-radius: 6px;
            padding: 20px; min-width: 300px; color: #ccc;
        `;
        dialog.innerHTML = `
            <div style="font-size: 14px; margin-bottom: 16px; color: #fff;">Treat index 0 as transparent?</div>
            <div style="font-size: 12px; color: #aaa; margin-bottom: 16px;">
                If yes, all pixels with palette index 0 will become transparent.
            </div>
            <div style="display: flex; gap: 8px;">
                <button id="transp-yes" style="flex: 1; padding: 8px; background: ${lastChoice === 'yes' ? '#007acc' : '#3c3c3c'};
                    border: 1px solid ${lastChoice === 'yes' ? '#007acc' : '#555'}; border-radius: 3px; color: #fff; cursor: pointer; font-size: 13px;">Yes</button>
                <button id="transp-no" style="flex: 1; padding: 8px; background: ${lastChoice === 'no' ? '#007acc' : '#3c3c3c'};
                    border: 1px solid ${lastChoice === 'no' ? '#007acc' : '#555'}; border-radius: 3px; color: #fff; cursor: pointer; font-size: 13px;">No</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const finish = (choice) => {
            localStorage.setItem('pix8-zero-transparent', choice ? 'yes' : 'no');
            overlay.remove();
            callback(choice);
        };

        dialog.querySelector('#transp-yes').addEventListener('click', () => finish(true));
        dialog.querySelector('#transp-no').addEventListener('click', () => finish(false));
        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish(lastChoice === 'yes');
            if (e.key === 'Escape') finish(lastChoice === 'no');
        });
        dialog.querySelector(lastChoice === 'yes' ? '#transp-yes' : '#transp-no').focus();
    }

    _importFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bmp,.pcx';
        input.addEventListener('change', () => {
            if (!input.files[0]) return;
            this._parseImageFile(input.files[0], (newDoc) => {
                this._replaceDocument(newDoc);
            });
        });
        input.click();
    }

    _importAsLayer() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bmp,.pcx';
        input.addEventListener('change', () => {
            if (!input.files[0]) return;
            this._parseImageFile(input.files[0], (tempDoc, file) => {
                const importedLayer = tempDoc.getActiveLayer();
                importedLayer.name = file.name.replace(/\.[^.]+$/, '');
                const insertIdx = this.doc.activeLayerIndex + 1;
                this.doc.layers.splice(insertIdx, 0, importedLayer);
                this.doc.activeLayerIndex = insertIdx;
                this.doc.selectedLayerIndices.clear();
                this.doc.selectedLayerIndices.add(insertIdx);
                this.bus.emit('layer-changed');
                this.bus.emit('document-changed');
            });
        });
        input.click();
    }

    _importPalette() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bmp,.pcx';
        input.addEventListener('change', () => {
            if (!input.files[0]) return;
            this._parseImageFile(input.files[0], (tempDoc) => {
                this.doc.palette.import(tempDoc.palette.export());
                this.bus.emit('palette-changed');
                this.bus.emit('fg-color-changed');
                this.bus.emit('bg-color-changed');
                this.bus.emit('document-changed');
            }, { askTransparency: false });
        });
        input.click();
    }

    _exportBMP() {
        const blob = exportBMP(this.doc);
        downloadBlob(blob, 'export.bmp');
    }

    _exportPCX() {
        const blob = exportPCX(this.doc);
        downloadBlob(blob, 'export.pcx');
    }

    async _exportPNG() {
        const blob = await exportPNG(this.doc, this.canvasView.renderer);
        downloadBlob(blob, 'export.png');
    }
}

// Boot
const app = new App();
