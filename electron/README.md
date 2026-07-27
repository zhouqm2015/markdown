# Markdown 工具集 · 桌面端

Electron 壳应用，三个页面直接加载仓库本地目录（开发与打包均不依赖线上地址）：

| 菜单 | 本地路径 |
|------|----------|
| 官网首页 | `../index/index.html` |
| Markdown 编辑器 | `../mdEditor/index.html` |
| 公众号排版 | `../WeChatFormatter/index.html` |

打包后上述目录会打进应用内的 `content/`。

## 开发启动

```bash
cd markdown/electron
npm install
# 若环境中有 ELECTRON_RUN_AS_NODE，需先取消：
unset ELECTRON_RUN_AS_NODE
npm start
```

## 打包

```bash
npm run dist        # 当前平台安装包 → electron/dist/
npm run pack        # 仅生成未打包目录
npm run dist:mac
npm run dist:win
npm run dist:linux
```

应用图标位于 `build/icon.icns` / `build/icon.png`。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + 1` | 官网首页 |
| `Cmd/Ctrl + 2` | Markdown 编辑器 |
| `Cmd/Ctrl + 3` | 公众号排版 |

## 说明

- 离线可用，页面资源来自本地项目目录。
- 同项目内的本地链接在应用内打开，其它 http(s) 外链走系统浏览器。
- 各页面的草稿 / API Key 仍保存在页面 localStorage（按 `file://` 源隔离）。
