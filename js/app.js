import { EventBus } from './EventBus.js';
import { ImageDocument } from './model/ImageDocument.js';
import { Brush } from './model/Brush.js';
import { DEFAULT_DOC_WIDTH, DEFAULT_DOC_HEIGHT, TRANSPARENT } from './constants.js';

import { CanvasView } from './ui/CanvasView.js';
import { Toolbar } from './ui/Toolbar.js';
import { ColorSelector } from './ui/ColorSelector.js';
import { PalettePanel } from './ui/PalettePanel.js';
import { LayersPanel } from './ui/LayersPanel.js';
import { TabBar } from './ui/TabBar.js';
import { FramePanel } from './ui/FramePanel.js';
import Dialog from './ui/Dialog.js';
import { INPUT_STYLE } from './ui/dialogHelpers.js';

import { UndoManager } from './history/UndoManager.js';

import { BrushTool } from './tools/BrushTool.js';
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

// Mixin modules — methods mixed into App.prototype below
import * as MenuManager from './ui/MenuManager.js';
import * as KeyboardManager from './KeyboardManager.js';
import * as FileManager from './FileManager.js';
import * as ImageOperations from './ImageOperations.js';

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

        // Warn before closing/refreshing (browser only)
        if (!window.electronAPI) {
            window.addEventListener('beforeunload', (e) => {
                e.preventDefault();
            });
        }
    }

    _showNewDocDialog() {
        const dlg = Dialog.create({
            title: 'New Document',
            width: '300px',
            buttons: [
                { label: 'Create', primary: true, onClick: () => {
                    const w = Math.max(1, Math.min(1024, parseInt(wInput.value) || 64));
                    const h = Math.max(1, Math.min(1024, parseInt(hInput.value) || 64));
                    dlg.close();
                    this._init(w, h);
                }},
            ],
            enterButton: 0,
        });

        dlg.body.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:8px 0;';
        dlg.body.innerHTML = `
            <div>
                <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-dim);">Width (px)</label>
                <input id="new-doc-w" type="number" value="64" min="1" max="1024" style="${INPUT_STYLE}">
            </div>
            <div>
                <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-dim);">Height (px)</label>
                <input id="new-doc-h" type="number" value="64" min="1" max="1024" style="${INPUT_STYLE}">
            </div>
            <div style="display:flex;gap:8px;">
                <button class="preset-btn" data-w="32" data-h="32" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">32x32</button>
                <button class="preset-btn" data-w="64" data-h="64" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">64x64</button>
                <button class="preset-btn" data-w="128" data-h="128" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">128x128</button>
                <button class="preset-btn" data-w="256" data-h="256" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">256x256</button>
            </div>
        `;

        const wInput = dlg.body.querySelector('#new-doc-w');
        const hInput = dlg.body.querySelector('#new-doc-h');

        for (const btn of dlg.body.querySelectorAll('.preset-btn')) {
            btn.addEventListener('click', () => {
                wInput.value = btn.dataset.w;
                hInput.value = btn.dataset.h;
            });
        }

        dlg.show(wInput);
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
            this._finishToolSwitch(tool);
        });

        this.toolbar.setActiveTool('Brush');

        // UI panels
        this.colorSelector = new ColorSelector(this.doc, this.bus);
        this.palettePanel = new PalettePanel(this.doc, this.bus, this.undoManager);
        this.layersPanel = new LayersPanel(this.doc, this.bus, this.undoManager);
        this.framePanel = new FramePanel(this.doc, this.bus);

        // FG/BG color picker via palette editor
        this.bus.on('open-palette-picker', (target) => {
            const initialIdx = target === 'fg' ? this.doc.fgColorIndex : this.doc.bgColorIndex;
            this.palettePanel._openDialog((colorIndex) => {
                if (target === 'fg') {
                    this.doc.fgColorIndex = colorIndex;
                    this.bus.emit('fg-color-changed');
                } else {
                    this.doc.bgColorIndex = colorIndex;
                    this.bus.emit('bg-color-changed');
                }
            }, initialIdx);
        });

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
        this.bus.on('active-layer-changed', () => this.canvasView.render());
        this.bus.on('space-tap', () => {
            if (this.doc.animationEnabled) this.framePanel.togglePlayTag();
        });
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

        // Frame panel visibility
        if (tab.doc.animationEnabled) {
            this.framePanel.show();
        } else {
            this.framePanel.hide();
        }

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
        this.framePanel.doc = doc;
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
        const dlg = Dialog.create({
            title: 'New Document',
            width: '300px',
            buttons: [
                { label: 'Cancel' },
                { label: 'Create', primary: true, onClick: () => {
                    const w = Math.max(1, Math.min(1024, parseInt(wInput.value) || 64));
                    const h = Math.max(1, Math.min(1024, parseInt(hInput.value) || 64));
                    dlg.close();
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
                    this.framePanel.hide();
                    this._createTab(nameInput.value.trim() || 'Untitled');
                    this.bus.emit('palette-changed');
                    this.bus.emit('fg-color-changed');
                    this.bus.emit('bg-color-changed');
                    this.bus.emit('layer-changed');
                    this.bus.emit('document-changed');
                    document.getElementById('status-size').textContent = `${w} x ${h}`;
                }},
            ],
            enterButton: 1,
        });

        dlg.body.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:8px 0;';
        dlg.body.innerHTML = `
            <div>
                <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-dim);">Name</label>
                <input id="new-tab-name" type="text" value="Untitled" style="${INPUT_STYLE}">
            </div>
            <div>
                <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-dim);">Width (px)</label>
                <input id="new-tab-w" type="number" value="64" min="1" max="1024" style="${INPUT_STYLE}">
            </div>
            <div>
                <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--text-dim);">Height (px)</label>
                <input id="new-tab-h" type="number" value="64" min="1" max="1024" style="${INPUT_STYLE}">
            </div>
            <div style="display:flex;gap:8px;">
                <button class="preset-btn" data-w="32" data-h="32" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">32x32</button>
                <button class="preset-btn" data-w="64" data-h="64" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">64x64</button>
                <button class="preset-btn" data-w="128" data-h="128" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">128x128</button>
                <button class="preset-btn" data-w="256" data-h="256" style="flex:1;padding:6px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;">256x256</button>
            </div>
        `;

        const nameInput = dlg.body.querySelector('#new-tab-name');
        const wInput = dlg.body.querySelector('#new-tab-w');
        const hInput = dlg.body.querySelector('#new-tab-h');

        for (const btn of dlg.body.querySelectorAll('.preset-btn')) {
            btn.addEventListener('click', () => {
                wInput.value = btn.dataset.w;
                hInput.value = btn.dataset.h;
            });
        }

        dlg.show(nameInput);
    }

    // ── Tool Hints ──────────────────────────────────────────────────

    _showStatus(msg) {
        this._showToast(msg);
    }

    _showToast(msg, duration = 1500) {
        const el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.remove('toast-visible');
        void el.offsetHeight; // force reflow to restart transition
        el.classList.add('toast-visible');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            el.classList.remove('toast-visible');
        }, duration);
    }

    _getToolHint(name) {
        const hints = {
            'Move':            'Drag to move layer',
            'Brush':           'Draw with brush  |  Right-click: BG color  |  Shift: line mode  |  Ctrl: snap angle',
            'Eraser':          'Erase to transparent  |  Shift: line mode  |  Ctrl: snap angle',
            'Fill':            'Click to flood fill  |  Right-click: BG color',
            'Color Picker':    'Click to pick FG color  |  Right-click: BG color',
            'Rectangle':       'Drag to draw rect  |  Shift: square',
            'Filled Rect':     'Drag to draw filled rect  |  Shift: square',
            'Ellipse':         'Drag to draw ellipse  |  Shift: circle',
            'Filled Ellipse':  'Drag to draw filled ellipse  |  Shift: circle',
            'Rect Select':     'Drag to select  |  Ctrl: add  |  Alt: subtract  |  Shift: square',
            'Ellipse Select':  'Drag to select  |  Ctrl: add  |  Alt: subtract  |  Shift: circle',
            'Free Transform':  'Move, resize, or rotate selection  |  Enter: apply  |  Escape: cancel  |  Ctrl: snap angle',
            'Mirror':          'Click to flip horizontal  |  Shift: flip vertical',
            'Text':            'Click to add text  |  Click text layer to edit',
        };
        return hints[name] || '';
    }

    _finishToolSwitch(tool) {
        const ft = this._freeTransformTool;
        this.canvasView.activeTool = tool;
        document.getElementById('status-tool').textContent = tool.name;
        document.getElementById('status-hint').textContent = this._getToolHint(tool.name);
        if (tool.activate && tool !== ft) {
            tool.activate();
        }
        if (tool === ft && !ft.isTransformActive) {
            const sel = this.doc.selection;
            if (!sel.active) {
                this._showToast('No selection');
                const fallback = this._lastNonTransformTool || 'Rect Select';
                this.toolbar.setActiveTool(fallback);
                return;
            }
            const prev = this._lastNonTransformTool || 'Rect Select';
            ft.activate(prev, this.undoManager);
            this.toolbar.setLocked(true);
        }
        if (tool !== ft) {
            this.toolbar.setLocked(false);
            this._lastNonTransformTool = tool.name;
        }
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

    // Menu, keyboard, file I/O, and image operation methods are mixed in
    // from separate modules — see Object.assign at the bottom of this file.

    _toggleAnimation() {
        if (this.doc.animationEnabled) {
            if (!confirm('Disable animation? Only frame 1 data will be kept.')) return;
            this.doc.disableAnimation();
            this.framePanel.hide();
        } else {
            this.doc.enableAnimation();
            this.framePanel.show();
        }
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
        this.bus.emit('animation-changed');
    }

    // ── Clipboard Operations ────────────────────────────────────────

    _copy() {
        const sel = this.doc.selection;
        if (!sel.active) return;
        const copied = sel.copyPixels(this.doc.getActiveLayer());
        if (copied) {
            if (copied.data.every(v => v === TRANSPARENT)) {
                this._showStatus('No content to copy');
                return;
            }
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

        // Save current frame before modifying layers
        if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
        const newLayer = this.doc.addLayer('Pasted');
        newLayer.width = cb.width;
        newLayer.height = cb.height;
        newLayer.data = new Uint16Array(cb.width * cb.height);
        newLayer.data.set(data);
        newLayer.offsetX = originX;
        newLayer.offsetY = originY;
        // Update current frame with the pasted content
        if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
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
                    if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
                    const newLayer = this.doc.addLayer('Pasted');
                    newLayer.width = w;
                    newLayer.height = h;
                    newLayer.data = new Uint16Array(w * h);
                    newLayer.data.set(indices);
                    newLayer.offsetX = Math.round((this.doc.width - w) / 2);
                    newLayer.offsetY = Math.round((this.doc.height - h) / 2);
                    if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
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
            this._showToast('No selection');
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
            this._showToast('No selection');
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

    _showTextDialog(opts) {
        const existing = opts.isNew ? null : opts.layer.textData;
        let selectedColorIndex = existing ? existing.colorIndex : this.doc.fgColorIndex;

        const dlg = Dialog.create({
            title: opts.isNew ? 'Add Text' : 'Edit Text',
            width: '320px',
            buttons: [
                { label: 'Cancel' },
                { label: 'OK', primary: true, onClick: () => {
                    const text = textarea.value;
                    if (!text.trim()) { dlg.close(); return; }
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
                        if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
                        const layer = this.doc.addLayer('Text: ' + text.split('\n')[0].substring(0, 20));
                        layer.type = 'text';
                        layer.textData = { ...textData };
                        layer.offsetX = opts.x || 0;
                        layer.offsetY = opts.y || 0;
                        if (this.doc.animationEnabled) this.doc.saveCurrentFrame();
                    } else {
                        opts.layer.textData = textData;
                        opts.layer.name = 'Text: ' + text.split('\n')[0].substring(0, 20);
                    }
                    dlg.close();
                    this.bus.emit('layer-changed');
                    this.bus.emit('document-changed');
                }},
            ],
        });

        const body = dlg.body;

        // Text input
        const textarea = document.createElement('textarea');
        textarea.value = existing ? existing.text : '';
        textarea.placeholder = 'Enter text...';
        textarea.style.cssText = 'width:100%;height:80px;resize:vertical;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);padding:6px;font-size:13px;font-family:monospace;box-sizing:border-box;margin-bottom:8px;';
        body.appendChild(textarea);

        const row = (label, el) => {
            const r = document.createElement('div');
            r.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12px;';
            const l = document.createElement('label');
            l.textContent = label;
            l.style.width = '70px';
            r.appendChild(l);
            r.appendChild(el);
            body.appendChild(r);
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
        body.appendChild(styleRow);

        // Color picker
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
            const rect = colorSwatch.getBoundingClientRect();
            const popupH = 16 * 15 + 12;
            popup.style.left = Math.max(0, rect.left) + 'px';
            popup.style.top = Math.max(0, rect.top - popupH - 4) + 'px';
            document.body.appendChild(popup);
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
        body.appendChild(colorRow);
        updateSwatch();

        dlg.show(textarea);
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

}

// Mix in methods from extracted modules
Object.assign(App.prototype, MenuManager);
Object.assign(App.prototype, KeyboardManager);
Object.assign(App.prototype, FileManager);
Object.assign(App.prototype, ImageOperations);

// Boot
const app = new App(); // eslint-disable-line
