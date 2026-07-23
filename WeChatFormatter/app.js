import { TECH_BG_MARKER, applyTechBgStyle, clearTechBgStyle } from './utils/techBg.js'

/* ===== 全局状态 ===== */
let currentTabIndex = 0
let undoStack = []
let redoStack = []

/* ===== DOM 引用 ===== */
const $ = id => document.getElementById(String(id).replace(/^#/, ''))
const input = $('gs-input')
const preview = $('gs-preview')
const formatBtn = $('gs-format-btn')
const indentCheckbox = $('gs-indent-check')
const headerBgPicker = $('gs-header-bg')
const h1Color = $('gs-h1-color')
const h1Size = $('gs-h1-size')
const h2Color = $('gs-h2-color')
const h2Size = $('gs-h2-size')
const h3Color = $('gs-h3-color')
const h3Size = $('gs-h3-size')
const h4Color = $('gs-h4-color')
const h4Size = $('gs-h4-size')
const previewBox = preview.closest('.gs-preview-box')

/* ===== 字数/阅读时间更新 ===== */
function updateStats() {
  const text = input.value
  const charCount = text.replace(/\s/g, '').length
  const paraCount = text.split('\n').filter(l => l.trim()).length || 0
  const minutes = Math.max(1, Math.round(charCount / 300))
  const el = id => document.getElementById(id)
  if (el('gs-char-count')) el('gs-char-count').textContent = charCount
  if (el('gs-para-count')) el('gs-para-count').textContent = paraCount
  if (el('gs-read-time')) el('gs-read-time').textContent = minutes
}

function injectStatsAfterTitle(html) {
  const charCount = input.value.replace(/\s/g, '').length
  const paraCount = input.value.split('\n').filter(l => l.trim()).length || 0
  const minutes = Math.max(1, Math.round(charCount / 300))
  const statsHtml = `<p style="font-size:13px; color:#999; line-height:1.6; margin:0 0 1em 0;"><span leaf="">字数：${charCount}  ·  段落：${paraCount}  ·  预计阅读约 ${minutes} 分钟</span></p>`
  return html.replace('</h1>', '</h1>' + statsHtml)
}

/* ===== 行号同步 ===== */
function syncLineNumbers() {
  const nums = $('#gs-line-nums')
  if (!nums) return
  const lines = input.value.split('\n')
  const count = Math.max(lines.length, 1)
  nums.innerHTML = Array.from({ length: count }, (_, i) => `<span>${i + 1}</span>`).join('')
  nums.scrollTop = input.scrollTop
}
input.addEventListener('scroll', syncLineNumbers)

/* ===== 多草稿管理 ===== */
const DRAFTS_KEY = 'WeChatFormatter_drafts'
const HELP_SHOWN_KEY = 'WeChatFormatter_help_shown'

function openHelp() {
  $('gs-help-modal')?.classList.remove('gs-hidden')
}

function closeHelp() {
  $('gs-help-modal')?.classList.add('gs-hidden')
  try { localStorage.setItem(HELP_SHOWN_KEY, 'true') } catch (e) { /* ignore */ }
}
function loadDrafts() {
  try {
    let raw = localStorage.getItem(DRAFTS_KEY)
    if (!raw) {
      const legacy = localStorage.getItem('geshifang_drafts')
      if (legacy) {
        localStorage.setItem(DRAFTS_KEY, legacy)
        raw = legacy
      }
    }
    return JSON.parse(raw || '{}')
  } catch (e) { return {} }
}
function saveDrafts(drafts) {
  try { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)) } catch (e) { /* ignore */ }
}
function renderDraftList() {
  const list = $('#gs-draft-list')
  if (!list) return
  const drafts = loadDrafts()
  const entries = Object.entries(drafts)
  if (!entries.length) { list.innerHTML = '<p style="padding:16px;color:var(--text-muted);font-size:13px;text-align:center;">暂无草稿</p>'; return }
  list.innerHTML = entries.map(([name, content]) => `
    <div class="gs-draft-item" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--border);cursor:pointer;">
      <span style="font-size:13px;" onclick="document.getElementById('gs-input').value = this.parentElement.dataset.content; updateStats(); $('#gs-draft-modal').classList.add('gs-hidden');">${name}</span>
      <button class="gs-draft-delete" data-name="${name}" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:12px;">&#x2716;</button>
    </div>
  `).join('')
  list.querySelectorAll('.gs-draft-delete').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const name = btn.dataset.name
      const drafts = loadDrafts()
      delete drafts[name]
      saveDrafts(drafts)
      renderDraftList()
    })
  })
}

/* ===== 自动生成目录 ===== */
function generateTOC() {
  const headings = preview.querySelectorAll('h1, h2, h3, h4')
  if (!headings.length) { alert('预览区未检测到标题（H1~H4）'); return }
  let toc = '<section style="background:#F7F8FA;border:1px solid #E5E6EB;border-radius:8px;padding:16px 20px;margin-bottom:20px;">'
  toc += '<p style="font-weight:700;font-size:15px;margin:0 0 10px 0;color:#1A3C6D;"><span leaf="">文章目录</span></p>'
  headings.forEach(h => {
    const level = parseInt(h.tagName[1], 10)
    const text = h.textContent.trim()
    if (!text) return
    const padding = (level - 1) * 16
    const size = [16, 14, 13, 13][level - 1] || 12
    toc += `<p style="padding-left:${padding}px;font-size:${size}px;line-height:1.8;color:#2B6CB0;margin:0;"><span leaf="">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span></p>`
  })
  toc += '</section>'
  saveSnapshot()
  preview.innerHTML = toc + preview.innerHTML
}

/* ===== 导出 HTML / 复制到公众号 ===== */
function buildArticleHTML() {
  const content = preview.innerHTML
  if (!content || !content.trim()) return null
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>article</title>
<style>
  body { max-width: 680px; margin: 0 auto; padding: 32px 20px; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; font-size: 15px; line-height: 1.8; color: #333; background: #fff; }
  img { max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 13px; border-radius: 6px; overflow: hidden; }
  th, td { border: 1px solid #D0D0D0; padding: 8px 12px; text-align: left; }
  th { background: #1A3C6D; color: #fff; font-weight: 600; }
  tr:nth-child(even) td { background: #F8F9FA; }
  pre { background: #F5F5F7; border-radius: 6px; padding: 14px 18px; overflow-x: auto; font-size: 13px; line-height: 1.6; }
  code { font-family: 'JetBrains Mono','Consolas',monospace; font-size: 0.9em; }
  blockquote { background: #F5F5F7; border-left: 4px solid #1A3C6D; margin: 16px 0; padding: 12px 16px; border-radius: 0 6px 6px 0; color: #555; }
  hr { border: none; border-top: 1px solid #E0E0E0; margin: 24px 0; }
</style>
</head>
<body>
${content}
</body>
</html>`
}

function exportHTML() {
  const html = buildArticleHTML()
  if (!html) { alert('暂无排版结果可导出'); return }
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'article.html'
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * 复制预览区富文本到剪贴板，可直接粘贴到公众号编辑器。
 * 复制前会：烘焙自定义 CSS、危险标签改写为 section/p/span、文字包 leaf、
 * 并通过 copy 事件写入 text/html（必须在点击同步栈内，不能先 await）。
 */
function copyToWechat(btnId) {
  if (!preview || !preview.innerHTML.trim()) {
    alert('暂无排版结果可复制')
    return
  }

  const flashBtn = (ok) => {
    const btn = btnId ? $(btnId) : null
    if (!btn) return
    const orig = btn.dataset.origLabel || btn.innerHTML
    btn.dataset.origLabel = orig
    btn.innerHTML = ok ? '&#x2705; 已复制' : '复制失败'
    setTimeout(() => { btn.innerHTML = orig }, 2200)
  }

  // 模块须已预加载；此处禁止 await import，否则丢失用户手势导致复制失败
  if (!window.__gsWechatCompat) {
    flashBtn(false)
    alert('复制模块尚未就绪，请稍候再试')
    return
  }

  const btn = btnId ? $(btnId) : null
  if (btn) {
    btn.dataset.origLabel = btn.dataset.origLabel || btn.innerHTML
    btn.innerHTML = '处理图片…'
  }

  window.__gsWechatCompat.copyWechatHTML(preview).then((ok) => {
    flashBtn(ok)
    if (!ok) alert('自动复制失败，请手动全选预览区后 Ctrl/⌘+C')
  }).catch((e) => {
    console.error('复制到公众号失败', e)
    flashBtn(false)
    alert('复制失败：' + (e.message || e))
  })
}

/* ===== 复制纯文本 ===== */
function copyPlainText() {
  const text = preview.textContent
  if (!text || !text.trim()) { alert('暂无排版结果可复制'); return }
  navigator.clipboard.writeText(text).then(() => {
    const btn = $('gs-text-copy-btn')
    const orig = btn.innerHTML
    btn.innerHTML = '&#x2705; 已复制'
    setTimeout(() => btn.innerHTML = orig, 1500)
  }).catch(() => alert('复制失败'))
}

/* ===== 模板导出/导入 ===== */
function exportTemplates() {
  const data = localStorage.getItem('gs_templates') || '{}'
  const blob = new Blob([data], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'WeChatFormatter-templates.json'; a.click()
  URL.revokeObjectURL(url)
}
function importTemplates() {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = '.json'
  input.onchange = e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result)
        const existing = JSON.parse(localStorage.getItem('gs_templates') || '{}')
        Object.assign(existing, data)
        localStorage.setItem('gs_templates', JSON.stringify(existing))
        loadTemplates()
        alert('模板导入成功')
      } catch (err) { alert('导入失败：无效的模板文件') }
    }
    reader.readAsText(file, 'utf-8')
  }
  input.click()
}

/* ===== AI 改写 ===== */
async function aiRewrite(text, action) {
  const actionPrompts = {
    polish: '请润色以下文字，优化表达、修正语病，保持原意不变：\n\n',
    expand: '请扩写以下文字，丰富内容、增加细节、保持风格一致：\n\n',
    shorten: '请缩写以下文字，提炼核心内容，保留关键信息：\n\n',
    'translate-en': '请将以下文字翻译为英文：\n\n',
    'translate-ja': '请将以下文字翻译为日文：\n\n',
    'translate-ko': '请将以下文字翻译为韩文：\n\n',
  }
  const prompt = (actionPrompts[action] || actionPrompts.polish) + text
  try {
    const { AI_REWRITE_CONFIG } = await import('./config/apiConfig.js')
    const { chatCompletion } = await import('./utils/deepseekClient.js')
    const result = await chatCompletion(
      [
        { role: 'system', content: AI_REWRITE_CONFIG.systemPrompt },
        { role: 'user', content: prompt },
      ],
      {
        temperature: AI_REWRITE_CONFIG.temperature,
        maxTokens: AI_REWRITE_CONFIG.maxTokens,
      }
    )
    return result.trim()
  } catch (e) {
    throw new Error('AI 处理失败: ' + e.message)
  }
}

function replaceInInput(source, replacement) {
  if (!source) return false
  if (input.value.includes(source)) {
    input.value = input.value.replace(source, replacement)
    return true
  }
  try {
    const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = escaped.split(/\s+/).filter(Boolean).join('\\s*')
    const re = new RegExp(pattern)
    if (re.test(input.value)) {
      input.value = input.value.replace(re, replacement)
      return true
    }
  } catch { /* ignore */ }
  return false
}

function replaceFirstInTextNodes(root, source, replacement) {
  if (!source) return false
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    const idx = node.textContent.indexOf(source)
    if (idx !== -1) {
      node.textContent =
        node.textContent.slice(0, idx) + replacement + node.textContent.slice(idx + source.length)
      return true
    }
  }
  return false
}

function applyAiResultToEditor() {
  const resultEl = $('gs-ai-result')
  const sourceEl = $('gs-ai-source')
  if (!resultEl) return

  const result = resultEl.value.trim()
  if (!result) {
    alert('没有可应用的结果')
    return
  }
  if (result.startsWith('错误：')) {
    alert(result)
    return
  }

  const source = sourceEl?.value?.trim() || ''
  let applied = false
  let previewOnly = false

  if (replaceInInput(source, result)) {
    applied = true
  } else if (source && replaceFirstInTextNodes(preview, source, result)) {
    applied = true
    previewOnly = true
  } else if (input.selectionStart !== input.selectionEnd) {
    const start = input.selectionStart
    const end = input.selectionEnd
    input.value = input.value.slice(0, start) + result + input.value.slice(end)
    input.selectionStart = start
    input.selectionEnd = start + result.length
    applied = true
  } else {
    const prefix = input.value && !input.value.endsWith('\n') ? '\n\n' : ''
    input.value = input.value + prefix + result
    applied = true
  }

  if (!applied) {
    alert('未能应用结果，请手动复制')
    return
  }

  syncLineNumbers()
  updateStats()
  saveDraft()
  if (!previewOnly) {
    applyFormat()
  }
  $('gs-ai-modal')?.classList.add('gs-hidden')
}

/* ===== 内置样式模板 ===== */
const FONT_SYSTEM = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif"
const FONT_SERIF = "'Noto Serif SC','Times New Roman',serif"
const FONT_KAITI = "'KaiTi','STKaiti',serif"
const FONT_SONG = "'SimSun','STSong',serif"

const BUILTIN_TEMPLATES = {
  colorui: {
    label: 'ColorUI',
    indent: false,
    headerBg: '#0081FF',
    h1Color: '#0081FF', h1Size: '22px',
    h2Color: '#39B54A', h2Size: '18px',
    h3Color: '#1CBBB4', h3Size: '16px',
    h4Color: '#8799A3', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* ColorUI — 活力圆角、多彩标签感 */
p { font-size: 15px; line-height: 1.9; color: #333333; }
h1 { font-size: 22px !important; font-weight: 700 !important; color: #FFFFFF !important; background: linear-gradient(135deg, #0081FF, #1CBBB4) !important; border-left: none !important; border-bottom: none !important; padding: 12px 16px !important; border-radius: 10px !important; margin: 20px 0 14px !important; }
h2 { font-size: 18px !important; font-weight: 700 !important; color: #39B54A !important; border-left: 4px solid #39B54A !important; padding: 4px 0 4px 12px !important; background: #F0F9F2; border-radius: 0 8px 8px 0; }
h3 { font-size: 16px !important; font-weight: 600 !important; color: #1CBBB4 !important; }
h4 { color: #8799A3 !important; }
blockquote { background: #E8F3FF; border-left: 4px solid #0081FF; color: #0081FF; border-radius: 0 10px 10px 0; padding: 12px 16px; }
pre { background: #F0F3F5 !important; color: #333333 !important; border: none !important; border-radius: 10px !important; padding: 14px 16px !important; }
code { background: #E8F3FF !important; color: #0081FF !important; border-radius: 6px; padding: 2px 6px; }
th { background: #0081FF !important; }
td { border-color: #E7E7E7; }
tbody tr:nth-child(even) td { background: #F1F1F1; }
hr { border-top: 2px dashed #C7C7C7; }
a { color: #0081FF !important; }
strong { color: #0081FF !important; }
img { border-radius: 10px !important; }`
  },
  tech: {
    label: '科技感',
    indent: false,
    headerBg: '#023E8A',
    h1Color: '#00B4D8', h1Size: '22px',
    h2Color: '#0077B6', h2Size: '18px',
    h3Color: '#0096C7', h3Size: '16px',
    h4Color: '#48CAE4', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* 科技感 — 电光青、粒子波浪底纹(gs-tech-css-bg)、未来感
 * 浅蓝点阵波浪由 utils/techBg.js 挂到 .gs-preview-box（不滚动），预览区透明 */
#gs-preview {
  background: transparent !important;
  background-image: none !important;
  color: #1A2332 !important;
}
p { font-size: 15px; line-height: 1.9; color: #1A2332; }
h1 { font-size: 22px !important; font-weight: 700 !important; color: #00B4D8 !important; border-left: 4px solid #00D4FF !important; padding: 6px 0 10px 14px !important; border-bottom: 1px solid #CAF0F8 !important; letter-spacing: 0.04em; text-shadow: 0 0 12px rgba(0,212,255,0.18); background: linear-gradient(90deg, rgba(0,180,216,0.08), transparent); }
h2 { font-size: 18px !important; font-weight: 600 !important; color: #0077B6 !important; border-left: 3px solid #48CAE4 !important; padding-left: 12px !important; }
h3 { font-size: 16px !important; font-weight: 600 !important; color: #0096C7 !important; }
h4 { color: #48CAE4 !important; }
blockquote { background: linear-gradient(90deg, #E8F7FC, #F0FBFF); border-left: 4px solid #00B4D8; color: #023E8A; border-radius: 0 8px 8px 0; }
pre { background: #0D1B2A !important; color: #E0F7FA !important; border: 1px solid #00B4D8; border-radius: 6px; box-shadow: 0 0 0 1px rgba(0,212,255,0.15), inset 0 0 28px rgba(0,180,216,0.15); }
pre code { color: #E0F7FA !important; background: transparent !important; }
pre [data-tok="base"] { color: #E0F7FA !important; }
pre [data-tok="comment"] { color: #67E8F9 !important; }
pre [data-tok="keyword"] { color: #A5B4FC !important; }
pre [data-tok="string"] { color: #6EE7B7 !important; }
pre [data-tok="number"] { color: #FCD34D !important; }
code { background: #E0F7FA; color: #0077B6; border-radius: 3px; font-family: 'JetBrains Mono','Consolas',monospace; }
th { background: #023E8A !important; }
td { border-color: #90E0EF; }
tbody tr:nth-child(even) td { background: #F0FBFF; }
hr { border-top: 1px solid #90E0EF; }
a { color: #00B4D8 !important; }
strong { color: #0077B6 !important; }`
  },
  classical: {
    label: '中华古典',
    indent: true,
    headerBg: '#8B1A1A',
    h1Color: '#8B1A1A', h1Size: '24px',
    h2Color: '#A52A2A', h2Size: '20px',
    h3Color: '#B54A3A', h3Size: '17px',
    h4Color: '#8B6914', h4Size: '15px',
    font: FONT_KAITI,
    spacing: '1.5em',
    css: `/* 中华古典 — 朱红、墨色、宣纸质感；代码块浅底深字保证可读 */
#gs-preview { background: #FBF7F0 !important; }
p { font-size: 16px; line-height: 2; color: #2A1A0A; font-family: 'KaiTi','STKaiti','Noto Serif SC',serif; }
h1 { font-size: 24px !important; font-weight: 700 !important; color: #8B1A1A !important; border-left: 4px solid #C43A3A !important; padding: 4px 0 10px 14px !important; border-bottom: 1px solid #E8C8C0 !important; font-family: 'KaiTi','STKaiti','Noto Serif SC',serif; letter-spacing: 0.12em; }
h2 { font-size: 20px !important; font-weight: 600 !important; color: #A52A2A !important; border-left: 3px solid #D46A4A !important; padding-left: 12px !important; font-family: 'KaiTi','STKaiti',serif; letter-spacing: 0.08em; }
h3 { font-size: 17px !important; font-weight: 600 !important; color: #B54A3A !important; font-family: 'KaiTi','STKaiti',serif; }
h4 { color: #8B6914 !important; font-family: 'KaiTi','STKaiti',serif; }
blockquote { background: #FCF5F0; border-left: 4px solid #C43A3A; color: #5A3A2A; border-radius: 0; font-family: 'KaiTi','STKaiti',serif; }
pre { background: #F3EBE0 !important; color: #2A1A0A !important; border: 1px solid #D4C0A8 !important; border-radius: 4px !important; font-family: 'JetBrains Mono','Consolas',monospace !important; }
pre code { background: transparent !important; color: #2A1A0A !important; font-family: inherit !important; }
code { background: #F5EDE4 !important; color: #8B2A1A !important; font-family: 'JetBrains Mono','Consolas',monospace; }
th { background: #8B1A1A !important; }
td { border-color: #E0D0C0; font-family: 'KaiTi','STKaiti',serif; }
tbody tr:nth-child(even) td { background: #FAF5F0; }
hr { border-top: 1px solid #E0D0C0; }
a { color: #8B3A2A !important; }
strong { color: #8B1A1A !important; }
table { font-family: 'KaiTi','STKaiti','Noto Serif SC',serif; }`
  },
  ink: {
    label: '水墨留白',
    indent: true,
    headerBg: '#2C2C2C',
    h1Color: '#1A1A1A', h1Size: '24px',
    h2Color: '#333333', h2Size: '20px',
    h3Color: '#555555', h3Size: '16px',
    h4Color: '#777777', h4Size: '15px',
    font: FONT_SONG,
    spacing: '1.5em',
    css: `/* 水墨留白 — 黑白灰、宋体；代码块浅灰底深字保证对比 */
p { font-size: 16px; line-height: 2.05; color: #2C2C2C; font-family: 'SimSun','STSong','Noto Serif SC',serif; }
h1 { font-size: 24px !important; font-weight: 700 !important; color: #1A1A1A !important; border-left: none !important; padding: 0 0 12px 0 !important; border-bottom: 2px solid #1A1A1A !important; letter-spacing: 0.16em; text-align: center; }
h2 { font-size: 20px !important; font-weight: 600 !important; color: #333 !important; border-left: none !important; padding-left: 0 !important; border-bottom: 1px solid #CCC; padding-bottom: 6px; letter-spacing: 0.1em; }
h3 { font-size: 16px !important; font-weight: 600 !important; color: #555 !important; }
blockquote { background: #F7F7F7; border-left: 2px solid #999; color: #555; border-radius: 0; font-style: italic; }
pre { background: #F0F0F0 !important; color: #1A1A1A !important; border: 1px solid #CCCCCC !important; border-radius: 0 !important; font-family: 'JetBrains Mono','Consolas',monospace !important; }
pre code { background: transparent !important; color: #1A1A1A !important; font-family: inherit !important; }
code { background: #E8E8E8 !important; color: #1A1A1A !important; font-family: 'JetBrains Mono','Consolas',monospace; }
th { background: #2C2C2C !important; }
td { border-color: #DDD; }
tbody tr:nth-child(even) td { background: #FAFAFA; }
hr { border-top: 1px solid #CCC; width: 40%; margin-left: auto; margin-right: auto; }
a { color: #333 !important; text-decoration: underline; }
strong { color: #000 !important; }`
  },
  cyber: {
    label: '赛博霓虹',
    indent: false,
    headerBg: '#7B2CBF',
    h1Color: '#C77DFF', h1Size: '22px',
    h2Color: '#E0AAFF', h2Size: '18px',
    h3Color: '#9D4EDD', h3Size: '16px',
    h4Color: '#FF6BCB', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* 赛博霓虹 — 紫粉霓虹、暗夜科技 */
#gs-preview { background: #12081F !important; color: #EDE4FF !important; }
p { font-size: 15px; line-height: 1.9; color: #EDE4FF; }
h1 { font-size: 22px !important; font-weight: 700 !important; color: #C77DFF !important; border-left: 4px solid #FF6BCB !important; padding: 6px 0 10px 14px !important; border-bottom: 1px solid #3C1E6B !important; text-shadow: 0 0 10px rgba(199,125,255,0.45); }
h2 { font-size: 18px !important; font-weight: 600 !important; color: #E0AAFF !important; border-left: 3px solid #9D4EDD !important; padding-left: 10px !important; }
h3 { font-size: 16px !important; font-weight: 600 !important; color: #9D4EDD !important; }
h4 { color: #FF6BCB !important; }
blockquote { background: #1E1033; border-left: 4px solid #FF6BCB; color: #D4B5FF; border-radius: 0 8px 8px 0; }
pre { background: #1A0B2E !important; border: 1px solid #7B2CBF; border-radius: 6px; color: #E0AAFF !important; }
pre code { color: #E0AAFF !important; background: transparent !important; }
pre [data-tok="base"] { color: #E0AAFF !important; }
pre [data-tok="comment"] { color: #C4B5FD !important; }
pre [data-tok="keyword"] { color: #F0ABFC !important; }
pre [data-tok="string"] { color: #86EFAC !important; }
pre [data-tok="number"] { color: #FDBA74 !important; }
code { background: #2A1548; color: #FF6BCB; }
th { background: #7B2CBF !important; color: #F8F0FF !important; }
td { border-color: #3C1E6B; color: #EDE4FF; }
tbody tr:nth-child(even) td { background: #1E1033; }
table { border-color: #3C1E6B; }
hr { border-top: 1px solid #3C1E6B; }
a { color: #FF6BCB !important; }
strong { color: #C77DFF !important; }`
  },
  dark: {
    label: '暗黑风格',
    indent: false,
    headerBg: '#21262D',
    h1Color: '#58A6FF', h1Size: '22px',
    h2Color: '#79C0FF', h2Size: '18px',
    h3Color: '#8B949E', h3Size: '16px',
    h4Color: '#6E7681', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* 暗黑风格 — 深色背景、冷蓝高亮、护眼阅读 */
#gs-preview { background: #0D1117 !important; color: #C9D1D9 !important; }
p { font-size: 15px; line-height: 1.9; color: #C9D1D9; }
h1 { font-size: 22px !important; font-weight: 700 !important; color: #58A6FF !important; border-left: 4px solid #58A6FF !important; padding: 4px 0 10px 14px !important; border-bottom: 1px solid #30363D !important; }
h2 { font-size: 18px !important; font-weight: 600 !important; color: #79C0FF !important; border-left: 3px solid #79C0FF !important; padding-left: 10px !important; }
h3 { font-size: 16px !important; font-weight: 600 !important; color: #8B949E !important; }
h4 { color: #6E7681 !important; }
blockquote { background: #161B22; border-left: 4px solid #388BFD; color: #8B949E; border-radius: 0 6px 6px 0; }
pre { background: #161B22 !important; border: 1px solid #30363D; border-radius: 6px; color: #C9D1D9 !important; }
pre code { color: #C9D1D9 !important; background: transparent !important; }
pre [data-tok="base"] { color: #C9D1D9 !important; }
pre [data-tok="comment"] { color: #8B949E !important; }
pre [data-tok="keyword"] { color: #FF7B72 !important; }
pre [data-tok="string"] { color: #A5D6FF !important; }
pre [data-tok="number"] { color: #79C0FF !important; }
code { background: #21262D; color: #F0883E; border-radius: 4px; }
th { background: #21262D !important; color: #C9D1D9 !important; }
td { border-color: #30363D; color: #C9D1D9; }
tbody tr:nth-child(even) td { background: #161B22; }
table { border-color: #30363D; }
hr { border-top: 1px solid #30363D; }
a { color: #58A6FF !important; }
strong { color: #58A6FF !important; }
li { color: #C9D1D9; }
img { border-radius: 6px !important; opacity: 0.95; }`
  },

  /* ===== gzh-design 公众号主题 ===== */
  moyuGreen: {
    label: '摸鱼绿',
    group: 'gzh',
    indent: false,
    headerBg: '#059669',
    h1Color: '#111827', h1Size: '22px',
    h2Color: '#059669', h2Size: '18px',
    h3Color: '#10B981', h3Size: '16px',
    h4Color: '#6B7280', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* 摸鱼绿 — gzh-design · 绿色杂志风、卡片丰富 */
#gs-preview { background: #ffffff !important; color: #374151 !important; letter-spacing: 0.5px; }
p { font-size: 14px; line-height: 1.9; color: #374151; letter-spacing: 0.5px; }
h1 { font-size: 22px !important; font-weight: 900 !important; color: #111827 !important; border-left: 4px solid #059669 !important; padding: 4px 0 10px 14px !important; border-bottom: 1px solid #E5E7EB !important; letter-spacing: -0.5px; }
h2 { font-size: 18px !important; font-weight: 800 !important; color: #059669 !important; border-left: 3px solid #34D399 !important; padding-left: 12px !important; }
h3 { font-size: 16px !important; font-weight: 700 !important; color: #10B981 !important; }
h4 { color: #6B7280 !important; }
blockquote { background: #ECFDF5; border-left: 4px solid #059669; color: #065F46; border-radius: 0 8px 8px 0; }
pre { background: #ECFDF5 !important; border: 1px solid #A7F3D0 !important; border-left: 4px solid #059669 !important; border-radius: 8px !important; color: #064E3B !important; padding: 14px 16px !important; overflow-x: auto !important; overflow-y: hidden !important; white-space: pre !important; word-break: normal !important; }
pre code { color: #064E3B !important; background: transparent !important; white-space: inherit !important; }
pre [data-tok="base"] { color: #065F46 !important; }
pre [data-tok="comment"] { color: #34D399 !important; }
pre [data-tok="keyword"] { color: #047857 !important; font-weight: 600; }
pre [data-tok="string"] { color: #059669 !important; }
pre [data-tok="number"] { color: #0D9488 !important; }
code { background: #D1FAE5; color: #047857; border-radius: 4px; font-weight: 600; }
th { background: #059669 !important; }
td { border-color: #E5E7EB; }
tbody tr:nth-child(even) td { background: #F0FDF4; }
hr { border-top: 1px solid #D1D5DB; }
a { color: #059669 !important; }
strong { color: #059669 !important; border-bottom: 2px solid #A7F3D0; }
img { border-radius: 8px !important; }`
  },
  redWhite: {
    label: '红白色系',
    group: 'gzh',
    indent: false,
    headerBg: '#DC2626',
    h1Color: '#1C1917', h1Size: '22px',
    h2Color: '#DC2626', h2Size: '18px',
    h3Color: '#991B1B', h3Size: '16px',
    h4Color: '#9CA3AF', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* 红白色系 — gzh-design · 经典编辑风、红色克制点睛 */
#gs-preview { background: #ffffff !important; color: #374151 !important; letter-spacing: 0.5px; }
p { font-size: 15px; line-height: 1.8; color: #374151; letter-spacing: 0.5px; }
h1 { font-size: 22px !important; font-weight: 800 !important; color: #1C1917 !important; border-left: 4px solid #DC2626 !important; padding: 4px 0 10px 14px !important; border-bottom: 1px solid #E5E7EB !important; }
h2 { font-size: 18px !important; font-weight: 700 !important; color: #DC2626 !important; border-left: 3px solid #FECACA !important; padding-left: 12px !important; }
h3 { font-size: 16px !important; font-weight: 700 !important; color: #991B1B !important; }
h4 { color: #9CA3AF !important; }
blockquote { background: #FEF2F2; border-left: 4px solid #FECACA; color: #7F1D1D; border-radius: 0 8px 8px 0; }
pre { background: #FEF2F2 !important; border: 1px solid #FECACA !important; border-left: 4px solid #DC2626 !important; border-radius: 6px !important; color: #1C1917 !important; padding: 14px 16px !important; overflow-x: auto !important; overflow-y: hidden !important; white-space: pre !important; word-break: normal !important; }
pre code { color: #1C1917 !important; background: transparent !important; }
pre [data-tok="base"] { color: #1C1917 !important; }
pre [data-tok="comment"] { color: #9CA3AF !important; }
pre [data-tok="keyword"] { color: #DC2626 !important; font-weight: 600; }
pre [data-tok="string"] { color: #B91C1C !important; }
pre [data-tok="number"] { color: #EA580C !important; }
code { background: #FEE2E2; color: #991B1B; border-radius: 3px; }
th { background: #DC2626 !important; }
td { border-color: #E5E7EB; }
tbody tr:nth-child(even) td { background: #FEF2F2; }
hr { border-top: 1px solid #E5E7EB; }
a { color: #DC2626 !important; }
strong { color: #1C1917 !important; border-bottom: 2px solid #FECACA; font-weight: 600; }`
  },
  graphiteMinimal: {
    label: '石墨极简风',
    group: 'gzh',
    indent: false,
    headerBg: '#27272A',
    h1Color: '#27272A', h1Size: '22px',
    h2Color: '#3F3F46', h2Size: '18px',
    h3Color: '#52525B', h3Size: '16px',
    h4Color: '#A1A1AA', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1.5em',
    css: `/* 石墨极简风 — gzh-design · 全灰阶、细线留白、克制理性 */
#gs-preview { background: #FFFFFF !important; color: #52525B !important; letter-spacing: 0.3px; }
p { font-size: 15px; line-height: 1.8; color: #52525B; letter-spacing: 0.3px; }
h1 { font-size: 22px !important; font-weight: 700 !important; color: #27272A !important; border-left: none !important; padding: 0 0 12px 0 !important; border-bottom: 1px solid #E4E4E7 !important; letter-spacing: 0.5px; }
h2 { font-size: 18px !important; font-weight: 600 !important; color: #3F3F46 !important; border-left: none !important; padding-left: 0 !important; border-bottom: 1px solid #E4E4E7; padding-bottom: 6px; }
h3 { font-size: 16px !important; font-weight: 600 !important; color: #52525B !important; }
h4 { color: #A1A1AA !important; }
blockquote { background: #FAFAFA; border-left: 2px solid #52525B; border-top: none; border-right: none; border-bottom: none; color: #3F3F46; border-radius: 0; padding: 16px 20px; }
pre { background: #FAFAFA !important; border: none !important; border-top: 2px solid #27272A !important; border-bottom: 1px solid #E4E4E7 !important; border-radius: 0 !important; color: #3F3F46 !important; padding: 16px 18px !important; overflow-x: auto !important; overflow-y: hidden !important; white-space: pre !important; word-break: normal !important; }
pre code { color: #3F3F46 !important; background: transparent !important; }
pre [data-tok="base"] { color: #3F3F46 !important; }
pre [data-tok="comment"] { color: #A1A1AA !important; }
pre [data-tok="keyword"] { color: #27272A !important; font-weight: 700; }
pre [data-tok="string"] { color: #52525B !important; }
pre [data-tok="number"] { color: #F97316 !important; }
code { background: #F4F4F5; color: #27272A; border-radius: 2px; }
th { background: #27272A !important; }
td { border-color: #E4E4E7; }
tbody tr:nth-child(even) td { background: #FAFAFA; }
hr { border-top: 1px solid #E4E4E7; }
a { color: #F97316 !important; }
strong { color: #27272A !important; border-bottom: 2px solid #52525B; font-weight: 600; }`
  },
  zenWhitespace: {
    label: '留白禅意风',
    group: 'gzh',
    indent: true,
    headerBg: '#4A5D52',
    h1Color: '#2B2B2B', h1Size: '24px',
    h2Color: '#4A5D52', h2Size: '20px',
    h3Color: '#3D5046', h3Size: '16px',
    h4Color: '#A3A3A3', h4Size: '15px',
    font: FONT_SERIF,
    spacing: '1.5em',
    css: `/* 留白禅意风 — gzh-design · 超大留白、墨绿点缀、衬线书卷气 */
#gs-preview { background: #FFFFFF !important; color: #525252 !important; letter-spacing: 0.3px; }
p { font-size: 15px; line-height: 1.9; color: #525252; letter-spacing: 0.3px; margin-bottom: 26px; }
h1 { font-size: 24px !important; font-weight: 600 !important; color: #2B2B2B !important; border-left: none !important; padding: 0 0 16px 0 !important; border-bottom: 1px solid #E8E8E8 !important; font-family: 'Noto Serif SC',Georgia,'Times New Roman',serif !important; letter-spacing: 0.8px; text-align: center; }
h2 { font-size: 20px !important; font-weight: 600 !important; color: #4A5D52 !important; border-left: none !important; padding-left: 0 !important; font-family: 'Noto Serif SC',Georgia,serif !important; letter-spacing: 0.5px; margin-top: 48px; }
h3 { font-size: 16px !important; font-weight: 600 !important; color: #3D5046 !important; font-family: 'Noto Serif SC',Georgia,serif !important; }
h4 { color: #A3A3A3 !important; }
blockquote { background: transparent; border-top: 1px solid #E8E8E8; border-bottom: 1px solid #E8E8E8; border-left: none; color: #2B2B2B; border-radius: 0; padding: 28px 24px; text-align: center; font-family: 'Noto Serif SC',Georgia,serif; }
pre { background: #F4F7F5 !important; border: none !important; border-left: 2px solid #4A5D52 !important; border-radius: 0 !important; color: #2B2B2B !important; padding: 18px 22px !important; overflow-x: auto !important; overflow-y: hidden !important; white-space: pre !important; word-break: normal !important; }
pre code { color: #2B2B2B !important; background: transparent !important; }
pre [data-tok="base"] { color: #2B2B2B !important; }
pre [data-tok="comment"] { color: #8A9A90 !important; }
pre [data-tok="keyword"] { color: #4A5D52 !important; font-weight: 600; }
pre [data-tok="string"] { color: #3D5046 !important; }
pre [data-tok="number"] { color: #B45309 !important; }
code { background: #EEF3F0; color: #3D5046; }
th { background: #4A5D52 !important; }
td { border-color: #E8E8E8; }
tbody tr:nth-child(even) td { background: #EEF3F0; }
hr { border-top: 1px solid #E8E8E8; width: 48%; margin-left: auto; margin-right: auto; }
a { color: #4A5D52 !important; }
strong { color: #2B2B2B !important; border-bottom: 1.5px solid #B5C8BC; font-weight: 500; }`
  },
  moyuTicket: {
    label: '摸鱼票据风',
    group: 'gzh',
    indent: false,
    headerBg: '#059669',
    h1Color: '#1a1a1a', h1Size: '22px',
    h2Color: '#059669', h2Size: '18px',
    h3Color: '#1a1a1a', h3Size: '16px',
    h4Color: '#888888', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* 摸鱼票据风 — gzh-design · 米黄纸感、硬阴影、撕票绿 */
#gs-preview { background: #fffef8 !important; color: #555555 !important; letter-spacing: 0.5px; }
p { font-size: 14px; line-height: 1.9; color: #555555; letter-spacing: 0.5px; }
h1 { font-size: 22px !important; font-weight: 900 !important; color: #1a1a1a !important; border: 2px solid #1a1a1a !important; border-left: 2px solid #1a1a1a !important; box-shadow: 4px 4px 0 #1a1a1a; padding: 12px 16px !important; background: #fffef8; margin: 24px 0 16px !important; }
h2 { font-size: 18px !important; font-weight: 800 !important; color: #059669 !important; border-left: none !important; padding-left: 0 !important; border-bottom: 2px dashed #A7F3D0; padding-bottom: 8px; }
h3 { font-size: 16px !important; font-weight: 700 !important; color: #1a1a1a !important; }
h4 { color: #888888 !important; }
blockquote { background: #F0FDF4; border: 2px solid #1a1a1a; border-left: 2px solid #1a1a1a; box-shadow: 3px 3px 0 #1a1a1a; color: #1a1a1a; border-radius: 0; padding: 14px 16px; }
pre { background: #fffef0 !important; border: 2px solid #1a1a1a !important; border-radius: 0 !important; box-shadow: 3px 3px 0 #1a1a1a !important; color: #1a1a1a !important; padding: 14px 16px !important; overflow-x: auto !important; overflow-y: hidden !important; white-space: pre !important; word-break: normal !important; }
pre code { color: #1a1a1a !important; background: transparent !important; }
pre [data-tok="base"] { color: #1a1a1a !important; }
pre [data-tok="comment"] { color: #059669 !important; }
pre [data-tok="keyword"] { color: #1a1a1a !important; font-weight: 800; }
pre [data-tok="string"] { color: #047857 !important; }
pre [data-tok="number"] { color: #CA8A04 !important; }
code { background: #ECFDF5; color: #047857; border: 1px solid #1a1a1a; border-radius: 0; }
th { background: #059669 !important; }
td { border-color: #1a1a1a; }
tbody tr:nth-child(even) td { background: #F0FDF4; }
table { border: 2px solid #1a1a1a; box-shadow: 3px 3px 0 #1a1a1a; }
hr { border-top: 2px dashed #A7F3D0; }
a { color: #059669 !important; }
strong { color: #1a1a1a !important; border-bottom: 2px solid #A7F3D0; font-weight: 600; }`
  },
  oliveJournal: {
    label: '橄榄手记',
    group: 'gzh',
    indent: false,
    headerBg: '#1e1f23',
    h1Color: '#23251d', h1Size: '22px',
    h2Color: '#23251d', h2Size: '18px',
    h3Color: '#ed7b2f', h3Size: '16px',
    h4Color: '#65675e', h4Size: '14px',
    font: FONT_SYSTEM,
    spacing: '1em',
    css: `/* 橄榄手记 — gzh-design · 内刊质感、墨黑+橙强调 */
#gs-preview { background: #fdfdf8 !important; color: #4d4f46 !important; }
p { font-size: 14px; line-height: 1.9; color: #4d4f46; }
h1 { font-size: 22px !important; font-weight: 800 !important; color: #23251d !important; border-left: 4px solid #1e1f23 !important; padding: 4px 0 10px 14px !important; border-bottom: 1px solid #bfc1b7 !important; letter-spacing: -0.5px; }
h2 { font-size: 18px !important; font-weight: 700 !important; color: #23251d !important; border-left: 3px solid #ed7b2f !important; padding-left: 12px !important; }
h3 { font-size: 16px !important; font-weight: 700 !important; color: #ed7b2f !important; }
h4 { color: #65675e !important; }
blockquote { background: #eeefe9; border-left: 4px solid #1e1f23; color: #4d4f46; border-radius: 0 6px 6px 0; }
pre { background: #f4f5ef !important; border: 1px solid #bfc1b7 !important; border-left: 4px solid #ed7b2f !important; border-radius: 6px !important; color: #23251d !important; padding: 14px 16px !important; overflow-x: auto !important; overflow-y: hidden !important; white-space: pre !important; word-break: normal !important; }
pre code { color: #23251d !important; background: transparent !important; }
pre [data-tok="base"] { color: #23251d !important; }
pre [data-tok="comment"] { color: #65675e !important; }
pre [data-tok="keyword"] { color: #1e1f23 !important; font-weight: 700; }
pre [data-tok="string"] { color: #ed7b2f !important; }
pre [data-tok="number"] { color: #c2410c !important; }
code { background: #e5e7e0; color: #23251d; border-radius: 3px; }
th { background: #1e1f23 !important; }
td { border-color: #bfc1b7; }
tbody tr:nth-child(even) td { background: #eeefe9; }
hr { border-top: 1px solid #bfc1b7; }
a { color: #ed7b2f !important; }
strong { color: #23251d !important; border-bottom: 2px solid #ed7b2f; font-weight: 600; }
img { border-radius: 6px !important; }`
  }
}

const BUILTIN_PREFIX = 'builtin:'

/* ===== 样式模板 ===== */
const TEMPLATES_KEY = 'gs_templates'
const CSS_KEY = 'gs_custom_css'

/** 把主题里的 `pre {}` / `p {}` 作用到 `#gs-preview`，避免被页面默认 `#gs-preview pre` 压过 */
function scopeThemeCssToPreview(css) {
  if (!css) return css
  return css.replace(/(^|})\s*([^{}@][^{]*?)\{/g, (match, brace, selectorList) => {
    const scoped = selectorList.split(',').map((raw) => {
      const sel = raw.trim()
      if (!sel) return sel
      if (sel.includes('#gs-preview')) return sel
      return `#gs-preview ${sel}`
    }).join(', ')
    return `${brace}\n${scoped} {`
  })
}

/** 科技感 CSS 底纹挂在预览外壳：外壳不滚动，内容区滚动，视觉上背景固定 */
function syncPreviewShellBackground(cssText) {
  if (!previewBox) return
  const css = cssText ?? (localStorage.getItem(CSS_KEY) || '')
  const toggle = $('gs-css-toggle')
  const enabled = !toggle || toggle.checked
  // 兼容旧主题 CSS 里残留的 png 标记
  const useTechBg = enabled && (
    css.includes(TECH_BG_MARKER) || css.includes('case_bg-a56a0b4b.png')
  )
  if (useTechBg) {
    previewBox.classList.add('gs-fixed-bg')
    applyTechBgStyle(previewBox)
  } else {
    previewBox.classList.remove('gs-fixed-bg')
    clearTechBgStyle(previewBox)
  }
}

function applyCustomCSSFromStorage() {
  const existing = document.getElementById('gs-custom-style')
  if (existing) existing.remove()
  const css = localStorage.getItem(CSS_KEY)
  const toggle = $('gs-css-toggle')
  if (!css || (toggle && !toggle.checked)) {
    syncPreviewShellBackground('')
    return
  }
  const style = document.createElement('style')
  style.id = 'gs-custom-style'
  style.textContent = scopeThemeCssToPreview(css)
  document.head.appendChild(style)
  syncPreviewShellBackground(css)
}

function loadTemplates() {
  try {
    const data = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}')
    const sel = $('gs-template')
    if (!sel) return
    sel.innerHTML = ''

    const placeholder = document.createElement('option')
    placeholder.value = ''
    placeholder.textContent = '样式模板'
    sel.appendChild(placeholder)

    const gzhGroup = document.createElement('optgroup')
    gzhGroup.label = '公众号主题'
    const otherGroup = document.createElement('optgroup')
    otherGroup.label = '内置风格'

    Object.entries(BUILTIN_TEMPLATES).forEach(([key, tpl]) => {
      const opt = document.createElement('option')
      opt.value = BUILTIN_PREFIX + key
      opt.textContent = tpl.label
      if (tpl.group === 'gzh') gzhGroup.appendChild(opt)
      else otherGroup.appendChild(opt)
    })
    if (gzhGroup.children.length) sel.appendChild(gzhGroup)
    if (otherGroup.children.length) sel.appendChild(otherGroup)

    const userEntries = Object.entries(data)
    if (userEntries.length) {
      const userGroup = document.createElement('optgroup')
      userGroup.label = '我的模板'
      userEntries.forEach(([name]) => {
        const opt = document.createElement('option')
        opt.value = name
        opt.textContent = name
        userGroup.appendChild(opt)
      })
      sel.appendChild(userGroup)
    }
  } catch (e) { /* ignore */ }
}

function saveTemplate(name, config) {
  try {
    const data = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}')
    data[name] = config
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(data))
    loadTemplates()
  } catch (e) { /* ignore */ }
}

function resolveTemplate(name) {
  if (name && name.startsWith(BUILTIN_PREFIX)) {
    return BUILTIN_TEMPLATES[name.slice(BUILTIN_PREFIX.length)] || null
  }
  try {
    const data = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}')
    return data[name] || null
  } catch (e) {
    return null
  }
}

function applyTemplate(name) {
  try {
    const tpl = resolveTemplate(name)
    if (!tpl) return

    if (tpl.indent !== undefined) indentCheckbox.checked = tpl.indent
    if (tpl.headerBg) headerBgPicker.value = tpl.headerBg
    if (tpl.h1Color) h1Color.value = tpl.h1Color
    if (tpl.h1Size) h1Size.value = tpl.h1Size
    if (tpl.h2Color) h2Color.value = tpl.h2Color
    if (tpl.h2Size) h2Size.value = tpl.h2Size
    if (tpl.h3Color) h3Color.value = tpl.h3Color
    if (tpl.h3Size) h3Size.value = tpl.h3Size
    if (tpl.h4Color) h4Color.value = tpl.h4Color
    if (tpl.h4Size) h4Size.value = tpl.h4Size

    const fontSel = $('gs-font-select')
    if (fontSel && tpl.font) {
      fontSel.value = tpl.font
      preview.style.fontFamily = tpl.font
    }
    const spacingSel = $('gs-p-spacing')
    if (spacingSel && tpl.spacing) {
      spacingSel.value = tpl.spacing
      preview.querySelectorAll('p').forEach(p => { p.style.marginBottom = tpl.spacing })
    }

    if (tpl.css) {
      localStorage.setItem(CSS_KEY, tpl.css)
      const toggle = $('gs-css-toggle')
      if (toggle) toggle.checked = true
      if ($('gs-css-editor')) $('gs-css-editor').value = tpl.css
      applyCustomCSSFromStorage()
    }

    headerBgPicker.dispatchEvent(new Event('input'))

    if (input.value.trim()) applyFormat()
  } catch (e) { /* ignore */ }
}

function deleteTemplate(name) {
  if (!name || name.startsWith(BUILTIN_PREFIX)) return
  try {
    const data = JSON.parse(localStorage.getItem(TEMPLATES_KEY) || '{}')
    delete data[name]
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(data))
    loadTemplates()
  } catch (e) { /* ignore */ }
}

/* ===== 草稿自动保存 ===== */
const DRAFT_KEY = 'WeChatFormatter_draft'
let saveDraftTimer = null
function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, input.value)
  } catch (e) { /* ignore */ }
}
function loadDraft() {
  try {
    let draft = localStorage.getItem(DRAFT_KEY)
    if (!draft) {
      const legacy = localStorage.getItem('geshifang_draft')
      if (legacy) {
        localStorage.setItem(DRAFT_KEY, legacy)
        draft = legacy
      }
    }
    if (draft && !input.value) {
      input.value = draft
    }
    updateStats()
    syncLineNumbers()
  } catch (e) { /* ignore */ }
}

/* ===== 核心排版 ===== */
async function updateModeBadge() {
  const badge = $('gs-mode-badge')
  if (!badge) return
  const { hasApiKey } = await import('./utils/deepseekClient.js')
  if (hasApiKey()) {
    badge.textContent = '本地排版 · AI 可用'
    badge.className = 'gs-badge-ai'
  } else {
    badge.textContent = '本地排版'
    badge.className = 'gs-badge-local'
  }
  badge.removeAttribute('style')
}

async function applyFormat() {
  try {
    let text = input.value
    if (!text.trim()) return

    const { preprocessText } = await import('./utils/textProcessor.js')
    text = preprocessText(text)

    await updateModeBadge()

    const { formatLocally } = await import('./utils/localFormatter.js?v=20260723g')
    const headerBg = headerBgPicker.value || '#1A3C6D'
    const h1c = h1Color.value
    const h1s = h1Size.value
    const h2c = h2Color.value
    const h2s = h2Size.value
    const h3c = h3Color.value
    const h3s = h3Size.value
    const h4c = h4Color.value
    const h4s = h4Size.value
    let result = formatLocally(text, headerBg, h1c, h1s, h2c, h2s, h3c, h3s, h4c, h4s)
    if (!result || !result.trim()) result = '<p>排版结果为空</p>'
    preview.innerHTML = injectStatsAfterTitle(result)

    // 公式等外链图预转 base64，复制到公众号时不再依赖第三方拉取
    if (window.__gsWechatCompat?.embedExternalImagesAsPng) {
      try {
        await window.__gsWechatCompat.embedExternalImagesAsPng(preview, { forWechat: false })
      } catch (err) {
        console.warn('公式图片内联失败', err)
      }
    }

    applyIndent()
    // 应用字体
    const fontSel = $('gs-font-select')
    if (fontSel && fontSel.value) preview.style.fontFamily = fontSel.value
    // 应用段间距
    const spacingSel = $('gs-p-spacing')
    if (spacingSel && spacingSel.value) {
      preview.querySelectorAll('p').forEach(p => p.style.marginBottom = spacingSel.value)
    }
    updateStats()
    saveDraft()
  } catch (e) {
    preview.innerHTML = `<p style="color:red;padding:12px;background:#FEE2E2;border-radius:6px;">排版出错：${e.message || e}</p>`
    console.error('排版错误', e)
  }
}

function applyIndent() {
  const enable = indentCheckbox.checked
  preview.querySelectorAll('p').forEach(p => {
    p.style.textIndent = enable ? '2em' : '0'
  })
}

/* ===== 撤销/重做（预览区） ===== */
function saveSnapshot() {
  undoStack.push(preview.innerHTML)
  redoStack = []
  if (undoStack.length > 50) undoStack.shift()
}

function undoRedoCmd(dir) {
  const src = dir === 'undo' ? undoStack : redoStack
  const dst = dir === 'undo' ? redoStack : undoStack
  if (!src.length) return
  dst.push(preview.innerHTML)
  preview.innerHTML = src.pop()
  applyIndent()
  preview.focus()
}

/* ===== Markdown 快捷插入 ===== */
function insertMarkdown(before, after) {
  const start = input.selectionStart, end = input.selectionEnd
  const selected = input.value.substring(start, end)
  const text = before + selected + after
  input.setRangeText(text, start, end, 'select')
  input.focus()
}

/* ===== 快捷键 ===== */
input.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault()
    const start = input.selectionStart, end = input.selectionEnd
    input.setRangeText('\t', start, end, 'end')
  }
  if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    applyFormat()
  }
})

const SENSITIVE_WORDS = [
  /fuck/gi, /shit/gi, /傻[逼B比]/g, /操你/g, /草你/g, /日你/g
]
const TYPO_MAP = {
  '吿': '告', '彳余': '行', '亻禺': '偶', '亻尔': '你',
  '丿': '', '丶': '', '扌足': '促',
}

function checkSensitive(text) {
  const found = []
  SENSITIVE_WORDS.forEach(re => {
    let m
    while ((m = re.exec(text)) !== null) {
      found.push(m[0])
    }
  })
  return found
}

function checkTypos(text) {
  let fixed = text
  let count = 0
  for (const [wrong, right] of Object.entries(TYPO_MAP)) {
    const re = new RegExp(wrong, 'g')
    if (re.test(fixed)) {
      fixed = fixed.replace(re, right)
      count++
    }
  }
  return { fixed, count }
}

async function applyFormatAndCheck() {
  await applyFormat()
  const text = input.value
  const sensitive = checkSensitive(text)
  const { fixed, count } = checkTypos(text)
  if (count > 0) {
    input.value = fixed
    const msg = document.createElement('div')
    msg.style.cssText = 'padding:8px 12px; margin:0 0 12px 0; background:#FEF3C7; border-left:4px solid #F59E0B; border-radius:4px; font-size:13px; color:#92400E;'
    msg.textContent = `已自动修正 ${count} 处常见错别字`
    preview.insertBefore(msg, preview.firstChild)
  }
  if (sensitive.length > 0) {
    const warn = document.createElement('div')
    warn.style.cssText = 'padding:8px 12px; margin:0 0 12px 0; background:#FEE2E2; border-left:4px solid #EF4444; border-radius:4px; font-size:13px; color:#991B1B;'
    warn.innerHTML = `<strong>⚠ 敏感词提醒：</strong>发现 ${sensitive.length} 处敏感词汇（${sensitive.join(', ')}），请检查后发布`
    preview.insertBefore(warn, preview.firstChild)
  }
}

/* ===== 导出 Markdown ===== */
function exportMarkdown() {
  let text = input.value
  const pasted = window.pastedImages || []
  for (let i = 0; i < pasted.length; i++) {
    if (pasted[i]) {
      text = text.replace(`![](pasted:${i})`, `![图片](${pasted[i]})`)
    }
  }
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'article.md'
  a.click()
  URL.revokeObjectURL(url)
}

/* ===== 导出长图 ===== */
function exportLongImage() {
  if (typeof html2canvas === 'undefined') {
    alert('html2canvas 尚未加载，请稍后重试')
    return
  }
  const clone = preview.cloneNode(true)
  clone.style.cssText = 'width:600px; padding:24px; background:#fff; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;'
  clone.style.position = 'absolute'
  clone.style.left = '-9999px'
  clone.style.top = '0'
  document.body.appendChild(clone)

  html2canvas(clone, {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: '#ffffff',
  }).then(canvas => {
    const link = document.createElement('a')
    link.download = 'article.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
    document.body.removeChild(clone)
  }).catch(err => {
    console.error(err)
    document.body.removeChild(clone)
    alert('导出失败: ' + err.message)
  })
}

/* ===== 历史版本 ===== */
const HISTORY_KEY = 'gs_history'
const MAX_HISTORY = 20
function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch (e) { return [] }
}
function saveToHistory(html) {
  try {
    const hist = loadHistory()
    hist.unshift({ html, time: Date.now() })
    if (hist.length > MAX_HISTORY) hist.length = MAX_HISTORY
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist))
    renderHistoryPanel()
  } catch (e) { /* ignore */ }
}
function renderHistoryPanel() {
  const panel = $('gs-history-panel')
  if (!panel) return
  const hist = loadHistory()
  if (!hist.length) { panel.innerHTML = '<p style="padding:12px;color:#999;font-size:13px;">暂无历史</p>'; return }
  panel.innerHTML = hist.map((item, i) => {
    const time = new Date(item.time).toLocaleString('zh-CN')
    return `<div class="gs-history-item" data-idx="${i}" style="padding:8px 12px;border-bottom:1px solid #E5E6EB;cursor:pointer;font-size:13px;">${time}</div>`
  }).join('')
  panel.querySelectorAll('.gs-history-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10)
      const hist = loadHistory()
      if (hist[idx]) {
        preview.innerHTML = hist[idx].html
        applyIndent()
      }
    })
  })
}

/* ===== 页面关闭前保存 ===== */
window.addEventListener('beforeunload', saveDraft)

/* ===== 事件绑定 ===== */
document.addEventListener('DOMContentLoaded', () => {
  loadDraft()
  loadTemplates()
  renderHistoryPanel()
  updateModeBadge()
  // 预加载复制模块，保证点击时同步可用（剪贴板需要用户手势）
  import('./utils/wechatCompat.js?v=20260723e').then((m) => { window.__gsWechatCompat = m }).catch(console.error)

  // 页脚
  const footer = $('gs-footer')
  const fc = window.GS_CONFIG?.footer
  if (fc && (fc.text || fc.creator || fc.license)) {
    const left = fc.text ? `<span>${fc.text}</span>` : ''
    let right = ''
    if (fc.creator) right += `${fc.creator.label} <a href="${fc.creator.url}" target="_blank" style="color:var(--primary-light);text-decoration:none;">${fc.creator.name}</a>`
    if (fc.creator && fc.license) right += ' · '
    if (fc.license) right += `<a href="${fc.license.url}" target="_blank" style="color:var(--primary-light);text-decoration:none;">${fc.license.name}</a>`
    const rightSpan = right ? `<span>${right}</span>` : ''
    footer.innerHTML = left + rightSpan
    footer.style.display = 'flex'
  } else {
    footer.style.display = 'none'
  }

  // 字数目标
  if ($('gs-target-input')) $('gs-target-input').addEventListener('input', updateStats)

  // 一键排版
  $('gs-format-btn').addEventListener('click', async () => {
    saveSnapshot()
    try {
      await applyFormatAndCheck()
    } catch (e) {
      preview.innerHTML = `<p style="color:red;padding:12px;background:#FEE2E2;border-radius:6px;">排版出错：${e.message || e}</p>`
      console.error(e)
    }
  })

  // 撤销
  $('gs-undo-btn').addEventListener('click', () => undoRedoCmd('undo'))
  $('gs-redo-btn').addEventListener('click', () => undoRedoCmd('redo'))

  // 首行缩进
  $('gs-indent-check').addEventListener('change', applyIndent)

  // 表头颜色（通过 formatLocally 传递）
  // (无需额外事件绑定)

  // 全屏
  $('gs-fullscreen-btn').addEventListener('click', () => {
    document.querySelector('main').classList.toggle('gs-fullscreen')
  })

  // 深色/浅色主题
  $('gs-theme-btn').addEventListener('click', () => {
    const html = document.documentElement
    html.classList.toggle('dark')
    localStorage.setItem('WeChatFormatter_theme', html.classList.contains('dark') ? 'dark' : 'light')
  })
  if (
    localStorage.getItem('WeChatFormatter_theme') === 'dark' ||
    localStorage.getItem('geshifang_theme') === 'dark'
  ) {
    document.documentElement.classList.add('dark')
  }

  // 手机预览
  $('gs-mobile-btn').addEventListener('click', () => {
    previewBox.classList.toggle('gs-mobile-preview')
  })

  // 导出按钮
  $('gs-export-btn').addEventListener('click', exportMarkdown)
  $('gs-export-img-btn')?.addEventListener('click', exportLongImage)

  // 历史
  $('gs-history-btn')?.addEventListener('click', () => {
    $('gs-history-panel').classList.toggle('gs-hidden')
  })

  // 插入图片
  $('gs-insert-image').addEventListener('click', () => {
    const url = prompt('输入图片 URL：')
    if (url) {
      saveSnapshot()
      preview.innerHTML += `<img src="${url}" style="max-width:100%;height:auto;display:block;margin:16px auto;border-radius:4px;" />`
    }
  })

  // 插入公式：mdEditor 风格面板，写入左侧 Markdown
  const MATH_TEMPLATES = {
    inline: { latex: '|', wrap: 'inline' },
    block: { latex: '|', wrap: 'display' },
    sup: { latex: '^{|}', wrap: 'inline' },
    sub: { latex: '_{|}', wrap: 'inline' },
    lparen: { latex: '(', wrap: 'inline' },
    rparen: { latex: ')', wrap: 'inline' },
    abs: { latex: '\\lvert |\\rvert', wrap: 'inline' },
    percent: { latex: '\\%', wrap: 'inline' },
    pow2: { latex: '|^{2}', wrap: 'inline' },
    pow3: { latex: '|^{3}', wrap: 'inline' },
    powy: { latex: 'x^{|}', wrap: 'inline' },
    exp: { latex: 'e^{|}', wrap: 'inline' },
    pow10: { latex: '10^{|}', wrap: 'inline' },
    recip: { latex: '\\dfrac{1}{|}', wrap: 'inline' },
    frac: { latex: '\\frac{|}{}', wrap: 'inline' },
    dfrac: { latex: '\\dfrac{|}{}', wrap: 'display' },
    sqrt: { latex: '\\sqrt{|}', wrap: 'inline' },
    cbrt: { latex: '\\sqrt[3]{|}', wrap: 'inline' },
    sqrtn: { latex: '\\sqrt[n]{|}', wrap: 'inline' },
    fact: { latex: '(|)!', wrap: 'inline' },
    sin: { latex: '\\sin(|)', wrap: 'inline' },
    cos: { latex: '\\cos(|)', wrap: 'inline' },
    tan: { latex: '\\tan(|)', wrap: 'inline' },
    ln: { latex: '\\ln(|)', wrap: 'inline' },
    log10: { latex: '\\log_{10}(|)', wrap: 'inline' },
    log: { latex: '\\log_{n}(|)', wrap: 'inline' },
    sinh: { latex: '\\sinh(|)', wrap: 'inline' },
    cosh: { latex: '\\cosh(|)', wrap: 'inline' },
    tanh: { latex: '\\tanh(|)', wrap: 'inline' },
    arcsin: { latex: '\\arcsin(|)', wrap: 'inline' },
    arccos: { latex: '\\arccos(|)', wrap: 'inline' },
    arctan: { latex: '\\arctan(|)', wrap: 'inline' },
    sum: { latex: '\\sum_{i=1}^{n} |', wrap: 'display' },
    prod: { latex: '\\prod_{i=1}^{n} |', wrap: 'display' },
    int: { latex: '\\int_{a}^{b} | \\, dx', wrap: 'display' },
    iint: { latex: '\\iint_{D} | \\, dA', wrap: 'display' },
    lim: { latex: '\\lim_{n \\to \\infty} |', wrap: 'display' },
    partial: { latex: '\\frac{\\partial |}{\\partial x}', wrap: 'inline' },
    cases: { latex: '\\begin{cases}\n  | \\\\\\\\\n  \n\\end{cases}', wrap: 'display' },
    aligned: { latex: '\\begin{aligned}\n  | &= \\\\\\\\\n   &= \n\\end{aligned}', wrap: 'display' },
    pmatrix: { latex: '\\begin{pmatrix}\n  a & b \\\\\\\\\n  c & d\n\\end{pmatrix}', wrap: 'display' },
    bmatrix: { latex: '\\begin{bmatrix}\n  a & b \\\\\\\\\n  c & d\n\\end{bmatrix}', wrap: 'display' },
    vmatrix: { latex: '\\begin{vmatrix}\n  a & b \\\\\\\\\n  c & d\n\\end{vmatrix}', wrap: 'display' },
    plus: { latex: '+', wrap: 'inline' },
    minus: { latex: '-', wrap: 'inline' },
    pm: { latex: '\\pm', wrap: 'inline' },
    times: { latex: '\\times', wrap: 'inline' },
    div: { latex: '\\div', wrap: 'inline' },
    cdot: { latex: '\\cdot', wrap: 'inline' },
    neq: { latex: '\\neq', wrap: 'inline' },
    leq: { latex: '\\leq', wrap: 'inline' },
    geq: { latex: '\\geq', wrap: 'inline' },
    approx: { latex: '\\approx', wrap: 'inline' },
    infty: { latex: '\\infty', wrap: 'inline' },
    rightarrow: { latex: '\\rightarrow', wrap: 'inline' },
    econst: { latex: 'e', wrap: 'inline' },
    alpha: { latex: '\\alpha', wrap: 'inline' },
    beta: { latex: '\\beta', wrap: 'inline' },
    theta: { latex: '\\theta', wrap: 'inline' },
    pi: { latex: '\\pi', wrap: 'inline' },
    delta: { latex: '\\Delta', wrap: 'inline' },
    omega: { latex: '\\omega', wrap: 'inline' },
    degree: { latex: '^{\\circ}', wrap: 'inline' },
    rectArea: { latex: 'S = ab', wrap: 'display' },
    triangleArea: { latex: 'S = \\dfrac{1}{2}ah', wrap: 'display' },
    circlePerimeter: { latex: 'C = 2\\pi r', wrap: 'display' },
    circleArea: { latex: 'S = \\pi r^{2}', wrap: 'display' },
    diffSquares: { latex: 'a^{2} - b^{2} = (a+b)(a-b)', wrap: 'display' },
    perfectSquare: { latex: '(a \\pm b)^{2} = a^{2} \\pm 2ab + b^{2}', wrap: 'display' },
    quadratic: { latex: 'x = \\dfrac{-b \\pm \\sqrt{b^{2}-4ac}}{2a}', wrap: 'display' },
    pythagorean: { latex: 'a^{2} + b^{2} = c^{2}', wrap: 'display' },
    linearFn: { latex: 'y = kx + b', wrap: 'display' },
    arithmetic: { latex: 'a_{n} = a_{1} + (n-1)d', wrap: 'display' },
    geometric: { latex: 'S_{n} = \\dfrac{a_{1}(1-q^{n})}{1-q}', wrap: 'display' },
    trigIdentity: { latex: '\\sin^{2}\\theta + \\cos^{2}\\theta = 1', wrap: 'display' },
    ellipse: { latex: '\\dfrac{x^{2}}{a^{2}} + \\dfrac{y^{2}}{b^{2}} = 1', wrap: 'display' },
    derivativeDef: { latex: 'f\'(x) = \\lim_{\\Delta x \\to 0} \\dfrac{f(x+\\Delta x)-f(x)}{\\Delta x}', wrap: 'display' }
  }

  function closeMathMenu() {
    const menu = $('gs-math-menu')
    if (menu) menu.hidden = true
  }

  function toggleMathMenu() {
    const menu = $('gs-math-menu')
    if (!menu) return
    menu.hidden = !menu.hidden
  }

  function insertMath(id) {
    const tpl = MATH_TEMPLATES[id]
    if (!tpl) return
    const start = input.selectionStart
    const end = input.selectionEnd
    const selected = input.value.slice(start, end)

    let latex = tpl.latex
    const mark = latex.indexOf('|')
    if (selected && mark >= 0) {
      latex = latex.slice(0, mark) + selected + latex.slice(mark + 1)
    } else {
      latex = latex.replace(/\|/g, '')
    }

    let prefix = ''
    let suffix = ''
    if (tpl.wrap === 'inline') {
      prefix = '$'
      suffix = '$'
    } else if (tpl.wrap === 'display') {
      prefix = '\n$$\n'
      suffix = '\n$$\n'
    }

    const insert = prefix + latex + suffix
    let cursorPos
    if (selected && mark >= 0) {
      cursorPos = start + prefix.length + mark + selected.length
    } else if (mark >= 0) {
      cursorPos = start + prefix.length + mark
    } else {
      cursorPos = start + insert.length
    }

    input.setRangeText(insert, start, end, 'end')
    input.setSelectionRange(cursorPos, cursorPos)
    input.focus()
    input.dispatchEvent(new Event('input', { bubbles: true }))
    closeMathMenu()
  }

  $('gs-insert-formula')?.addEventListener('click', (e) => {
    e.stopPropagation()
    toggleMathMenu()
  })
  $('gs-math-menu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-math]')
    if (!btn) return
    e.preventDefault()
    insertMath(btn.getAttribute('data-math'))
  })
  document.addEventListener('click', (e) => {
    const wrap = $('gs-math-dropdown')
    if (wrap && !wrap.contains(e.target)) closeMathMenu()
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMathMenu()
  })

  // Markdown 快捷插入
  $('gs-md-bold')?.addEventListener('click', () => insertMarkdown('**', '**'))
  $('gs-md-italic')?.addEventListener('click', () => insertMarkdown('*', '*'))
  $('gs-md-color-btn')?.addEventListener('click', () => {
    const color = ($('gs-md-color')?.value || '#E53E3E').toUpperCase()
    insertMarkdown(`{${color}}`, '{/#}')
  })
  $('gs-md-highlight')?.addEventListener('click', () => insertMarkdown('==', '=='))
  $('gs-md-link')?.addEventListener('click', () => insertMarkdown('[', '](url)'))
  $('gs-md-quote')?.addEventListener('click', () => {
    const start = input.selectionStart
    const sel = input.value.substring(input.selectionStart, input.selectionEnd)
    const lines = sel.split('\n').map(l => '> ' + l).join('\n')
    input.setRangeText(lines, start, input.selectionEnd, 'select')
    input.focus()
  })
  $('gs-md-img')?.addEventListener('click', () => {
    const url = prompt('输入图片 URL：')
    if (url) {
      insertMarkdown(`![`, `](${url})`)
    }
  })

  // 模板
  $('gs-template')?.addEventListener('change', function () {
    if (this.value) applyTemplate(this.value)
  })
  $('gs-save-template')?.addEventListener('click', () => {
    const name = prompt('样式模板名称：')
    if (name) {
      saveTemplate(name, {
        indent: indentCheckbox.checked,
        headerBg: headerBgPicker.value,
        h1Color: h1Color.value,
        h1Size: h1Size.value,
        h2Color: h2Color.value,
        h2Size: h2Size.value,
        h3Color: h3Color.value,
        h3Size: h3Size.value,
        h4Color: h4Color.value,
        h4Size: h4Size.value,
        font: $('gs-font-select')?.value || FONT_SYSTEM,
        spacing: $('gs-p-spacing')?.value || '1em',
        css: localStorage.getItem(CSS_KEY) || '',
      })
    }
  })
  $('gs-template')?.addEventListener('contextmenu', function (e) {
    e.preventDefault()
    if (!this.value) return
    if (this.value.startsWith(BUILTIN_PREFIX)) {
      alert('内置风格不可删除')
      return
    }
    if (confirm(`删除模板「${this.value}」？`)) {
      deleteTemplate(this.value)
      this.value = ''
    }
  })

  // 复制到公众号（富文本）
  $('gs-copy-btn')?.addEventListener('click', () => copyToWechat('gs-copy-btn'))

  // 字体选择
  $('gs-font-select')?.addEventListener('change', function () {
    preview.style.fontFamily = this.value
  })

  // 段间距
  $('gs-p-spacing')?.addEventListener('change', function () {
    preview.querySelectorAll('p').forEach(p => p.style.marginBottom = this.value)
  })

  // 拖入 .md 文件
  input.addEventListener('dragover', e => { e.preventDefault(); input.style.outline = '2px dashed var(--primary-light)' })
  input.addEventListener('dragleave', () => { input.style.outline = 'none' })
  input.addEventListener('drop', e => {
    e.preventDefault()
    input.style.outline = 'none'
    const file = e.dataTransfer.files[0]
    if (!file || !file.name.endsWith('.md')) { alert('请拖入 .md 文件'); return }
    const reader = new FileReader()
    reader.onload = () => { input.value = reader.result; updateStats() }
    reader.readAsText(file, 'utf-8')
  })

  // 自定义 CSS
  const CSS_PRESETS = {
    colorui: {
      label: BUILTIN_TEMPLATES.colorui.label,
      css: BUILTIN_TEMPLATES.colorui.css
    },
    tech: {
      label: '🚀 ' + BUILTIN_TEMPLATES.tech.label,
      css: BUILTIN_TEMPLATES.tech.css
    },
    classical: {
      label: '🏮 ' + BUILTIN_TEMPLATES.classical.label,
      css: BUILTIN_TEMPLATES.classical.css
    },
    ink: {
      label: '✒️ ' + BUILTIN_TEMPLATES.ink.label,
      css: BUILTIN_TEMPLATES.ink.css
    },
    cyber: {
      label: '💜 ' + BUILTIN_TEMPLATES.cyber.label,
      css: BUILTIN_TEMPLATES.cyber.css
    },
    dark: {
      label: '🌙 ' + BUILTIN_TEMPLATES.dark.label,
      css: BUILTIN_TEMPLATES.dark.css
    },
    moyuGreen: {
      label: '📗 ' + BUILTIN_TEMPLATES.moyuGreen.label,
      css: BUILTIN_TEMPLATES.moyuGreen.css
    },
    redWhite: {
      label: '📕 ' + BUILTIN_TEMPLATES.redWhite.label,
      css: BUILTIN_TEMPLATES.redWhite.css
    },
    graphiteMinimal: {
      label: '📓 ' + BUILTIN_TEMPLATES.graphiteMinimal.label,
      css: BUILTIN_TEMPLATES.graphiteMinimal.css
    },
    zenWhitespace: {
      label: '🤍 ' + BUILTIN_TEMPLATES.zenWhitespace.label,
      css: BUILTIN_TEMPLATES.zenWhitespace.css
    },
    moyuTicket: {
      label: '🎫 ' + BUILTIN_TEMPLATES.moyuTicket.label,
      css: BUILTIN_TEMPLATES.moyuTicket.css
    },
    oliveJournal: {
      label: '🫒 ' + BUILTIN_TEMPLATES.oliveJournal.label,
      css: BUILTIN_TEMPLATES.oliveJournal.css
    },
    simple: {
      label: '🌿 简约留白',
      css: `/* 简约留白 — 干净、透气、文字为主 */
p { font-size: 16px; line-height: 2; color: #333; }
h1 { font-size: 24px; font-weight: 700; color: #1A1A2E; border-left: none; padding-left: 0; border-bottom: 2px solid #1A1A2E; padding-bottom: 10px; margin-bottom: 20px; }
h2 { font-size: 20px; font-weight: 600; color: #1A1A2E; border-left: none; padding-left: 0; margin-top: 28px; }
h3 { font-size: 17px; font-weight: 600; color: #555; }
blockquote { background: #F9F9FB; border-left: 3px solid #CCC; border-radius: 0; color: #666; }
pre { border-radius: 8px; background: #F5F5F7; }
code { background: #F0F0F2; color: #D63384; }
table { font-size: 14px; }
th { background: #1A1A2E !important; }
hr { border-top: 1px solid #EEE; }`
    },
    warm: {
      label: '☀️ 暖阳橙调',
      css: `/* 暖阳橙调 — 温暖、亲和、活力 */
p { font-size: 15px; line-height: 1.9; color: #3D2E1E; }
h1 { font-size: 24px; font-weight: 700; color: #C75B12; border-left: 5px solid #E8831A; padding-left: 14px; border-bottom: none; }
h2 { font-size: 19px; font-weight: 600; color: #D4731E; border-left: 4px solid #F0A347; padding-left: 12px; }
h3 { font-size: 16px; font-weight: 600; color: #A65D1A; }
blockquote { background: #FEF7EE; border-left: 4px solid #E8831A; color: #7A5A3A; border-radius: 0 8px 8px 0; }
pre { background: #FDF6ED; border: 1px solid #F0DCC8; border-radius: 8px; }
code { background: #FDF0E0; color: #C75B12; }
th { background: #E8831A !important; }
td { border-color: #F0DCC8; }
tbody tr:nth-child(even) td { background: #FEF7EE; }
hr { border-top: 2px solid #F0A347; }`
    },
    forest: {
      label: '🌲 森林绿意',
      css: `/* 森林绿意 — 自然、沉稳、舒适 */
p { font-size: 15px; line-height: 1.9; color: #2D3A2D; }
h1 { font-size: 23px; font-weight: 700; color: #2D5A2D; border-left: 4px solid #4A8C5C; padding-left: 14px; border-bottom: 1px solid #C8DCC8; }
h2 { font-size: 19px; font-weight: 600; color: #3A7040; border-left: 3px solid #6BAF7A; padding-left: 10px; }
h3 { font-size: 16px; font-weight: 600; color: #4A7A50; }
blockquote { background: #F2F8F2; border-left: 4px solid #6BAF7A; color: #4A6A4A; border-radius: 0 8px 8px 0; }
pre { background: #F0F7F0; border: 1px solid #C8DCC8; border-radius: 8px; }
code { background: #E8F0E8; color: #2D6A3A; }
th { background: #4A8C5C !important; }
td { border-color: #C8DCC8; }
tbody tr:nth-child(even) td { background: #F5FAF5; }
hr { border-top: 1px solid #C8DCC8; }
a { color: #3A8C4A !important; }`
    },
    twilight: {
      label: '🌆 暮色紫调',
      css: `/* 暮色紫调 — 优雅、深邃、浪漫 */
p { font-size: 15px; line-height: 1.9; color: #2E2437; }
h1 { font-size: 23px; font-weight: 700; color: #5B3A7A; border-left: 4px solid #8B5CF6; padding-left: 14px; border-bottom: 1px solid #D8CCE8; }
h2 { font-size: 19px; font-weight: 600; color: #6B4A8A; border-left: 3px solid #A78BFA; padding-left: 10px; }
h3 { font-size: 16px; font-weight: 600; color: #7B5A9A; }
blockquote { background: #F6F2FA; border-left: 4px solid #A78BFA; color: #5A4A6A; border-radius: 0 8px 8px 0; }
pre { background: #F4F0F8; border: 1px solid #D8CCE8; border-radius: 8px; }
code { background: #EEE8F4; color: #7B3A9A; }
th { background: #7B4A9A !important; }
td { border-color: #D8CCE8; }
tbody tr:nth-child(even) td { background: #F8F4FC; }
hr { border-top: 1px solid #D8CCE8; }
a { color: #7B3A9A !important; }`
    },
    ocean: {
      label: '🌊 海洋蓝调',
      css: `/* 海洋蓝调 — 冷静、专业、信赖 */
p { font-size: 15px; line-height: 1.9; color: #1A2A3A; }
h1 { font-size: 23px; font-weight: 700; color: #1A5276; border-left: 4px solid #2E86C1; padding-left: 14px; border-bottom: 1px solid #AED6F1; }
h2 { font-size: 19px; font-weight: 600; color: #2E6A9A; border-left: 3px solid #5DADE2; padding-left: 10px; }
h3 { font-size: 16px; font-weight: 600; color: #3A7AAA; }
blockquote { background: #EBF5FB; border-left: 4px solid #5DADE2; color: #3A5A7A; border-radius: 0 8px 8px 0; }
pre { background: #F0F7FC; border: 1px solid #AED6F1; border-radius: 8px; }
code { background: #E8F0F8; color: #1A6AAA; }
th { background: #2E86C1 !important; }
td { border-color: #AED6F1; }
tbody tr:nth-child(even) td { background: #F2F8FD; }
hr { border-top: 1px solid #AED6F1; }
a { color: #1A6AAA !important; }`
    },
    chinese: {
      label: '🏮 国风典雅',
      css: BUILTIN_TEMPLATES.classical.css
    },
    morandi: {
      label: '🎨 柔和莫兰迪',
      css: `/* 柔和莫兰迪 — 低饱和度、克制、高级感 */
p { font-size: 15px; line-height: 2; color: #4A4A5A; }
h1 { font-size: 22px; font-weight: 600; color: #6B6B7B; border-left: 4px solid #B8B8C8; padding-left: 14px; border-bottom: 1px solid #D8D8E2; }
h2 { font-size: 18px; font-weight: 500; color: #7A7A8A; border-left: 3px solid #C8C8D8; padding-left: 10px; }
h3 { font-size: 16px; font-weight: 500; color: #8A8A9A; }
blockquote { background: #F0F0F5; border-left: 4px solid #C8C8D8; color: #6A6A7A; border-radius: 0 8px 8px 0; }
pre { background: #F2F2F7; border: 1px solid #DDDDE5; border-radius: 8px; }
code { background: #ECECF2; color: #8A6A8A; }
th { background: #8A8A9A !important; }
td { border-color: #DDDDE5; }
tbody tr:nth-child(even) td { background: #F5F5FA; }
hr { border-top: 1px solid #DDDDE5; }
a { color: #8A7A8A !important; }`
    },
    code: {
      label: '💻 代码舒适',
      css: `/* 代码舒适 — 代码块暖深灰白字、阅读友好 */
pre { background: #2B2D3E !important; border: 1px solid #3A3D52; border-radius: 8px; padding: 16px 20px !important; }
pre code { color: #E4E4E8 !important; background: transparent !important; font-size: 13px; line-height: 1.7; }
code { background: #EEEEF4; color: #C43E5A; padding: 2px 7px; border-radius: 4px; font-size: 0.9em; }
p code { background: #F0F0F6; color: #C43E5A; }
h1 code, h2 code, h3 code, h4 code { background: #EEEEF4; color: #C43E5A; }
li code { background: #EEEEF4; color: #C43E5A; }
td code { background: #EEEEF4; color: #C43E5A; }
p { font-size: 15px; line-height: 1.9; color: #2E2E3E; }
h1 { font-size: 22px; font-weight: 700; color: #3A3A4E; border-left: 4px solid #7C7CA8; padding-left: 14px; border-bottom: 1px solid #D8D8E4; }
h2 { font-size: 18px; font-weight: 600; color: #4A4A5E; border-left: 3px solid #9494BA; padding-left: 10px; }
h3 { font-size: 16px; font-weight: 600; color: #5A5A6E; }
blockquote { background: #F4F4F8; border-left: 4px solid #9494BA; color: #5A5A6A; border-radius: 0 8px 8px 0; }
th { background: #4A4A5E !important; color: #F0F0F6 !important; }
td { border-color: #D8D8E4; }
tbody tr:nth-child(even) td { background: #F6F6FA; }
hr { border-top: 1px solid #D8D8E4; }
a { color: #5A6AAA !important; }`
    }
  }

  function applyCustomCSS() {
    applyCustomCSSFromStorage()
  }

  function loadCSSEditor() {
    const saved = localStorage.getItem(CSS_KEY) || ''
    if ($('gs-css-editor')) $('gs-css-editor').value = saved
    applyCustomCSS()
  }

  function populateCSSPresets() {
    const sel = $('gs-css-preset')
    if (!sel) return
    sel.innerHTML = '<option value="">— 从预设模板开始 —</option>'
    for (const [key, preset] of Object.entries(CSS_PRESETS)) {
      const opt = document.createElement('option')
      opt.value = key
      opt.textContent = preset.label
      sel.appendChild(opt)
    }
  }

  // 预设选择 → 填充编辑器
  $('gs-css-preset')?.addEventListener('change', function () {
    const preset = CSS_PRESETS[this.value]
    if (preset && $('gs-css-editor')) {
      $('gs-css-editor').value = preset.css
    }
  })

  $('gs-css-btn')?.addEventListener('click', () => {
    $('gs-css-modal')?.classList.remove('gs-hidden')
    populateCSSPresets()
    loadCSSEditor()
  })
  $('gs-css-close')?.addEventListener('click', () => {
    $('gs-css-modal')?.classList.add('gs-hidden')
  })
  $('gs-css-save')?.addEventListener('click', () => {
    const css = $('gs-css-editor')?.value || ''
    localStorage.setItem(CSS_KEY, css)
    applyCustomCSS()
    $('gs-css-modal')?.classList.add('gs-hidden')
  })
  $('gs-css-reset')?.addEventListener('click', () => {
    localStorage.removeItem(CSS_KEY)
    if ($('gs-css-editor')) $('gs-css-editor').value = ''
    if ($('gs-css-preset')) $('gs-css-preset').value = ''
    applyCustomCSS()
    $('gs-css-status').textContent = '已恢复默认'
    setTimeout(() => $('gs-css-status').textContent = '', 2000)
  })
  $('gs-css-toggle')?.addEventListener('change', applyCustomCSS)

  // 预览内容变化时重新应用自定义 CSS
  new MutationObserver(() => applyCustomCSS()).observe(preview, { childList: true, subtree: true, attributes: false })

  loadCSSEditor()

  // Ctrl+F 搜索
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      const bar = $('gs-search-bar')
      if (bar) {
        e.preventDefault()
        bar.classList.toggle('gs-hidden')
        if (!bar.classList.contains('gs-hidden')) {
          $('gs-search-input')?.focus()
        }
      }
    }
    if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault()
      $('gs-shortcuts-modal')?.classList.toggle('gs-hidden')
    }
    if (e.key === 'Escape') {
      if ($('gs-help-modal') && !$('gs-help-modal').classList.contains('gs-hidden')) {
        closeHelp()
        return
      }
      $('gs-shortcuts-modal')?.classList.add('gs-hidden')
      $('gs-css-modal')?.classList.add('gs-hidden')
      $('gs-history-panel')?.classList.add('gs-hidden')
      $('gs-draft-modal')?.classList.add('gs-hidden')
      $('gs-ai-modal')?.classList.add('gs-hidden')
      $('gs-api-config-modal')?.classList.add('gs-hidden')
      $('gs-shortcut-settings-modal')?.classList.add('gs-hidden')
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.target.id === 'gs-preview') {
      e.preventDefault()
      undoRedoCmd('undo')
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z')) && e.target.id === 'gs-preview') {
      e.preventDefault()
      undoRedoCmd('redo')
    }
  })

  // 搜索替换
  $('gs-search-input')?.addEventListener('input', function () {
    const q = this.value.toLowerCase()
    const text = preview.textContent.toLowerCase()
    let idx = text.indexOf(q)
    if (idx >= 0) {
      window._gsSearchIdx = idx
      window._gsSearchTerm = q
    }
  })
  $('gs-search-prev')?.addEventListener('click', () => {
    const q = window._gsSearchTerm
    if (!q) return
    const text = preview.textContent.toLowerCase()
    let idx = text.lastIndexOf(q, (window._gsSearchIdx || 0) - 1)
    if (idx < 0) idx = text.lastIndexOf(q)
    if (idx >= 0) {
      window._gsSearchIdx = idx
      preview.focus()
    }
  })
  $('gs-search-next')?.addEventListener('click', () => {
    const q = window._gsSearchTerm
    if (!q) return
    const text = preview.textContent.toLowerCase()
    let idx = text.indexOf(q, (window._gsSearchIdx || 0) + 1)
    if (idx < 0) idx = text.indexOf(q)
    if (idx >= 0) {
      window._gsSearchIdx = idx
      preview.focus()
    }
  })
  $('gs-search-replace')?.addEventListener('click', () => {
    const from = $('gs-search-input')?.value
    const to = $('gs-search-replace-input')?.value
    if (from && to && confirm(`将所有「${from}」替换为「${to}」？`)) {
      input.value = input.value.split(from).join(to)
    }
  })

  // 导入 .md 文件
  $('gs-import-btn')?.addEventListener('click', () => $('gs-file-input')?.click())
  $('gs-file-input')?.addEventListener('change', e => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => { input.value = reader.result; updateStats(); syncLineNumbers() }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  })

  // 生成目录
  $('gs-toc-btn')?.addEventListener('click', generateTOC)

  // 草稿管理
  $('gs-draft-btn')?.addEventListener('click', () => {
    renderDraftList()
    $('#gs-draft-modal')?.classList.toggle('gs-hidden')
  })
  $('gs-draft-save')?.addEventListener('click', () => {
    const name = $('#gs-draft-name')?.value?.trim()
    if (!name) { alert('请输入草稿名称'); return }
    const drafts = loadDrafts()
    drafts[name] = input.value
    saveDrafts(drafts)
    $('#gs-draft-name').value = ''
    renderDraftList()
    alert('草稿已保存')
  })
  $('gs-draft-close')?.addEventListener('click', () => $('#gs-draft-modal')?.classList.add('gs-hidden'))

  // AI API 配置弹窗
  async function openApiConfigModal() {
    const { getAiApiConfig } = await import('./config/apiConfig.js')
    const cfg = getAiApiConfig()
    if ($('gs-api-key')) $('gs-api-key').value = cfg.apiKey || ''
    if ($('gs-api-model')) $('gs-api-model').value = cfg.model || ''
    if ($('gs-api-url')) $('gs-api-url').value = cfg.apiUrl || ''
    if ($('gs-api-config-status')) $('gs-api-config-status').textContent = ''
    $('gs-api-config-modal')?.classList.remove('gs-hidden')
  }

  function closeApiConfigModal() {
    $('gs-api-config-modal')?.classList.add('gs-hidden')
  }

  $('gs-api-config-btn')?.addEventListener('click', () => openApiConfigModal())
  $('gs-help-api-config')?.addEventListener('click', () => {
    closeHelp()
    openApiConfigModal()
  })
  $('gs-api-config-close')?.addEventListener('click', closeApiConfigModal)
  $('gs-api-config-modal')?.addEventListener('click', e => {
    if (e.target === $('gs-api-config-modal')) closeApiConfigModal()
  })
  $('gs-api-config-save')?.addEventListener('click', async () => {
    const { saveAiApiConfig } = await import('./config/apiConfig.js')
    saveAiApiConfig({
      apiKey: $('gs-api-key')?.value || '',
      model: $('gs-api-model')?.value || '',
      apiUrl: $('gs-api-url')?.value || '',
    })
    if ($('gs-api-config-status')) $('gs-api-config-status').textContent = '已保存到本机'
    await updateModeBadge()
    setTimeout(() => {
      if ($('gs-api-config-status')) $('gs-api-config-status').textContent = ''
    }, 2000)
  })
  $('gs-api-config-clear')?.addEventListener('click', async () => {
    if (!confirm('确定清除本机已保存的 API 配置？')) return
    const { clearAiApiConfig } = await import('./config/apiConfig.js')
    const cfg = clearAiApiConfig()
    if ($('gs-api-key')) $('gs-api-key').value = ''
    if ($('gs-api-model')) $('gs-api-model').value = cfg.model
    if ($('gs-api-url')) $('gs-api-url').value = cfg.apiUrl
    if ($('gs-api-config-status')) $('gs-api-config-status').textContent = '已清除'
    await updateModeBadge()
  })
  $('gs-ai-open-api-config')?.addEventListener('click', () => {
    $('gs-ai-modal')?.classList.add('gs-hidden')
    openApiConfigModal()
  })

  // AI 辅助
  $('gs-ai-btn')?.addEventListener('click', async () => {
    const { hasApiKey } = await import('./utils/deepseekClient.js')
    if (!hasApiKey()) {
      if (confirm('尚未配置 API Key。是否现在打开「API 配置」？')) {
        openApiConfigModal()
      }
      return
    }
    let sel = window.getSelection()?.toString() || ''
    if (!sel && input.selectionStart !== input.selectionEnd) {
      sel = input.value.substring(input.selectionStart, input.selectionEnd)
    }
    const sourceEl = $('gs-ai-source')
    if (sourceEl) sourceEl.value = sel
    $('gs-ai-result').value = ''
    $('gs-ai-modal')?.classList.remove('gs-hidden')
  })
  $('gs-ai-go')?.addEventListener('click', async () => {
    const text = $('#gs-ai-source')?.value?.trim()
    if (!text) { alert('请输入待处理的文字'); return }
    const action = $('#gs-ai-action')?.value || 'polish'
    const btn = $('gs-ai-go')
    const orig = btn.textContent
    btn.textContent = '处理中...'
    btn.disabled = true
    try {
      const result = await aiRewrite(text, action)
      if ($('gs-ai-result')) $('gs-ai-result').value = result
    } catch (e) {
      if ($('gs-ai-result')) $('gs-ai-result').value = '错误：' + e.message
    } finally {
      btn.textContent = orig
      btn.disabled = false
    }
  })
  $('gs-ai-apply')?.addEventListener('click', () => applyAiResultToEditor())
  $('gs-ai-close')?.addEventListener('click', () => $('#gs-ai-modal')?.classList.add('gs-hidden'))

  // 导出 HTML / 复制到公众号
  $('gs-html-btn')?.addEventListener('click', exportHTML)
  $('gs-html-copy-btn')?.addEventListener('click', () => copyToWechat('gs-html-copy-btn'))

  // 复制纯文本
  $('gs-text-copy-btn')?.addEventListener('click', copyPlainText)

  // 模板导出/导入
  $('gs-template-export-btn')?.addEventListener('click', () => {
    const choice = confirm('确定 → 导出模板\n取消 → 导入模板')
    if (choice) exportTemplates()
    else importTemplates()
  })

  // 快捷键设置
  $('gs-shortcut-settings-btn')?.addEventListener('click', () => {
    const list = $('#gs-shortcut-list')
    if (!list) return
    const defaultShortcuts = [
      { id: 'format', label: '一键排版', key: 's', ctrl: true },
      { id: 'search', label: '搜索/替换', key: 'f', ctrl: true },
      { id: 'undo', label: '撤销（预览区）', key: 'z', ctrl: true },
      { id: 'redo', label: '重做（预览区）', key: 'y', ctrl: true },
      { id: 'shortcuts', label: '快捷键面板', key: '?', ctrl: false },
    ]
    const custom = JSON.parse(localStorage.getItem('gs_custom_shortcuts') || '{}')
    list.innerHTML = defaultShortcuts.map(sc => {
      const k = custom[sc.id] || sc.key
      const ctrl = sc.ctrl
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
        <span>${sc.label}</span>
        <span style="display:flex;align-items:center;gap:6px;">
          <kbd class="gs-kbd" data-id="${sc.id}" style="background:var(--surface-hover);border:1px solid var(--border);border-radius:4px;padding:2px 10px;font-size:12px;cursor:pointer;">${ctrl ? 'Ctrl+' : ''}${k.toUpperCase()}</kbd>
          <button class="gs-shortcut-reset" data-id="${sc.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:11px;">重置</button>
        </span>
      </div>`
    }).join('')
    list.querySelectorAll('.gs-kbd').forEach(el => {
      el.addEventListener('click', function () {
        const id = this.dataset.id
        this.textContent = '按键...'
        const handler = e => {
          e.preventDefault()
          const key = e.key === 'Escape' ? 'Esc' : e.key
          this.textContent = (e.ctrlKey || e.metaKey ? 'Ctrl+' : '') + key.toUpperCase()
          const custom = JSON.parse(localStorage.getItem('gs_custom_shortcuts') || '{}')
          custom[id] = key
          if (e.ctrlKey || e.metaKey) custom[id + '_ctrl'] = true
          localStorage.setItem('gs_custom_shortcuts', JSON.stringify(custom))
          document.removeEventListener('keydown', handler)
        }
        document.addEventListener('keydown', handler)
      })
    })
    list.querySelectorAll('.gs-shortcut-reset').forEach(btn => {
      btn.addEventListener('click', function () {
        const id = this.dataset.id
        const custom = JSON.parse(localStorage.getItem('gs_custom_shortcuts') || '{}')
        delete custom[id]; delete custom[id + '_ctrl']
        localStorage.setItem('gs_custom_shortcuts', JSON.stringify(custom))
        $('gs-shortcut-settings-btn')?.click()
      })
    })
    $('#gs-shortcut-settings-modal')?.classList.remove('gs-hidden')
  })
  $('gs-shortcut-settings-close')?.addEventListener('click', () => $('#gs-shortcut-settings-modal')?.classList.add('gs-hidden'))

  // 输入监听
  input.addEventListener('input', () => {
    updateStats()
    syncLineNumbers()
    clearTimeout(saveDraftTimer)
    saveDraftTimer = setTimeout(saveDraft, 500)
  })
})

/* ===== 粘贴图片 / Excel 表格 ===== */
input.addEventListener('paste', function (e) {
  const items = e.clipboardData?.items
  if (!items) return

  const images = []
  const texts = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      images.push(item)
    } else if (item.type === 'text/plain') {
      texts.push(item)
    }
  }

  // 图片粘贴
  if (images.length > 0) {
    let allImg = true
    for (const item of items) {
      if (!item.type.startsWith('image/')) { allImg = false; break }
    }
    if (!allImg) return

    e.preventDefault()
    if (!window.pastedImages) window.pastedImages = []
    images.forEach(item => {
      const blob = item.getAsFile()
      if (!blob) return
      const idx = window.pastedImages.length
      window.pastedImages.push(null)
      const placeholder = `\n![](pasted:${idx})\n`
      input.setRangeText(placeholder, input.selectionStart, input.selectionEnd, 'end')

      const reader = new FileReader()
      reader.onload = () => {
        window.pastedImages[idx] = reader.result
        preview.innerHTML += `<img src="${reader.result}" style="max-width:100%;height:auto;display:block;margin:16px auto;border-radius:4px;" />`
      }
      reader.readAsDataURL(blob)
    })
  }

  // Excel 表格粘贴
  for (const item of items) {
    if (item.type === 'text/plain') {
      item.getAsString(text => {
        if (text.includes('\t') && (text.includes('\r') || text.includes('\n'))) {
          e.preventDefault()
          const rows = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(r => r.trim())
          if (rows.length < 2) return
          const cols = rows[0].split('\t').length
          const markdown = rows.map((r, i) => {
            const cells = r.split('\t')
            if (cells.length < cols) cells.push(...Array(cols - cells.length).fill(''))
            const line = '| ' + cells.join(' | ') + ' |'
            return i === 1 ? line + '\n' + rows.map((_, j) => '|' + ' ---'.repeat(cols) + ' |').join('\n') : line
          }).join('\n')
          input.setRangeText(markdown, input.selectionStart, input.selectionEnd, 'end')
        }
      })
      break
    }
  }
})

/* ===== 使用帮助：首次打开自动弹出 ===== */
$('gs-help-btn')?.addEventListener('click', openHelp)
$('gs-help-close')?.addEventListener('click', closeHelp)
$('gs-help-close-x')?.addEventListener('click', closeHelp)
$('gs-help-modal')?.addEventListener('click', e => {
  if (e.target === $('gs-help-modal')) closeHelp()
})
if (!localStorage.getItem(HELP_SHOWN_KEY)) {
  openHelp()
}
