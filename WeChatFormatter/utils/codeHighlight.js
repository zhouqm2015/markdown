/**
 * 代码块简易语法着色（注释 / 字符串 / 关键字 / 数字）。
 * 供预览排版与公众号复制共用，保证两边颜色一致。
 */

function parseColorToRgb(input) {
  if (!input) return null
  const s = String(input).trim().toLowerCase()
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (m) {
    let h = m[1]
    if (h.length === 3) h = h.split('').map((c) => c + c).join('')
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    }
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/)
  if (m) return { r: +m[1], g: +m[2], b: +m[3] }
  return null
}

function luminance(rgb) {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
}

/** 按代码块背景选择配色（浅底深蓝字+天蓝注释，深底浅字） */
export function codePaletteForBackground(bg) {
  const rgb = parseColorToRgb(bg)
  const dark = rgb ? luminance(rgb) <= 0.55 : false
  if (dark) {
    return {
      base: '#CDD6F4',
      comment: '#89DCEB',
      keyword: '#CBA6F7',
      string: '#A6E3A1',
      number: '#FAB387',
    }
  }
  // 与常见公众号浅色代码块预览一致：正文深蓝、注释天蓝
  return {
    base: '#1E3A5F',
    comment: '#0EA5E9',
    keyword: '#1D4ED8',
    string: '#059669',
    number: '#C2410C',
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const KEYWORD_RE = /^(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|class|extends|new|this|super|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|void|null|undefined|true|false|public|private|protected|static|interface|type|enum|implements|package|yield|delete|with|debugger)\b/

/**
 * 将一行代码拆成带颜色的 token 列表
 * @returns {{ text: string, color: string, tok: string }[]}
 */
export function tokenizeCodeLine(line, palette) {
  const p = palette || codePaletteForBackground('#F3F4F6')
  const runs = []
  let i = 0

  const push = (text, color, tok) => {
    if (!text) return
    // 合并同色相邻段
    const last = runs[runs.length - 1]
    if (last && last.color === color && last.tok === tok) last.text += text
    else runs.push({ text, color, tok })
  }

  while (i < line.length) {
    // 行注释 //
    if (line[i] === '/' && line[i + 1] === '/') {
      push(line.slice(i), p.comment, 'comment')
      break
    }
    // 块注释开头 /* ... */（单行内）
    if (line[i] === '/' && line[i + 1] === '*') {
      const end = line.indexOf('*/', i + 2)
      if (end === -1) {
        push(line.slice(i), p.comment, 'comment')
        break
      }
      push(line.slice(i, end + 2), p.comment, 'comment')
      i = end + 2
      continue
    }
    // 字符串 '...' "..." `...`
    const q = line[i]
    if (q === "'" || q === '"' || q === '`') {
      let j = i + 1
      while (j < line.length) {
        if (line[j] === '\\') { j += 2; continue }
        if (line[j] === q) { j += 1; break }
        j += 1
      }
      push(line.slice(i, j), p.string, 'string')
      i = j
      continue
    }
    // 数字
    if (/[0-9]/.test(line[i]) && (i === 0 || /[^\w$]/.test(line[i - 1]))) {
      let j = i
      while (j < line.length && /[0-9_]/.test(line[j])) j += 1
      if (line[j] === '.' && /[0-9]/.test(line[j + 1])) {
        j += 1
        while (j < line.length && /[0-9_]/.test(line[j])) j += 1
      }
      push(line.slice(i, j), p.number, 'number')
      i = j
      continue
    }
    // 关键字 / 标识符
    if (/[A-Za-z_$]/.test(line[i])) {
      let j = i
      while (j < line.length && /[\w$]/.test(line[j])) j += 1
      const word = line.slice(i, j)
      if (KEYWORD_RE.test(word)) push(word, p.keyword, 'keyword')
      else push(word, p.base, 'base')
      i = j
      continue
    }
    // 其它符号
    push(line[i], p.base, 'base')
    i += 1
  }

  return runs.length ? runs : [{ text: '', color: p.base, tok: 'base' }]
}

/**
 * 行首缩进：tab→2 空格；也识别全角空格/nbsp（预览高亮后再复制时行首已是全角）。
 * - fullwidth：预览用（<pre> 内）
 * - spaces：公众号用（改成 padding-left，因行首空白字符常被吃掉导致缩进错乱）
 */
function measureLineIndent(line) {
  const m = String(line).match(/^([ \t\u00a0\u3000]*)(.*)$/)
  if (!m) return { indent: '', spaces: 0, rest: line }
  const expanded = m[1]
    .replace(/\t/g, '  ')
    .replace(/\u3000/g, ' ')
    .replace(/\u00a0/g, ' ')
  return {
    spaces: expanded.length,
    indent: expanded.replace(/ /g, '　'),
    rest: m[2],
  }
}

/** 预览用：整段代码 → 多行 HTML（style > leaf）
 *  必须用真实换行 \\n 连接（放在 <pre> 内会保留），不要用 <br>——
 *  否则 textContent 读不到换行，复制到公众号会黏成一行。
 */
export function highlightCodeToHtml(code, background) {
  const palette = codePaletteForBackground(background || '#F3F4F6')
  const lines = String(code).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return lines.map((line) => {
    const { indent, rest } = measureLineIndent(line)
    const runs = tokenizeCodeLine(rest, palette)
    const parts = []
    if (indent) {
      parts.push(`<span style="color:${palette.base};" data-tok="base"><span leaf="">${indent}</span></span>`)
    }
    if (!rest) {
      if (!indent) parts.push(`<span style="color:${palette.base};"><span leaf=""> </span></span>`)
      return parts.join('')
    }
    runs.forEach((r) => {
      parts.push(
        `<span style="color:${r.color};" data-tok="${r.tok}"><span leaf="">${escapeHtml(r.text)}</span></span>`
      )
    })
    return parts.join('')
  }).join('\n')
}

/**
 * 公众号用：按行返回 runs + 缩进空格数（缩进用 padding-left，不写行首空白字符）
 * @returns {{ indentSpaces: number, runs: { text: string, color: string }[] }[]}
 */
export function highlightCodeToLines(code, background) {
  const palette = codePaletteForBackground(background || '#F3F4F6')
  const lines = String(code).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return lines.map((line) => {
    const { spaces, rest } = measureLineIndent(line)
    const runs = []
    if (rest) {
      tokenizeCodeLine(rest, palette).forEach((r) => {
        runs.push({ text: r.text, color: r.color })
      })
    } else {
      runs.push({ text: '', color: palette.base })
    }
    return { indentSpaces: spaces, runs }
  })
}
