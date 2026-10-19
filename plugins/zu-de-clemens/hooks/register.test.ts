import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

const PLUGIN = 'zu-de-clemens'
const KEY = 'test-key-1234567890'
const OPTIONS = { typesafe_api_key: KEY, threshold: 0.5, auto_mode: false, image_check: false, language: 'auto' }
const GOOD_REPLY = '```d2\na -> b\n```\nKIND: flow\nTITLE: 流れの図\nRECOMMEND: 2. B案：速い'
const QUESTION = { question: 'A案とB案のどちら？', header: '案', multiSelect: false, options: [{ label: 'A案', description: 'a' }, { label: 'B案', description: 'b' }] }

type World = {
  fetches: number
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
}

// プラグインが使う外部の呼び出しを、すべてテスト側で受ける。
function world(on: On, over: Partial<World> = {}) {
  const w: World = {
    fetches: 0, forks: 0, toasts: [], files: new Map(), surfaces: ['desktop'], placed: true,
    noul: 0.8, jevStatus: 200, forkReply: GOOD_REPLY, opens: 0, surfacesThrow: false, ...over,
  }
  const clock = mock.clock(on)
  on('http.fetch', async (_$, e) => {
    w.fetches++
    const body = JSON.parse(String(e.init?.body))
    const answers = 'session_summary' in body.questions
      ? { session_summary: { type: 'noul', noul: w.noul } }
      : { needs_diagram: { type: 'noul', noul: w.noul }, diagram_kind: { type: 'choice', probabilities: { flow: 0.7, layers: 0.3 } } }
    return { value: { status: w.jevStatus, ok: w.jevStatus < 300, headers: {}, text: JSON.stringify({ answers }) } }
  })
  on('model.fork', async () => {
    w.forks++
    const text = w.fork ? await w.fork(w.forks) : w.forkReply
    return { value: { isAnswered: true, text } as never }
  })
  on('process.run', async (_$, e) => {
    const out = e.argv[1] === '--version' ? 'v0.9.0' : e.argv[1] === 'validate' ? 'ok'
      : e.argv.includes('ascii') ? '[a]->[b]' : '<svg viewBox="0 0 320 120"></svg>'
    return { value: { exitCode: 0, stdout: out, stderr: '' } }
  })
  on('fs.read', async (_$, e) => {
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

test('確率がしきい値未満なら何も出ず、fork も呼ばれない', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on, { noul: 0.3 })
  await ask($)
  await settle()
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'draw' })).toBe(undefined)
  expect(w.forks).toBe(0)
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

test('キーがなければ案内を 1 回だけ出し、Jev には聞かない', { options: { ...OPTIONS, typesafe_api_key: '' } }, async ($, on) => {
  const { w, settle } = world(on)
  await ask($)
  await settle()
  await complete($)
  await settle()
  expect(w.fetches).toBe(0)
  expect(w.opens).toBe(1)
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ text: /API キーが設定されていません/ })).toBeDefined()
})

test('Jev が 503 なら何も出さず、質問の結果はそのまま返る', { options: OPTIONS }, async ($, on) => {
  const { w, settle } = world(on, { jevStatus: 503 })
  const ran = await ask($)
  await settle()
  expect((ran as any).result.answers[QUESTION.question]).toBe('B案')
  const ui = await mountPane($, 'desktop')
  expect(await ui.find({ key: 'draw' })).toBe(undefined)
  expect(w.forks).toBe(0)
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

test('MOD の中で例外が起きても、質問の結果はそのまま返る', { options: OPTIONS }, async ($, on) => {
  const { settle } = world(on, { surfacesThrow: true })
  const ran = await ask($)
  await settle()
  expect((ran as any).result.answers[QUESTION.question]).toBe('B案')
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
