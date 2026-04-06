import { Renderer } from '../render/Renderer.js';

export class FramePanel {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;
        this.panel = document.getElementById('frame-panel');
        this._list = null;
        this._playing = false;
        this._playMode = null; // 'all' or 'tag'
        this._playFrameIndices = null; // indices to loop through
        this._playTimer = null;

        this._buildUI();

        this.bus.on('layer-changed', () => this._updateCurrentThumb());
        this.bus.on('document-changed', () => this._updateCurrentThumb());
        this.bus.on('frame-changed', () => this.render());
        this.bus.on('animation-changed', () => this.render());
    }

    _buildUI() {
        // Header
        const header = document.createElement('div');
        header.className = 'frame-panel-header';

        const btn = (iconSrc, title, action) => {
            const b = document.createElement('button');
            b.className = 'icon-btn';
            const img = document.createElement('img');
            img.src = iconSrc;
            img.className = 'panel-icon';
            img.draggable = false;
            b.appendChild(img);
            b.title = title;
            b.addEventListener('click', action);
            header.appendChild(b);
            return b;
        };

        btn('images/icon-add.svg', 'Add frame', () => {
            this.doc.addFrame();
            this.bus.emit('frame-changed');
            this.bus.emit('animation-changed');
        });
        btn('images/icon-delete.svg', 'Delete frame', () => {
            if (this.doc.frames.length <= 1) return;
            if (!confirm('Delete this frame?')) return;
            this.doc.deleteFrame(this.doc.activeFrameIndex);
            this.bus.emit('frame-changed');
            this.bus.emit('animation-changed');
            this.bus.emit('layer-changed');
        });
        btn('images/icon-move-left.svg', 'Move left', () => {
            this.doc.saveCurrentFrame();
            if (this.doc.moveFrame(this.doc.activeFrameIndex, -1)) {
                this.bus.emit('frame-changed');
                this.bus.emit('animation-changed');
            }
        });
        btn('images/icon-move-right.svg', 'Move right', () => {
            this.doc.saveCurrentFrame();
            if (this.doc.moveFrame(this.doc.activeFrameIndex, 1)) {
                this.bus.emit('frame-changed');
                this.bus.emit('animation-changed');
            }
        });

        const sep = document.createElement('span');
        sep.style.cssText = 'width:1px;height:16px;background:var(--border);margin:0 4px;';
        header.appendChild(sep);

        this._playBtn = btn('images/icon-play.svg', 'Play all', () => this._play());
        this._playTagBtn = btn('images/icon-play-tag.svg', 'Play tag', () => this._playTag());
        this._pauseBtn = btn('images/icon-pause.svg', 'Pause', () => this._pause());
        this._stopBtn = btn('images/icon-stop.svg', 'Stop', () => this._stop());

        const sep2 = document.createElement('span');
        sep2.style.cssText = 'width:1px;height:16px;background:var(--border);margin:0 4px;';
        header.appendChild(sep2);

        // Onion skinning checkbox
        const onionLabel = document.createElement('label');
        onionLabel.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:11px;color:var(--text-dim);cursor:pointer;user-select:none;';
        this._onionCheckbox = document.createElement('input');
        this._onionCheckbox.type = 'checkbox';
        this._onionCheckbox.checked = this.doc.onionSkinning;
        this._onionCheckbox.addEventListener('change', () => {
            this.doc.onionSkinning = this._onionCheckbox.checked;
            this.bus.emit('document-changed');
        });
        onionLabel.appendChild(this._onionCheckbox);
        onionLabel.appendChild(document.createTextNode('Onion'));
        header.appendChild(onionLabel);

        // Onion opacity input
        this._onionOpacityInput = document.createElement('input');
        this._onionOpacityInput.type = 'number';
        this._onionOpacityInput.min = 1;
        this._onionOpacityInput.max = 100;
        this._onionOpacityInput.value = this.doc.onionOpacity ?? 50;
        this._onionOpacityInput.style.cssText = 'width:38px;padding:1px 3px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);border-radius:3px;font-size:11px;text-align:center;';
        this._onionOpacityInput.addEventListener('change', () => {
            this.doc.onionOpacity = Math.max(1, Math.min(100, parseInt(this._onionOpacityInput.value) || 50));
            this._onionOpacityInput.value = this.doc.onionOpacity;
            this.bus.emit('document-changed');
        });
        const pctLabel = document.createElement('span');
        pctLabel.textContent = '%';
        pctLabel.style.cssText = 'font-size:11px;color:var(--text-dim);';
        header.appendChild(this._onionOpacityInput);
        header.appendChild(pctLabel);

        // Onion extended checkbox (+/- 2 frames)
        const extLabel = document.createElement('label');
        extLabel.style.cssText = 'display:flex;align-items:center;gap:3px;font-size:11px;color:var(--text-dim);cursor:pointer;user-select:none;margin-left:2px;';
        this._onionExtCheckbox = document.createElement('input');
        this._onionExtCheckbox.type = 'checkbox';
        this._onionExtCheckbox.checked = this.doc.onionExtended;
        this._onionExtCheckbox.addEventListener('change', () => {
            this.doc.onionExtended = this._onionExtCheckbox.checked;
            this.bus.emit('document-changed');
        });
        extLabel.appendChild(this._onionExtCheckbox);
        extLabel.appendChild(document.createTextNode('\u00B12'));
        header.appendChild(extLabel);

        this.panel.appendChild(header);

        // Frame list
        this._list = document.createElement('div');
        this._list.className = 'frame-list';
        this.panel.appendChild(this._list);
    }

    show() {
        this.panel.classList.add('visible');
        this._onionCheckbox.checked = this.doc.onionSkinning;
        this._onionOpacityInput.value = this.doc.onionOpacity ?? 50;
        this._onionExtCheckbox.checked = this.doc.onionExtended;
        this.render();
    }

    hide() {
        this._stop();
        this.panel.classList.remove('visible');
    }

    render() {
        this._list.innerHTML = '';
        const frames = this.doc.frames;
        const activeIdx = this.doc.activeFrameIndex;

        // Determine which tag group the active frame belongs to
        let activeTag = null;
        for (let j = activeIdx; j >= 0; j--) {
            if (frames[j].tag) { activeTag = frames[j].tag; break; }
        }

        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];

            const thumb = document.createElement('div');
            thumb.className = 'frame-thumb' + (i === activeIdx ? ' active' : '');

            // Tag label above the frame (only on tag-start frames)
            if (frame.tag) {
                const tagLabel = document.createElement('div');
                tagLabel.className = 'frame-tag-label';
                tagLabel.textContent = frame.tag;
                // Active tag group gets higher z-index
                if (frame.tag === activeTag) {
                    tagLabel.classList.add('active-tag');
                }
                thumb.appendChild(tagLabel);
            }

            // Preview canvas
            const canvas = document.createElement('canvas');
            const scale = Math.min(48 / this.doc.width, 36 / this.doc.height);
            canvas.width = Math.round(this.doc.width * scale);
            canvas.height = Math.round(this.doc.height * scale);
            canvas.style.cssText = `image-rendering:pixelated;`;
            this._renderThumb(canvas, frame, i);
            thumb.appendChild(canvas);

            // Label — always show frame number
            const label = document.createElement('div');
            label.className = 'frame-label';
            label.textContent = `${i + 1}`;
            thumb.appendChild(label);

            // Click to switch frame
            thumb.addEventListener('click', () => {
                if (this._playing) return;
                this._switchFrame(i);
            });

            // Double-click to edit tag/delay
            thumb.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                if (this._playing) return;
                this._editFrame(i, frame);
            });

            this._list.appendChild(thumb);
        }
    }

    _renderThumb(canvas, frame, frameIndex) {
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // Temporarily load frame data to render it
        const doc = this.doc;
        const isActive = frameIndex === doc.activeFrameIndex;

        // For active frame, render current state; for others, temporarily swap
        if (!isActive && frame.layerData) {
            // Save current layer state
            const saved = doc.layers.map(l => ({
                data: l.data, opacity: l.opacity, textData: l.textData,
                offsetX: l.offsetX, offsetY: l.offsetY,
                width: l.width, height: l.height,
            }));
            // Load frame data
            doc._restoreLayersFromFrame(frame);
            // Render
            const renderer = new Renderer(doc);
            const imageData = renderer.composite();
            const tmp = document.createElement('canvas');
            tmp.width = doc.width;
            tmp.height = doc.height;
            tmp.getContext('2d').putImageData(imageData, 0, 0);
            ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
            // Restore
            for (let i = 0; i < doc.layers.length && i < saved.length; i++) {
                const s = saved[i];
                doc.layers[i].data = s.data;
                doc.layers[i].opacity = s.opacity;
                doc.layers[i].textData = s.textData;
                doc.layers[i].offsetX = s.offsetX;
                doc.layers[i].offsetY = s.offsetY;
                doc.layers[i].width = s.width;
                doc.layers[i].height = s.height;
            }
        } else {
            const renderer = new Renderer(doc);
            const imageData = renderer.composite();
            const tmp = document.createElement('canvas');
            tmp.width = doc.width;
            tmp.height = doc.height;
            tmp.getContext('2d').putImageData(imageData, 0, 0);
            ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
        }
    }

    _updateCurrentThumb() {
        if (!this.doc.animationEnabled || !this.panel.classList.contains('visible')) return;
        // Re-render just the active frame's thumbnail
        const thumbs = this._list.querySelectorAll('.frame-thumb');
        const idx = this.doc.activeFrameIndex;
        if (thumbs[idx]) {
            const canvas = thumbs[idx].querySelector('canvas');
            if (canvas) {
                this._renderThumb(canvas, this.doc.frames[idx], idx);
            }
        }
    }

    _switchFrame(index) {
        if (index === this.doc.activeFrameIndex) return;
        this.doc.saveCurrentFrame();
        this.doc.loadFrame(index);
        this.bus.emit('frame-changed');
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
    }

    _editFrame(index, frame) {
        // Create modal dialog for frame properties
        const overlay = document.createElement('div');
        overlay.className = 'palette-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'palette-dialog';
        dialog.style.cssText = 'width:260px;max-width:90vw;';

        // Header
        const header = document.createElement('div');
        header.className = 'palette-dialog-header';
        header.innerHTML = `<span>Frame ${index + 1} Properties</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'palette-dialog-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', close);
        header.appendChild(closeBtn);
        dialog.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px 0;';

        // Tag input
        const tagRow = document.createElement('div');
        tagRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const tagLabel = document.createElement('label');
        tagLabel.textContent = 'Tag:';
        tagLabel.style.cssText = 'font-size:13px;color:var(--text);width:50px;';
        const tagInput = document.createElement('input');
        tagInput.type = 'text';
        tagInput.value = frame.tag || '';
        tagInput.placeholder = 'e.g. idle, run';
        tagInput.style.cssText = 'flex:1;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);border-radius:3px;font-size:13px;';
        tagRow.appendChild(tagLabel);
        tagRow.appendChild(tagInput);
        body.appendChild(tagRow);

        // Delay input
        const delayRow = document.createElement('div');
        delayRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
        const delayLabel = document.createElement('label');
        delayLabel.textContent = 'Delay:';
        delayLabel.style.cssText = 'font-size:13px;color:var(--text);width:50px;';
        const delayInput = document.createElement('input');
        delayInput.type = 'number';
        delayInput.value = frame.delay || 100;
        delayInput.min = 1;
        delayInput.max = 10000;
        delayInput.style.cssText = 'width:80px;padding:3px 6px;background:var(--bg-input);border:1px solid var(--border);color:var(--text);border-radius:3px;font-size:13px;';
        const delayUnit = document.createElement('span');
        delayUnit.textContent = 'ms';
        delayUnit.style.cssText = 'font-size:12px;color:var(--text-dim);';
        delayRow.appendChild(delayLabel);
        delayRow.appendChild(delayInput);
        delayRow.appendChild(delayUnit);
        body.appendChild(delayRow);

        dialog.appendChild(body);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'palette-dialog-footer';
        footer.style.justifyContent = 'flex-end';
        footer.style.gap = '8px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', close);

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
        okBtn.className = 'primary';
        okBtn.addEventListener('click', () => {
            frame.tag = tagInput.value.trim();
            frame.delay = Math.max(1, parseInt(delayInput.value) || 100);
            this.render();
            close();
        });

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        dialog.appendChild(footer);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Focus tag input
        tagInput.focus();
        tagInput.select();

        // Keyboard handling
        const onKey = (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter' && e.target !== tagInput) okBtn.click();
        };
        dialog.addEventListener('keydown', onKey);

        // Click overlay to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        function close() {
            overlay.remove();
        }
    }

    _getTagFrameIndices() {
        // A tag marks the start of a group. The group extends until the next
        // tagged frame (or end of frames). Find which group the active frame
        // belongs to and return all indices in that group.
        const frames = this.doc.frames;
        const idx = this.doc.activeFrameIndex;

        // Walk backwards to find the group's start (a frame with a non-empty tag)
        let start = idx;
        while (start > 0 && !frames[start].tag) start--;
        // If the start frame has no tag either, there's no tag group here
        if (!frames[start].tag) return null;

        // Walk forwards from start to find the end (next tagged frame or end)
        let end = start + 1;
        while (end < frames.length && !frames[end].tag) end++;
        // end is now exclusive

        if (end - start < 2) return null; // single frame, nothing to animate
        const indices = [];
        for (let i = start; i < end; i++) indices.push(i);
        return indices;
    }

    _setPlayingState(playing) {
        this._playing = playing;
        this._playBtn.disabled = playing;
        this._playTagBtn.disabled = playing;
    }

    _play() {
        if (this._playing || this.doc.frames.length <= 1) return;
        this._playMode = 'all';
        const indices = [];
        for (let i = 0; i < this.doc.frames.length; i++) indices.push(i);
        this._playFrameIndices = indices;
        this._setPlayingState(true);
        this._tick();
    }

    _playTag() {
        if (this._playing) return;
        const indices = this._getTagFrameIndices();
        if (!indices) return; // not in a tag group or only 1 frame
        this._playMode = 'tag';
        this._playFrameIndices = indices;
        this._setPlayingState(true);
        this._tick();
    }

    _tick() {
        if (!this._playing) return;
        this.doc.saveCurrentFrame();
        const indices = this._playFrameIndices;
        const curPos = indices.indexOf(this.doc.activeFrameIndex);
        const nextPos = (curPos + 1) % indices.length;
        const nextIdx = indices[nextPos];
        this.doc.loadFrame(nextIdx);
        this.bus.emit('frame-changed');
        this.bus.emit('layer-changed');
        this.bus.emit('document-changed');
        const delay = this.doc.frames[nextIdx].delay || 100;
        this._playTimer = setTimeout(() => this._tick(), delay);
    }

    _pause() {
        // Pause: stop playback but stay on current frame
        if (!this._playing) return;
        this._playing = false;
        this._playMode = null;
        this._playFrameIndices = null;
        this._setPlayingState(false);
        if (this._playTimer) {
            clearTimeout(this._playTimer);
            this._playTimer = null;
        }
    }

    _stop() {
        // Stop: stop playback and jump to beginning
        if (!this._playing) return;
        const mode = this._playMode;
        const indices = this._playFrameIndices;
        this._playing = false;
        this._setPlayingState(false);
        if (this._playTimer) {
            clearTimeout(this._playTimer);
            this._playTimer = null;
        }
        // Jump to first frame of the played range
        const targetIdx = (mode === 'tag' && indices && indices.length > 0) ? indices[0] : 0;
        if (targetIdx !== this.doc.activeFrameIndex) {
            this.doc.saveCurrentFrame();
            this.doc.loadFrame(targetIdx);
            this.bus.emit('frame-changed');
            this.bus.emit('layer-changed');
            this.bus.emit('document-changed');
        }
        this._playMode = null;
        this._playFrameIndices = null;
    }
}
