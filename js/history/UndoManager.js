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
