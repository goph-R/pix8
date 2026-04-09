import { ZOOM_LEVELS } from '../constants.js';
import { Brush } from '../model/Brush.js';
import { ROW_STYLE } from './dialogHelpers.js';
import Dialog from './Dialog.js';

/**
 * Menu bar infrastructure and menu definitions.
 * Methods are mixed into App.prototype — `this` refers to the App instance.
 */

export function _setupMenuBar() {
    this._activeMenuName = null;
    this._activeDropdown = null;
    this._closeMenuListener = null;

    const menuItems = document.querySelectorAll('#menubar .menu-item');
    for (const item of menuItems) {
        item.addEventListener('click', () => {
            const menu = item.dataset.menu;
            if (this._activeMenuName === menu) {
                this._closeActiveMenu();
            } else {
                this._handleMenu(menu);
            }
        });
        item.addEventListener('mouseenter', () => {
            if (this._activeMenuName && this._activeMenuName !== item.dataset.menu) {
                this._handleMenu(item.dataset.menu);
            }
        });
    }
}

export function _closeActiveMenu() {
    if (this._activeDropdown) {
        this._activeDropdown.remove();
        this._activeDropdown = null;
    }
    if (this._closeMenuListener) {
        document.removeEventListener('pointerdown', this._closeMenuListener);
        this._closeMenuListener = null;
    }
    this._activeMenuName = null;
}

export function _handleMenu(menu) {
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

export function _showDropdown(anchorEl, menuName, items) {
    this._closeActiveMenu();

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
                this._closeActiveMenu();
                item.action();
            });
        }
        dropdown.appendChild(el);
    }

    document.body.appendChild(dropdown);
    this._activeDropdown = dropdown;
    this._activeMenuName = menuName || null;

    // Close on click outside
    this._closeMenuListener = (e) => {
        if (!dropdown.contains(e.target) && !e.target.closest('#menubar')) {
            this._closeActiveMenu();
        }
    };
    setTimeout(() => document.addEventListener('pointerdown', this._closeMenuListener), 0);
}

export function _showFileMenu() {
    const anchor = document.querySelector('[data-menu="file"]');
    this._showDropdown(anchor, 'file', [
        { label: 'New...', shortcut: '', action: () => this._newDocument() },
        { label: 'Open...', shortcut: 'Ctrl+O', action: () => this._openFile() },
        { label: 'Close Tab', disabled: this._tabs.length <= 1, action: () => this._closeTab(this._activeTabId) },
        '-',
        { label: 'Save Project (.pix8)', shortcut: 'Ctrl+S', action: () => this._saveProject() },
        '-',
        { label: 'Import as Layer...', action: () => this._importAsLayer() },
        '-',
        { label: 'Export as...', shortcut: 'Ctrl+Shift+E', action: () => this._showExportDialog() },
    ]);
}

export function _showEditMenu() {
    const anchor = document.querySelector('[data-menu="edit"]');
    this._showDropdown(anchor, 'edit', [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: () => this.undoManager.undo(),
          disabled: this._freeTransformTool?.isTransformActive },
        { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: () => this.undoManager.redo(),
          disabled: this._freeTransformTool?.isTransformActive },
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
        '-',
        { label: (this.doc.animationEnabled ? '\u2713 ' : '') + 'Enable Animation', action: () => this._toggleAnimation() },
    ]);
}

export function _showSelectionMenu() {
    const anchor = document.querySelector('[data-menu="selection"]');
    const sel = this.doc.selection;
    const hasSel = sel.active;
    this._showDropdown(anchor, 'selection', [
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

export function _showViewMenu() {
    const anchor = document.querySelector('[data-menu="view"]');
    const cv = this.canvasView;
    this._showDropdown(anchor, 'view', [
        { label: 'Zoom In', shortcut: '+', action: () => this._zoomStep(1) },
        { label: 'Zoom Out', shortcut: '-', action: () => this._zoomStep(-1) },
        '-',
        { label: 'Reset Zoom', action: () => {
            cv.zoomIndex = 3;
            cv.zoom = ZOOM_LEVELS[2];
            cv._centerDocument();
            this.bus.emit('zoom-changed', cv.zoom);
            cv.render();
        }},
        '-',
        { label: (cv.gridVisible ? '\u2713 ' : '') + 'Show Grid', shortcut: "Ctrl+'", action: () => {
            cv.gridVisible = !cv.gridVisible; cv.render();
        }},
        { label: (cv.snapToGrid ? '\u2713 ' : '') + 'Snap to Grid', shortcut: "Ctrl+Shift+'", action: () => {
            cv.snapToGrid = !cv.snapToGrid;
        }},
        { label: 'Grid Settings...', action: () => this._showGridSettingsDialog() },
        '-',
        { label: (cv.rulersVisible ? '\u2713 ' : '') + 'Show Rulers', shortcut: 'Alt+R', action: () => {
            cv.setRulersVisible(!cv.rulersVisible);
        }},
        '-',
        { label: (cv.guides.visible ? '\u2713 ' : '') + 'Show Guides', shortcut: 'Ctrl+;', action: () => {
            cv.guides.visible = !cv.guides.visible; cv.render();
        }},
        { label: 'Clear All Guides', action: () => {
            cv.guides.clear(); cv.render();
        }, disabled: cv.guides.guides.length === 0 },
    ]);
}

export function _showImageMenu() {
    const anchor = document.querySelector('[data-menu="image"]');
    this._showDropdown(anchor, 'image', [
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

export function _showLayerMenu() {
    const anchor = document.querySelector('[data-menu="layer"]');
    const sel = this.doc.selectedLayerIndices;
    const multiSelected = sel.size >= 2;
    const activeLayer = this.doc.getActiveLayer();
    const isTextLayer = activeLayer && activeLayer.type === 'text';
    this._showDropdown(anchor, 'layer', [
        { label: 'Convert to Bitmap', disabled: !isTextLayer, action: () => this._convertTextToBitmap() },
        { label: 'Trim to Content', disabled: isTextLayer, action: () => this._trimLayerToContent() },
        { label: 'Crop to Canvas', disabled: isTextLayer, action: () => this._cropLayerToCanvas() },
        { label: (this.canvasView.showLayerBorder ? '\u2713 ' : '') + 'Show Border', action: () => {
            this.canvasView.showLayerBorder = !this.canvasView.showLayerBorder;
            this.canvasView.render();
        }},
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

export function _showGridSettingsDialog() {
    const dlg = Dialog.create({
        title: 'Grid Settings',
        width: '280px',
        buttons: [
            { label: 'Cancel' },
            { label: 'OK', primary: true, onClick: () => {
                const val = Math.max(2, Math.min(256, parseInt(sizeInput.value) || 16));
                this.canvasView.gridSize = val;
                this.canvasView.render();
                dlg.close();
            }},
        ],
        enterButton: 1,
    });

    const labelStyle = 'font-size:13px;color:var(--text);width:70px;';
    const inputStyle = 'flex:1;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);border-radius:3px;font-size:13px;text-align:center;';

    dlg.body.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px 0;';

    const sizeRow = document.createElement('div');
    sizeRow.style.cssText = ROW_STYLE;
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = 'Grid Size:';
    sizeLabel.style.cssText = labelStyle;
    const sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = 2;
    sizeInput.max = 256;
    sizeInput.value = this.canvasView.gridSize;
    sizeInput.style.cssText = inputStyle;
    sizeRow.appendChild(sizeLabel);
    sizeRow.appendChild(sizeInput);
    dlg.body.appendChild(sizeRow);

    const presetRow = document.createElement('div');
    presetRow.style.cssText = 'display:flex;gap:6px;';
    for (const s of [8, 16, 32]) {
        const btn = document.createElement('button');
        btn.textContent = `${s}\u00D7${s}`;
        btn.style.cssText = 'flex:1;padding:4px;font-size:12px;background:var(--bg-input);border:1px solid var(--border);border-radius:3px;color:var(--text);cursor:pointer;';
        btn.addEventListener('click', () => { sizeInput.value = s; });
        presetRow.appendChild(btn);
    }
    dlg.body.appendChild(presetRow);

    dlg.show(sizeInput);
}
