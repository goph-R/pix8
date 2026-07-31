/**
 * Lightweight dialog helper. Creates the overlay, header (title + close button),
 * body container, and footer with buttons. Handles Escape/Enter keys and
 * safe overlay-click-to-close (requires mousedown + click both on overlay).
 *
 * Usage:
 *   const dlg = Dialog.create({
 *       title: 'My Dialog',
 *       width: '300px',           // optional, CSS value
 *       buttons: [
 *           { label: 'Cancel' },
 *           { label: 'OK', primary: true, onClick: () => { ... } },
 *       ],
 *       onClose: () => { ... },   // optional, called on any close
 *       enterButton: 1,           // optional, index into buttons[] for Enter key
 *   });
 *   dlg.body.appendChild(myContent);
 *   dlg.show();
 *   // later: dlg.close();
 */
export default class Dialog {
    static create(opts = {}) {
        return new Dialog(opts);
    }

    constructor(opts) {
        this._onClose = opts.onClose || null;
        this._closed = false;

        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'palette-dialog-overlay';

        // Dialog container
        this.dialog = document.createElement('div');
        this.dialog.className = 'palette-dialog';
        if (opts.width) {
            this.dialog.style.width = opts.width;
            this.dialog.style.maxWidth = '90vw';
        }

        // Header
        const header = document.createElement('div');
        header.className = 'palette-dialog-header';
        header.innerHTML = `<span>${opts.title || ''}</span>`;
        const closeBtn = document.createElement('button');
        closeBtn.className = 'palette-dialog-close';
        closeBtn.textContent = '\u00D7';
        closeBtn.addEventListener('click', () => this.close());
        header.appendChild(closeBtn);
        this.dialog.appendChild(header);

        // Body
        this.body = document.createElement('div');
        this.dialog.appendChild(this.body);

        // Footer (only if buttons provided)
        this._buttons = [];
        this._primaryIdx = -1;
        if (opts.buttons && opts.buttons.length) {
            const footer = document.createElement('div');
            footer.className = 'palette-dialog-footer';
            footer.style.justifyContent = 'flex-end';
            footer.style.gap = '8px';

            for (const btnOpt of opts.buttons) {
                const btn = document.createElement('button');
                btn.textContent = btnOpt.label;
                if (btnOpt.primary) {
                    btn.className = 'primary';
                    if (this._primaryIdx < 0) this._primaryIdx = this._buttons.length;
                }
                btn.addEventListener('click', () => {
                    if (btnOpt.onClick) {
                        btnOpt.onClick(this);
                    } else {
                        this.close();
                    }
                });
                footer.appendChild(btn);
                this._buttons.push(btn);
            }
            this.dialog.appendChild(footer);
        }

        this.overlay.appendChild(this.dialog);

        // Keyboard: Escape always cancels; Enter triggers OK. The OK button is
        // opts.enterButton if given, otherwise the primary button.
        const enterIdx = opts.enterButton !== undefined ? opts.enterButton : this._primaryIdx;
        this._onKey = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            } else if (e.key === 'Enter' && enterIdx >= 0 && this._buttons[enterIdx]) {
                // Don't trigger button when typing in a textarea (Enter = newline)
                if (e.target.tagName === 'TEXTAREA') return;
                e.preventDefault();
                this._buttons[enterIdx].click();
            }
            e.stopPropagation();
        };

        // Make the dialog focusable so Enter/Escape are caught even when no
        // field inside it holds focus.
        this.dialog.tabIndex = -1;

        // Overlay click-to-close (mousedown + click must both be on overlay)
        let mouseDownOnOverlay = false;
        this.overlay.addEventListener('mousedown', (e) => {
            mouseDownOnOverlay = e.target === this.overlay;
        });
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay && mouseDownOnOverlay) this.close();
            mouseDownOnOverlay = false;
        });
    }

    show(focusEl) {
        document.body.appendChild(this.overlay);
        this.dialog.addEventListener('keydown', this._onKey);
        if (focusEl) {
            focusEl.focus();
            if (focusEl.select) focusEl.select();
        } else {
            // Focus the dialog itself so keyboard events reach _onKey.
            this.dialog.focus();
        }
        return this;
    }

    close() {
        if (this._closed) return;
        this._closed = true;
        this.dialog.removeEventListener('keydown', this._onKey);
        // Removing a subtree that still holds focus can leave Chromium's focus
        // state wedged: later inputs report as activeElement but show no caret
        // and drop typed characters (backspace still works). Blur first so
        // focus unwinds to <body> cleanly before the node goes away.
        const active = document.activeElement;
        if (active && active.blur && this.overlay.contains(active)) active.blur();
        this.overlay.remove();
        if (this._onClose) this._onClose();
    }

    /** Get a button element by index. */
    getButton(index) {
        return this._buttons[index] || null;
    }
}
