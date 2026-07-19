/**
 * 科技感主题背景：浅蓝粒子波浪（纯 CSS DOM 层，无外部图片）。
 * 预览挂在 .gs-preview-box；公众号用静态渐变近似。
 */

export const TECH_BG_MARKER = 'gs-tech-css-bg'
export const TECH_BG_COLOR = '#fcfdff'

const STYLE_ID = 'gs-tech-particle-style'
const LAYER_CLASS = 'gs-tech-bg'

const STYLE_CSS = `
.gs-preview-box.gs-fixed-bg {
  position: relative;
  overflow: hidden;
  background: ${TECH_BG_COLOR} !important;
}
.gs-preview-box.gs-fixed-bg > *:not(.${LAYER_CLASS}) {
  position: relative;
  z-index: 1;
}
.${LAYER_CLASS} {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
}
.${LAYER_CLASS} .gs-tech-float-curve {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at top, rgba(225, 240, 255, 0.5) 0%, transparent 70%),
    radial-gradient(ellipse at bottom, rgba(225, 240, 255, 0.4) 0%, transparent 70%);
  animation: gsTechCurveFloat 15s ease-in-out infinite alternate;
}
.${LAYER_CLASS} .gs-tech-wave {
  position: absolute;
  width: 200%;
  height: 60%;
  left: -50%;
  background-image: radial-gradient(rgba(170, 208, 250, 0.65) 1px, transparent 1px);
  background-size: 14px 14px;
  clip-path: polygon(
    0 28%, 18% 34%, 36% 26%, 54% 32%, 72% 25%, 90% 33%, 100% 29%,
    100% 100%, 0 100%
  );
}
.${LAYER_CLASS} .gs-tech-wave:nth-child(2) {
  top: 20%;
  opacity: 0.42;
  animation: gsTechWaveLeft 22s linear infinite;
}
.${LAYER_CLASS} .gs-tech-wave:nth-child(3) {
  top: 33%;
  opacity: 0.30;
  animation: gsTechWaveRight 26s linear infinite;
}
.${LAYER_CLASS} .gs-tech-wave:nth-child(4) {
  top: 46%;
  opacity: 0.20;
  animation: gsTechWaveLeft 30s linear infinite;
}
.${LAYER_CLASS} .gs-tech-stream {
  position: absolute;
  width: 100%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(155, 195, 245, 0.6), transparent);
  filter: blur(1px);
  animation: gsTechStreamFlow 11s ease-in-out infinite;
}
.${LAYER_CLASS} .gs-tech-stream:nth-child(5) { top: 27%; animation-delay: -4s; }
.${LAYER_CLASS} .gs-tech-stream:nth-child(6) { top: 39%; animation-delay: -2s; }
.${LAYER_CLASS} .gs-tech-stream:nth-child(7) { top: 51%; animation-delay: -6s; }

@keyframes gsTechCurveFloat {
  0% { transform: translateY(-35px) scale(1.02); }
  100% { transform: translateY(35px) scale(0.98); }
}
@keyframes gsTechWaveLeft {
  0% { transform: translateX(0); }
  100% { transform: translateX(50%); }
}
@keyframes gsTechWaveRight {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}
@keyframes gsTechStreamFlow {
  0% { opacity: 0; transform: translateX(-30%); }
  50% { opacity: 0.9; }
  100% { opacity: 0; transform: translateX(30%); }
}

@media (prefers-reduced-motion: reduce) {
  .${LAYER_CLASS} .gs-tech-float-curve,
  .${LAYER_CLASS} .gs-tech-wave,
  .${LAYER_CLASS} .gs-tech-stream {
    animation: none !important;
  }
}
`

function ensureTechBgStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = STYLE_CSS
  document.head.appendChild(style)
}

function ensureTechBgLayer(host) {
  let layer = host.querySelector(`:scope > .${LAYER_CLASS}`)
  if (layer) return layer
  layer = document.createElement('div')
  layer.className = LAYER_CLASS
  layer.setAttribute('aria-hidden', 'true')
  layer.innerHTML = [
    '<div class="gs-tech-float-curve"></div>',
    '<div class="gs-tech-wave"></div>',
    '<div class="gs-tech-wave"></div>',
    '<div class="gs-tech-wave"></div>',
    '<div class="gs-tech-stream"></div>',
    '<div class="gs-tech-stream"></div>',
    '<div class="gs-tech-stream"></div>',
  ].join('')
  host.insertBefore(layer, host.firstChild)
  return layer
}

/** 在预览外壳挂载粒子波浪层 */
export function applyTechBgStyle(el) {
  if (!el) return
  ensureTechBgStyles()
  ensureTechBgLayer(el)
  el.style.backgroundColor = TECH_BG_COLOR
  el.style.backgroundImage = 'none'
}

export function clearTechBgStyle(el) {
  if (!el) return
  el.querySelectorAll(`:scope > .${LAYER_CLASS}`).forEach((n) => n.remove())
  el.style.backgroundColor = ''
  el.style.backgroundImage = ''
  el.style.backgroundSize = ''
  el.style.backgroundPosition = ''
  el.style.backgroundRepeat = ''
  el.style.backgroundAttachment = ''
}

/**
 * 公众号静态近似：浅底 + 柔光 + 点阵（无动画 / clip-path）
 */
export function getTechBgWechatCss() {
  const image = [
    'radial-gradient(ellipse at top, rgba(225,240,255,0.55) 0%, transparent 70%)',
    'radial-gradient(ellipse at bottom, rgba(225,240,255,0.4) 0%, transparent 70%)',
    'radial-gradient(ellipse 120% 40% at 50% 38%, rgba(170,208,250,0.22) 0%, transparent 60%)',
    'radial-gradient(circle, rgba(170,208,250,0.55) 1px, transparent 1px)',
    'radial-gradient(circle, rgba(155,195,245,0.28) 0.8px, transparent 1.1px)',
  ].join(',')
  return (
    `background-color:${TECH_BG_COLOR};` +
    `background-image:${image};` +
    `background-size:100% 100%,100% 100%,100% 100%,14px 14px,18px 16px;` +
    `background-position:center top,center bottom,center 40%,0 28%,4px 42%;` +
    `background-repeat:no-repeat,no-repeat,no-repeat,repeat,repeat`
  )
}
