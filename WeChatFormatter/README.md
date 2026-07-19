# WeChatFormatter

纯前端 **Markdown → 微信公众号** 排版工具。本地一键排版，复制到后台样式不易丢；可选 AI 助手做润色 / 扩写 / 翻译。

**在线体验：** https://www.zybkpro.top/WeChatFormatter/

![主界面](README.assets/image-20260617174929540.png)

---

## 快速开始

在仓库根目录：

```bash
npm start
```

打开 http://localhost:3000/WeChatFormatter/

也可：

```bash
# 本目录会转调根目录统一服务
node server.js
```

或直接用静态服务器托管本目录（需支持 ES Module）。双击 `index.html` 在部分浏览器会受模块跨域限制，推荐走 `npm start`。

更完整的上手说明：[articles/WeChatFormatter使用指南.md](./articles/WeChatFormatter使用指南.md)  
推广向介绍：[articles/README.md](./articles/README.md)

---

## 功能概览

### 编辑区

| 功能 | 说明 |
|------|------|
| Markdown 编辑 | 左栏输入 / 粘贴 |
| 行号 | 左侧行号，随滚动同步 |
| 粘贴图片 | `Ctrl+V` → `![](pasted:N)` 并渲染 |
| 粘贴 Excel | 单元格 → Markdown 表格 |
| 导入 / 拖入 | `.md` 文件载入 |
| Tab 缩进 | 插入制表符，不跳焦点 |
| 快捷插入 | B / I / 链接 / 引用 / 图片 / 着色 / 高亮等 |
| 草稿 | 输入防抖自动保存；支持多草稿 |

### 一键排版

点击 **「一键排版」** 或 `Ctrl+S`，本地将 Markdown 渲染为**内联样式** HTML（无需联网）。

排版时还会：

- 注入字数 / 段落 / 预计阅读时间
- 常见错别字修正、敏感词警告
- 应用首行缩进、字体、段间距与当前主题

> 说明：当前主路径是本地排版引擎。API Key 用于「AI 助手」（润色等），不是必须才能排版。

### 预览区

| 功能 | 说明 |
|------|------|
| 可编辑预览 | `contenteditable`，可直接改字 |
| 撤销 / 重做 | `Ctrl+Z` / `Ctrl+Y`，约 50 步 |
| 搜索替换 | `Ctrl+F` |
| 复制到公众号 | 烘焙内联样式、结构兼容处理后复制 |
| 纯文本 | 去格式复制 |
| 目录 | 按 H1～H4 生成可点击目录 |

![一键排版](README.assets/01.jpg)

![目录](README.assets/02.jpg)

### AI 助手（可选）

| 能力 | 说明 |
|------|------|
| 润色 / 扩写 / 缩写 | 改写正文 |
| 翻译 | 中 → 英 / 日 / 韩 |

页头 **「API 配置」** 填写 Key / 模型 / 接口（存 `localStorage`）。兼容 OpenAI 格式 Chat Completions（如 DeepSeek）。未配置时点「AI 助手」会引导去配置。

### 样式

| 功能 | 说明 |
|------|------|
| H1～H4 | 颜色 + 字号 |
| 表头色 / 字体 / 段距 / 首行缩进 | 工具栏即时生效 |
| 样式模板 | 摸鱼绿、红白、石墨极简、留白禅意、摸鱼票据、橄榄手记等；另有 ColorUI、科技感、中华古典、水墨留白、赛博霓虹、暗黑等 |
| 自定义 CSS | 面板编辑；内置简约留白、暖阳橙调、森林绿意等预设 |
| 模板导入导出 | JSON，便于分享系列风格 |

### 导出与界面

| 功能 | 说明 |
|------|------|
| 导出 Markdown | `.md`，粘贴图可转 base64 |
| 导出 HTML | 独立网页 |
| 导出长图 | 本地 `vendor/html2canvas.min.js` |
| 深浅色 / 全屏 / 手机预览 | 页头按钮；手机预览约 375px |
| 历史版本 | 排版快照，最多约 20 条 |
| 帮助 | 首次打开自动弹出；页头「帮助」可再开 |
| 快捷键 | `?` 面板；工具栏可自定义 |

---

## 支持的 Markdown 语法（摘要）

| 元素 | 示例 |
|------|------|
| 标题 | `#`～`####`，及 `一、` / `（一）` / `【】` 等 |
| 强调 | `**粗**` `*斜*` `~~删~~` `==高亮==` |
| 颜色 | `{#E53E3E}文字{/#}` / `{红}文字{/}`（可嵌套） |
| 列表 | `-` / `1.` / `- [ ]` 任务 |
| 链接 / 图 | `[文字](url)` / `![alt](url)` |
| 引用 / 分割线 | `>` / `---` |
| 代码 | 行内 `` `code` ``；围栏代码块 |
| 表格 | `\| a \| b \|` |
| 公式 | `$$ LaTeX $$`（CodeCogs SVG） |

完整说明见使用指南。

---

## 配置

### AI API（弹窗）

页头 **「API 配置」** → 填写后保存。键名：`WeChatFormatter_ai_api`。

| 示例 | API URL | Model |
|------|---------|-------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 其他兼容网关 | 填到 `/v1` 即可 | 按服务商文档 |

请求时会自动拼接 `/chat/completions`（若 URL 尚未包含）。

### 页脚

编辑 `index.html` 中的 `window.GS_CONFIG.footer`；设为 `null` 或不写则不显示。

---

## 项目结构

```
WeChatFormatter/
├── index.html              # 页面与样式
├── app.js                  # 主逻辑
├── config/
│   ├── apiConfig.js        # API 默认值 + localStorage 读写
│   └── promptConfig.js     # AI 提示词
├── utils/
│   ├── localFormatter.js   # 本地排版引擎
│   ├── wechatCompat.js     # 复制到公众号兼容
│   ├── deepseekClient.js   # Chat Completions 客户端
│   ├── textProcessor.js
│   ├── codeHighlight.js
│   └── techBg.js
├── vendor/
│   └── html2canvas.min.js  # 长图导出（本地）
├── articles/               # 使用指南 / 介绍文
├── README.assets/          # 截图
└── server.js               # 转调仓库根目录服务
```

本工具与同仓库的 `mdEditor/` **可独立部署**，互不依赖。

---

## 部署

纯静态资源。将本目录（或你打包后的副本）放到任意静态托管即可，例如：

https://www.zybkpro.top/WeChatFormatter/

注意：需以 HTTP(S) 提供服务，以便 ES Module 与 `vendor/` 相对路径正常加载。

---

## 数据存储（localStorage）

| Key | 用途 |
|-----|------|
| `WeChatFormatter_draft` | 当前草稿 |
| `WeChatFormatter_drafts` | 多草稿 |
| `WeChatFormatter_theme` | `dark` / `light` |
| `WeChatFormatter_help_shown` | 是否已看过帮助 |
| `WeChatFormatter_ai_api` | API Key / model / apiUrl |
| `gs_templates` | 样式模板 |
| `gs_custom_css` | 自定义 CSS |
| `gs_history` | 历史快照 |
| `gs_custom_shortcuts` | 自定义快捷键 |

---

## 技术栈

- 原生 HTML / CSS / JavaScript（ES Module）
- Tailwind CSS（CDN）+ CSS 变量主题
- 本地内联样式排版引擎
- 可选：OpenAI 兼容 Chat Completions
- 长图：html2canvas（已 vendor）
- 公式：CodeCogs LaTeX SVG

---

## 常用快捷键

| 按键 | 作用 |
|------|------|
| `Ctrl+S` | 一键排版 |
| `Ctrl+F` | 搜索 / 替换 |
| `Ctrl+Z` / `Ctrl+Y` | 预览区撤销 / 重做 |
| `?` | 快捷键面板 |
| `Esc` | 关闭弹窗 |
