'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('path');

const PAGE_TITLES = {
  home: '首页',
  editor: 'Markdown编辑器',
  wechat: 'Markdown转公众号',
};

let mainWindow = null;

function sendToShell(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, ...args);
}

function navigate(page) {
  sendToShell('navigate-page', page);
}

function reloadContent(force = false) {
  sendToShell('reload-content', force);
}

function buildMenu() {
  const template = [
    {
      label: 'Markdown 工具集',
      submenu: [
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于 Markdown 工具集',
              message: 'Markdown 工具集',
              detail:
                '桌面端壳：直接加载线上页面\n' +
                'https://www.zybkpro.top/markdown/\n' +
                'https://www.zybkpro.top/mdEditor/\n' +
                'https://www.zybkpro.top/WeChatFormatter/\n\n' +
                '线上内容更新后，刷新即可，无需重新打包。',
            });
          },
        },
        { type: 'separator' },
        { role: process.platform === 'darwin' ? 'close' : 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '首页', accelerator: 'CmdOrCtrl+1', click: () => navigate('home') },
        {
          label: 'Markdown编辑器',
          accelerator: 'CmdOrCtrl+2',
          click: () => navigate('editor'),
        },
        {
          label: 'Markdown转公众号',
          accelerator: 'CmdOrCtrl+3',
          click: () => navigate('wechat'),
        },
        { type: 'separator' },
        { label: '刷新', accelerator: 'CmdOrCtrl+R', click: () => reloadContent(false) },
        {
          label: '强制刷新',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => reloadContent(true),
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: PAGE_TITLES.home,
    show: true,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'shell.html'));

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function bootstrap() {
  ipcMain.on('page-changed', (_event, page) => {
    if (mainWindow && PAGE_TITLES[page]) {
      mainWindow.setTitle(PAGE_TITLES[page]);
    }
  });

  buildMenu();
  createWindow();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    dialog.showErrorBox('启动失败', err.stack || String(err));
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
