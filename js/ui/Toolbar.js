export class Toolbar {
    constructor(tools, bus, doc) {
        this.tools = tools;
        this.bus = bus;
        this.doc = doc;
        this.container = document.getElementById('toolbar-area');
        this.activeTool = null;
        this._buttons = []; // { btn, toolName, groupEl? }
        this._openFlyout = null;
        this._disabledTools = new Set();

        this._render();

        this.bus.on('switch-tool', (name) => {
            this.setActiveTool(name);
        });

        this.bus.on('layer-changed', () => this.updateEnabledState());
        this.bus.on('document-changed', () => this.updateEnabledState());
        this.bus.on('active-layer-changed', () => this.updateEnabledState());

        // Close flyout on click outside
        document.addEventListener('pointerdown', (e) => {
            if (this._openFlyout && !this._openFlyout.contains(e.target)) {
                this._closeFlyout();
            }
        });
    }

    _render() {
        const colorSelector = document.getElementById('color-selector');

        // Items: either a tool name string, or a flyout group { tools: [...], label }
        const layout = [
            'Move', 'Brush', 'Eraser', 'Fill', 'Color Picker',
            'sep',
            'Line',
            { tools: ['Rectangle', 'Filled Rect', 'Ellipse', 'Filled Ellipse'], label: 'Shapes' },
            'sep',
            { tools: ['Rect Select', 'Ellipse Select'], label: 'Select' },
            'Free Transform',
            'sep',
            'Mirror',
            'Text',
        ];

        for (const item of layout) {
            if (item === 'sep') {
                const sep = document.createElement('div');
                sep.className = 'toolbar-sep';
                this.container.insertBefore(sep, colorSelector);
                continue;
            }

            if (typeof item === 'string') {
                // Single tool button
                const tool = this.tools.find(t => t.name === item);
                if (!tool) continue;
                const btn = this._createButton(tool);
                btn.addEventListener('click', () => {
                    this._closeFlyout();
                    this.setActiveTool(tool.name);
                });
                this.container.insertBefore(btn, colorSelector);
                this._buttons.push({ btn, toolName: tool.name });
            } else {
                // Flyout group
                this._createFlyoutGroup(item, colorSelector);
            }
        }
    }

    _createButton(tool) {
        const btn = document.createElement('button');
        btn.className = 'tool-btn';
        btn.title = tool.name + (tool.shortcut ? ` (${tool.shortcut})` : '');
        btn.innerHTML = tool.icon;

        if (tool.shortcut && tool.shortcut.length === 1) {
            const hint = document.createElement('span');
            hint.className = 'shortcut-hint';
            hint.textContent = tool.shortcut;
            btn.appendChild(hint);
        }

        return btn;
    }

    _createFlyoutGroup(group, colorSelector) {
        const wrapper = document.createElement('div');
        wrapper.className = 'tool-group';

        // The main button shows the first tool (or the currently selected one from the group)
        const firstTool = this.tools.find(t => t.name === group.tools[0]);
        if (!firstTool) return;

        const mainBtn = this._createButton(firstTool);
        // Add triangle indicator
        const tri = document.createElement('span');
        tri.className = 'group-indicator';
        tri.textContent = '\u25E2'; // small triangle
        mainBtn.appendChild(tri);

        wrapper.appendChild(mainBtn);

        // Flyout panel
        const flyout = document.createElement('div');
        flyout.className = 'tool-flyout';

        for (const toolName of group.tools) {
            const tool = this.tools.find(t => t.name === toolName);
            if (!tool) continue;

            const flyBtn = this._createButton(tool);
            // Add label text for flyout items
            const label = document.createElement('span');
            label.className = 'flyout-label';
            label.textContent = tool.name;
            flyBtn.classList.add('flyout-btn');
            flyBtn.appendChild(label);

            flyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeFlyout();
                // Update the main button to show this tool's icon
                this._updateGroupButton(mainBtn, tool);
                this.setActiveTool(tool.name);
            });

            flyout.appendChild(flyBtn);
            this._buttons.push({ btn: flyBtn, toolName: tool.name, mainBtn });
        }

        wrapper.appendChild(flyout);

        mainBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (flyout === this._openFlyout) {
                this._closeFlyout();
            } else {
                this._closeFlyout();
                flyout.classList.add('open');
                this._openFlyout = flyout;
            }
            // Always activate the tool shown on the group button
            const entry = this._buttons.find(b => b.btn === mainBtn && b.isGroupMain);
            if (entry) this.setActiveTool(entry.toolName);
        });

        // Hover to switch flyout when one is already open
        wrapper.addEventListener('mouseenter', () => {
            if (this._openFlyout && this._openFlyout !== flyout) {
                this._closeFlyout();
                flyout.classList.add('open');
                this._openFlyout = flyout;
            }
        });

        this.container.insertBefore(wrapper, colorSelector);
        // Also track the main button for active highlighting
        this._buttons.push({ btn: mainBtn, toolName: firstTool.name, isGroupMain: true, groupTools: group.tools });
    }

    _updateGroupButton(mainBtn, tool) {
        // Preserve the group indicator and shortcut hint, replace icon
        const indicator = mainBtn.querySelector('.group-indicator');
        mainBtn.innerHTML = tool.icon;
        mainBtn.title = tool.name + (tool.shortcut ? ` (${tool.shortcut})` : '');
        if (tool.shortcut && tool.shortcut.length === 1) {
            const hint = document.createElement('span');
            hint.className = 'shortcut-hint';
            hint.textContent = tool.shortcut;
            mainBtn.appendChild(hint);
        }
        mainBtn.appendChild(indicator);

        // Update the main button's tracked tool name
        for (const entry of this._buttons) {
            if (entry.btn === mainBtn && entry.isGroupMain) {
                entry.toolName = tool.name;
                break;
            }
        }
    }

    _closeFlyout() {
        if (this._openFlyout) {
            this._openFlyout.classList.remove('open');
            this._openFlyout = null;
        }
    }

    updateEnabledState() {
        const layer = this.doc.getActiveLayer();
        const isText = layer && layer.type === 'text';
        const multiSelected = this.doc.selectedLayerIndices.size >= 2;

        // Text layer: only Move and Text allowed
        // Multi-selected: only Move allowed
        const alwaysEnabled = ['Move'];
        const textEnabled = ['Move', 'Text'];

        this._disabledTools.clear();
        for (const tool of this.tools) {
            let disabled = false;
            if (multiSelected) {
                disabled = !alwaysEnabled.includes(tool.name);
            } else if (isText) {
                disabled = !textEnabled.includes(tool.name);
            }
            if (disabled) this._disabledTools.add(tool.name);
        }

        for (const entry of this._buttons) {
            if (entry.isGroupMain) {
                const anyEnabled = entry.groupTools.some(n => !this._disabledTools.has(n));
                entry.btn.disabled = !anyEnabled;
            } else {
                entry.btn.disabled = this._disabledTools.has(entry.toolName);
            }
        }

        // If current tool got disabled, switch to Move
        if (this.activeTool && this._disabledTools.has(this.activeTool.name)) {
            this.setActiveTool('Move');
        }
    }

    setActiveTool(name) {
        for (const entry of this._buttons) {
            if (entry.isGroupMain) {
                const isActive = entry.groupTools.includes(name);
                entry.btn.classList.toggle('active', isActive);
                // Update group button icon to show the selected tool
                if (isActive && entry.toolName !== name) {
                    const tool = this.tools.find(t => t.name === name);
                    if (tool) this._updateGroupButton(entry.btn, tool);
                }
            } else {
                entry.btn.classList.toggle('active', entry.toolName === name);
            }
        }
        const tool = this.tools.find(t => t.name === name);
        if (tool) {
            if (this.activeTool && this.activeTool.deactivate) {
                this.activeTool.deactivate();
            }
            this.activeTool = tool;
            this.bus.emit('tool-changed', tool);
        }
    }
}
