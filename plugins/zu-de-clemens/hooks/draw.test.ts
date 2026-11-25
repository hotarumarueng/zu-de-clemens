import { expect, test } from 'claude-code/testing'

import { downward, draw, gridOnlyWithoutEdges, isSafeD2, parseReply, themed } from './draw'
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

test('応答のときに fork が整理専用の status を選んだら、理由を添えて書き直させる（#8）', async () => {
  const status = '```d2\na\n```\nKIND: status\nTITLE: 状況'
  const { io, prompts } = fakeIO([{ text: status }, { text: GOOD }])
  const r = await draw(io, { ...input, trigger: 'answer' })
  expect(r.ok && r.figure.kind).toBe('flow')
  expect(prompts.length).toBe(2)
  expect(prompts[1]!.includes('status is only for session overviews')).toBe(true)
})

test('整理のときは status を選べる', async () => {
  const { io, prompts } = fakeIO([{ text: '```d2\na\n```\nKIND: status\nTITLE: 状況' }])
  const r = await draw(io, { ...input, trigger: 'prompt', candidates: [{ id: 'status', p: 1 }] })
  expect(r.ok && r.figure.kind).toBe('status')
  expect(prompts.length).toBe(1)
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
  expect(r).toEqual({ ok: true, figure: { kind: 'flow', title: '流れ', recommend: '2. B案：速い', svg: '<svg/>', ascii: '[a]->[b]', d2: themed('direction: down\na -> b') } })
  const [svg, ascii] = renders(runs)
  for (const flag of ['--theme', '0', '--dark-theme', '200', '--scale', '1', '--pad', '20']) expect(svg!.argv.includes(flag)).toBe(true)
  expect(ascii!.argv.includes('--stdout-format') && ascii!.argv.includes('ascii')).toBe(true)
  expect(svg!.stdin).toBe(themed('direction: down\na -> b'))
})

test('fork への指示に、候補の種類の見本と返す形が入る', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }])
  await draw(io, input)
  expect(prompts[0]!.includes('input -> process -> store -> output')).toBe(true)
  expect(prompts[0]!.includes('KIND:')).toBe(true)
  expect(prompts[0]!.includes('RECOMMEND:')).toBe(true)
  expect(prompts[0]!.includes('grid-columns: 1')).toBe(true)
  expect(prompts[0]!.includes('Draw only what the target states')).toBe(true)
  expect(prompts[0]!.includes('Do not invent an order')).toBe(true)
  expect(prompts[0]!.includes('belongs in its container label')).toBe(true)
  expect(prompts[0]!.includes('Something proposed to replace X is not an input to X')).toBe(true)
  expect(prompts[0]!.includes('{style.stroke-dash: 3}')).toBe(true)
})

// 結論がない・主語がない・状態の区別がない・関係のない箱の羅列、を防ぐルール（#8）
test('fork への指示に、結論・主語・状態の記号・関係のない項目の扱いが入る', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }])
  await draw(io, { ...input, trigger: 'answer' })
  expect(prompts[0]!.includes('TITLE: <the conclusion of the target, one sentence>')).toBe(true)
  expect(prompts[0]!.includes('keeps its subject')).toBe(true)
  expect(prompts[0]!.includes('✓ done or fine, ! needs action, ? not checked')).toBe(true)
  // 関係のない項目は、箱を積まずに一覧・表にする（2026-11-24 に比較表・格子への誘導から置き換え）
  expect(prompts[0]!.includes('do not draw a diagram. Reply with a ```md block instead')).toBe(true)
})

test('ラベルは 2 行まで。1 行の文字数は日本語 16・英語 30', async () => {
  const ja = fakeIO([{ text: GOOD }])
  await draw(ja.io, input)
  expect(ja.prompts[0]!.includes('at most 2 lines (split with \\n), each line at most 16 characters')).toBe(true)
  expect(ja.prompts[0]!.includes('at most 20 characters')).toBe(false)
  const en = fakeIO([{ text: GOOD }])
  await draw(en.io, { ...input, lang: 'en' })
  expect(en.prompts[0]!.includes('each line at most 30 characters')).toBe(true)
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

test('描く図にはライトとダークの配色が付き、安全の検査も通る', async () => {
  expect(isSafeD2(themed('a -> b'))).toBe(true)
  const { io, runs } = fakeIO([{ text: GOOD }])
  const result = await draw(io, input)
  expect(result.ok && result.figure.d2.includes('theme-overrides') && result.figure.d2.includes('dark-theme-overrides')).toBe(true)
  expect(renders(runs).every(r => r.stdin?.includes('B1: "#6A3FC1"') && r.stdin.includes('B1: "#5FE3FF"'))).toBe(true)
})

// 格子（grid-columns）の中の矢印は ELK を通らず直線で引かれ、箱を貫いて文字が重なる（#4）
test('矢印のある図からは grid-columns を外し、矢印のない整理の図には残す', async () => {
  const nested = '```d2\nmac: Mac {\n  grid-columns: 1\n  a: A\n  b: B\n}\nsrv: Server {\n  grid-rows: 2\n  p: P\n}\nmac.a -> srv.p: copy\n```\nKIND: containment\nTITLE: t'
  const withEdges = await draw(fakeIO([{ text: nested }]).io, { ...input, trigger: 'answer', candidates: [{ id: 'containment', p: 0.9 }] })
  expect(withEdges.ok && /grid-(columns|rows)/.test(withEdges.figure.d2)).toBe(false)
  expect(withEdges.ok && withEdges.figure.d2.includes('mac.a -> srv.p: copy')).toBe(true)
  const status = '```d2\ngrid-columns: 1\nt: Topic {\n  grid-columns: 1\n  d: "✓ Decided"\n}\n```\nKIND: status\nTITLE: t'
  const summary = await draw(fakeIO([{ text: status }]).io, { ...input, trigger: 'prompt', candidates: [{ id: 'status', p: 1 }] })
  expect(summary.ok && summary.figure.d2.match(/grid-columns: 1/g)?.length).toBe(2)
})

test('fork への指示で、grid-columns は矢印のない図に限る（#4）', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }])
  await draw(io, input)
  expect(prompts[0]!.includes('Never put grid-columns on a container whose members have arrows to or from them')).toBe(true)
})

// 一覧・表（Markdown）: 流れのない返答は図にせず、ペインの Markdown で出す（2026-11-24 の試作）
const LIST = '```md\n## 原因\n- ! 返答を写さなかった\n## 今の状態\n- ✓ 戻せる\n```\nKIND: list\nTITLE: 取り違えたのは私'

test('parseReply は md のブロックと KIND: list を取り出す', async () => {
  expect(parseReply(LIST)).toEqual({ markdown: '## 原因\n- ! 返答を写さなかった\n## 今の状態\n- ✓ 戻せる', kind: 'list', title: '取り違えたのは私' })
  expect(parseReply('```md\na\n```\n```d2\nb\n```\nKIND: list\nTITLE: t')).toBe(undefined)
})

test('一覧の返事は D2 を通さずに、Markdown の図として返す', async () => {
  const { io, runs } = fakeIO([{ text: LIST }])
  const result = await draw(io, { ...input, trigger: 'answer' })
  expect(result.ok && result.figure.kind).toBe('list')
  expect(result.ok && result.figure.markdown).toBe('## 原因\n- ! 返答を写さなかった\n## 今の状態\n- ✓ 戻せる')
  expect(result.ok && result.figure.svg).toBe('')
  expect(renders(runs).length).toBe(0)
})

test('一覧の KIND が list・table 以外なら書き直させる', async () => {
  const { io, prompts } = fakeIO([{ text: LIST.replace('KIND: list', 'KIND: chart') }, { text: LIST }])
  const result = await draw(io, { ...input, trigger: 'answer' })
  expect(result.ok).toBe(true)
  expect(prompts.length).toBe(2)
})

test('一覧の中のリンク・画像・URL・HTML のタグは取り除く', async () => {
  const bad = '```md\n- [公式](https://e.com/x) を見る\n- ![図](http://e.com/a.png)\n- <img src=x onerror=y>あ\n- 詳しくは https://e.com/y\n- 別に www.e.com/z も\n```\nKIND: list\nTITLE: t'
  const result = await draw(fakeIO([{ text: bad }]).io, { ...input, trigger: 'answer' })
  const md = result.ok ? result.figure.markdown ?? '' : ''
  expect(/https?:|www\.|\]\(|<img|onerror/.test(md)).toBe(false)
  expect(md.includes('公式 を見る')).toBe(true)
})

test('依頼文に一覧・表の選択肢があり、「比較表か格子にする」の規則は外れている', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }])
  await draw(io, input)
  expect(prompts[0]!.includes('```md')).toBe(true)
  expect(prompts[0]!.includes('use a comparison or matrix layout instead')).toBe(false)
})

// 状態の印は描く前に見た目へ変える（2026-11-24）
test('D2 の箱の印は状態の class に変わり、印の文字は残らない', async () => {
  const marked = '```d2\na: "! 権限が足りない"\nb: ✓ 通過\na -> b\n```\nKIND: flow\nTITLE: t'
  const { io, runs } = fakeIO([{ text: marked }])
  const result = await draw(io, { ...input, trigger: 'answer' })
  expect(result.ok && result.figure.d2.includes('a.class: st-warn')).toBe(true)
  expect(result.ok && /:\s*"?!\s/.test(result.figure.d2)).toBe(false)
  expect(renders(runs).every(r => r.stdin?.includes('st-ok'))).toBe(true)
})

test('矢印の文字は斜体にしない（実機で読みにくかった）', async () => {
  const { io, runs } = fakeIO([{ text: GOOD }])
  await draw(io, input)
  expect(renders(runs).every(r => r.stdin?.includes('(** -> **)[*].style.italic: false'))).toBe(true)
})

test('新しい md の種類（タイムライン・カンバン・長所と短所・チェックリスト）を受け付ける', async () => {
  for (const kind of ['timeline', 'kanban', 'procon', 'checklist']) {
    const result = await draw(fakeIO([{ text: `\`\`\`md\n- a\n\`\`\`\nKIND: ${kind}\nTITLE: t` }]).io, { ...input, trigger: 'answer' })
    expect(result.ok && result.figure.kind).toBe(kind)
  }
})

test('md の種類の候補には、md の見本を付けて渡す', async () => {
  const { io, prompts } = fakeIO([{ text: GOOD }])
  await draw(io, { ...input, trigger: 'answer', candidates: [{ id: 'timeline' as never, p: 0.9 }] })
  expect(prompts[0]!.includes('reply with a ```md block')).toBe(true)
})

// 格子を外すのは、中身に矢印がつながる枠だけ。枠そのものから出る矢印は重ならない（2026-11-24、特性要因の縦積み）
test('中身に矢印がつながらない枠の格子は残し、つながる枠の格子は外す', async () => {
  const fish = 'causes: 原因 {\n  grid-columns: 1\n  img: 画像 {\n    grid-columns: 1\n    a: 圧縮なし\n  }\n}\nresult: 結果\ncauses -> result'
  expect(gridOnlyWithoutEdges(fish)).toBe(fish)
  const nested = 'mac: Mac {\n  grid-columns: 1\n  a: A\n}\nsrv: S {\n  grid-columns: 1\n  p: P\n}\nmac.a -> srv.p'
  expect(/grid-columns/.test(gridOnlyWithoutEdges(nested))).toBe(false)
  const top = 'grid-columns: 1\na: A\nb: B\na -> b'
  expect(/grid-columns/.test(gridOnlyWithoutEdges(top))).toBe(false)
  const inner = 'x: X {\n  grid-columns: 1\n  a -> b\n}'
  expect(/grid-columns/.test(gridOnlyWithoutEdges(inner))).toBe(false)
})

// 図の中の問いに、その場で返答を書けるようにする（2026-11-25）
test('parseReply は REPLY 行を見出しと問いに分け、崩れた行と 6 行目以降を捨てる', async () => {
  const text = '```md\n## 案A\n- x\n```\nKIND: list\nTITLE: t\nREPLY: 案A | どちらで進めますか？（案A／案C）\nREPLY: 期限はいつにしますか？\nREPLY:   \nREPLY: | \n' + 'REPLY: q\n'.repeat(5)
  const parsed = parseReply(text)!
  expect(parsed.replies?.[0]).toEqual({ section: '案A', question: 'どちらで進めますか？（案A／案C）' })
  expect(parsed.replies?.[1]).toEqual({ section: '', question: '期限はいつにしますか？' })
  expect(parsed.replies?.length).toBe(5)
})

test('応答のときは問いの書き出し方を指示し、質問のときは指示しない', async () => {
  const a = fakeIO([{ text: GOOD }])
  await draw(a.io, { ...input, trigger: 'answer' })
  expect(a.prompts[0]!.includes('REPLY:')).toBe(true)
  expect(a.prompts[0]!.includes('Do not invent questions')).toBe(true)
  const q = fakeIO([{ text: GOOD }])
  await draw(q.io, { ...input, trigger: 'question' })
  expect(q.prompts[0]!.includes('REPLY:')).toBe(false)
})

test('質問から描いた図では、fork が REPLY を書いても返答欄を出さない', async () => {
  const { io } = fakeIO([{ text: GOOD + '\nREPLY: | どれにしますか？' }])
  const r = await draw(io, { ...input, trigger: 'question' })
  expect(r.ok && r.figure.replies).toBe(undefined)
  const a = fakeIO([{ text: GOOD + '\nREPLY: | どれにしますか？' }])
  const r2 = await draw(a.io, { ...input, trigger: 'answer' })
  expect(r2.ok && r2.figure.replies).toEqual([{ section: '', question: 'どれにしますか？' }])
})
