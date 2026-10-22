import { expect, test } from 'claude-code/testing'

import { downward, draw, isSafeD2, parseReply } from './draw'
import type { DrawIO } from './draw'

const GOOD = '```d2\na -> b\n```\nKIND: flow\nTITLE: 流れ\nRECOMMEND: 2. B案：速い'

type Run = { argv: readonly string[]; stdin?: string }

// 偽の fork と d2。fork は返事を順に返し、d2 は決めた結果を返す。
function fakeIO(forkReplies: ({ text: string } | { reason: string })[], d2: { validateFails?: number; missing?: boolean } = {}) {
  const prompts: string[] = []
  const runs: Run[] = []
  let validateFailures = d2.validateFails ?? 0
  const io: DrawIO = {
    fork: async prompt => {
      prompts.push(prompt)
      const reply = forkReplies.shift() ?? { reason: 'empty-reply' }
      return ('text' in reply ? { isAnswered: true, text: reply.text } : { isAnswered: false, reason: reply.reason }) as never
    },
    run: async (argv, init) => {
      runs.push({ argv, stdin: init?.stdin })
      if (d2.missing) throw new Error('cannot start')
      if (argv[1] === '--version') return { exitCode: 0, stdout: 'v0.9.0', stderr: '' } as never
      if (argv[1] === 'validate') {
        if (validateFailures > 0) {
          validateFailures--
          return { exitCode: 1, stdout: '', stderr: 'err: -:1:1: connection missing destination' } as never
        }
        return { exitCode: 0, stdout: 'ok', stderr: '' } as never
      }
      return { exitCode: 0, stdout: argv.includes('ascii') ? '[a]->[b]' : '<svg/>', stderr: '' } as never
    },
  }
  return { io, prompts, runs }
}

const input = { trigger: 'question' as const, text: 'A案とB案のどちら？', candidates: [{ id: 'flow' as const, p: 0.6 }], lang: 'ja' as const }
const renders = (runs: Run[]) => runs.filter(r => r.argv.includes('--layout=elk'))

test('parseReply は D2 と 3 行を取り出す', async () => {
  expect(parseReply(GOOD)).toEqual({ d2: 'a -> b', kind: 'flow', title: '流れ', recommend: '2. B案：速い' })
})

test('parseReply はコードブロックが 0 個・2 個、KIND がないとき undefined', async () => {
  expect(parseReply('KIND: flow\nTITLE: t')).toBe(undefined)
  expect(parseReply('```d2\na\n```\n```d2\nb\n```\nKIND: flow\nTITLE: t')).toBe(undefined)
  expect(parseReply('```d2\na -> b\n```\nTITLE: t')).toBe(undefined)
})

test('isSafeD2 はインポートと外部の URL を拒む', async () => {
  expect(isSafeD2('a -> b')).toBe(true)
  expect(isSafeD2('x: @secrets')).toBe(false)
  expect(isSafeD2('...@base')).toBe(false)
  expect(isSafeD2('a: {icon: https://e.com/a.svg}')).toBe(false)
  expect(isSafeD2('a: http://e.com')).toBe(false)
})

test('1 回目が形の違反なら理由を添えて書き直させ、2 回目で成功する', async () => {
  const { io, prompts } = fakeIO([{ text: 'no block' }, { text: GOOD }])
  const r = await draw(io, input)
  expect(r.ok).toBe(true)
  expect(prompts.length).toBe(2)
  expect(prompts[1]!.includes('```d2')).toBe(true)
})

test('d2 validate が 2 回とも失敗したら d2-failed、fork は 2 回だけ', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }, { text: GOOD }, { text: GOOD }], { validateFails: 2 })
  expect(await draw(io, input)).toEqual({ ok: false, reason: 'd2-failed' })
  expect(prompts.length).toBe(2)
  expect(prompts[1]!.includes('connection missing destination')).toBe(true)
})

test('fork が nothing-to-fork なら nothing-to-fork、api-error なら fork-failed', async () => {
  expect(await draw(fakeIO([{ reason: 'nothing-to-fork' }]).io, input)).toEqual({ ok: false, reason: 'nothing-to-fork' })
  expect(await draw(fakeIO([{ reason: 'api-error' }]).io, input)).toEqual({ ok: false, reason: 'fork-failed' })
})

test('インポートを含む D2 が 2 回続いたら unsafe-d2 で、描かない', async () => {
  const unsafe = '```d2\nx: @secrets\n```\nKIND: flow\nTITLE: t'
  const { io, runs } = fakeIO([{ text: unsafe }, { text: unsafe }])
  expect(await draw(io, input)).toEqual({ ok: false, reason: 'unsafe-d2' })
  expect(runs.some(r => r.argv[1] === 'validate')).toBe(false)
  expect(renders(runs).length).toBe(0)
})

test('カタログにない KIND は書き直しの対象', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD.replace('KIND: flow', 'KIND: pie') }, { text: GOOD }])
  expect((await draw(io, input)).ok).toBe(true)
  expect(prompts.length).toBe(2)
})

test('d2 が見つからなければ d2-missing', async () => {
  expect(await draw(fakeIO([{ text: GOOD }], { missing: true }).io, input)).toEqual({ ok: false, reason: 'd2-missing' })
})

test('成功時は SVG と文字の図を決めたオプションで作る', async () => {
  const { io, runs } = fakeIO([{ text: GOOD }])
  const r = await draw(io, input)
  expect(r).toEqual({ ok: true, figure: { kind: 'flow', title: '流れ', recommend: '2. B案：速い', svg: '<svg/>', ascii: '[a]->[b]', d2: 'direction: down\na -> b' } })
  const [svg, ascii] = renders(runs)
  for (const flag of ['--theme', '0', '--dark-theme', '200', '--scale', '1', '--pad', '20']) expect(svg!.argv.includes(flag)).toBe(true)
  expect(ascii!.argv.includes('--stdout-format') && ascii!.argv.includes('ascii')).toBe(true)
  expect(svg!.stdin).toBe('direction: down\na -> b')
})

test('fork への指示に、候補の種類の見本と返す形が入る', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }])
  await draw(io, input)
  expect(prompts[0]!.includes('input -> process -> store -> output')).toBe(true)
  expect(prompts[0]!.includes('KIND:')).toBe(true)
  expect(prompts[0]!.includes('RECOMMEND:')).toBe(true)
})

test('検品なしのときは PNG を作らない', async () => {
  const { io } = fakeIO([{ text: GOOD }])
  let pngs = 0
  const r = await draw({ ...io, png: async () => { pngs++; return 'PNG' } }, input)
  expect(r.ok).toBe(true)
  expect(pngs).toBe(0)
})

test('検品で不合格なら、理由を添えて書き直させる', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }, { text: GOOD }])
  const results = [{ ok: false as const, problem: 'some labels or boxes overlap' }, { ok: true as const }]
  const r = await draw({ ...io, png: async () => 'PNG' }, { ...input, check: async () => results.shift()! })
  expect(r.ok).toBe(true)
  expect(prompts.length).toBe(2)
  expect(prompts[1]!.includes('some labels or boxes overlap')).toBe(true)
})

test('検品が skipped なら、そのまま図を返す', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }])
  const r = await draw({ ...io, png: async () => 'PNG' }, { ...input, check: async () => ({ ok: 'skipped' as const }) })
  expect(r.ok).toBe(true)
  expect(prompts.length).toBe(1)
})

test('2 回目も検品で不合格なら、図はそのまま返す', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }, { text: GOOD }])
  const r = await draw({ ...io, png: async () => 'PNG' }, { ...input, check: async () => ({ ok: false as const, problem: 'overlap' }) })
  expect(r.ok).toBe(true)
  expect(prompts.length).toBe(2)
})

test('downward は向きの指定を下向き 1 つに揃える（入れ子の中の向きは残す）', async () => {
  expect(downward('direction: right\na -> b')).toBe('direction: down\na -> b')
  expect(downward('a -> b')).toBe('direction: down\na -> b')
  expect(downward('g: {\n  direction: right\n  x -> y\n}')).toBe('direction: down\ng: {\n  direction: right\n  x -> y\n}')
})
