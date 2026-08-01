const { app, BrowserWindow } = require('electron');
const path = require('path');

try {
  require(path.join(__dirname, 'server.cjs'));
  console.log('Backend server started successfully.');
} catch (error) {
  console.error('Failed to start backend server:', error);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
