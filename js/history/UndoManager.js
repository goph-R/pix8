export class UndoManager {
    constructor(doc, bus, maxEntries = 50) {
        this.doc = doc;
        this.bus = bus;
        this.maxEntries = maxEntries;
        this.undoStack = [];
        this.redoStack = [];
        this._snapshot = null;
        this._snapshotGeometry = null;
        this._snapshotLayer = -1;
        this._selectionSnapshot = null;
    }

    /** Call before a tool operation begins (on pointer down). */
    beginOperation() {
        const idx = this.doc.activeLayerIndex;
        const layer = this.doc.layers[idx];
        this._snapshotLayer = idx;
        this._snapshot = layer.snapshotData();
        this._snapshotGeometry = layer.snapshotGeometry();
        this._selectionSnapshot = this.doc.selection.snapshot();
    }

    /** Call after a tool operation ends (on pointer up). */
    endOperation() {
        if (this._snapshot === null) return;

        const idx = this._snapshotLayer;
        const layer = this.doc.layers[idx];
        const afterData = layer.snapshotData();
        const afterGeometry = layer.snapshotGeometry();
        const afterSelection = this.doc.selection.snapshot();

        // Check if layer changed (data or geometry)
        let layerChanged = false;
        const bg = this._snapshotGeometry;
        if (bg.width !== afterGeometry.width || bg.height !== afterGeometry.height ||
            bg.offsetX !== afterGeometry.offsetX || bg.offsetY !== afterGeometry.offsetY) {
            layerChanged = true;
        } else {
            const afterArr = afterData.data || afterData;
            const beforeArr = this._snapshot.data || this._snapshot;
            for (let i = 0; i < afterArr.length; i++) {
                if (afterArr[i] !== beforeArr[i]) {
                    layerChanged = true;
                    break;
                }
            }
        }

        // Check if selection changed
        let selectionChanged = false;
        const bs = this._selectionSnapshot;
        if (bs.active !== afterSelection.active) {
            selectionChanged = true;
        } else if (bs.active) {
            for (let i = 0; i < bs.mask.length; i++) {
                if (bs.mask[i] !== afterSelection.mask[i]) {
                    selectionChanged = true;
                    break;
                }
            }
            if (!selectionChanged) {
                const bf = bs.floating;
                const af = afterSelection.floating;
                if ((!bf) !== (!af)) {
                    selectionChanged = true;
                } else if (bf && af) {
                    if (bf.originX !== af.originX || bf.originY !== af.originY) {
                        selectionChanged = true;
                    }
                }
            }
        }

        if (layerChanged || selectionChanged) {
            this.undoStack.push({
                layerIndex: idx,
                beforeData: this._snapshot,
                afterData: afterData,
                beforeGeometry: this._snapshotGeometry,
                afterGeometry: afterGeometry,
                beforeSelection: this._selectionSnapshot,
                afterSelection: afterSelection,
            });

            if (this.undoStack.length > this.maxEntries) {
                this.undoStack.shift();
            }

            this.redoStack = [];
        }

        this._snapshot = null;
        this._snapshotGeometry = null;
        this._snapshotLayer = -1;
        this._selectionSnapshot = null;
    }

    pushEntry(entry) {
        this.undoStack.push(entry);
        if (this.undoStack.length > this.maxEntries) {
            this.undoStack.shift();
        }
        this.redoStack = [];
    }

    _restoreLayerState(entry, side) {
        this.doc.activeLayerIndex = entry[side + 'ActiveIndex'];
        this.doc.selectedLayerIndices = new Set(entry[side + 'Selected']);
        if (entry[side + 'Frames']) {
            this.doc.frames = entry[side + 'Frames'];
        }
    }

    _restoreResize(entry, key) {
        const size = entry[key + 'DocSize'];
        const layers = entry[key + 'Layers'];
        const sel = entry[key + 'Selection'];
        this.doc.width = size.width;
        this.doc.height = size.height;
        for (let i = 0; i < this.doc.layers.length; i++) {
            if (layers[i]) {
                this.doc.layers[i].restoreSnapshot(layers[i].data, layers[i].geometry);
            }
        }
        this.doc.selection.resize(size.width, size.height);
        this.doc.selection.restoreSnapshot(sel);
        document.getElementById('status-size').textContent = `${size.width} x ${size.height}`;
    }

    undo() {
        const entry = this.undoStack.pop();
        if (!entry) return;

        if (entry.type === 'palette') {
            this.doc.palette.import(entry.beforePalette);
            this.doc.layers = entry.beforeLayers;
            this.redoStack.push(entry);
            this.bus.emit('palette-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'resize') {
            this._restoreResize(entry, 'before');
            this.redoStack.push(entry);
            this.bus.emit('selection-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'merge-layers') {
            this.doc.layers = entry.beforeLayers.map(l => l.clone(true));
            this.doc.activeLayerIndex = entry.beforeActiveIndex;
            this.doc.selectedLayerIndices = new Set(entry.beforeSelected);
            if (entry.beforeFrames) {
                this.doc.frames = entry.beforeFrames.map(f => ({
                    ...f,
                    layerData: f.layerData ? f.layerData.map(ld => ({ ...ld, data: ld.data.slice() })) : null,
                }));
                this.doc.loadFrame(this.doc.activeFrameIndex);
            }
            this.redoStack.push(entry);
            this.bus.emit('frame-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-add') {
            this.doc.layers.splice(entry.insertIndex, 1);
            this._restoreLayerState(entry, 'before');
            this.redoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-delete') {
            this.doc.layers.splice(entry.removedIndex, 0, entry.layer);
            this._restoreLayerState(entry, 'before');
            this.redoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-move') {
            const [layer] = this.doc.layers.splice(entry.toIndex, 1);
            this.doc.layers.splice(entry.fromIndex, 0, layer);
            this._restoreLayerState(entry, 'before');
            this.redoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-rename') {
            this.doc.layers[entry.layerIndex].name = entry.beforeName;
            this.redoStack.push(entry);
            this.bus.emit('layer-changed');
            return;
        }

        if (entry.type === 'layer-visibility') {
            for (let i = 0; i < entry.beforeStates.length; i++) {
                this.doc.layers[i].visible = entry.beforeStates[i];
            }
            this.redoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-opacity') {
            this.doc.layers[entry.layerIndex].opacity = entry.beforeOpacity;
            this.redoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        const layer = this.doc.layers[entry.layerIndex];
        if (layer) {
            layer.restoreSnapshot(entry.beforeData, entry.beforeGeometry);
            this.doc.selection.restoreSnapshot(entry.beforeSelection);
            this.redoStack.push(entry);
            this.bus.emit('selection-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
        }
    }

    redo() {
        const entry = this.redoStack.pop();
        if (!entry) return;

        if (entry.type === 'palette') {
            this.doc.palette.import(entry.afterPalette);
            this.doc.layers = entry.afterLayers;
            this.undoStack.push(entry);
            this.bus.emit('palette-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'resize') {
            this._restoreResize(entry, 'after');
            this.undoStack.push(entry);
            this.bus.emit('selection-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'merge-layers') {
            this.doc.layers = entry.afterLayers.map(l => l.clone(true));
            this.doc.activeLayerIndex = entry.afterActiveIndex;
            this.doc.selectedLayerIndices = new Set(entry.afterSelected);
            if (entry.afterFrames) {
                this.doc.frames = entry.afterFrames.map(f => ({
                    ...f,
                    layerData: f.layerData ? f.layerData.map(ld => ({ ...ld, data: ld.data.slice() })) : null,
                }));
                this.doc.loadFrame(this.doc.activeFrameIndex);
            }
            this.undoStack.push(entry);
            this.bus.emit('frame-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-add') {
            this.doc.layers.splice(entry.insertIndex, 0, entry.layer);
            this._restoreLayerState(entry, 'after');
            this.undoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-delete') {
            this.doc.layers.splice(entry.removedIndex, 1);
            this._restoreLayerState(entry, 'after');
            this.undoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-move') {
            const [layer] = this.doc.layers.splice(entry.fromIndex, 1);
            this.doc.layers.splice(entry.toIndex, 0, layer);
            this._restoreLayerState(entry, 'after');
            this.undoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-rename') {
            this.doc.layers[entry.layerIndex].name = entry.afterName;
            this.undoStack.push(entry);
            this.bus.emit('layer-changed');
            return;
        }

        if (entry.type === 'layer-visibility') {
            for (let i = 0; i < entry.afterStates.length; i++) {
                this.doc.layers[i].visible = entry.afterStates[i];
            }
            this.undoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        if (entry.type === 'layer-opacity') {
            this.doc.layers[entry.layerIndex].opacity = entry.afterOpacity;
            this.undoStack.push(entry);
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
            return;
        }

        const layer = this.doc.layers[entry.layerIndex];
        if (layer) {
            layer.restoreSnapshot(entry.afterData, entry.afterGeometry);
            this.doc.selection.restoreSnapshot(entry.afterSelection);
            this.undoStack.push(entry);
            this.bus.emit('selection-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
        }
    }
}
