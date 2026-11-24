import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

const PLUGIN = 'zu-de-clemens'
const KEY = 'test-key-1234567890'
const OPTIONS = { typesafe_api_key: KEY, threshold: 0.5, auto_mode: false, image_check: false, language: 'auto' }
const GOOD_REPLY = '```d2\na -> b\n```\nKIND: flow\nTITLE: 流れの図\nRECOMMEND: 2. B案：速い'
const QUESTION = { question: 'A案とB案のどちら？', header: '案', multiSelect: false, options: [{ label: 'A案', description: 'a' }, { label: 'B案', description: 'b' }] }

type World = {
  fetches: number
  /** 最後に Jev に送った判定対象の文 */
  sentText?: string
  imageFetches: number
  forks: number
  toasts: string[]
  files: Map<string, string>
  surfaces: RenderSurface[]
  placed: boolean
  noul: number
  jevStatus: number
  forkReply: string
  opens: number
  surfacesThrow: boolean
  /** fork の返事を差し替える（n は何回目の呼び出しか） */
  fork?: (n: number) => Promise<string>
  /** 最後に fork へ送った依頼文 */
  lastPrompt?: string
  /** $.process.run に渡されたコマンド */
  runs: string[][]
  /** uname の答え */
  os: string
}

// プラグインが使う外部の呼び出しを、すべてテスト側で受ける。
function world(on: On, over: Partial<World> = {}) {
  const w: World = {
    fetches: 0, imageFetches: 0, forks: 0, toasts: [], runs: [], os: 'Darwin', files: new Map(), surfaces: ['desktop'], placed: true,
    noul: 0.8, jevStatus: 200, forkReply: GOOD_REPLY, opens: 0, surfacesThrow: false, ...over,
  }
  const clock = mock.clock(on)
  on('http.fetch', async (_$, e) => {
    const body = JSON.parse(String(e.init?.body))
    if (body.assets) {
      w.imageFetches++
      const ok = { overlap: { noul: 0.1 }, one_direction: { noul: 0.9 }, diagram_kind: { probabilities: { flow: 0.9 } } }
      return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ answers: ok }) } }
    }
    w.fetches++
    w.sentText = body.state?.target?.text
    const answers = 'session_summary' in body.questions
      ? { session_summary: { type: 'noul', noul: w.noul } }
      : { needs_diagram: { type: 'noul', noul: w.noul }, diagram_kind: { type: 'choice', probabilities: { flow: 0.7, layers: 0.3 } } }
    return { value: { status: w.jevStatus, ok: w.jevStatus < 300, headers: {}, text: JSON.stringify({ answers }) } }
  })
  on('model.fork', async (_$, e) => {
    w.forks++
    w.lastPrompt = e.prompt
    const text = w.fork ? await w.fork(w.forks) : w.forkReply
    return { value: { isAnswered: true, text } as never }
  })
  on('process.run', async (_$, e) => {
    w.runs.push([...e.argv])
    if (e.argv[0] === 'uname') return { value: { exitCode: 0, stdout: `${w.os}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    const out = e.argv[1] === '--version' ? 'v0.9.0' : e.argv[1] === 'validate' ? 'ok'
      : e.argv.includes('ascii') ? '[a]->[b]' : '<svg viewBox="0 0 320 120"></svg>'
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('fs.read', async (_$, e) => {
    if (e.path.endsWith('.png')) return { value: { base64: 'iVBORw0KGgoAAAANSUhEUgAAAZAAAAEsCAIAAABi1XKV' } as never }
    if (!w.files.has(e.path)) throw new Error('missing')
    return { value: w.files.get(e.path)! }
  })
  on('fs.write', async (_$, e) => {
    w.files.set(e.path, e.text)
    return { value: undefined }
  })
  on('env.get', async (_$, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  on('session.cwd', async () => ({ value: '/home/u/app' }))
  on('session.surfaces', async () => {
    if (w.surfacesThrow) throw new Error('boom')
    return { value: w.surfaces }
  })
  on('ui.open', async () => {
    w.opens++
    return { value: w.placed ? { isPlaced: true } : { isPlaced: false, reason: 'no room' } as never }
  })
  on('ui.toast', async (_$, e) => {
    w.toasts.push(String(e.text))
    return { value: undefined }
  })
  on('ui.log', async () => ({ value: undefined }))
  on('tool.call', { tool: 'AskUserQuestion' }, async () => ({ result: { answers: { [QUESTION.question]: 'B案' } } as never }))
  on('turn.complete', async () => ({ text: '' }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async () => ({ cwd: '/home/u/app' }))
  const settle = () => clock.advance(0)
  const log = () => [...w.files.values()].join('\n')
  return { w, settle, log }
}

const mountPane = ($: any, surface: RenderSurface) => $.ui.mount({
  plugin: PLUGIN, surface, component: 'Pane', requestId: PLUGIN,
  props: { title: '図解', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 } },
})

const ask = ($: any) => $.tool.call({ tool: 'AskUserQuestion', questions: [QUESTION] } as never)

for (const surface of ['terminal', 'desktop'] as const) {
  test(`R1: 確率がしきい値以上なら提案が出て、押すまで fork は呼ばれない（${surface}）`, { options: OPTIONS }, async ($, on) => {
    const { w, settle } = world(on)
    await ask($)
    await settle()
    const ui = await mountPane($, surface)
    expect(await ui.find({ key: 'draw' })).toBeDefined()
    expect(w.forks).toBe(0)
    await ui.press({ key: 'draw' })
    await settle()
    expect(w.forks).toBe(1)
    expect(await ui.find({ text: /流れの図/ })).toBeDefined()
    if (surface === 'desktop') expect(await ui.find({ type: 'Svg' })).toBeDefined()
    else expect(await ui.find({ text: /\[a\]->\[b\]/ })).toBeDefined()
  })
}

test('確率がしきい値未満なら何も出ず、fork も呼ばれない。回答ログに below と確率が残る', { options: OPTIONS }, async ($, on) => {
  const { w, settle, log } = world(on, { noul: 0.3 })
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'draw' })).toBe(undefined)
  expect(w.forks).toBe(0)
  expect(log().includes('- reaction: below')).toBe(true)
  expect(log().includes('- probability: 0.30')).toBe(true)
})

test('［今回はいらない］で提案が消え、回答ログに dismissed が残る', { options: OPTIONS }, async ($, on) => {
  const { w, settle, log } = world(on)
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'dismiss' })
  await settle()
  expect(await ui.find({ key: 'draw' })).toBe(undefined)
  expect(w.forks).toBe(0)
  expect(log().includes('- reaction: dismissed')).toBe(true)
})

const complete = ($: any, over: object = {}) =>
  $.turn.complete({ answer: 'IAM のポリシーはアカウントの中で効きます。', reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1', ...over } as never)

test('R2: 応答が正常に終わったときだけ判定する', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on)
  await complete($, { reason: 'aborted', isAborted: true })
  await complete($, { agentId: 'sub-1' })
  await complete($, { answer: '   ' })
  await settle()
  expect(w.fetches).toBe(0)
  await complete($)
  await settle()
  expect(w.fetches).toBe(1)
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ text: /この返答は図で解説できます/ })).toBeDefined()
})

test('R3: セッションの整理を頼んだら提案が出る', { options: OPTIONS }, async ($, on) => {
  const { settle } = world(on, { noul: 0.9 })
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as never)
  await $.prompt.submit({ text: '今このセッションどうなってる？' } as never)
  await settle()
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ text: /このセッションの整理を図にできます/ })).toBeDefined()
  expect(await ui.find({ key: 'draw' })).toBeDefined()
})

test('オートモードでは、提案を経ずに fork が呼ばれる', { options: { ...OPTIONS, auto_mode: true } }, async ($, on) => {
  const { w, settle, log } = world(on)
  await ask($)
  await settle()
  expect(w.forks).toBe(1)
  expect(log().includes('- reaction: auto')).toBe(true)
})

test('キーがなければ案内を 1 回だけ出し、Jev には聞かない。回答ログに no-key が残る', { options: { ...OPTIONS, typesafe_api_key: '' } }, async ($, on) => {
  const { w, settle, log } = world(on)
  await ask($)
  await settle()
  await complete($)
  await settle()
  expect(w.fetches).toBe(0)
  expect(w.opens).toBe(1)
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ text: /API キーが設定されていません/ })).toBeDefined()
  expect(log().includes('- reaction: no-key')).toBe(true)
})

test('Jev が 503 なら何も出さず、質問の結果はそのまま返る。回答ログに jev-unavailable が残る', { options: OPTIONS }, async ($, on) => {
  const { w, settle, log } = world(on, { jevStatus: 503 })
  const ran = await ask($)
  await settle()
  expect((ran as any).result.answers[QUESTION.question]).toBe('B案')
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'draw' })).toBe(undefined)
  expect(w.forks).toBe(0)
  expect(log().includes('- reaction: jev-unavailable')).toBe(true)
})

test('ペインが置かれなければトーストで知らせる', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on, { placed: false })
  await ask($)
  await settle()
  expect(w.toasts.length).toBe(1)
})

test('画面がつながっていなければ Jev に聞かず、not-shown を記録する', { options: OPTIONS }, async ($, on) => {
  const { w, settle, log } = world(on, { surfaces: [] })
  await ask($)
  await settle()
  expect(w.fetches).toBe(0)
  expect(log().includes('- reaction: not-shown')).toBe(true)
})

test('MOD の中で例外が起きても、質問の結果はそのまま返る。回答ログに error が残る', { options: OPTIONS }, async ($, on) => {
  const { settle, log } = world(on, { surfacesThrow: true })
  const ran = await ask($)
  await settle()
  expect((ran as any).result.answers[QUESTION.question]).toBe('B案')
  expect(log().includes('- reaction: error')).toBe(true)
})

test('提案中に次のきっかけが来たら ignored を記録する', { options: OPTIONS }, async ($, on) => {
  const { settle, log } = world(on)
  await ask($)
  await settle()
  await complete($)
  await settle()
  expect(log().includes('- reaction: ignored')).toBe(true)
})

test('描いている途中に次のきっかけが来たら、古い結果は表示しない', { options: OPTIONS }, async ($, on) => {
  let release = () => {}
  const { settle } = world(on, {
    fork: async n => {
      if (n === 1) await new Promise<void>(resolve => { release = resolve })
      return GOOD_REPLY.replace('流れの図', n === 1 ? '古い図' : '新しい図')
    },
  })
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  const pressing = ui.press({ key: 'draw' })
  await settle()
  await complete($)
  await settle()
  release()
  await pressing
  await settle()
  expect(await ui.find({ text: /古い図/ })).toBe(undefined)
})

test('図の検品が ON のときだけ、描いた図を画像で Jev に見せる', { options: { ...OPTIONS, image_check: true } }, async ($, on) => {
  const { w, settle } = world(on)
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'draw' })
  await settle()
  expect(w.imageFetches).toBe(1)
  expect(await ui.find({ text: /流れの図/ })).toBeDefined()
})

test('図の検品が OFF なら画像を送らない', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on)
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'draw' })
  await settle()
  expect(w.imageFetches).toBe(0)
})

const CASES = '/home/u/app/evals/cases.jsonl'
const evalCase = (id: string, label: string | null) =>
  JSON.stringify({ id, trigger: 'question', text: 'A案とB案のどちら？', recent_prompts: [], label, kind: label === 'want' ? 'flow' : null })
const runEvalCommand = async ($: any) => {
  await $.session.start({ cwd: '/home/u/app' } as never)
  return $.command.run({ command: 'zu-de-clemens-eval' })
}

test('評価コマンドは設定済みのキーで各件を Jev に聞き、results.md を書く', { options: OPTIONS }, async ($, on) => {
  const { w } = world(on)
  w.files.set(CASES, [evalCase('c01', 'want'), evalCase('c02', 'no')].join('\n'))
  const ran = await runEvalCommand($)
  expect(w.fetches).toBe(2)
  const results = w.files.get('/home/u/app/evals/results.md')!
  expect(results.includes('| c01 | want | 0.80 | flow | flow, layers |')).toBe(true)
  expect(String(ran.text).includes('results.md')).toBe(true)
})

test('評価コマンドは、ラベルのない件があれば Jev に聞かない', { options: OPTIONS }, async ($, on) => {
  const { w } = world(on)
  w.files.set(CASES, [evalCase('c01', 'want'), evalCase('c02', null)].join('\n'))
  const ran = await runEvalCommand($)
  expect(w.fetches).toBe(0)
  expect(String(ran.text).includes('c02')).toBe(true)
})

test('評価コマンドは、キーがなければ Jev に聞かない', { options: { ...OPTIONS, typesafe_api_key: '' } }, async ($, on) => {
  const { w } = world(on)
  w.files.set(CASES, evalCase('c01', 'want'))
  const ran = await runEvalCommand($)
  expect(w.fetches).toBe(0)
  expect(String(ran.text).includes('/plugin configure')).toBe(true)
})

test('Claude の質問を判定するとき、選択肢の説明まで Jev に渡す', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on)
  await ask($)
  await settle()
  expect(w.sentText).toBe('A案とB案のどちら？\n1. A案: a\n2. B案: b')
})

test('図を出したあと、次のきっかけで提案が出なければ図は残る', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on)
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'draw' })
  await settle()
  w.noul = 0.3
  await complete($)
  await settle()
  expect(await ui.find({ text: /流れの図/ })).toBeDefined()
})

test('描いている途中に次のきっかけが来ても、提案が出なければ描き終えた図を出す', { options: OPTIONS }, async ($, on) => {
  let release = () => {}
  const { w, settle } = world(on, {
    fork: async () => {
      await new Promise<void>(resolve => { release = resolve })
      return GOOD_REPLY
    },
  })
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  const pressing = ui.press({ key: 'draw' })
  await settle()
  w.noul = 0.3
  await complete($)
  await settle()
  release()
  await pressing
  await settle()
  expect(await ui.find({ text: /流れの図/ })).toBeDefined()
})

test('入力のときに画面があれば、応答の終わりに画面が空と返っても提案を出す', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on)
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as never)
  await $.prompt.submit({ text: 'リクエストの流れを説明して' } as never)
  await settle()
  w.surfaces = []
  await complete($)
  await settle()
  expect(w.fetches).toBe(2)
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'draw' })).toBeDefined()
})

test('入力のときにも画面がなければ（claude -p など）、応答の終わりも Jev に聞かない', { options: OPTIONS }, async ($, on) => {
  const { w, settle, log } = world(on, { surfaces: [] })
  on('prompt.submit', async (_$, e) => ({ text: e.text }) as never)
  await $.prompt.submit({ text: 'リクエストの流れを説明して' } as never)
  await settle()
  await complete($)
  await settle()
  expect(w.fetches).toBe(0)
  expect(log().split('- reaction: not-shown').length - 1).toBe(2)
})

// #7 ボタンの押しやすさ。大きさの指定は API にないため、主ボタンの印・枠・ラベルの長さで押せる範囲を広げる
for (const surface of ['terminal', 'desktop'] as const) {
  test(`提案のボタンは［図にする］が主ボタンで、［今回はいらない］も枠つきで描く（${surface}）`, { options: OPTIONS }, async ($, on) => {
    const { settle } = world(on)
    await ask($)
    await settle()
    const ui = await mountPane($, surface)
    const drawButton = await ui.find({ key: 'draw' })
    const dismissButton = await ui.find({ key: 'dismiss' })
    expect(drawButton?.props.variant).toBe('primary')
    expect(drawButton?.props.label).toBe('🎨 図にする')
    expect(dismissButton?.props.plain).toBe(undefined)
    expect(dismissButton?.props.label).toBe('🙅 今回はいらない')
  })
}

// #5 手動の［図にして］
test('しきい値未満でも［図にして］で直近のきっかけを図にでき、回答ログに manual が残る', { options: OPTIONS }, async ($, on) => {
  const { w, settle, log } = world(on, { noul: 0.3 })
  await complete($)
  await settle()
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'draw' })).toBe(undefined)
  await ui.press({ key: 'manual' })
  await settle()
  expect(w.forks).toBe(1)
  expect(w.lastPrompt?.includes('IAM のポリシーはアカウントの中で効きます。')).toBe(true)
  expect(await ui.find({ text: /流れの図/ })).toBeDefined()
  expect(log().includes('- reaction: below')).toBe(true)
  expect(log().includes('- reaction: manual')).toBe(true)
})

test('図を出したあとにしきい値未満のきっかけが来たら、図を残したまま［図にして］を出す', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on)
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'draw' })
  await settle()
  w.noul = 0.3
  await complete($)
  await settle()
  expect(await ui.find({ text: /流れの図/ })).toBeDefined()
  await ui.press({ key: 'manual' })
  await settle()
  expect(w.forks).toBe(2)
  expect(w.lastPrompt?.includes('IAM のポリシーはアカウントの中で効きます。')).toBe(true)
})

test('提案が出ている場面と、きっかけがまだない場面では［図にして］を出さない', { options: OPTIONS }, async ($, on) => {
  const { settle } = world(on)
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'manual' })).toBe(undefined)
  await ask($)
  await settle()
  expect(await ui.find({ key: 'draw' })).toBeDefined()
  expect(await ui.find({ key: 'manual' })).toBe(undefined)
})

// #3 図を大きく開く
const drawFigure = async ($: any, on: On, over: Partial<World> = {}) => {
  const ctx = world(on, over)
  await ask($)
  await ctx.settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'draw' })
  await ctx.settle()
  return { ...ctx, ui }
}

test('［大きく開く］で図を埋め込んだ HTML をデータ置き場に書き、macOS の open で開く', { options: OPTIONS }, async ($, on) => {
  const { w, ui } = await drawFigure($, on)
  await ui.press({ key: 'open' })
  const path = '/home/u/.claude/plugins/data/zu-de-clemens/figure.html'
  const html = w.files.get(path) ?? ''
  expect(html.startsWith('<!doctype html>')).toBe(true)
  expect(html.includes('<svg viewBox="0 0 320 120"></svg>')).toBe(true)
  expect(w.runs.some(argv => argv[0] === 'open' && argv[1] === path)).toBe(true)
})

test('［大きく開く］は、開き方を知らない OS ではトーストで知らせ、何も起動しない', { options: OPTIONS }, async ($, on) => {
  const { w, ui } = await drawFigure($, on, { os: 'MINGW64_NT' })
  await ui.press({ key: 'open' })
  expect(w.runs.some(argv => argv[0] === 'open' || argv[0] === 'xdg-open')).toBe(false)
  expect(w.toasts.length).toBe(1)
})

// #6 描き直しの指示
for (const surface of ['terminal', 'desktop'] as const) {
  test(`図の下の入力欄に指示を書いて送ると、指示と前の D2 を添えて描き直す（${surface}）`, { options: OPTIONS }, async ($, on) => {
    const ctx = world(on)
    await ask($)
    await ctx.settle()
    const ui = await mountPane($, surface)
    await ui.press({ key: 'draw' })
    await ctx.settle()
    await $.ui.input({ plugin: PLUGIN, key: 'redraw', text: 'AとBは同時に起きる', surface })
    await ctx.settle()
    expect(ctx.w.forks).toBe(2)
    expect(ctx.w.lastPrompt?.includes('AとBは同時に起きる')).toBe(true)
    expect(ctx.w.lastPrompt?.includes('a -> b')).toBe(true)
    expect(await ui.find({ text: /流れの図/ })).toBeDefined()
    expect(ctx.log().includes('- reaction: redraw')).toBe(true)
    expect(ctx.log().includes('- instruction: AとBは同時に起きる')).toBe(true)
  })
}

// 入力欄は送信ボタン（submitLabel）を自分で描く。別に［描き直す］を置くと 2 つ並ぶ（2026-11-21 実機）
test('描き直しの入力欄は空なら何もせず、別置きの［描き直す］ボタンはない', { options: OPTIONS }, async ($, on) => {
  const { w, ui, settle } = await drawFigure($, on)
  await $.ui.input({ plugin: PLUGIN, key: 'redraw', text: '   ', surface: 'desktop' })
  await settle()
  expect(w.forks).toBe(1)
  expect(await ui.find({ key: 'redrawButton' })).toBeUndefined()
})

// 一覧・表は Markdown で描き、［大きく開く］は出さない（2026-11-24 の試作）
test('一覧の図はデスクトップで Markdown として描き、［大きく開く］を出さない', { options: OPTIONS }, async ($, on) => {
  const ctx = world(on, { forkReply: '```md\n## 原因\n- ! a\n```\nKIND: list\nTITLE: 一覧の題' })
  await ask($)
  await ctx.settle()
  const ui = await mountPane($, 'desktop')
  await ui.press({ key: 'draw' })
  await ctx.settle()
  expect(await ui.find({ text: /一覧の題/ })).toBeDefined()
  const fig = await ui.find({ key: 'figure' })
  expect((fig as { type?: string } | undefined)?.type).toBe('Markdown')
  expect(await ui.find({ key: 'open' })).toBeUndefined()
})
