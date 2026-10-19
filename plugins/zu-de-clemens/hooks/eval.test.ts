import { expect, test } from 'claude-code/testing'

import { parseCases, report } from './eval'
import type { Outcome } from './eval'

const line = (over: object = {}) => JSON.stringify({ id: 'c01', trigger: 'question', text: 't', recent_prompts: [], label: 'want', kind: 'flow', ...over })

test('parseCases は空行を飛ばして読み、形の崩れは行番号で返す', async () => {
  const ok = parseCases(`${line()}\n\n${line({ id: 'c02', label: null, kind: null })}\n`)
  expect(ok.ok && ok.cases.map(c => c.id)).toEqual(['c01', 'c02'])
  expect(parseCases(`${line()}\n{oops`)).toEqual({ ok: false, error: '2 行目が JSON として読めません' })
  expect(parseCases(line({ label: 'maybe' })).ok).toBe(false)
  expect(parseCases(line({ kind: 'pie' })).ok).toBe(false)
})

const o = (id: string, label: 'want' | 'no', p: number | undefined, kinds: string[] = [], kind: string | null = null): Outcome =>
  ({ id, label, p, kinds, kind }) as Outcome

test('report は見逃し率 10% 以下の中で外れが最も少ない値を選び、同じ数なら高いほう。失敗した件は率から除く', async () => {
  // want 10 件：0.40 が 1 件、ほかは 0.80。0.40 を見逃すと 10%、0.80 を超えると 100%
  const outcomes = [
    o('w1', 'want', 0.4, ['flow'], 'flow'),
    ...Array.from({ length: 9 }, (_, i) => o(`w${i + 2}`, 'want', 0.8, ['tree', 'layers', 'flow', 'hub'], i === 0 ? 'hub' : null)),
    o('n1', 'no', 0.6),
    o('n2', 'no', undefined),
  ]
  const r = report(outcomes, { at: '2026-10-19T00:00:00.000Z', model: 'jev-latest' })
  expect(r.threshold).toBe(0.8)
  expect(r.markdown.includes('| 0.80 | 10%（1/10） | 0%（0/1） |')).toBe(true)
  expect(r.markdown.includes('| 0.60 | 10%（1/10） | 100%（1/1） |')).toBe(true)
  expect(r.markdown.includes('Jev が答えなかった 1')).toBe(true)
  // flow は上位 3 つに入り、hub は 4 番目なので外れ
  expect(r.markdown.includes('上位 3 つに入った割合：50%（1/2）')).toBe(true)
})

test('満たすしきい値がなければ threshold を返さない', async () => {
  const r = report([o('w1', 'want', 0.1), o('w2', 'want', 0.2)], { at: 'x', model: 'm' })
  expect(r.threshold).toBe(undefined)
  expect(r.markdown.includes('満たす値なし')).toBe(true)
})

test('外れが減らないなら、しきい値を上げて見逃しを増やさない', async () => {
  // want の最低が 0.63、no の最高が 0.55。0.60 なら外れ 0、0.65 以上は見逃し 1（10%）
  const outcomes = [o('w1', 'want', 0.63), ...Array.from({ length: 9 }, (_, i) => o(`w${i + 2}`, 'want', 0.95)), o('n1', 'no', 0.55)]
  expect(report(outcomes, { at: 'x', model: 'm' }).threshold).toBe(0.6)
})
