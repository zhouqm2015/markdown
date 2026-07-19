import { highlightCodeToHtml } from './codeHighlight.js'

const CODE_FENCE_RE = /^```(\w*)$/
const CODE_INDENT_RE = /^(?:\t|    )/
const IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
const H1_RE = /^(?:[一二三四五六七八九十]+[、.．]|#\s+|##\s+|第[一二三四五六七八九十]+[章节篇部分])\s*(.+)$/
const H2_RE = /^(?:[（(][一二三四五六七八九十]+[)）]|##\s+|###\s+)\s*(.+)$/
const H3_RE = /^(?:[【［][^】］]+[】］]|###\s+|####\s+)\s*(.+)$/
const H4_RE = /^(?:####\s+|#####\s+)(.+)$/
const HR_RE = /^-{3,}$/
const TASK_RE = /^[-*]\s+\[([ x])\]\s+(.+)$/
const OL_RE = /^\d+[.．、]\s+(.+)$/
const UL_RE = /^[-*•●]\s+(.+)$/
const BQ_RE = /^>\s?(.+)$/
const BOLD_RE = /\*\*(.+?)\*\*/g
const BOLD_US_RE = /__(.+?)__/g
const ITALIC_RE = /\*([^*]+?)\*/g
const ITALIC_US_RE = /(^|[^\w])_([^_]+?)_([^\w]|$)/g
const STRIKE_RE = /~~(.+?)~~/g
const INLINE_CODE_RE = /`([^`]+)`/g
const LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g

const COLOR_NAMED = {
  '红': '#E53E3E', '红色': '#E53E3E',
  '橙': '#DD6B20', '橙色': '#DD6B20',
  '黄': '#D69E2E', '黄色': '#D69E2E',
  '绿': '#38A169', '绿色': '#38A169',
  '青': '#319795', '青色': '#319795',
  '蓝': '#3182CE', '蓝色': '#3182CE',
  '紫': '#805AD5', '紫色': '#805AD5',
  '粉': '#D53F8C', '粉色': '#D53F8C',
  '灰': '#718096', '灰色': '#718096',
  '黑': '#1A202C', '黑色': '#1A202C',
  '白': '#FFFFFF', '白色': '#FFFFFF',
}

const P_STYLE = 'font-size:15px; line-height:1.8; margin:0 0 1em 0;'
const BQ_STYLE = 'background:#F7F8FA; border-left:4px solid #2B6CB0; padding:12px 16px; margin:16px 0; border-radius:0 6px 6px 0; font-size:15px; line-height:1.8;'
const UL_STYLE = 'padding-left:1.5em; margin:12px 0; font-size:15px; line-height:1.8;'
const OL_STYLE = 'padding-left:1.5em; margin:12px 0; font-size:15px; line-height:1.8;'
const LI_STYLE = 'margin-bottom:6px;'
const TABLE_STYLE = 'width:100%; border-collapse:separate; border-spacing:0; border:1px solid #E5E6EB; border-radius:6px; overflow:hidden; margin:16px 0; font-size:14px; line-height:1.6;'
const TH_STYLE = 'font-weight:600; padding:10px 14px; text-align:left; border-right:1px solid rgba(255,255,255,0.15);'
const TD_STYLE = 'padding:10px 14px; border:1px solid #E5E6EB;'
// 不写死 background/color，交给主题 CSS（#gs-preview pre），复制时才能带上各风格差异
const CODE_BLOCK_STYLE = 'border-radius:6px; padding:14px 16px; margin:16px 0; font-size:13px; line-height:1.7; overflow-x:auto; overflow-y:hidden; white-space:pre; word-break:normal; overflow-wrap:normal; font-family:"JetBrains Mono","Fira Code","Consolas",monospace;'

/** 公众号粘贴保样式：文字须包在 span[leaf] 内 */
function leaf(inner) {
  return `<span leaf="">${inner}</span>`
}

const BOLD_PH = '\u0000BLD\u0000'
const ITALIC_PH = '\u0000ITA\u0000'
const BOLD_PH_RE = /\u0000BLD\u0000/g
const ITALIC_PH_RE = /\u0000ITA\u0000/g

/** 先加粗后斜体，避免 * 与 ** 互相干扰 */
function renderEmphasis(text) {
  const bolds = []
  const italics = []

  let out = text.replace(BOLD_RE, (_, t) => {
    bolds.push(t)
    return BOLD_PH
  })
  out = out.replace(BOLD_US_RE, (_, t) => {
    bolds.push(t)
    return BOLD_PH
  })
  out = out.replace(ITALIC_RE, (_, t) => {
    italics.push(t)
    return ITALIC_PH
  })
  out = out.replace(ITALIC_US_RE, (_, pre, t, post) => {
    italics.push(t)
    return pre + ITALIC_PH + post
  })

  let bi = 0, ii = 0
  out = out.replace(ITALIC_PH_RE, () =>
    `<em style="font-style:italic;">${italics[ii++]}</em>`
  )
  out = out.replace(BOLD_PH_RE, () =>
    `<strong style="font-weight:700;">${bolds[bi++]}</strong>`
  )
  return out
}

function renderStrike(text) {
  return text.replace(STRIKE_RE, '<s style="text-decoration:line-through; color:#999;">$1</s>')
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }
  return text.replace(/[&<>"']/g, m => map[m])
}

const IMG_STYLE = 'max-width:100%; height:auto; display:block; margin:16px auto; border-radius:4px;'
const CODE_STYLE = 'background:#F0F1F3; color:#E53E3E; padding:1px 5px; border-radius:3px; font-size:0.9em; font-family:"JetBrains Mono","Fira Code","Consolas",monospace;'
const IMG_PH = '\u0000IMG\u0000'
const CODE_PH = '\u0000COD\u0000'
const LINK_PH = '\u0000LNK\u0000'
const IMG_PH_RE = /\u0000IMG\u0000/g
const CODE_PH_RE = /\u0000COD\u0000/g
const LINK_PH_RE = /\u0000LNK\u0000/g
const COLOR_PH_RE = /\u0000CLR(\d+)\u0000/g

const COLOR_NAME_ALT = '红|橙|黄|绿|青|蓝|紫|粉|灰|黑|白|红色|橙色|黄色|绿色|青色|蓝色|紫色|粉色|灰色|黑色|白色'
const COLOR_OPEN_HEX_RE = /^\{#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\}/
const COLOR_OPEN_NAME_RE = new RegExp(`^\\{(${COLOR_NAME_ALT})\\}`)
const COLOR_CLOSE_RE = new RegExp(`^\\{/#\\}|^\\{/\\}|^\\{/(?:${COLOR_NAME_ALT})\\}`)

/**
 * 栈式解析颜色/高亮，支持嵌套：
 * {#F90606}相机的{#0643F9}最小距离{/#}限制{/#}
 * 未闭合的颜色在末尾自动闭合。
 */
function extractColors(text, colors) {
  let i = 0

  function flushText(buf, segments) {
    if (buf.value) {
      segments.push({ type: 'text', value: buf.value })
      buf.value = ''
    }
  }

  function parseSegments(stopOnClose) {
    const segments = []
    const buf = { value: '' }

    while (i < text.length) {
      if (stopOnClose && COLOR_CLOSE_RE.test(text.slice(i))) break

      // ==高亮==
      if (text.startsWith('==', i)) {
        const end = text.indexOf('==', i + 2)
        if (end !== -1) {
          flushText(buf, segments)
          const idx = colors.length
          colors.push({
            bg: '#FDE68A',
            segments: [{ type: 'text', value: text.slice(i + 2, end) }],
          })
          segments.push({ type: 'color', index: idx })
          i = end + 2
          continue
        }
      }

      // {#RRGGBB}
      const hexM = text.slice(i).match(COLOR_OPEN_HEX_RE)
      if (hexM) {
        flushText(buf, segments)
        i += hexM[0].length
        const child = parseSegments(true)
        if (COLOR_CLOSE_RE.test(text.slice(i))) {
          const closeM = text.slice(i).match(COLOR_CLOSE_RE)
          i += closeM[0].length
        }
        const idx = colors.length
        colors.push({ color: '#' + hexM[1], segments: child })
        segments.push({ type: 'color', index: idx })
        continue
      }

      // {红} / {红色}
      const nameM = text.slice(i).match(COLOR_OPEN_NAME_RE)
      if (nameM) {
        flushText(buf, segments)
        i += nameM[0].length
        const child = parseSegments(true)
        if (COLOR_CLOSE_RE.test(text.slice(i))) {
          const closeM = text.slice(i).match(COLOR_CLOSE_RE)
          i += closeM[0].length
        }
        const idx = colors.length
        colors.push({ color: COLOR_NAMED[nameM[1]] || '#E53E3E', segments: child })
        segments.push({ type: 'color', index: idx })
        continue
      }

      buf.value += text[i]
      i += 1
    }

    flushText(buf, segments)
    return segments
  }

  const top = parseSegments(false)
  let out = ''
  for (const seg of top) {
    if (seg.type === 'text') out += seg.value
    else out += `\u0000CLR${seg.index}\u0000`
  }
  return out
}

function extractAll(text) {
  const images = [], codes = [], links = [], colors = []
  // 先抽出代码，避免着色语法吃进代码
  let t = text.replace(INLINE_CODE_RE, (m, c) => { codes.push(c); return CODE_PH })
  t = extractColors(t, colors)
  t = t.replace(IMG_RE, (m, alt, src) => { images.push({ alt, src }); return IMG_PH })
  t = t.replace(LINK_RE, (m, text, href) => { links.push({ text, href }); return LINK_PH })
  return { text: t, images, codes, links, colors }
}

function renderColoredInner(raw) {
  const escaped = escapeHtml(raw)
  return renderStrike(renderEmphasis(escaped))
}

function renderColorEntry(c, colors) {
  if (!c) return ''
  const segs = c.segments || [{ type: 'text', value: c.text || '' }]
  const inner = segs.map(seg => {
    if (seg.type === 'text') return renderColoredInner(seg.value)
    return renderColorEntry(colors[seg.index], colors)
  }).join('')
  if (c.bg) {
    return `<span style="background:${c.bg};padding:1px 4px;border-radius:2px;">${inner}</span>`
  }
  return `<span style="color:${c.color};">${inner}</span>`
}

function restoreAll(text, images, codes, links, colors) {
  let li = 0, ii = 0, ci = 0
  const withColors = text.replace(COLOR_PH_RE, (_, idx) =>
    renderColorEntry(colors[parseInt(idx, 10)], colors)
  )
  const withLinks = withColors.replace(LINK_PH_RE, () => {
    const link = links[li++]
    return `<a href="${escapeHtml(link.href)}" style="color:#2B6CB0;text-decoration:underline;">${renderEmphasis(escapeHtml(link.text))}</a>`
  })
  const withCode = withLinks.replace(CODE_PH_RE, () => `<code style="${CODE_STYLE}">${escapeHtml(codes[ci++])}</code>`)
  return withCode.replace(IMG_PH_RE, () => {
    const img = images[ii++]
    let src = img.src
    const m = src.match(/^pasted:(\d+)$/)
    if (m && window.pastedImages && window.pastedImages[parseInt(m[1])]) {
      src = window.pastedImages[parseInt(m[1])]
    }
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(img.alt)}" style="${IMG_STYLE}" />`
  })
}

function renderInline(text) {
  const { text: extracted, images, codes, links, colors } = extractAll(text)
  const escaped = escapeHtml(extracted)
  const emphasized = renderEmphasis(escaped)
  const striked = renderStrike(emphasized)
  return restoreAll(striked, images, codes, links, colors)
}

function isTableRow(line) {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 2
}

function isTableSep(line) {
  const cells = line.trim().split('|').filter(c => c.trim())
  return cells.length > 0 && cells.every(c => /^[\s:-]+$/.test(c))
}

function parseTableRow(line) {
  return line.trim().split('|').filter(c => c.trim()).map(c => c.trim())
}

function renderTable(rows, sepIndex, headerBg) {
  const headerCells = parseTableRow(rows[0])
  const bodyRows = rows.slice(sepIndex + 1)

  let html = `<section style="overflow-x:auto; -webkit-overflow-scrolling:touch;"><table style="${TABLE_STYLE}"><thead style="background:${headerBg}; color:#FFFFFF;"><tr>`
  headerCells.forEach((cell, i) => {
    const style = i < headerCells.length - 1 ? TH_STYLE : TH_STYLE.replace(' border-right:1px solid rgba(255,255,255,0.15);', '')
    html += `<th style="${style}">${leaf(renderInline(cell))}</th>`
  })
  html += '</tr></thead><tbody>'
  bodyRows.forEach((row, ri) => {
    const cells = parseTableRow(row)
    const bg = ri % 2 === 0 ? '#FFFFFF' : '#F7F8FA'
    html += `<tr style="background:${bg};">`
    cells.forEach(cell => {
      html += `<td style="${TD_STYLE}">${leaf(renderInline(cell))}</td>`
    })
    html += '</tr>'
  })
  html += '</tbody></table></section>'
  return html
}

function getIndent(line) {
  const m = line.match(/^([\t ]*)/)
  if (!m) return 0
  const raw = m[1]
  return raw.replace(/\t/g, '  ').length
}

function classifyLine(line) {
  const trimmed = line.trim()
  if (!trimmed) return { type: 'empty' }

  let m
  if (HR_RE.test(trimmed)) return { type: 'hr' }
  if (m = trimmed.match(H1_RE)) return { type: 'h1', text: m[1].trim() }
  if (m = trimmed.match(H2_RE)) return { type: 'h2', text: m[1].trim() }
  if (m = trimmed.match(H3_RE)) return { type: 'h3', text: m[1].trim() }
  if (m = trimmed.match(H4_RE)) return { type: 'h4', text: m[1].trim() }
  if (m = trimmed.match(TASK_RE)) return { type: 'task', checked: m[1] === 'x', text: m[2].trim() }
  if (m = trimmed.match(OL_RE)) return { type: 'ol', text: m[1].trim() }
  if (m = trimmed.match(UL_RE)) return { type: 'ul', text: m[1].trim() }
  if (m = trimmed.match(BQ_RE)) return { type: 'bq', text: m[1].trim() }
  if (/^!\[.*\]\(.+\)$/.test(trimmed)) return { type: 'img', text: trimmed }

  return { type: 'p', text: trimmed }
}

function isListType(t) {
  return t === 'ol' || t === 'ul' || t === 'task'
}

export function formatLocally(rawText, headerBgColor = '#1A3C6D', h1Color = '#1A3C6D', h1Size = '22px', h2Color = '#2B6CB0', h2Size = '18px', h3Color = '#1A3C6D', h3Size = '16px', h4Color = '#666', h4Size = '15px') {
  if (!rawText || typeof rawText !== 'string') return ''

  // 标题只写结构色；边框/字体细节由主题 CSS（#gs-custom-style）覆盖，复制时从预览烘焙
  const H1 = `font-size:${h1Size}; font-weight:700; color:${h1Color}; padding:4px 0 8px 12px; margin:24px 0 12px 0; line-height:1.6;`
  const H2 = `font-size:${h2Size}; font-weight:600; color:${h2Color}; padding-left:10px; margin:20px 0 10px 0; line-height:1.6;`
  const H3 = `font-size:${h3Size}; font-weight:600; color:${h3Color}; margin:16px 0 8px 0; line-height:1.6;`
  const H4 = `font-size:${h4Size}; font-weight:600; color:${h4Color}; margin:14px 0 6px 0; line-height:1.6;`

  const lines = rawText.split('\n')
  const parts = []
  let inCodeBlock = false
  let codeBuffer = []
  let codeLang = ''
  let inTable = false
  let tableRows = []
  let tableSepIndex = -1
  let inIndentCode = false
  let indentCodeBuffer = []
  let listStack = []
  let listIndentBase = -1

  function renderListItem(text, type, checked) {
    if (type === 'raw') return text
    const inner = leaf(renderInline(text))
    if (type === 'task') {
      const chk = checked ? 'checked' : ''
      return `<li style="${LI_STYLE}display:flex;align-items:flex-start;gap:6px;"><input type="checkbox" ${chk} disabled style="margin-top:0.35em;flex-shrink:0;" /> <span>${inner}</span></li>`
    }
    return `<li style="${LI_STYLE}">${inner}</li>`
  }

  function flushListStack() {
    if (!listStack.length) return
    function renderLevel(level) {
      if (level >= listStack.length) return ''
      const l = listStack[level]
      const tag = l.tag
      const style = tag === 'ol' ? OL_STYLE : UL_STYLE
      const margin = level === 0 ? 'margin:12px 0;' : 'margin:0;'
      let html = `<${tag} style="${style}${margin}">`
      for (const item of l.items) {
        html += renderListItem(item.text, item.type, item.checked)
      }
      html += renderLevel(level + 1)
      html += `</${tag}>`
      return html
    }
    parts.push(renderLevel(0))
    listStack = []
    listIndentBase = -1
  }

  function flushCodeBlock() {
    if (!codeBuffer.length) return
    const code = codeBuffer.join('\n')
    // 语法着色写进 inline style，预览与复制到公众号颜色一致
    parts.push(`<pre style="${CODE_BLOCK_STYLE}"><code style="background:transparent;padding:0;color:inherit;">${highlightCodeToHtml(code, '#F3F4F6')}</code></pre>`)
    codeBuffer = []
    codeLang = ''
  }

  function flushTable() {
    if (!tableRows.length) return
    if (tableSepIndex >= 0) {
      parts.push(renderTable(tableRows, tableSepIndex, headerBgColor))
    }
    tableRows = []
    tableSepIndex = -1
  }

  function flushIndentCode() {
    if (!indentCodeBuffer.length) return
    const code = indentCodeBuffer.map(l => l.replace(/^(?:\t|    )/, '')).join('\n')
    parts.push(`<pre style="${CODE_BLOCK_STYLE}"><code style="background:transparent;padding:0;color:inherit;">${highlightCodeToHtml(code, '#F3F4F6')}</code></pre>`)
    indentCodeBuffer = []
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(CODE_FENCE_RE)

    if (fence) {
      if (inCodeBlock) {
        flushCodeBlock()
        inCodeBlock = false
      } else {
        flushListStack()
        flushTable()
        inCodeBlock = true
        codeLang = fence[1]
      }
      continue
    }

    if (inCodeBlock) {
      codeBuffer.push(line)
      continue
    }

    if (isTableRow(line) || (inTable && !line.trim())) {
      if (!inTable && isTableRow(line)) {
        flushListStack()
        inTable = true
        tableRows = []
        tableSepIndex = -1
      }
      if (!line.trim()) {
        flushTable()
        inTable = false
        continue
      }
      tableRows.push(line)
      if (isTableSep(line)) {
        tableSepIndex = tableRows.length - 1
      }
      const nextLine2 = i + 1 < lines.length ? lines[i + 1] : ''
      if (!nextLine2.trim() || !isTableRow(nextLine2)) {
        flushTable()
        inTable = false
      }
      continue
    }

    flushTable()

    if (CODE_INDENT_RE.test(line)) {
      if (!inIndentCode) {
        flushListStack()
        inIndentCode = true
        indentCodeBuffer = []
      }
      indentCodeBuffer.push(line)
      const nextLine3 = i + 1 < lines.length ? lines[i + 1] : ''
      if (nextLine3.trim() && !CODE_INDENT_RE.test(nextLine3)) {
        flushIndentCode()
        inIndentCode = false
      }
      continue
    }
    if (inIndentCode) {
      if (!line.trim()) {
        indentCodeBuffer.push(line)
        continue
      }
      flushIndentCode()
      inIndentCode = false
    }

    const c = classifyLine(line)
    const nextLine = i + 1 < lines.length ? lines[i + 1] : ''
    const nextC = classifyLine(nextLine)

    if (c.type === 'empty') {
      flushListStack()
      continue
    }

    if (c.type === 'hr') {
      flushListStack()
      parts.push('<hr style="border:none;border-top:1px solid #E5E6EB;margin:20px 0;" />')
      continue
    }

    if (isListType(c.type)) {
      const indent = getIndent(line)
      if (listIndentBase < 0) listIndentBase = indent

      const level = Math.round((indent - listIndentBase) / 2)
      if (level < 0) {
        flushListStack()
        listIndentBase = indent
      }

      const listTag = c.type === 'ol' ? 'ol' : 'ul'

      // Ensure stack has enough levels
      while (listStack.length <= level) {
        listStack.push({ tag: listStack.length > 0 ? listStack[listStack.length - 1].tag : listTag, items: [] })
      }
      // Trim excess levels
      if (listStack.length > level + 1) {
        listStack.length = level + 1
      }

      // If type changed at same level, flush and restart
      if (listStack[level].tag !== listTag && listStack[level].items.length > 0) {
        flushListStack()
        listIndentBase = indent
        while (listStack.length <= level) {
          listStack.push({ tag: listTag, items: [] })
        }
      }

      listStack[level].items.push({ text: c.text, type: c.type === 'task' ? 'task' : listTag, checked: c.checked })

      // If next line is non-list non-empty, flush
      if (!isListType(nextC.type) && nextC.type !== 'empty') {
        flushListStack()
      }
      continue
    }

    flushListStack()

    if (c.type === 'h1') {
      parts.push(`<h1 style="${H1}">${leaf(renderInline(c.text))}</h1>`)
    } else if (c.type === 'h2') {
      parts.push(`<h2 style="${H2}">${leaf(renderInline(c.text))}</h2>`)
    } else if (c.type === 'h3') {
      parts.push(`<h3 style="${H3}">${leaf(renderInline(c.text))}</h3>`)
    } else if (c.type === 'h4') {
      parts.push(`<h4 style="${H4}">${leaf(renderInline(c.text))}</h4>`)
    } else if (c.type === 'bq') {
      parts.push(`<blockquote style="${BQ_STYLE}">${leaf(renderInline(c.text))}</blockquote>`)
    } else if (c.type === 'img') {
      parts.push(renderInline(c.text))
    } else if (c.type === 'p') {
      parts.push(`<p style="${P_STYLE}">${leaf(renderInline(c.text))}</p>`)
    }
  }

  flushListStack()
  flushCodeBlock()
  flushTable()
  flushIndentCode()

  // 不再包 max-width/margin:auto 外层：预览区居中会算出巨大的 margin-left，
  // 烘焙进公众号后左侧出现大块空白。容器交给 #gs-preview / 复制时的 wrapper。
  return parts.join('\n')
}
