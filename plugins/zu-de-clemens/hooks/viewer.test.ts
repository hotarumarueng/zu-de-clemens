import { expect, test } from 'claude-code/testing'

import { isSafeSvg, viewerHtml } from './viewer'

const SVG = '<?xml version="1.0" encoding="utf-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 308 716" width="308" height="716"><rect /></svg>'

test('図を埋め込んだページに、題名・種類・おすすめと拡大縮小の操作が入る', async () => {
  const html = viewerHtml({ title: 'A と <B>', kind: 'ステップ', recommend: 'A案', svg: SVG }, 'ja')!
  expect(html.startsWith('<!doctype html>')).toBe(true)
  expect(html.includes('<title>A と &lt;B&gt;</title>')).toBe(true)
  expect(html.includes('ステップ')).toBe(true)
  expect(html.includes('おすすめ: A案')).toBe(true)
  expect(html.includes('<svg xmlns')).toBe(true)
  expect(html.includes('<?xml')).toBe(false)
  expect(html.includes('全体を表示')).toBe(true)
  expect(html.includes('ctrlKey')).toBe(true)
  expect(html.includes('gesturechange')).toBe(true)
  // 外への通信を止める
  expect(html.includes("default-src 'none'")).toBe(true)
})

test('英語の文言で出せる', async () => {
  const html = viewerHtml({ title: 't', kind: 'Steps', svg: SVG }, 'en')!
  expect(html.includes('Fit to window')).toBe(true)
  expect(html.includes('lang="en"')).toBe(true)
})

test('スクリプト・イベント属性・外部の参照を含む SVG はページにしない', async () => {
  expect(isSafeSvg(SVG)).toBe(true)
  expect(isSafeSvg('<svg><style>@font-face{src:url("data:font/woff;base64,AA")}</style><use xlink:href="#a"/></svg>')).toBe(true)
  for (const bad of [
    '<svg><script>alert(1)</script></svg>',
    '<svg><rect onload="x()"/></svg>',
    '<svg><a href="javascript:x()"></a></svg>',
    '<svg><image href="https://example.com/a.png"/></svg>',
    '<svg><style>@import url(https://example.com/a.css)</style></svg>',
    '<svg><foreignObject><iframe/></foreignObject></svg>',
  ]) {
    expect(isSafeSvg(bad)).toBe(false)
    expect(viewerHtml({ title: 't', kind: 'k', svg: bad }, 'ja')).toBe(undefined)
  }
})
