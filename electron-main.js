const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 600,
        minHeight: 400,
        title: 'Pix8',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'electron-preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        backgroundColor: '#1e1e1e',
    });

    mainWindow.loadFile('index.html');

    // Remove default menu bar (app has its own menus)
    Menu.setApplicationMenu(null);

    // DEVTOOLS=1 npm run electron — opens DevTools, F12 to toggle
    if (process.env.DEVTOOLS) {
        mainWindow.webContents.openDevTools();
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'F12') {
                mainWindow.webContents.toggleDevTools();
            }
        });
    }

    mainWindow.on('close', (e) => {
        const choice = dialog.showMessageBoxSync(mainWindow, {
            type: 'question',
            buttons: ['Quit', 'Cancel'],
            defaultId: 1,
            title: 'Quit Pix8?',
            message: 'Unsaved changes will be lost.',
        });
        if (choice === 1) e.preventDefault();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) createWindow();
});

// After a native modal dialog closes, Windows doesn't reliably hand keyboard
// focus back to the page. The renderer still reports the right activeElement,
// so inline inputs (tab/layer rename) look focused but show no caret and drop
// typed characters. Explicitly refocusing the web contents restores input.
function restoreFocus() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.focus();
    }
}

// IPC handlers for native file dialogs
ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    restoreFocus();
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    const copy = new Uint8Array(data).buffer;
    return { filePath, fileName: path.basename(filePath), data: copy };
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
    restoreFocus();
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
});

ipcMain.handle('save-file', async (event, filePath, data) => {
    fs.writeFileSync(filePath, Buffer.from(data));
    return true;
});

ipcMain.handle('read-file', async (event, filePath) => {
    const data = fs.readFileSync(filePath);
    return data.buffer;
});
