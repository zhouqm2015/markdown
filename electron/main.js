'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const PAGE_TITLES = {
  home: '首页',
  editor: 'Markdown编辑器',
  wechat: 'Markdown转公众号',
};

let mainWindow = null;

function getContentRoot() {
  return app.isPackaged
    ? path.join(__dirname, 'content')
    : path.join(__dirname, '..');
}

function getPageUrls() {
  const root = getContentRoot();
  return {
    home: pathToFileURL(path.join(root, 'index', 'index.html')).href,
    editor: pathToFileURL(path.join(root, 'mdEditor', 'index.html')).href,
    wechat: pathToFileURL(path.join(root, 'WeChatFormatter', 'index.html')).href,
  };
}

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
  const pages = getPageUrls();
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
                '桌面端：加载本地项目页面\n' +
                `首页：${pages.home}\n` +
                `编辑器：${pages.editor}\n` +
                `公众号排版：${pages.wechat}`,
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
  const pages = getPageUrls();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: PAGE_TITLES.home,
    show: false,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, 'shell.html'), {
    query: { pages: JSON.stringify(pages) },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function bootstrap() {
  ipcMain.handle('get-pages', () => getPageUrls());
  ipcMain.handle('open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      return shell.openExternal(url);
    }
  });

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

  app.whenReady().then(() => {
    bootstrap();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((err) => {
    dialog.showErrorBox('启动失败', err.stack || String(err));
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
