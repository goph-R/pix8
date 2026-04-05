const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
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

// IPC handlers for native file dialogs
ipcMain.handle('show-open-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const data = fs.readFileSync(filePath);
    return { filePath, fileName: path.basename(filePath), data: data.buffer };
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    const result = await dialog.showSaveDialog(mainWindow, options);
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
