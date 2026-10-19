import { expect, test } from 'claude-code/testing'

import { checkFigure, pngSize } from './check'
import type { JevIO } from './jev'

// PNG の先頭 33 バイト（シグネチャと IHDR）だけを base64 にしたもの
const PNG_400x300 = 'iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAIAAABi1XKV'
const PNG_100x50 = 'iVBORw0KGgoAAAANSUhEUgAAAGQAAAAyCAIAAAAlV+np'

function fakeIO(reply: { status: number; answers?: object }) {
  const sent: { headers: Record<string, string>; body: any }[] = []
  const io: JevIO = {
    fetch: async (_url, init) => {
      sent.push({ headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body)) })
      return { status: reply.status, ok: reply.status < 300, headers: {}, text: JSON.stringify({ answers: reply.answers ?? {} }) } as never
    },
    sleep: () => new Promise(() => {}),
    log: () => {},
  }
  return { io, sent }
}

const answers = (overlap: number, direction: number, top: string) => ({
  overlap: { type: 'noul', noul: overlap },
  one_direction: { type: 'noul', noul: direction },
  diagram_kind: { type: 'choice', probabilities: { [top]: 0.8, layers: 0.2 } },
})

test('pngSize は IHDR から縦横を読む', async () => {
  expect(pngSize(PNG_400x300)).toEqual({ width: 400, height: 300 })
  expect(pngSize('not a png')).toBe(undefined)
})

test('画像付きのリクエストに Danger Zone のヘッダーと assets を付ける', async () => {
  const { io, sent } = fakeIO({ status: 200, answers: answers(0.1, 0.9, 'flow') })
  await checkFigure(io, { key: 'k', png: PNG_400x300, kind: 'flow' })
  expect(sent[0]!.headers['TypeSafe-Danger-Zone-Images']).toBe('true')
  const assets = Object.values(sent[0]!.body.assets) as { type: string; format: string; data_base64: string }[]
  expect(assets).toEqual([{ type: 'image', format: 'png', data_base64: PNG_400x300 }])
})

test('重なりがなく一方向で、種類が合えば合格', async () => {
  const { io } = fakeIO({ status: 200, answers: answers(0.1, 0.9, 'flow') })
  expect(await checkFigure(io, { key: 'k', png: PNG_400x300, kind: 'flow' })).toEqual({ ok: true })
})

test('文字が重なっていれば不合格で、理由を返す', async () => {
  const { io } = fakeIO({ status: 200, answers: answers(0.8, 0.9, 'flow') })
  const r = await checkFigure(io, { key: 'k', png: PNG_400x300, kind: 'flow' })
  expect(r.ok).toBe(false)
  expect('problem' in r && r.problem.length > 0).toBe(true)
})

test('種類が狙いと違えば不合格', async () => {
  const { io } = fakeIO({ status: 200, answers: answers(0.1, 0.9, 'tree') })
  expect((await checkFigure(io, { key: 'k', png: PNG_400x300, kind: 'flow' })).ok).toBe(false)
})

test('Jev が失敗したら skipped', async () => {
  const { io } = fakeIO({ status: 503 })
  expect(await checkFigure(io, { key: 'k', png: PNG_400x300, kind: 'flow' })).toEqual({ ok: 'skipped' })
})

test('縦横が 280〜1568 ピクセルに収まらなければ、送らずに skipped', async () => {
  const { io, sent } = fakeIO({ status: 200, answers: answers(0.1, 0.9, 'flow') })
  expect(await checkFigure(io, { key: 'k', png: PNG_100x50, kind: 'flow' })).toEqual({ ok: 'skipped' })
  expect(sent.length).toBe(0)
})
