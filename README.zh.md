<div align="center">

# Markdown 工具集

浏览器里即开即用的 Markdown 写作与公众号排版工具。<br>
**无安装、无账号、无订阅，你的文字只属于你。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![纯前端](https://img.shields.io/badge/Architecture-Pure%20Frontend-success)](./mdEditor/index.html)
[![多语言](https://img.shields.io/badge/I18N-10%20Languages-orange)](./mdEditor/i18n.js)

<p align="center">
  <a href="./README.md" style="display:inline-block;padding:6px 18px;background:#f3f4f6;color:#4b5563;border-radius:6px 0 0 6px;text-decoration:none;font-weight:600;">English</a>  |  <a href="./README.zh.md" style="display:inline-block;padding:6px 18px;background:#4f46e5;color:#fff;border-radius:0 6px 6px 0;text-decoration:none;font-weight:600;">简体中文</a>
</p>

</div>

本仓库包含两个可独立部署的纯前端项目：

| 项目 | 目录 | 用途 |
|------|------|------|
| **mdEditor** | [`mdEditor/`](./mdEditor/) | 通用 Markdown 编辑器：实时预览、多格式导出、多语言 |
| **WeChatFormatter** | [`WeChatFormatter/`](./WeChatFormatter/) | 微信公众号排版：一键生成可粘贴后台的内联样式 HTML |

> 如果你也相信：AI 时代，Markdown 就是第一语言。欢迎你来用、来改、来 Star。

---

## 在线体验

- **mdEditor**：https://www.zybkpro.top/mdEditor/
- **WeChatFormatter**：https://www.zybkpro.top/WeChatFormatter/

## 快速开始

```bash
npm start
```

然后打开：

- 官网：http://localhost:3000/index/
- 编辑器：http://localhost:3000/mdEditor/
- 公众号排版：http://localhost:3000/WeChatFormatter/

也可直接双击打开：

- `mdEditor/index.html`
- `WeChatFormatter/index.html`

桌面端（Electron）：

```bash
npm run start:desktop
# 或
cd electron && npm start
```

打包安装包：`npm run dist:desktop`（产物在 `electron/dist/`）。

打包部署（编辑器）：

```bash
npm run build    # 产物在 mdEditor/dist/
npm run deploy   # 可选，部署到服务器 /usr/share/nginx/html/mdEditor
```

两个项目互不依赖，可分别上传对应目录（或各自的 `dist/`）到静态托管。

---

## 项目一：mdEditor（Markdown 编辑器）

一款在浏览器里「即开即用」的 Markdown 写作工具。打开即可写，内容保存在本地，断网也能继续。适合日常写作、笔记，以及配合 Codex、Claude Code、Openclaw 等 Agent 使用。

### 功能特性

- **即开即用**：打开 `mdEditor/index.html` 即可；依赖已 vendor 到 `mdEditor/public/vendor/`，可离线使用。
- **实时预览**：左写右看；支持「编辑 + 预览 / 仅编辑 / 仅预览」，可拖拽分栏。
- **源码模式**：右侧可直接改 Markdown 源码。
- **拖拽导入**：把 `.md` / `.txt` 或图片拖进窗口即可。
- **本地自动保存**：约每 500ms 写入浏览器存储；文件名、分栏、主题、语言等一并记忆。
- **深色 / 浅色主题**：一键切换，偏好自动保存。
- **10 种语言**：简体中文、繁体中文、English、日本語、한국어、Español、Français、Deutsch、Русский、Português。

### 编辑工具

| 功能 | 说明 |
|------|------|
| 标题 | H1–H6 快速插入 |
| 文本样式 | 加粗、斜体、下划线、删除线、上标、下标 |
| 列表 | 无序、有序、任务列表 |
| 引用与代码 | 引用块、行内代码、代码块 |
| 链接与图片 | URL 插入；本地图片 Base64 嵌入 |
| 表格 | 可视化 8×8 表格选择器 |
| 查找替换 | 查找下一个、替换、全部替换 |
| 公式 / 图表 | KaTeX（`$...$` / `$$...$$`）、Mermaid |

### 多格式导出

| 格式 | 说明 |
|------|------|
| `.md` | 原始 Markdown |
| `.html` | 独立 HTML，可直接打开 |
| `.doc` | Word 文档 |
| `.pdf` | 浏览器打印为 PDF |
| `.png` | 长图导出（多种比例，适合分享） |

### 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + S` | 保存 |
| `Ctrl + Z` / `Ctrl + Y` | 撤销 / 重做 |
| `Ctrl + B` / `I` / `U` | 加粗 / 斜体 / 下划线 |
| `Ctrl + K` | 插入链接 |
| `Ctrl + Shift + K` | 插入图片 |
| `Ctrl + F` | 查找替换 |
| `Tab` | 插入 4 空格缩进 |

首次打开会弹出使用帮助；之后可随时点工具栏「帮助」再次查看。

---

## 项目二：WeChatFormatter（公众号排版）

纯前端 Markdown → 微信公众号文章排版工具，支持**本地排版**与（可选）**AI 排版**。排版结果为带内联样式的 HTML，可直接粘贴到公众号后台。

更细的说明见 [`WeChatFormatter/README.md`](./WeChatFormatter/README.md)。

<p align="center">
  <img src="WeChatFormatter/README.assets/image-20260617174929540.png" width="100%" alt="WeChatFormatter 界面" />
</p>

### 核心能力

| 能力 | 说明 |
|------|------|
| 一键排版 | `Ctrl+S` 或点按钮；本地渲染，无需联网 |
| 复制到公众号 | 烘焙内联样式、兼容公众号编辑器结构 |
| 样式模板 | 摸鱼绿、红白、石墨极简、留白禅意等多套主题 |
| 标题 / 字体 / 段距 | H1–H4 颜色字号、表头色、首行缩进等 |
| 自定义 CSS | 面板内写 CSS，保存后下次排版生效 |
| 预览微调 | 预览区可直接改字；支持撤销 / 重做 |
| 草稿管理 | 自动保存 + 多草稿切换 |
| 导出 | Markdown / HTML / 长图 / 纯文本 |
| AI 助手（可选） | 润色、扩写、缩写、翻译（需配置 DeepSeek API Key） |

### 编辑区便利功能

- 行号显示；Tab 缩进；工具栏快捷插入（加粗 / 斜体 / 链接 / 引用 / 图片等）
- 粘贴图片 → 自动插入占位并渲染
- 粘贴 Excel 表格 → 转为 Markdown 表格
- 拖入或导入 `.md` 文件；自动生成目录

### 常用快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl + S` | 一键排版 |
| `Ctrl + F` | 搜索 / 替换 |
| `Ctrl + Z` / `Ctrl + Y` | 预览区撤销 / 重做 |
| `?` | 快捷键面板 |
| `Esc` | 关闭弹窗 |

首次打开同样会弹出使用帮助；页头「帮助」可再次打开。

---

## 技术架构

```
┌──────────────────────── mdEditor/ ────────────────────────┐
│  index.html + i18n.js + public/                           │
│  Editor (textarea) ──▶ Preview (marked / KaTeX / Mermaid) │
│           │                                               │
│           ▼                                               │
│     localStorage / IndexedDB                              │
└───────────────────────────────────────────────────────────┘

┌──────────────────── WeChatFormatter/ ─────────────────────┐
│  index.html + app.js + config/ + utils/ + vendor/         │
│  Markdown ──▶ 内联样式 HTML ──▶ 复制到公众号              │
│           │                                               │
│           ▼                                               │
│     localStorage（草稿 / 主题 / CSS）                     │
└───────────────────────────────────────────────────────────┘
```

| 能力 | 技术 |
|------|------|
| 运行时 | 纯原生 HTML / CSS / JS，无框架 |
| mdEditor 渲染 | marked、KaTeX、Mermaid |
| mdEditor 导出图 | dom-to-image-more |
| WeChatFormatter 长图 | html2canvas（已本地 vendor） |
| 本地服务 | `server.js`（Node 静态服务） |
| 构建 | `scripts/build.js`（压缩 / 混淆 mdEditor） |

---

## 项目结构

```
.
├── mdEditor/                  # Markdown 编辑器（可独立部署）
│   ├── index.html
│   ├── i18n.js
│   ├── public/                # CSS / JS / vendor
│   └── dist/                  # npm run build 产物
├── WeChatFormatter/           # 公众号排版（可独立部署）
│   ├── index.html
│   ├── app.js
│   ├── config/
│   ├── utils/
│   ├── vendor/
│   └── dist/
├── electron/                  # Electron 桌面端（打包三项目）
├── server.js                  # 本地统一静态服务
├── scripts/                   # 构建 / 部署
├── web-to-md-proxy.py         # 可选：网页转 Markdown 代理
├── README.md
└── README.zh.md
```

桌面端启动：`cd electron && npm install && npm start`，或在本目录执行 `npm run start:desktop`。打包：`npm run dist:desktop`。

---

## 可选：网页转 Markdown 代理

```bash
pip install requests
python web-to-md-proxy.py   # 默认端口 8765
```

在编辑器中勾选「使用本地代理」后，可将部分网页正文转成 Markdown（知乎、公众号等站点更稳妥）。

---

## 参与贡献

欢迎新功能、Bug 修复、界面优化、语言补充与文档改进：

1. Fork 本仓库
2. `git checkout -b feature/AmazingFeature`
3. `git commit -m 'Add some AmazingFeature'`
4. `git push origin feature/AmazingFeature`
5. 提交 Pull Request

---

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。

你可以自由使用、修改、分发；如需商用请获取授权。

---

<div align="center">

### 如果它帮到了你，给个 ⭐ 吧。

**写得好，比什么都重要。**

</div>
