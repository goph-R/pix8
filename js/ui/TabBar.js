export class TabBar {
    constructor(bus) {
        this.bus = bus;
        this.container = document.getElementById('tab-bar');
    }

    render(tabs, activeTabId) {
        this.container.innerHTML = '';
        for (const tab of tabs) {
            const el = document.createElement('div');
            el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');

            const name = document.createElement('span');
            name.className = 'tab-name';
            name.textContent = tab.name;
            el.appendChild(name);

            const close = document.createElement('span');
            close.className = 'tab-close';
            close.textContent = '\u00D7';
            close.addEventListener('click', (e) => {
                e.stopPropagation();
                this.bus.emit('tab-close', tab.id);
            });
            el.appendChild(close);

            el.addEventListener('click', () => {
                this.bus.emit('tab-switch', tab.id);
            });

            this.container.appendChild(el);
        }
    }
}
