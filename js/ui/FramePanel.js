import { Renderer } from '../render/Renderer.js';

export class FramePanel {
    constructor(doc, bus) {
        this.doc = doc;
        this.bus = bus;
        this.panel = document.getElementById('frame-panel');
        this._list = null;
        this._playing = false;
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

        const btn = (label, title, action) => {
            const b = document.createElement('button');
            b.className = 'icon-btn';
            b.textContent = label;
            b.title = title;
            b.addEventListener('click', action);
            header.appendChild(b);
            return b;
        };

        btn('+', 'Add frame', () => {
            this.doc.addFrame();
            this.bus.emit('frame-changed');
            this.bus.emit('animation-changed');
        });
        btn('\u2212', 'Delete frame', () => {
            if (this.doc.frames.length <= 1) return;
            if (!confirm('Delete this frame?')) return;
            this.doc.deleteFrame(this.doc.activeFrameIndex);
            this.bus.emit('frame-changed');
            this.bus.emit('animation-changed');
            this.bus.emit('layer-changed');
        });
        btn('\u2750', 'Copy frame', () => {
            this.doc.addFrame(); // addFrame already copies current
            this.bus.emit('frame-changed');
            this.bus.emit('animation-changed');
        });
        btn('\u2190', 'Move left', () => {
            this.doc.saveCurrentFrame();
            if (this.doc.moveFrame(this.doc.activeFrameIndex, -1)) {
                this.bus.emit('frame-changed');
                this.bus.emit('animation-changed');
            }
        });
        btn('\u2192', 'Move right', () => {
            this.doc.saveCurrentFrame();
            if (this.doc.moveFrame(this.doc.activeFrameIndex, 1)) {
                this.bus.emit('frame-changed');
                this.bus.emit('animation-changed');
            }
        });

        const sep = document.createElement('span');
        sep.style.cssText = 'width:1px;height:16px;background:var(--border);margin:0 4px;';
        header.appendChild(sep);

        this._playBtn = btn('\u25B6', 'Play', () => this._play());
        this._stopBtn = btn('\u25A0', 'Stop', () => this._stop());

        this.panel.appendChild(header);

        // Frame list
        this._list = document.createElement('div');
        this._list.className = 'frame-list';
        this.panel.appendChild(this._list);
    }

    show() {
        this.panel.classList.add('visible');
        this.render();
    }

    hide() {
        this._stop();
        this.panel.classList.remove('visible');
    }

    render() {
        this._list.innerHTML = '';
        const frames = this.doc.frames;
        for (let i = 0; i < frames.length; i++) {
            const frame = frames[i];
            const thumb = document.createElement('div');
            thumb.className = 'frame-thumb' + (i === this.doc.activeFrameIndex ? ' active' : '');

            // Preview canvas
            const canvas = document.createElement('canvas');
            const scale = Math.min(48 / this.doc.width, 36 / this.doc.height);
            canvas.width = Math.round(this.doc.width * scale);
            canvas.height = Math.round(this.doc.height * scale);
            canvas.style.cssText = `image-rendering:pixelated;`;
            this._renderThumb(canvas, frame, i);
            thumb.appendChild(canvas);

            // Label
            const label = document.createElement('div');
            label.className = 'frame-label';
            label.textContent = frame.tag || `${i + 1}`;
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
        const tag = prompt('Frame tag (empty for none):', frame.tag || '');
        if (tag === null) return;
        frame.tag = tag.trim();
        const delay = prompt('Frame delay (ms):', frame.delay);
        if (delay !== null) {
            frame.delay = Math.max(1, parseInt(delay) || 100);
        }
        this.render();
    }

    _play() {
        if (this._playing || this.doc.frames.length <= 1) return;
        this._playing = true;
        this._playBtn.disabled = true;
        const tick = () => {
            if (!this._playing) return;
            this.doc.saveCurrentFrame();
            const nextIdx = (this.doc.activeFrameIndex + 1) % this.doc.frames.length;
            this.doc.loadFrame(nextIdx);
            this.bus.emit('frame-changed');
            this.bus.emit('layer-changed');
            const delay = this.doc.frames[nextIdx].delay || 100;
            this._playTimer = setTimeout(tick, delay);
        };
        tick();
    }

    _stop() {
        if (!this._playing) return;
        this._playing = false;
        this._playBtn.disabled = false;
        if (this._playTimer) {
            clearTimeout(this._playTimer);
            this._playTimer = null;
        }
    }
}
