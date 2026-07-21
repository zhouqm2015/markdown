# Markdown 工具集 · 桌面端

Electron 壳应用，三个页面直接加载线上地址（内容更新后刷新即可，无需重新打包）：

| 菜单 | 地址 |
|------|------|
| 官网首页 | https://www.zybkpro.top/markdown/ |
| Markdown 编辑器 | https://www.zybkpro.top/mdEditor/ |
| 公众号排版 | https://www.zybkpro.top/WeChatFormatter/ |

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

壳本身很轻，只包含窗口与菜单；页面资源始终走线上。应用图标位于 `build/icon.icns` / `build/icon.png`。

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl + 1` | 官网首页 |
| `Cmd/Ctrl + 2` | Markdown 编辑器 |
| `Cmd/Ctrl + 3` | 公众号排版 |

## 说明

- 需要能访问 `www.zybkpro.top`。
- 同站链接在应用内打开，其它外链走系统浏览器。
- 各页面的草稿 / API Key 仍保存在页面 localStorage（按域名隔离）。
