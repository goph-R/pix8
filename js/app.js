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
import { TabBar } from './ui/TabBar.js';

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
import { TextTool } from './tools/TextTool.js';

import {
    savePix8, loadPix8,
    exportBMP, importBMP,
    exportPCX, importPCX,
    exportPNG, downloadBlob
} from './util/io.js';

import { quantizeImage, mapToPalette } from './util/quantize.js';

class App {
    constructor() {
        this.bus = new EventBus();
        this.doc = null;
        this.canvasView = null;
        this.toolbar = null;
        this.undoManager = null;
        this.tabBar = null;
        this._tabs = [];
        this._activeTabId = null;
        this._nextTabId = 1;

        this._init(DEFAULT_DOC_WIDTH, DEFAULT_DOC_HEIGHT);
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

        // Tools (stored for doc reference updates on tab switch)
        this._tools = [
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
            new TextTool(this.doc, this.bus, this.canvasView),
        ];

        this._freeTransformTool = this._tools.find(t => t.name === 'Free Transform');

        // Toolbar
        this.toolbar = new Toolbar(this._tools, this.bus, this.doc);

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

        // Text tool dialog
        this.bus.on('open-text-dialog', (opts) => this._showTextDialog(opts));

        // Keyboard shortcuts
        this._setupKeyboardShortcuts(this._tools);

        // Menu bar
        this._setupMenuBar();

        // Tab bar
        this.tabBar = new TabBar(this.bus);
        this.bus.on('tab-switch', (id) => this._switchTab(id));
        this.bus.on('tab-close', (id) => this._closeTab(id));
        this.bus.on('tab-rename', ({ id, name }) => {
            const tab = this._tabs.find(t => t.id === id);
            if (tab) { tab.name = name; this._renderTabs(); }
        });

        // Create first tab
        this._createTab('Untitled');

        // Mouse wheel on number inputs
        document.addEventListener('wheel', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
                e.preventDefault();
                const input = e.target;
                const step = parseFloat(input.step) || 1;
                const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
                const max = input.max !== '' ? parseFloat(input.max) : Infinity;
                const val = parseFloat(input.value) || 0;
                const delta = e.deltaY < 0 ? step : -step;
                input.value = Math.max(min, Math.min(max, val + delta));
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, { passive: false });
    }

    // ── Tab Management ──────────────────────────────────────────────

    _createTab(name) {
        const tab = {
            id: this._nextTabId++,
            name,
            doc: this.doc,
            undoStack: this.undoManager.undoStack,
            redoStack: this.undoManager.redoStack,
            zoomIndex: this.canvasView.zoomIndex,
            zoom: this.canvasView.zoom,
            panX: this.canvasView.panX,
            panY: this.canvasView.panY,
        };
        this._tabs.push(tab);
        this._activeTabId = tab.id;
        this._renderTabs();
        return tab;
    }

    _saveTabState() {
        const tab = this._tabs.find(t => t.id === this._activeTabId);
        if (!tab) return;
        tab.doc = this.doc;
        tab.undoStack = this.undoManager.undoStack;
        tab.redoStack = this.undoManager.redoStack;
        tab.zoomIndex = this.canvasView.zoomIndex;
        tab.zoom = this.canvasView.zoom;
        tab.panX = this.canvasView.panX;
        tab.panY = this.canvasView.panY;
    }

    _loadTabState(tab) {
        // Replace document instance on all components
        this.doc = tab.doc;
        this._setDocOnComponents(tab.doc);

        this.undoManager.undoStack = tab.undoStack;
        this.undoManager.redoStack = tab.redoStack;

        // Restore view state
        this.canvasView.zoomIndex = tab.zoomIndex;
        this.canvasView.zoom = tab.zoom;
        this.canvasView.panX = tab.panX;
        this.canvasView.panY = tab.panY;

        // Recreate offscreen canvas and renderer
        this.canvasView.offscreen.width = tab.doc.width;
        this.canvasView.offscreen.height = tab.doc.height;
        this.canvasView.renderer = new (this.canvasView.renderer.constructor)(this.doc);

        document.getElementById('status-size').textContent = `${tab.doc.width} x ${tab.doc.height}`;
        document.getElementById('status-zoom').textContent = `${tab.zoom * 100}%`;

        // Refresh all UI
        this.canvasView.stopMarchingAnts();
        this.bus.emit('palette-changed');
        this.bus.emit('fg-color-changed');
        this.bus.emit('bg-color-changed');
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
        this.bus.emit('selection-changed');
    }

    _setDocOnComponents(doc) {
        this.canvasView.doc = doc;
        this.undoManager.doc = doc;
        this.colorSelector.doc = doc;
        this.palettePanel.doc = doc;
        this.layersPanel.doc = doc;
        this.toolbar.doc = doc;
        for (const tool of this._tools) {
            tool.doc = doc;
        }
    }

    _switchTab(id) {
        if (id === this._activeTabId) return;
        this._saveTabState();
        this._activeTabId = id;
        const tab = this._tabs.find(t => t.id === id);
        if (tab) this._loadTabState(tab);
        this._renderTabs();
    }

    _closeTab(id) {
        if (this._tabs.length <= 1) return;
        const tab = this._tabs.find(t => t.id === id);
        if (!confirm(`Close "${tab ? tab.name : 'tab'}"?`)) return;
        const idx = this._tabs.findIndex(t => t.id === id);
        if (idx < 0) return;
        this._tabs.splice(idx, 1);
        if (id === this._activeTabId) {
            const newIdx = Math.min(idx, this._tabs.length - 1);
            this._activeTabId = this._tabs[newIdx].id;
            this._loadTabState(this._tabs[newIdx]);
        }
        this._renderTabs();
    }

    _getActiveTab() {
        return this._tabs.find(t => t.id === this._activeTabId);
    }

    _renderTabs() {
        this.tabBar.render(this._tabs, this._activeTabId);
    }

    _newDocument() {
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
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #aaa;">Name</label>
                <input id="new-tab-name" type="text" value="Untitled"
                    style="width: 100%; padding: 6px; background: #3c3c3c; border: 1px solid #555;
                    border-radius: 3px; color: #ccc; font-size: 13px; box-sizing: border-box;">
            </div>
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #aaa;">Width (px)</label>
                <input id="new-tab-w" type="number" value="64" min="1" max="1024"
                    style="width: 100%; padding: 6px; background: #3c3c3c; border: 1px solid #555;
                    border-radius: 3px; color: #ccc; font-size: 13px;">
            </div>
            <div style="margin-bottom: 12px;">
                <label style="display: block; font-size: 12px; margin-bottom: 4px; color: #aaa;">Height (px)</label>
                <input id="new-tab-h" type="number" value="64" min="1" max="1024"
                    style="width: 100%; padding: 6px; background: #3c3c3c; border: 1px solid #555;
                    border-radius: 3px; color: #ccc; font-size: 13px;">
            </div>
            <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button class="preset-btn" data-w="32" data-h="32" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">32x32</button>
                <button class="preset-btn" data-w="64" data-h="64" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">64x64</button>
                <button class="preset-btn" data-w="128" data-h="128" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">128x128</button>
                <button class="preset-btn" data-w="256" data-h="256" style="flex:1; padding: 6px; background: #3c3c3c; border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer;">256x256</button>
            </div>
            <div style="display:flex;gap:8px;">
                <button id="new-tab-cancel" style="flex:1; padding: 8px; background: #3c3c3c;
                    border: 1px solid #555; border-radius: 3px; color: #ccc; cursor: pointer; font-size: 13px;">Cancel</button>
                <button id="new-tab-ok" style="flex:1; padding: 8px; background: #007acc;
                    border: none; border-radius: 3px; color: #fff; cursor: pointer; font-size: 13px;">Create</button>
            </div>
        `;
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const nameInput = dialog.querySelector('#new-tab-name');
        const wInput = dialog.querySelector('#new-tab-w');
        const hInput = dialog.querySelector('#new-tab-h');

        for (const btn of dialog.querySelectorAll('.preset-btn')) {
            btn.addEventListener('click', () => {
                wInput.value = btn.dataset.w;
                hInput.value = btn.dataset.h;
            });
        }

        dialog.querySelector('#new-tab-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        dialog.querySelector('#new-tab-ok').addEventListener('click', () => {
            const w = Math.max(1, Math.min(1024, parseInt(wInput.value) || 64));
            const h = Math.max(1, Math.min(1024, parseInt(hInput.value) || 64));
            overlay.remove();
            this._saveTabState();
            this.doc = new ImageDocument(w, h);
            this._setDocOnComponents(this.doc);
            this.undoManager.undoStack = [];
            this.undoManager.redoStack = [];
            this._clipboard = null;
            this.canvasView.offscreen.width = w;
            this.canvasView.offscreen.height = h;
            this.canvasView.renderer = new (this.canvasView.renderer.constructor)(this.doc);
            this.canvasView._centerDocument();
            this._createTab(nameInput.value.trim() || 'Untitled');
            this.bus.emit('palette-changed');
            this.bus.emit('fg-color-changed');
            this.bus.emit('bg-color-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            document.getElementById('status-size').textContent = `${w} x ${h}`;
        });

        dialog.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') dialog.querySelector('#new-tab-ok').click();
            if (e.key === 'Escape') overlay.remove();
        });

        nameInput.focus();
        nameInput.select();
    }

    // ── Tool Hints ──────────────────────────────────────────────────

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
            'Text':            'Click to add text  |  Click text layer to edit',
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
                if (this._clipboard) {
                    this._paste();
                } else {
                    this._pasteFromClipboard();
                }
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
            case 'selection':
                this._showSelectionMenu();
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
            { label: 'New...', shortcut: '', action: () => this._newDocument() },
            { label: 'Open...', shortcut: 'Ctrl+O', action: () => this._openFile() },
            { label: 'Close Tab', disabled: this._tabs.length <= 1, action: () => this._closeTab(this._activeTabId) },
            '-',
            { label: 'Save Project (.pix8)', shortcut: 'Ctrl+S', action: () => this._saveProject() },
            '-',
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
            { label: 'Paste', shortcut: 'Ctrl+V', action: () => this._clipboard ? this._paste() : this._pasteFromClipboard() },
            { label: 'Paste in Place', shortcut: 'Ctrl+Shift+V', action: () => this._pasteInPlace() },
            '-',
            { label: 'Clear', shortcut: 'Delete', action: () => this._clearSelection() },
            '-',
            { label: 'Set Brush from Selection', shortcut: 'Ctrl+B', action: () => this._setBrushFromSelection() },
        ]);
    }

    _showSelectionMenu() {
        const anchor = document.querySelector('[data-menu="selection"]');
        const sel = this.doc.selection;
        const hasSel = sel.active;
        this._showDropdown(anchor, [
            { label: 'Select All', shortcut: 'Ctrl+A', action: () => {
                if (sel.hasFloating()) sel.commitFloating(this.doc.getActiveLayer());
                sel.selectAll();
                this.bus.emit('selection-changed');
            }},
            { label: 'Deselect', shortcut: 'Ctrl+D', disabled: !hasSel, action: () => {
                if (sel.hasFloating()) {
                    this.undoManager.beginOperation();
                    sel.commitFloating(this.doc.getActiveLayer());
                    this.undoManager.endOperation();
                }
                sel.clear();
                this.bus.emit('selection-changed');
            }},
            '-',
            { label: 'Expand...', disabled: !hasSel, action: () => this._expandShrinkSelection(1) },
            { label: 'Shrink...', disabled: !hasSel, action: () => this._expandShrinkSelection(-1) },
            '-',
            { label: 'Select by Alpha', action: () => this._selectByAlpha() },
        ]);
    }

    _expandShrinkSelection(direction) {
        const label = direction > 0 ? 'Expand' : 'Shrink';
        const px = prompt(`${label} selection by (px):`, '1');
        if (px === null) return;
        const amount = Math.max(1, parseInt(px) || 1);
        const sel = this.doc.selection;
        const { width, height, mask } = sel;
        const newMask = new Uint8Array(mask);

        for (let iter = 0; iter < amount; iter++) {
            const src = new Uint8Array(newMask);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = y * width + x;
                    if (direction > 0) {
                        // Expand: if any neighbor is selected, select this pixel
                        if (src[i]) continue;
                        if ((x > 0 && src[i - 1]) || (x < width - 1 && src[i + 1]) ||
                            (y > 0 && src[i - width]) || (y < height - 1 && src[i + width])) {
                            newMask[i] = 1;
                        }
                    } else {
                        // Shrink: if any neighbor is not selected, deselect this pixel
                        if (!src[i]) continue;
                        if (x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                            !src[i - 1] || !src[i + 1] || !src[i - width] || !src[i + width]) {
                            newMask[i] = 0;
                        }
                    }
                }
            }
        }

        mask.set(newMask);
        sel._pureShape = null;
        this.bus.emit('selection-changed');
    }

    _selectByAlpha() {
        const layer = this.doc.getActiveLayer();
        const sel = this.doc.selection;
        if (sel.hasFloating()) sel.commitFloating(layer);
        sel.mask.fill(0);
        const { width, height } = sel;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const px = layer.getPixelDoc(x, y);
                if (px !== TRANSPARENT) {
                    sel.mask[y * width + x] = 1;
                }
            }
        }
        sel.active = true;
        sel._pureShape = null;
        this.bus.emit('selection-changed');
    }

    _copy() {
        const sel = this.doc.selection;
        if (!sel.active) return;
        const copied = sel.copyPixels(this.doc.getActiveLayer());
        if (copied) {
            copied.sourcePalette = this.doc.palette.export();
            this._clipboard = copied;
        }
    }

    _copyMerged() {
        const sel = this.doc.selection;
        if (!sel.active) return;
        const copied = sel.copyPixelsMerged(this.doc.layers);
        if (copied) {
            copied.sourcePalette = this.doc.palette.export();
            this._clipboard = copied;
        }
    }

    _cut() {
        const sel = this.doc.selection;
        if (!sel.active) return;
        this.undoManager.beginOperation();
        const copied = sel.copyPixels(this.doc.getActiveLayer());
        if (copied) {
            copied.sourcePalette = this.doc.palette.export();
            this._clipboard = copied;
        }
        if (!sel.hasFloating()) {
            sel.liftPixels(this.doc.getActiveLayer());
        }
        sel.clear();
        this.undoManager.endOperation();
        this.bus.emit('selection-changed');
        this.bus.emit('layer-changed');
    }

    _pasteAsLayer(originX, originY) {
        if (!this._clipboard) return;
        const cb = this._clipboard;

        // Remap palette indices if pasting from a different palette
        const data = new Uint16Array(cb.data);
        if (cb.sourcePalette) {
            const dstPalette = this.doc.palette.export();
            const remap = new Uint16Array(256);
            for (let i = 0; i < 256; i++) {
                const [sr, sg, sb] = cb.sourcePalette[i];
                let bestDist = Infinity, bestJ = 0;
                for (let j = 0; j < 256; j++) {
                    const [dr, dg, db] = dstPalette[j];
                    const dist = (sr - dr) ** 2 + (sg - dg) ** 2 + (sb - db) ** 2;
                    if (dist < bestDist) { bestDist = dist; bestJ = j; }
                    if (dist === 0) break;
                }
                remap[i] = bestJ;
            }
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== TRANSPARENT) {
                    data[i] = remap[data[i]];
                }
            }
        }

        const newLayer = new Layer('Pasted', cb.width, cb.height);
        newLayer.data.set(data);
        newLayer.offsetX = originX;
        newLayer.offsetY = originY;
        const insertIdx = this.doc.activeLayerIndex + 1;
        this.doc.layers.splice(insertIdx, 0, newLayer);
        this.doc.activeLayerIndex = insertIdx;
        this.doc.selectedLayerIndices.clear();
        this.doc.selectedLayerIndices.add(insertIdx);
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
    }

    _paste() {
        if (!this._clipboard) return;
        const cb = this._clipboard;
        const ox = Math.round((this.doc.width - cb.width) / 2);
        const oy = Math.round((this.doc.height - cb.height) / 2);
        this._pasteAsLayer(ox, oy);
    }

    _pasteInPlace() {
        if (!this._clipboard) return;
        this._pasteAsLayer(this._clipboard.originX, this._clipboard.originY);
    }

    async _pasteFromClipboard() {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find(t => t.startsWith('image/'));
                if (!imageType) continue;
                const blob = await item.getType(imageType);
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement('canvas');
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(bitmap, 0, 0);
                const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
                bitmap.close();

                this._showPasteDitherDialog(imageData.data, canvas.width, canvas.height, (indices, w, h) => {
                    // Create a new layer with the pasted data
                    const newLayer = new Layer('Pasted', w, h);
                    newLayer.data.set(indices);
                    newLayer.offsetX = Math.round((this.doc.width - w) / 2);
                    newLayer.offsetY = Math.round((this.doc.height - h) / 2);
                    const insertIdx = this.doc.activeLayerIndex + 1;
                    this.doc.layers.splice(insertIdx, 0, newLayer);
                    this.doc.activeLayerIndex = insertIdx;
                    this.doc.selectedLayerIndices.clear();
                    this.doc.selectedLayerIndices.add(insertIdx);
                    this.bus.emit('layer-changed');
                    this.bus.emit('document-changed');
                });
                return;
            }
        } catch (e) {
            // Clipboard API not available or denied
        }
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
        const activeLayer = this.doc.getActiveLayer();
        const isTextLayer = activeLayer && activeLayer.type === 'text';
        this._showDropdown(anchor, [
            { label: 'Convert to Bitmap', disabled: !isTextLayer, action: () => this._convertTextToBitmap() },
            '-',
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

    _showTextDialog(opts) {
        const overlay = document.createElement('div');
        overlay.className = 'palette-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'palette-dialog';
        dialog.style.width = 'fit-content';
        dialog.style.minWidth = '320px';

        const header = document.createElement('div');
        header.className = 'palette-dialog-header';
        header.innerHTML = `<span>${opts.isNew ? 'Add Text' : 'Edit Text'}</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'palette-dialog-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => overlay.remove());
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        const existing = opts.isNew ? null : opts.layer.textData;

        // Text input
        const textarea = document.createElement('textarea');
        textarea.value = existing ? existing.text : '';
        textarea.placeholder = 'Enter text...';
        textarea.style.cssText = 'width:100%;height:80px;resize:vertical;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);padding:6px;font-size:13px;font-family:monospace;box-sizing:border-box;margin-bottom:8px;';
        dialog.appendChild(textarea);

        const row = (label, el) => {
            const r = document.createElement('div');
            r.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;';
            const l = document.createElement('label');
            l.textContent = label;
            l.style.width = '70px';
            r.appendChild(l);
            r.appendChild(el);
            dialog.appendChild(r);
            return r;
        };

        // Font family
        const fontSelect = document.createElement('select');
        fontSelect.style.cssText = 'flex:1;background:var(--bg-input);border:1px solid var(--border);border-radius:2px;color:var(--text);padding:3px;font-size:12px;';
        for (const f of ['monospace', 'sans-serif', 'serif', 'Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana']) {
            const opt = document.createElement('option');
            opt.value = f;
            opt.textContent = f;
            opt.style.fontFamily = f;
            if (existing && existing.fontFamily === f) opt.selected = true;
            fontSelect.appendChild(opt);
        }
        row('Font:', fontSelect);

        // Font size
        const sizeInput = document.createElement('input');
        sizeInput.type = 'number';
        sizeInput.min = 4;
        sizeInput.max = 128;
        sizeInput.value = existing ? existing.fontSize : 16;
        sizeInput.style.cssText = 'width:60px;background:var(--bg-input);border:1px solid var(--border);border-radius:2px;color:var(--text);padding:3px;font-size:12px;text-align:center;';
        row('Size:', sizeInput);

        // Style checkboxes
        const styleRow = document.createElement('div');
        styleRow.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:6px;font-size:12px;';
        const makeCheck = (label, checked) => {
            const lbl = document.createElement('label');
            lbl.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = checked;
            cb.style.accentColor = 'var(--accent)';
            lbl.appendChild(cb);
            lbl.appendChild(document.createTextNode(label));
            styleRow.appendChild(lbl);
            return cb;
        };
        const boldCheck = makeCheck('Bold', existing ? existing.bold : false);
        const italicCheck = makeCheck('Italic', existing ? existing.italic : false);
        const underlineCheck = makeCheck('Underline', existing ? existing.underline : false);
        const aaCheck = makeCheck('Anti-aliased', existing ? existing.antialiased !== false : true);
        dialog.appendChild(styleRow);

        // Color picker
        let selectedColorIndex = existing ? existing.colorIndex : this.doc.fgColorIndex;
        const colorRow = document.createElement('div');
        colorRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;position:relative;';
        const colorLabel = document.createElement('label');
        colorLabel.textContent = 'Color:';
        colorLabel.style.width = '70px';
        const colorSwatch = document.createElement('div');
        const colorText = document.createElement('span');
        colorText.style.color = 'var(--text-dim)';
        const updateSwatch = () => {
            const [r, g, b] = this.doc.palette.getColor(selectedColorIndex);
            colorSwatch.style.background = `rgb(${r},${g},${b})`;
            colorText.textContent = `Index: ${selectedColorIndex}`;
        };
        colorSwatch.style.cssText = 'width:24px;height:24px;border:1px solid var(--border);cursor:pointer;';

        // Floating palette popup
        const openColorPopup = () => {
            const popup = document.createElement('div');
            popup.style.cssText = 'position:fixed;z-index:1100;display:grid;grid-template-columns:repeat(16,14px);gap:1px;padding:6px;background:var(--bg-panel);border:1px solid var(--border);border-radius:4px;box-shadow:0 4px 12px rgba(0,0,0,0.5);';
            for (let i = 0; i < 256; i++) {
                const sw = document.createElement('div');
                const [r, g, b] = this.doc.palette.getColor(i);
                sw.style.cssText = `width:14px;height:14px;background:rgb(${r},${g},${b});cursor:pointer;border:1px solid var(--border);box-sizing:border-box;`;
                sw.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectedColorIndex = i;
                    updateSwatch();
                    popup.remove();
                });
                popup.appendChild(sw);
            }
            // Position above the swatch
            const rect = colorSwatch.getBoundingClientRect();
            const popupW = 16 * 15 + 12; // approximate width
            const popupH = 16 * 15 + 12;
            popup.style.left = Math.max(0, rect.left) + 'px';
            popup.style.top = Math.max(0, rect.top - popupH - 4) + 'px';
            document.body.appendChild(popup);
            // Close on click outside
            const closePopup = (e) => {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('pointerdown', closePopup, true);
                }
            };
            setTimeout(() => document.addEventListener('pointerdown', closePopup, true), 0);
        };
        colorSwatch.addEventListener('click', openColorPopup);

        colorRow.appendChild(colorLabel);
        colorRow.appendChild(colorSwatch);
        colorRow.appendChild(colorText);
        dialog.appendChild(colorRow);
        updateSwatch();

        // Buttons
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--border);';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:4px 14px;border:1px solid var(--border);border-radius:3px;background:var(--bg-input);color:var(--text);cursor:pointer;font-size:12px;';
        cancelBtn.addEventListener('click', () => overlay.remove());
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding:4px 14px;border:1px solid var(--accent);border-radius:3px;background:var(--accent);color:var(--text-bright);cursor:pointer;font-size:12px;';
        okBtn.addEventListener('click', () => {
            const text = textarea.value;
            if (!text.trim()) { overlay.remove(); return; }
            const textData = {
                text,
                fontFamily: fontSelect.value,
                fontSize: Math.max(4, Math.min(128, parseInt(sizeInput.value) || 16)),
                bold: boldCheck.checked,
                italic: italicCheck.checked,
                underline: underlineCheck.checked,
                antialiased: aaCheck.checked,
                colorIndex: selectedColorIndex,
            };
            if (opts.isNew) {
                const layer = Layer.createText('Text: ' + text.split('\n')[0].substring(0, 20), textData, this.doc.width, this.doc.height);
                layer.offsetX = opts.x || 0;
                layer.offsetY = opts.y || 0;
                const insertIdx = this.doc.activeLayerIndex + 1;
                this.doc.layers.splice(insertIdx, 0, layer);
                this.doc.activeLayerIndex = insertIdx;
                this.doc.selectedLayerIndices.clear();
                this.doc.selectedLayerIndices.add(insertIdx);
            } else {
                opts.layer.textData = textData;
                opts.layer.name = 'Text: ' + text.split('\n')[0].substring(0, 20);
            }
            overlay.remove();
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
        });
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
        const onKey = (e) => {
            if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
        };
        document.addEventListener('keydown', onKey);
        textarea.focus();
    }

    _convertTextToBitmap() {
        const layer = this.doc.getActiveLayer();
        if (!layer || layer.type !== 'text') return;

        const td = layer.textData;
        const palette = this.doc.palette;
        const [r, g, b] = palette.getColor(td.colorIndex);
        const docW = this.doc.width;
        const docH = this.doc.height;

        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = docW;
        tmpCanvas.height = docH;
        const ctx = tmpCanvas.getContext('2d');

        const style = (td.italic ? 'italic ' : '') + (td.bold ? 'bold ' : '');
        ctx.font = `${style}${td.fontSize}px ${td.fontFamily}`;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.textBaseline = 'top';

        const lines = td.text.split('\n');
        const lineHeight = Math.round(td.fontSize * 1.2);
        for (let li = 0; li < lines.length; li++) {
            const ty = layer.offsetY + li * lineHeight;
            ctx.fillText(lines[li], layer.offsetX, ty);
            if (td.underline) {
                const metrics = ctx.measureText(lines[li]);
                ctx.fillRect(layer.offsetX, ty + td.fontSize, metrics.width, 1);
            }
        }

        const tmpData = ctx.getImageData(0, 0, docW, docH).data;
        layer.data = new Uint16Array(docW * docH).fill(TRANSPARENT);
        layer.width = docW;
        layer.height = docH;
        layer.offsetX = 0;
        layer.offsetY = 0;
        if (td.antialiased) {
            const colors = this.doc.palette.colors;
            for (let i = 0; i < docW * docH; i++) {
                const off = i * 4;
                const a = tmpData[off + 3];
                if (a < 8) continue;
                const alpha = a / 255;
                const mr = Math.round(r * alpha);
                const mg = Math.round(g * alpha);
                const mb = Math.round(b * alpha);
                let bestDist = Infinity, bestIdx = 0;
                for (let j = 0; j < 256; j++) {
                    const [pr, pg, pb] = colors[j];
                    const dist = (mr - pr) ** 2 + (mg - pg) ** 2 + (mb - pb) ** 2;
                    if (dist < bestDist) { bestDist = dist; bestIdx = j; }
                    if (dist === 0) break;
                }
                layer.data[i] = bestIdx;
            }
        } else {
            for (let i = 0; i < docW * docH; i++) {
                if (tmpData[i * 4 + 3] >= 128) {
                    layer.data[i] = td.colorIndex;
                }
            }
        }
        layer.type = 'raster';
        layer.textData = null;
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
        const tab = this._getActiveTab();
        const filename = (tab ? tab.name : 'untitled') + '.pix8';
        const blob = savePix8(this.doc);
        downloadBlob(blob, filename);
    }

    _openFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pix8,.bmp,.pcx,.png,.jpg,.jpeg,.gif,.webp';
        input.addEventListener('change', () => {
            const file = input.files[0];
            if (!file) return;
            const ext = file.name.split('.').pop().toLowerCase();

            // Truecolor image formats — decode via canvas, then quantize
            if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
                this._openTruecolorFile(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    let newDoc;
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
                    this._openInNewTab(file.name, newDoc);
                } catch (err) {
                    alert('Error loading file: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        });
        input.click();
    }

    _openInNewTab(filename, newDoc) {
        this._saveTabState();
        this.doc = newDoc;
        this._setDocOnComponents(newDoc);
        this.undoManager.undoStack = [];
        this.undoManager.redoStack = [];
        this._clipboard = null;
        this.canvasView.offscreen.width = newDoc.width;
        this.canvasView.offscreen.height = newDoc.height;
        this.canvasView.renderer = new (this.canvasView.renderer.constructor)(this.doc);
        this.canvasView._centerDocument();
        const name = filename.replace(/\.[^.]+$/, '');
        this._createTab(name);
        this.bus.emit('palette-changed');
        this.bus.emit('fg-color-changed');
        this.bus.emit('bg-color-changed');
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
        document.getElementById('status-size').textContent = `${newDoc.width} x ${newDoc.height}`;
    }

    _openTruecolorFile(file) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, img.width, img.height);
            URL.revokeObjectURL(url);
            this._showQuantizeDialog(imageData.data, img.width, img.height, (doc) => {
                this._openInNewTab(file.name, doc);
            });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            alert('Error loading image file');
        };
        img.src = url;
    }

    _showQuantizeDialog(rgbaData, width, height, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'palette-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'palette-dialog';
        dialog.style.width = 'fit-content';

        const header = document.createElement('div');
        header.className = 'palette-dialog-header';
        header.innerHTML = '<span>Import Image</span>';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'palette-dialog-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => overlay.remove());
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        const info = document.createElement('div');
        info.style.cssText = 'font-size:12px;color:var(--text-dim);margin-bottom:8px;';
        info.textContent = `Image: ${width} \u00D7 ${height} pixels`;
        dialog.appendChild(info);

        // Colors
        const colorsRow = document.createElement('div');
        colorsRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;';
        const colorsLabel = document.createElement('label');
        colorsLabel.textContent = 'Colors:';
        const colorsInput = document.createElement('input');
        colorsInput.type = 'number';
        colorsInput.min = 1;
        colorsInput.max = 256;
        colorsInput.value = 256;
        colorsInput.style.cssText = 'width:50px;background:var(--bg-input);border:1px solid var(--border);border-radius:2px;color:var(--text);padding:2px 4px;text-align:center;font-size:12px;';
        colorsRow.appendChild(colorsLabel);
        colorsRow.appendChild(colorsInput);
        dialog.appendChild(colorsRow);

        // Dithering
        const ditherRow = document.createElement('div');
        ditherRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;';
        const ditherLabel = document.createElement('label');
        ditherLabel.textContent = 'Dithering:';
        const ditherSelect = document.createElement('select');
        ditherSelect.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:2px;color:var(--text);padding:2px 4px;font-size:12px;';
        for (const [val, label] of [['none', 'None'], ['floyd-steinberg', 'Floyd-Steinberg'], ['ordered', 'Ordered (Bayer)']]) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            ditherSelect.appendChild(opt);
        }
        ditherRow.appendChild(ditherLabel);
        ditherRow.appendChild(ditherSelect);
        dialog.appendChild(ditherRow);

        // Buttons
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--border);';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'palette-dialog-footer';
        cancelBtn.style.cssText = 'padding:4px 14px;border:1px solid var(--border);border-radius:3px;background:var(--bg-input);color:var(--text);cursor:pointer;font-size:12px;';
        cancelBtn.addEventListener('click', () => overlay.remove());
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding:4px 14px;border:1px solid var(--accent);border-radius:3px;background:var(--accent);color:var(--text-bright);cursor:pointer;font-size:12px;';
        okBtn.addEventListener('click', () => {
            okBtn.disabled = true;
            cancelBtn.disabled = true;
            info.textContent = 'Converting, please wait...';
            setTimeout(() => {
                const numColors = Math.max(1, Math.min(256, parseInt(colorsInput.value) || 256));
                const ditherMode = ditherSelect.value;
                const result = quantizeImage(rgbaData, width, height, numColors, ditherMode);

                const doc = new ImageDocument(width, height);
                for (let i = 0; i < 256; i++) {
                    if (i < result.palette.length) {
                        doc.palette.setColor(i, ...result.palette[i]);
                    } else {
                        doc.palette.setColor(i, 0, 0, 0);
                    }
                }
                const layer = doc.getActiveLayer();
                layer.data.set(result.indices);
                overlay.remove();
                callback(doc);
            }, 16);
        });
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Escape to close
        const onKey = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    _showPasteDitherDialog(rgbaData, width, height, callback) {
        const overlay = document.createElement('div');
        overlay.className = 'palette-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'palette-dialog';
        dialog.style.width = 'fit-content';

        const header = document.createElement('div');
        header.className = 'palette-dialog-header';
        header.innerHTML = '<span>Paste Image</span>';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'palette-dialog-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => overlay.remove());
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        const info = document.createElement('div');
        info.style.cssText = 'font-size:12px;color:var(--text-dim);margin-bottom:8px;';
        info.textContent = `Image: ${width} \u00D7 ${height} pixels — mapping to current palette`;
        dialog.appendChild(info);

        // Dithering
        const ditherRow = document.createElement('div');
        ditherRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;';
        const ditherLabel = document.createElement('label');
        ditherLabel.textContent = 'Dithering:';
        const ditherSelect = document.createElement('select');
        ditherSelect.style.cssText = 'background:var(--bg-input);border:1px solid var(--border);border-radius:2px;color:var(--text);padding:2px 4px;font-size:12px;';
        for (const [val, label] of [['none', 'None'], ['floyd-steinberg', 'Floyd-Steinberg'], ['ordered', 'Ordered (Bayer)']]) {
            const opt = document.createElement('option');
            opt.value = val;
            opt.textContent = label;
            ditherSelect.appendChild(opt);
        }
        ditherRow.appendChild(ditherLabel);
        ditherRow.appendChild(ditherSelect);
        dialog.appendChild(ditherRow);

        // Buttons
        const footer = document.createElement('div');
        footer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;padding-top:8px;border-top:1px solid var(--border);';
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = 'padding:4px 14px;border:1px solid var(--border);border-radius:3px;background:var(--bg-input);color:var(--text);cursor:pointer;font-size:12px;';
        cancelBtn.addEventListener('click', () => overlay.remove());
        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.style.cssText = 'padding:4px 14px;border:1px solid var(--accent);border-radius:3px;background:var(--accent);color:var(--text-bright);cursor:pointer;font-size:12px;';
        okBtn.addEventListener('click', () => {
            okBtn.disabled = true;
            cancelBtn.disabled = true;
            info.textContent = 'Converting, please wait...';
            setTimeout(() => {
                const palette = this.doc.palette.export();
                const indices = mapToPalette(rgbaData, width, height, palette, ditherSelect.value);
                overlay.remove();
                callback(indices, width, height);
            }, 16);
        });
        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const onKey = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
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
