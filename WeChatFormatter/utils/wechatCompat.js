/**
 * 微信公众号兼容复制。
 *
 * 关键（与 gzh-design 产物一致）：
 * 1. 只用 section / p / span / img / table 等安全标签
 * 2. 样式在外层 span，文字在内层 <span leaf="">…</span>
 * 3. 样式全部内联；边框必须用「有则写边、无则 none」，否则公众号会画出灰色鬼框
 * 4. 主题样式从真实预览 getComputedStyle 烘焙，默认值不得覆盖主题
 * 5. 用 copy 事件 + clipboardData.setData('text/html') 写入剪贴板
 */

import { highlightCodeToLines } from './codeHighlight.js'
import { TECH_BG_MARKER, TECH_BG_COLOR, getTechBgWechatCss } from './techBg.js'

/** 从 pre 取纯文本，把 <br> 还原成 \\n（textContent 会丢掉 br 换行） */
function getPrePlainText(pre) {
  const clone = pre.cloneNode(true)
  clone.querySelectorAll('br').forEach((br) => {
    br.replaceWith(document.createTextNode('\n'))
  })
  // 块级子节点之间补换行，防止被拼行
  clone.querySelectorAll('p,div,section').forEach((el) => {
    if (el.nextSibling) el.after(document.createTextNode('\n'))
  })
  return (clone.textContent || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 从真实预览 pre 提取带主题色的代码行（读 getComputedStyle，含 [data-tok] 主题覆盖）
 * @returns {{ indentSpaces: number, runs: { text: string, color: string }[] }[]}
 */
function extractCodeLinesFromSourcePre(pre) {
  const lines = []
  let runs = []

  const pushRun = (text, color) => {
    if (!text) return
    const last = runs[runs.length - 1]
    if (last && last.color === color) last.text += text
    else runs.push({ text, color })
  }

  const flush = () => {
    const plain = runs.map((r) => r.text).join('')
    const m = plain.match(/^([ \t\u00a0\u3000]*)([\s\S]*)$/)
    const indentChars = m ? m[1] : ''
    const spaces = indentChars
      .replace(/\t/g, '  ')
      .replace(/\u3000/g, ' ')
      .replace(/\u00a0/g, ' ').length
    let toStrip = indentChars.length
    const newRuns = []
    for (const r of runs) {
      let t = r.text
      if (toStrip > 0) {
        if (t.length <= toStrip) {
          toStrip -= t.length
          continue
        }
        t = t.slice(toStrip)
        toStrip = 0
      }
      if (t) newRuns.push({ text: t, color: r.color })
    }
    lines.push({
      indentSpaces: spaces,
      runs: newRuns.length ? newRuns : [{ text: '', color: '#333333' }],
    })
    runs = []
  }

  const walk = (node) => {
    if (node.nodeType === 3) {
      const parent = node.parentElement
      const color = parent ? window.getComputedStyle(parent).color : '#333333'
      const parts = String(node.textContent || '').split('\n')
      parts.forEach((part, i) => {
        pushRun(part, color)
        if (i < parts.length - 1) flush()
      })
      return
    }
    if (node.nodeType === 1) {
      if (node.tagName === 'BR') {
        flush()
        return
      }
      Array.from(node.childNodes).forEach(walk)
    }
  }

  walk(pre)
  if (runs.length) flush()
  return lines.length ? lines : [{ indentSpaces: 0, runs: [{ text: '', color: '#333333' }] }]
}

const SKIP_STYLE_TAGS = new Set(['BR', 'IMG', 'HR', 'COL', 'COLGROUP'])
const SKIP_BAKE_TAGS = new Set(['SPAN', 'STRONG', 'B', 'EM', 'I', 'S', 'DEL', 'A'])
/** 这些标签不烘焙边框，避免公众号出现莫名灰框 */
const SKIP_BORDER_BAKE = new Set(['P', 'LI', 'UL', 'OL', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'S', 'DEL', 'A', 'BR', 'IMG'])
const BLOCK_TAGS = new Set([
  'P', 'SECTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH', 'DIV',
])

const BAKE_PROPS = [
  'color', 'background-color', 'background-image',
  'font-size', 'font-weight', 'font-family', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-indent',
  // 故意不烘焙 margin-left/right、width、max-width：
  // 预览区 margin:auto 居中会变成上百 px 的 margin-left，公众号左侧就会空一大块
  'margin-top', 'margin-bottom',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'border-radius', 'box-shadow',
  'overflow', 'overflow-x', 'white-space', 'vertical-align',
]

function cssTextOf(el) {
  return (el.getAttribute('style') || '').trim()
}

function parseStyleMap(styleText) {
  const map = new Map()
  if (!styleText) return map
  styleText.split(';').forEach((chunk) => {
    const i = chunk.indexOf(':')
    if (i < 0) return
    const k = chunk.slice(0, i).trim().toLowerCase()
    const v = chunk.slice(i + 1).trim()
    if (k && v) map.set(k, v)
  })
  return map
}

function styleMapToText(map) {
  return Array.from(map.entries()).map(([k, v]) => `${k}:${v}`).join(';')
}

/** base 在前，extra 覆盖 —— 用于「默认 + 主题」时让主题胜出：mergeStyle(defaults, baked) */
function mergeStyle(base, extra) {
  const map = parseStyleMap(base)
  parseStyleMap(extra).forEach((v, k) => map.set(k, v))
  return styleMapToText(map)
}

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

function codeFgForBackground(bg, explicitFg) {
  const fgRgb = parseColorToRgb(explicitFg)
  const bgRgb = parseColorToRgb(bg)
  if (fgRgb && bgRgb) {
    if (Math.abs(luminance(fgRgb) - luminance(bgRgb)) >= 0.35) return explicitFg
  } else if (fgRgb && !bgRgb) {
    return explicitFg
  }
  if (bgRgb && luminance(bgRgb) > 0.55) return '#1F2937'
  if (bgRgb && luminance(bgRgb) <= 0.55) return '#CDD6F4'
  return explicitFg || '#1F2937'
}

function clearBorderKeys(map) {
  for (const k of [...map.keys()]) {
    if (k === 'border' || k.startsWith('border-')) map.delete(k)
  }
}

/**
 * 从计算样式读取四边，写成公众号安全写法：
 * border-left:4px solid #c00; border-top:none; border-right:none; ...
 * 只写 longhand / 不声明 none 时，公众号常会补出灰色方框。
 */
function applyBordersFromComputed(map, cs, tagName) {
  if (SKIP_BORDER_BAKE.has(tagName)) {
    clearBorderKeys(map)
    return
  }

  const sides = ['top', 'right', 'bottom', 'left']
  const found = {}
  let any = false
  for (const side of sides) {
    const w = (cs.getPropertyValue(`border-${side}-width`) || '').trim()
    const s = (cs.getPropertyValue(`border-${side}-style`) || '').trim()
    const c = (cs.getPropertyValue(`border-${side}-color`) || '').trim()
    if (!w || w === '0px' || s === 'none' || s === 'hidden') {
      found[side] = null
      continue
    }
    any = true
    found[side] = `${w} ${s || 'solid'} ${c || '#333333'}`
  }

  clearBorderKeys(map)
  if (!any) return

  for (const side of sides) {
    map.set(`border-${side}`, found[side] || 'none')
  }
}

/**
 * 把已有 style 里的杂乱 border 收成「边 + none」形式（用于转换后二次清理）
 */
function compactBordersInMap(map, tagName) {
  if (SKIP_BORDER_BAKE.has(tagName)) {
    clearBorderKeys(map)
    return
  }

  const sides = ['top', 'right', 'bottom', 'left']
  const found = {}
  let any = false

  // 已有 side shorthand
  for (const side of sides) {
    const v = map.get(`border-${side}`)
    if (v && v !== 'none' && v !== '0' && v !== '0px') {
      found[side] = v
      any = true
    } else {
      found[side] = null
    }
  }

  // longhand width/style/color
  for (const side of sides) {
    if (found[side]) continue
    const w = map.get(`border-${side}-width`)
    const s = map.get(`border-${side}-style`)
    const c = map.get(`border-${side}-color`)
    if (w && w !== '0px' && s !== 'none') {
      found[side] = `${w} ${s || 'solid'} ${c || '#333333'}`
      any = true
    }
  }

  // 统一 border: 1px solid #ccc
  const all = map.get('border')
  if (all && all !== 'none' && !any) {
    for (const side of sides) found[side] = all
    any = true
  }

  // border:none / 0 也算「故意无边框」，不能清掉后交给公众号默认灰框
  const allNone = all === 'none' || all === '0' || all === '0px'
  clearBorderKeys(map)
  if (!any || allNone) {
    // 容器类标签显式四边 none；正文表格若已有格线则 any=true，不会进这里
    if (
      tagName === 'SECTION' ||
      tagName === 'TABLE' ||
      tagName === 'TBODY' ||
      tagName === 'THEAD' ||
      tagName === 'TR' ||
      tagName === 'TD' ||
      tagName === 'TH'
    ) {
      for (const side of sides) map.set(`border-${side}`, 'none')
    }
    return
  }
  for (const side of sides) {
    map.set(`border-${side}`, found[side] || 'none')
  }
}

function bakeFromComputedStyle(el, cs) {
  if (el.nodeType !== 1 || SKIP_STYLE_TAGS.has(el.tagName)) return
  if (SKIP_BAKE_TAGS.has(el.tagName)) return

  // 以计算样式为准，丢掉排版器写死的旧 inline（否则各主题复制结果趋同）
  const map = new Map()

  for (const prop of BAKE_PROPS) {
    let val = cs.getPropertyValue(prop)
    if (!val || val === 'none' || val === 'normal' || val === 'auto') continue
    if (val === '0px' || val === 'rgba(0, 0, 0, 0)' || val === 'transparent') continue
    if (prop === 'font-weight' && (val === '400' || val === 'normal')) continue
    if (prop === 'text-align' && (val === 'start' || val === 'left')) continue
    if (prop === 'overflow' && val === 'visible') continue
    map.set(prop, val)
  }

  const bg = map.get('background-color')
  if (bg) map.set('background', bg)

  applyBordersFromComputed(map, cs, el.tagName)

  if (map.size) el.setAttribute('style', styleMapToText(map))
  else el.removeAttribute('style')
}

function bakeTreeFromSource(sourceRoot, cloneRoot) {
  const srcList = [sourceRoot, ...sourceRoot.querySelectorAll('*')]
  const dstList = [cloneRoot, ...cloneRoot.querySelectorAll('*')]
  const n = Math.min(srcList.length, dstList.length)
  for (let i = 0; i < n; i++) {
    const src = srcList[i]
    const dst = dstList[i]
    if (!src || !dst || src.tagName !== dst.tagName) continue
    bakeFromComputedStyle(dst, window.getComputedStyle(src))
  }
}

/** defaults 垫底，el 已有样式（主题烘焙）优先 */
function replaceTag(el, newTag, defaultStyle = '') {
  const next = document.createElement(newTag)
  const style = mergeStyle(defaultStyle, cssTextOf(el))
  if (style) next.setAttribute('style', style)
  while (el.firstChild) next.appendChild(el.firstChild)
  el.parentNode.replaceChild(next, el)
  return next
}

function unwrapElement(el) {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

function readInlineEmphasis(el) {
  const map = parseStyleMap(cssTextOf(el))
  const tag = el.tagName
  if (tag === 'STRONG' || tag === 'B') map.set('font-weight', map.get('font-weight') || '700')
  if (tag === 'EM' || tag === 'I') map.set('font-style', map.get('font-style') || 'italic')
  if (tag === 'S' || tag === 'DEL') {
    map.set('text-decoration', map.get('text-decoration') || 'line-through')
    if (!map.has('color')) map.set('color', '#999999')
  }
  const keep = ['color', 'background', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'border-bottom', 'letter-spacing']
  const out = new Map()
  keep.forEach((k) => {
    if (map.has(k)) out.set(k, map.get(k))
  })
  return out
}

function collectTextRunStyle(textNode, root) {
  const merged = new Map()
  let el = textNode.parentElement
  while (el && el !== root) {
    if (BLOCK_TAGS.has(el.tagName)) break
    const part = readInlineEmphasis(el)
    part.forEach((v, k) => {
      if (!merged.has(k)) merged.set(k, v)
    })
    el = el.parentElement
  }
  return merged
}

function isInsideSkipped(node, root) {
  let el = node.nodeType === 1 ? node : node.parentElement
  while (el && el !== root) {
    if (el.getAttribute?.('data-gs-skip-flatten') === '1' || el.getAttribute?.('data-gs-code') === '1') {
      return true
    }
    el = el.parentElement
  }
  return false
}

function flattenInlineToLeafRuns(root) {
  root.querySelectorAll('span[leaf]').forEach((el) => {
    if (!isInsideSkipped(el, root)) unwrapElement(el)
  })

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)

  for (const textNode of textNodes) {
    if (isInsideSkipped(textNode, root)) continue
    const raw = textNode.textContent
    if (raw == null) continue
    if (/^\s*$/.test(raw) && /[\n\r]/.test(raw)) {
      textNode.remove()
      continue
    }
    const styleMap = collectTextRunStyle(textNode, root)
    const leaf = document.createElement('span')
    leaf.setAttribute('leaf', '')
    leaf.textContent = raw

    let replacement = leaf
    if (styleMap.size) {
      const wrap = document.createElement('span')
      wrap.setAttribute('style', styleMapToText(styleMap))
      wrap.appendChild(leaf)
      replacement = wrap
    }
    textNode.parentNode.replaceChild(replacement, textNode)
  }

  const isFinalRun = (el) =>
    el?.nodeType === 1 &&
    el.tagName === 'SPAN' &&
    !!el.getAttribute('style') &&
    el.childNodes.length === 1 &&
    el.firstChild.nodeType === 1 &&
    el.firstChild.hasAttribute?.('leaf')

  const isLeaf = (el) => el?.nodeType === 1 && el.hasAttribute?.('leaf')

  let changed = true
  let guard = 0
  while (changed && guard++ < 50) {
    changed = false
    const candidates = Array.from(root.querySelectorAll('strong,b,em,i,s,del,span:not([leaf])'))
    for (const el of candidates) {
      if (!el.parentNode) continue
      if (isInsideSkipped(el, root)) continue
      if (isLeaf(el)) continue
      if (isFinalRun(el)) continue

      if (!el.childNodes.length) {
        el.remove()
        changed = true
        continue
      }

      if (
        el.childNodes.length === 1 &&
        (isFinalRun(el.firstChild) || isLeaf(el.firstChild))
      ) {
        unwrapElement(el)
        changed = true
        continue
      }

      if (['STRONG', 'B', 'EM', 'I', 'S', 'DEL'].includes(el.tagName)) {
        unwrapElement(el)
        changed = true
        continue
      }

      if (el.tagName === 'SPAN' && !el.getAttribute('style')) {
        unwrapElement(el)
        changed = true
        continue
      }

      if (
        el.tagName === 'SPAN' &&
        el.getAttribute('style') &&
        el.childNodes.length === 1 &&
        isFinalRun(el.firstChild)
      ) {
        unwrapElement(el)
        changed = true
      }
    }
  }
}

/** 最终清理：边框收成公众号安全写法，并去掉会导致左侧空白的布局属性 */
function finalizeStylesForWechat(root) {
  const all = [root, ...root.querySelectorAll('*')]
  all.forEach((el) => {
    const map = parseStyleMap(cssTextOf(el))
    if (!map.size && el.tagName !== 'SECTION') return

    // 干掉居中残留：margin:auto / 过大的左右 margin、固定 677 宽
    for (const k of ['margin-left', 'margin-right', 'margin']) {
      const v = (map.get(k) || '').toLowerCase()
      if (!v) continue
      if (v.includes('auto')) map.delete(k)
      else if (k !== 'margin') {
        const px = parseFloat(v)
        if (!Number.isNaN(px) && px > 24) map.delete(k)
      }
    }
    const maxW = map.get('max-width')
    if (maxW && (maxW.includes('677') || maxW === '677px')) map.delete('max-width')
    const w = map.get('width')
    if (w && (w.includes('677') || parseFloat(w) > 500)) map.delete('width')

    // 根节点与顶层块：左右 margin 归零，避免整体右偏
    if (el === root || el.parentNode === root) {
      map.set('margin-left', '0')
      map.set('margin-right', '0')
    }

    compactBordersInMap(map, el.tagName)
    if (map.size) el.setAttribute('style', styleMapToText(map))
  })
}

function normalizeForWechat(root, sourceRoot = null) {
  const sourcePres = sourceRoot
    ? Array.from(sourceRoot.querySelectorAll('pre'))
    : []
  let sourcePreIdx = 0

  // 1) 标题 → section（主题烘焙样式优先，默认只补 display/margin）
  root.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
    const level = Number(h.tagName[1])
    const defaults = {
      1: 'display:block;margin:24px 0 12px;line-height:1.6;',
      2: 'display:block;margin:20px 0 10px;line-height:1.6;',
      3: 'display:block;margin:16px 0 8px;line-height:1.6;',
      4: 'display:block;margin:14px 0 6px;line-height:1.6;',
    }
    replaceTag(h, 'section', defaults[level] || defaults[4])
  })

  // 2) blockquote → section（主题优先）
  root.querySelectorAll('blockquote').forEach((bq) => {
    replaceTag(
      bq,
      'section',
      'display:block;margin:16px 0;padding:12px 16px;background:#F7F8FA;border-left:4px solid #2B6CB0;border-top:none;border-right:none;border-bottom:none;border-radius:0 6px 6px 0;'
    )
  })

  // 3) pre → 外层底色 section + 内层 padding section + 每行一个 p
  // 结构对齐 gzh-design；内层 font-size:0 消除公众号 <p> 间隙；缩进用全角空格
  root.querySelectorAll('pre').forEach((pre) => {
    const preMap = parseStyleMap(cssTextOf(pre))
    const bg =
      preMap.get('background-color') ||
      preMap.get('background') ||
      '#F3F4F6'
    const fg = codeFgForBackground(bg, preMap.get('color'))

    // 边框：仅保留主题有意设置的边
    const borderMap = new Map()
    ;['border-top', 'border-right', 'border-bottom', 'border-left'].forEach((k) => {
      if (preMap.has(k)) borderMap.set(k, preMap.get(k))
    })
    if (![...borderMap.values()].some((v) => v && v !== 'none')) {
      ;['top', 'right', 'bottom', 'left'].forEach((s) => borderMap.set(`border-${s}`, 'none'))
    }

    const radius = preMap.get('border-radius') || '8px'
    const outerStyle = new Map([
      ['margin', '0 0 20px'],
      ['border-radius', radius],
      ['overflow', 'hidden'],
      ['background', bg],
      ['background-color', bg],
      ['box-sizing', 'border-box'],
      ['max-width', '100%'],
    ])
    borderMap.forEach((v, k) => outerStyle.set(k, v))
    const outer = document.createElement('section')
    outer.setAttribute('style', styleMapToText(outerStyle))
    outer.setAttribute('data-gs-code', '1')

    // 横向滚动层：超长不换行，可左右滑
    const scroller = document.createElement('section')
    scroller.setAttribute(
      'style',
      'overflow-x:auto;overflow-y:hidden;max-width:100%;margin:0;padding:0;border-top:none;border-right:none;border-bottom:none;border-left:none;-webkit-overflow-scrolling:touch;'
    )

    // font-size:0 / line-height:0 是公众号去掉段落间隙的常用写法
    const inner = document.createElement('section')
    inner.setAttribute(
      'style',
      'padding:11px 14px;margin:0;font-size:0;line-height:0;border-top:none;border-right:none;border-bottom:none;border-left:none;box-sizing:border-box;display:block;min-width:100%;'
    )

    const fontFamily = "Consolas,Monaco,'SF Mono',monospace"
    const sourcePre = sourcePres[sourcePreIdx++]
    // 优先用预览里主题着色后的计算色；否则按背景重新高亮
    const highlighted = sourcePre
      ? extractCodeLinesFromSourcePre(sourcePre)
      : highlightCodeToLines(getPrePlainText(pre), bg)

    // 外框再补主题可能有的左边强调色（已从 computed 烘焙进 border-*）
    const boxShadow = preMap.get('box-shadow')
    if (boxShadow) outerStyle.set('box-shadow', boxShadow)
    outer.setAttribute('style', styleMapToText(outerStyle))

    highlighted.forEach((line) => {
      const indentSpaces = Math.max(0, Number(line.indentSpaces) || 0)
      // 每空格 8px（约等于 13px 等宽字体一字宽）；不用行首空格——公众号会吞掉导致缩进错乱
      const padLeft = indentSpaces > 0 ? `${indentSpaces * 8}px` : '0'
      const p = document.createElement('p')
      p.setAttribute(
        'style',
        `margin:0;padding:0;padding-left:${padLeft};text-indent:0;text-align:left;font-size:13px;line-height:1.6;font-family:${fontFamily};color:${fg};letter-spacing:0;white-space:nowrap;word-break:keep-all;border-top:none;border-right:none;border-bottom:none;border-left:none;background:transparent;box-sizing:border-box;`
      )
      const runs = line.runs && line.runs.length ? line.runs : [{ text: '', color: fg }]
      let hasText = false
      runs.forEach((run) => {
        if (run.text) hasText = true
        const styled = document.createElement('span')
        styled.setAttribute('style', `color:${run.color || fg};font-size:13px;line-height:1.6;font-family:${fontFamily};`)
        const leafEl = document.createElement('span')
        leafEl.setAttribute('leaf', '')
        leafEl.textContent = run.text
        styled.appendChild(leafEl)
        p.appendChild(styled)
      })
      if (!hasText) {
        while (p.firstChild) p.removeChild(p.firstChild)
        const styled = document.createElement('span')
        styled.setAttribute('style', `color:${fg};font-size:13px;line-height:1.6;`)
        const leafEl = document.createElement('span')
        leafEl.setAttribute('leaf', '')
        leafEl.appendChild(document.createElement('br'))
        styled.appendChild(leafEl)
        p.appendChild(styled)
      }
      inner.appendChild(p)
    })

    scroller.appendChild(inner)
    outer.appendChild(scroller)
    pre.parentNode.replaceChild(outer, pre)
  })

  // 4) 行内 code
  root.querySelectorAll('code').forEach((code) => {
    const baked = cssTextOf(code)
    const style = mergeStyle(
      'background:#F0F1F3;color:#E53E3E;padding:1px 5px;border-radius:3px;font-size:0.9em;font-family:Consolas,Monaco,monospace;',
      baked
    )
    const next = document.createElement('span')
    next.setAttribute('style', style)
    while (code.firstChild) next.appendChild(code.firstChild)
    code.parentNode.replaceChild(next, code)
  })

  // 5) strong/em/s
  root.querySelectorAll('strong,b').forEach((s) => {
    s.setAttribute('style', mergeStyle('font-weight:700', cssTextOf(s)))
  })
  root.querySelectorAll('em,i').forEach((s) => {
    s.setAttribute('style', mergeStyle('font-style:italic', cssTextOf(s)))
  })
  root.querySelectorAll('s,del').forEach((s) => {
    s.setAttribute('style', mergeStyle('text-decoration:line-through;color:#999', cssTextOf(s)))
  })

  // 6) ul/ol/li
  const lists = Array.from(root.querySelectorAll('ul,ol'))
  lists.sort((a, b) => (b.querySelectorAll('ul,ol').length) - (a.querySelectorAll('ul,ol').length))
  lists.forEach((list) => {
    if (!list.parentNode) return
    const ordered = list.tagName === 'OL'
    const wrap = document.createElement('section')
    wrap.setAttribute(
      'style',
      mergeStyle(
        'display:block;margin:12px 0;padding:0;border-top:none;border-right:none;border-bottom:none;border-left:none;',
        cssTextOf(list)
      )
    )
    let idx = 0
    Array.from(list.children).forEach((child) => {
      if (child.tagName !== 'LI') {
        wrap.appendChild(child)
        return
      }
      idx += 1
      const p = document.createElement('p')
      const liMap = parseStyleMap(cssTextOf(child))
      clearBorderKeys(liMap)
      p.setAttribute(
        'style',
        mergeStyle(
          'margin:0 0 6px 0;padding-left:1.2em;line-height:1.8;font-size:15px;border-top:none;border-right:none;border-bottom:none;border-left:none;',
          styleMapToText(liMap)
        )
      )
      const bullet = document.createElement('span')
      bullet.setAttribute('leaf', '')
      bullet.textContent = ordered ? `${idx}. ` : '• '
      p.appendChild(bullet)
      while (child.firstChild) p.appendChild(child.firstChild)
      wrap.appendChild(p)
    })
    list.parentNode.replaceChild(wrap, list)
  })

  // 7) div → section
  Array.from(root.querySelectorAll('div')).forEach((div) => {
    replaceTag(div, 'section', 'display:block;border-top:none;border-right:none;border-bottom:none;border-left:none;')
  })

  // 8) 去掉 class/id
  root.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('class')
    el.removeAttribute('id')
    el.removeAttribute('contenteditable')
  })

  // 9) leaf 结构（代码块带 data-gs-code，flatten 会跳过）
  flattenInlineToLeafRuns(root)

  // 10) 边框最终清理
  finalizeStylesForWechat(root)
}

/** 是否启用科技感 CSS 底纹（预览外壳 / 主题 CSS 标记） */
function isTechCssBgActive(sourceEl) {
  const shell = sourceEl?.closest?.('.gs-preview-box')
  if (shell?.classList?.contains('gs-fixed-bg')) return true
  try {
    const css = localStorage.getItem('gs_custom_css') || ''
    return css.includes(TECH_BG_MARKER) || css.includes('case_bg-a56a0b4b.png')
  } catch (_) {
    return false
  }
}

export async function buildWechatHTML(sourceEl) {
  const clone = sourceEl.cloneNode(true)
  clone.removeAttribute('contenteditable')
  clone.removeAttribute('id')

  bakeTreeFromSource(sourceEl, clone)
  normalizeForWechat(clone, sourceEl)

  const rootCs = window.getComputedStyle(sourceEl)
  const shell = sourceEl.closest?.('.gs-preview-box')
  const shellCs = shell ? window.getComputedStyle(shell) : null
  const useTechBg = isTechCssBgActive(sourceEl)
  let rootBg = rootCs.backgroundColor
  if (!rootBg || rootBg === 'rgba(0, 0, 0, 0)' || rootBg === 'transparent') {
    rootBg = useTechBg
      ? TECH_BG_COLOR
      : (shellCs?.backgroundColor && shellCs.backgroundColor !== 'rgba(0, 0, 0, 0)'
        ? shellCs.backgroundColor
        : '#ffffff')
  }
  const rootColor = rootCs.color || '#333333'
  const rootFont = rootCs.fontFamily || "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif"

  // 科技感：纯 CSS 渐变底纹写在外层 section（不用 table，避免公众号默认灰框）
  const bgLayer = useTechBg
    ? `${getTechBgWechatCss()};`
    : `background-color:${rootBg};`

  const wrapper = document.createElement('section')
  // 公众号里不要 margin:auto / max-width:677，否则容易左侧一大块空白
  // 边框必须四边显式 none（写 border:none 会被清理逻辑丢掉，公众号会补灰框）
  wrapper.setAttribute(
    'style',
    `display:block;width:100%;margin:0;padding:0;font-family:${rootFont};color:${rootColor};line-height:1.8;letter-spacing:0.5px;overflow-x:hidden;${bgLayer}border-top:none;border-right:none;border-bottom:none;border-left:none;outline:none;box-shadow:none;box-sizing:border-box;`
  )

  while (clone.firstChild) wrapper.appendChild(clone.firstChild)
  flattenInlineToLeafRuns(wrapper)
  finalizeStylesForWechat(wrapper)
  // 根节点再强制无边框，防止 finalize 过程中丢失
  const rootMap = parseStyleMap(cssTextOf(wrapper))
  ;['top', 'right', 'bottom', 'left'].forEach((s) => rootMap.set(`border-${s}`, 'none'))
  rootMap.set('outline', 'none')
  rootMap.set('box-shadow', 'none')
  wrapper.setAttribute('style', styleMapToText(rootMap))
  // 清理内部标记，勿带进公众号
  wrapper.querySelectorAll('[data-gs-code]').forEach((el) => el.removeAttribute('data-gs-code'))
  return wrapper.outerHTML
}

function copyHtmlViaExecCommandSync(html, plain) {
  let ok = false
  const onCopy = (e) => {
    e.preventDefault()
    try {
      e.clipboardData.setData('text/html', html)
      e.clipboardData.setData('text/plain', plain || '')
      ok = true
    } catch (_) {
      ok = false
    }
  }

  document.addEventListener('copy', onCopy, true)

  let probe = document.getElementById('gs-copy-probe')
  if (!probe) {
    probe = document.createElement('textarea')
    probe.id = 'gs-copy-probe'
    probe.setAttribute('readonly', '')
    probe.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px;border:0;padding:0;margin:0;'
    document.body.appendChild(probe)
  }
  probe.value = ' '
  probe.focus()
  probe.select()
  probe.setSelectionRange(0, 1)

  try {
    document.execCommand('copy')
  } catch (_) { /* ignore */ }

  document.removeEventListener('copy', onCopy, true)
  return ok
}

export async function copyWechatHTML(sourceEl) {
  const html = await buildWechatHTML(sourceEl)
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  const plain = tmp.textContent || ''

  if (copyHtmlViaExecCommandSync(html, plain)) return true

  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' }),
        }),
      ])
      return true
    } catch (_) { /* fallthrough */ }
  }

  return false
}

export async function previewWechatHTML(sourceEl) {
  return buildWechatHTML(sourceEl)
}
