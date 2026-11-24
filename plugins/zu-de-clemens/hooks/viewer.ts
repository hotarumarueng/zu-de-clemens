import type { Lang } from './strings'

// ［大きく開く］で OS の既定のブラウザに渡すページ（#3）。ペインの Svg 部品は拡大・移動を受け付けないため、
// 図を埋め込んだ HTML にして、図だけを拡大・縮小・移動できるようにする。

const LABELS = {
  ja: { zoomIn: '拡大', zoomOut: '縮小', fit: '全体を表示', hint: 'ピンチ・Ctrl＋ホイールで拡大縮小、ドラッグで移動', recommend: 'おすすめ: ' },
  en: { zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to window', hint: 'Pinch or Ctrl + wheel to zoom, drag to move', recommend: 'Recommended: ' },
} satisfies Record<Lang, Record<string, string>>

// ペインの安全な枠の外（ブラウザ）で開くため、図に動くものや外への参照がないことを確かめる。
// d2 の SVG は文字を data: のフォントで埋め込み、内部の参照は # で書く
export function isSafeSvg(svg: string): boolean {
  return !(
    /<script|<foreignObject|javascript:|@import/i.test(svg) ||
    /\son[a-z]+\s*=/i.test(svg) ||
    /\s(?:xlink:)?(?:href|src)\s*=\s*["'](?!#|data:)/i.test(svg) ||
    /url\(\s*(?!["']?(?:data:|#))/i.test(svg)
  )
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function size(svg: string): { w: number; h: number } {
  const tag = /<svg[^>]*>/.exec(svg)?.[0] ?? ''
  const attr = (name: string) => Number(new RegExp(`\\s${name}="([\\d.]+)"`).exec(tag)?.[1])
  const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(tag)
  const w = attr('width') || Number(box?.[1]) || 800
  const h = attr('height') || Number(box?.[2]) || 600
  return { w, h }
}

export function viewerHtml(figure: { title: string; kind: string; recommend?: string; svg: string }, lang: Lang): string | undefined {
  if (!isSafeSvg(figure.svg)) return undefined
  const l = LABELS[lang]
  const { w, h } = size(figure.svg)
  const svg = figure.svg.replace(/^\s*<\?xml[^>]*\?>/, '')
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; img-src data:">
<title>${escape(figure.title)}</title>
<style>
:root { --bg: #f4f1fa; --card: #ffffff; --ink: #2b2540; --sub: #5d5675; --line: #d9d0ee; --accent: #6a3fc1; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #15141c; --card: #1e1e2e; --ink: #ecebf5; --sub: #a9a6bd; --line: #34334a; --accent: #5fe3ff; }
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; background: var(--bg); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Segoe UI", sans-serif; }
header { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 24px; padding: 20px 28px 14px; }
.titles { flex: 1 1 320px; min-width: 0; }
h1 { margin: 0; font-size: 20px; line-height: 1.4; font-weight: 700; }
.meta { margin-top: 4px; font-size: 13px; color: var(--sub); }
.meta .rec { color: var(--accent); font-weight: 600; }
.tools { display: flex; align-items: center; gap: 8px; }
button { font: inherit; font-size: 14px; min-width: 40px; min-height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); color: var(--ink); cursor: pointer; }
button:hover { border-color: var(--accent); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
#stage { position: relative; flex: 1; margin: 0 20px 12px; border: 1px solid var(--line); border-radius: 14px; background: var(--card); overflow: hidden; cursor: grab; touch-action: none; }
#stage.dragging { cursor: grabbing; }
#fig { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
#fig > svg { display: block; }
footer { padding: 0 28px 14px; font-size: 12px; color: var(--sub); }
</style>
</head>
<body>
<header>
  <div class="titles">
    <h1>${escape(figure.title)}</h1>
    <div class="meta">${escape(figure.kind)}${figure.recommend ? ` ・ <span class="rec">${escape(l.recommend + figure.recommend)}</span>` : ''}</div>
  </div>
  <div class="tools">
    <button id="out" aria-label="${l.zoomOut}" title="${l.zoomOut}">－</button>
    <button id="in" aria-label="${l.zoomIn}" title="${l.zoomIn}">＋</button>
    <button id="fit">${l.fit}</button>
  </div>
</header>
<main id="stage" aria-label="${escape(figure.title)}"><div id="fig">${svg}</div></main>
<footer>${l.hint}</footer>
<script>
(() => {
  const W = ${w}, H = ${h}
  const stage = document.getElementById('stage'), fig = document.getElementById('fig')
  let s = 1, x = 0, y = 0
  const apply = () => { fig.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')' }
  const fit = () => {
    const r = stage.getBoundingClientRect()
    s = Math.min(r.width / W, r.height / H) * 0.92
    x = (r.width - W * s) / 2
    y = (r.height - H * s) / 2
    apply()
  }
  // 指した点を動かさずに拡大・縮小する
  const zoom = (f, cx, cy) => {
    const n = Math.min(20, Math.max(0.05, s * f))
    x = cx - (cx - x) * n / s
    y = cy - (cy - y) * n / s
    s = n
    apply()
  }
  const center = () => { const r = stage.getBoundingClientRect(); return [r.width / 2, r.height / 2] }
  // トラックパッドのピンチは ctrlKey つきの wheel で届く（Chrome・Firefox）
  stage.addEventListener('wheel', e => {
    e.preventDefault()
    const r = stage.getBoundingClientRect()
    if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
    else { x -= e.deltaX; y -= e.deltaY; apply() }
  }, { passive: false })
  // Safari のピンチは gesture イベントで届く
  let s0 = 1
  stage.addEventListener('gesturestart', e => { e.preventDefault(); s0 = s })
  stage.addEventListener('gesturechange', e => { e.preventDefault(); const [cx, cy] = center(); zoom(s0 * e.scale / s, cx, cy) })
  let drag = null
  stage.addEventListener('pointerdown', e => { drag = { id: e.pointerId, px: e.clientX, py: e.clientY }; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging') })
  stage.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return
    x += e.clientX - drag.px; y += e.clientY - drag.py; drag.px = e.clientX; drag.py = e.clientY
    apply()
  })
  const end = () => { drag = null; stage.classList.remove('dragging') }
  stage.addEventListener('pointerup', end)
  stage.addEventListener('pointercancel', end)
  document.getElementById('in').onclick = () => zoom(1.25, ...center())
  document.getElementById('out').onclick = () => zoom(0.8, ...center())
  document.getElementById('fit').onclick = fit
  document.addEventListener('keydown', e => {
    if (e.key === '+' || e.key === '=') zoom(1.25, ...center())
    else if (e.key === '-') zoom(0.8, ...center())
    else if (e.key === '0') fit()
  })
  window.addEventListener('resize', fit)
  // 見出しの文字が読み込まれて高さが変わったあとに合わせ直す
  window.addEventListener('load', fit)
  fit()
})()
</script>
</body>
</html>
`
}
