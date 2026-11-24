import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { View } from '../types'
import { kindById } from './catalog'
import type { DiagramKind } from './catalog'
import { checkFigure } from './check'
import { draw } from './draw'
import type { DrawIO } from './draw'
import { parseCases, report, runEval } from './eval'
import { judge } from './jev'
import type { JevIO, TriggerKind } from './jev'
import { appendLog } from './log'
import type { LogEntry, LogIO } from './log'
import { renderPane } from './pane'
import { detectLang, t } from './strings'
import type { StringKey } from './strings'
import { viewerHtml } from './viewer'

const PANE = 'zu-de-clemens'
// コマンド名にコロンは使えない（CommandSpec.name）
const EVAL_COMMAND = 'zu-de-clemens-eval'
const view = atom({ plugin: 'zu-de-clemens', key: 'view' } as const, { seq: 0, state: 'idle', lang: 'en' } as View)
const guided = atom({ plugin: 'zu-de-clemens', key: 'guided' } as const, false)
const prompts = atom({ plugin: 'zu-de-clemens', key: 'prompts' } as const, [] as string[])
const watched = atom({ plugin: 'zu-de-clemens', key: 'watched' } as const, false)

// 外部とのやりとりは $ を通す。各部品には必要な働きだけを渡す（テストで差し替えるため）。
const jevIO = ($: EngineInterface): JevIO => ({
  fetch: (url, init) => $.http.fetch(url, init),
  sleep: (ms, signal) => $.clock.sleep(ms, { signal }),
  log: text => $.ui.log(text, { to: 'debug' }),
})
const drawIO = ($: EngineInterface): DrawIO => ({
  fork: prompt => $.model.fork({ prompt }),
  run: (argv, init) => $.process.run(argv, init),
  // 標準出力で受けるとバイト列が壊れるため、データ置き場のファイルに書かせてバイトで読む
  png: async d2 => {
    const path = `${(await $.env.get('HOME')) ?? ''}/.claude/plugins/data/zu-de-clemens/check.png`
    const made = await $.process.run(['d2', '--layout=elk', '--theme', '0', '--pad', '20', '-', path], { stdin: d2, timeoutMs: 10_000 })
    if (made.exitCode !== 0) return undefined
    const read = await $.fs.read(path, { as: 'bytes' })
    return typeof read === 'string' ? undefined : read.base64
  },
})
const logIO = ($: EngineInterface): LogIO => ({
  read: path => $.fs.read(path).catch(() => undefined),
  write: (path, text) => $.fs.write(path, text),
  log: text => $.ui.log(text, { to: 'debug' }),
})

type Options = { key: string; threshold: number; auto: boolean; imageCheck: boolean; language: string }

function readOptions(options: PluginOptions): Options {
  const threshold = Number(options.threshold)
  return {
    key: typeof options.typesafe_api_key === 'string' ? options.typesafe_api_key.trim() : '',
    threshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.8,
    auto: options.auto_mode === true,
    imageCheck: options.image_check === true,
    language: typeof options.language === 'string' ? options.language : 'auto',
  }
}

async function log($: EngineInterface, current: View, reaction: LogEntry['reaction'], instruction?: string) {
  if (!current.trigger) return
  const place = { home: (await $.env.get('HOME')) ?? '', cwd: await $.session.cwd() }
  await appendLog(logIO($), place, {
    at: new Date(await $.clock.now()).toISOString(),
    trigger: current.trigger,
    probability: current.probability,
    candidates: (current.candidates ?? []).map(c => c.id) as LogEntry['candidates'],
    reaction,
    ...(current.figure ? { figure: { kind: current.figure.kind as never, title: current.figure.title } } : {}),
    ...(current.question ? { question: current.question } : {}),
    ...(current.answer ? { answer: current.answer } : {}),
    ...(instruction ? { instruction } : {}),
  })
}

const dataDir = async ($: EngineInterface) => `${(await $.env.get('HOME')) ?? ''}/.claude/plugins/data/zu-de-clemens`

async function show($: EngineInterface, lang: View['lang']) {
  const opened = await $.ui.open({ id: PANE, title: t(lang, 'title') })
  if (!opened.isPlaced) $.ui.toast(t(lang, 'toastNotPlaced'))
}

async function guide($: EngineInterface, seq: number, lang: View['lang'], message: StringKey) {
  if (await read($, guided)) return
  await update($, guided, () => true)
  await update($, view, (): View => ({ seq, state: 'guide', lang, message }))
  await show($, lang)
}

/** 手動（#5）・描き直し（#6）のときの描き方。描き直しは利用者の指示と前の D2 を fork への依頼の末尾に足す */
type DrawHow = { reaction?: 'manual' | 'redraw'; instruction?: string; previous?: string }

function redrawNote(instruction: string, previous: string | undefined): string {
  return [
    '',
    'The user looked at the diagram drawn for this target and asked for a redraw.',
    ...(previous ? ['Previous diagram:', '```d2', previous, '```'] : []),
    `The user's instruction (follow it, and keep the rules above): ${JSON.stringify(instruction)}`,
  ].join('\n')
}

async function startDraw($: EngineInterface, options: Options, seq: number, how: DrawHow = {}) {
  const current = await read($, view)
  if (current.seq !== seq || !current.trigger) return
  await update($, view, (v): View => ({ ...v, state: 'drawing', drawId: seq }))
  const io = drawIO($)
  if (how.instruction) {
    const note = redrawNote(how.instruction, how.previous)
    io.fork = prompt => $.model.fork({ prompt: `${prompt}\n${note}` })
  }
  const result = await draw(io, {
    trigger: current.trigger,
    text: current.text ?? '',
    candidates: (current.candidates ?? []) as never,
    lang: current.lang,
    ...(options.imageCheck ? { check: (png: string, kind: DiagramKind) => checkFigure(jevIO($), { key: options.key, png, kind }) } : {}),
  })
  // 次のきっかけが来ても、新しい提案や案内に置き換わっていなければ描き終えた図を出す
  const now = await read($, view)
  if (now.state !== 'drawing' || now.drawId !== seq) return
  if (result.ok) {
    // D2 は描き直しのときに fork へ前の図として渡すため残す
    await update($, view, (v): View => ({ ...v, state: 'figure', figure: result.figure }))
    await log($, await read($, view), how.reaction ?? (options.auto ? 'auto' : 'accepted'), how.instruction)
    return
  }
  if (result.reason === 'd2-missing') {
    await update($, guided, () => false)
    await guide($, seq, current.lang, 'guideNoD2')
    return
  }
  const reason = result.reason
  const message: Record<typeof reason, StringKey> = {
    'nothing-to-fork': 'failureNothingToFork',
    'fork-failed': 'failureFork',
    'invalid-reply': 'failureInvalid',
    'unsafe-d2': 'failureUnsafe',
    'd2-failed': 'failureD2',
  }
  await update($, view, (v): View => ({ ...v, state: 'failure', message: message[reason] }))
}

async function consider($: EngineInterface, options: Options, trigger: TriggerKind, text: string, extra: Partial<View> = {}) {
  const before = await read($, view)
  const seq = before.seq + 1
  const lang = detectLang(text, options.language)
  const idle: View = { seq, state: 'idle', lang, trigger, ...extra }
  // キーがなければ、表示中の案内を消さずに抜ける（案内は 1 セッションに 1 回）
  if (!options.key) {
    await log($, idle, 'no-key')
    return guide($, seq, lang, 'guideNoKey')
  }
  // 提案を出したまま次のきっかけが来たら、放置として記録する
  if (before.state === 'proposal') await log($, before, 'ignored')
  // 図と描画中の表示は、次の提案が出るまで残す（読んでいる途中で消さない）
  await update($, view, (v): View => (v.state === 'figure' || v.state === 'drawing' ? { ...v, seq, latest: undefined } : { seq, state: 'idle', lang }))

  const onScreen = (await $.session.surfaces()).length > 0
  if (trigger === 'prompt') await update($, watched, () => onScreen)
  // 応答の終わりには、見ているのに画面が空と返ることがある（2026-10-20 の記録で応答 30 件中 11 件、入力では 0 件）。
  // 直前の入力のときに画面があれば、見ているとみなす。誰も見ていない実行（claude -p など）では入力の時点で空なので、送らない
  if (!onScreen && (trigger === 'prompt' || !(await read($, watched)))) {
    return log($, idle, 'not-shown')
  }
  const judgement = await judge(jevIO($), { key: options.key, trigger, text, recentPrompts: await read($, prompts) })
  if (!judgement.ok) {
    await log($, idle, `jev-${judgement.reason}`)
    if (judgement.reason === 'unauthorized') await guide($, seq, lang, 'guideBadKey')
    return
  }
  const probability = trigger === 'prompt' ? judgement.sessionSummary : judgement.needsDiagram
  const candidates = trigger === 'prompt' ? [{ id: 'status', p: 1 }] : judgement.kinds ?? []
  if (probability === undefined || probability < options.threshold) {
    const latest = { trigger, lang, text, probability, candidates, ...extra }
    if (probability !== undefined) await update($, view, (v): View => (v.seq === seq ? { ...v, latest } : v))
    return log($, { ...idle, probability, candidates }, 'below')
  }
  if ((await read($, view)).seq !== seq) return

  await update($, view, (): View => ({ seq, state: 'proposal', trigger, lang, text, probability, candidates, ...extra }))
  if (options.auto) {
    await show($, lang)
    return startDraw($, options, seq)
  }
  await show($, lang)
}

// しきい値未満だった直近のきっかけを、利用者が頼んだときに描く（#5）
async function drawManually($: EngineInterface, options: Options) {
  const v = await read($, view)
  if (!v.latest || v.state === 'proposal' || v.state === 'drawing') return
  await update($, view, (): View => ({ seq: v.seq, state: 'idle', ...v.latest!, lang: v.latest!.lang, ...(v.answer ? { answer: v.answer } : {}) }))
  await startDraw($, options, v.seq, { reaction: 'manual' })
}

async function redraw($: EngineInterface, options: Options, instruction: string) {
  const text = instruction.trim().slice(0, 1000)
  const v = await read($, view)
  if (!text || v.state !== 'figure' || !v.figure) return
  await startDraw($, options, v.seq, { reaction: 'redraw', instruction: text, ...(v.figure.d2 ? { previous: v.figure.d2 } : {}) })
}

// ペインの幅では読めない図を、図を埋め込んだ HTML にして既定のブラウザで開く（#3。拡大・移動は viewer.ts）。
// Svg 部品はホイール・ピンチを受けず、Client は Svg を描けないため、ペインの中では実現できない
async function openFigure($: EngineInterface) {
  const v = await read($, view)
  if (!v.figure) return
  try {
    // $.session.info() の platform は 2.1.322 の CLI にないため、uname で OS を見分ける
    const os = (await $.process.run(['uname'], { timeoutMs: 10_000 })).stdout.trim()
    const opener = os === 'Darwin' ? 'open' : os === 'Linux' ? 'xdg-open' : undefined
    if (!opener) return $.ui.toast(t(v.lang, 'toastCannotOpen'))
    const kind = kindById(v.figure.kind)?.name[v.lang] ?? v.figure.kind
    const html = viewerHtml({ ...v.figure, kind }, v.lang)
    if (!html) return $.ui.toast(t(v.lang, 'toastCannotOpen'))
    const path = `${await dataDir($)}/figure.html`
    await $.fs.write(path, html)
    const ran = await $.process.run([opener, path], { timeoutMs: 10_000 })
    if (ran.exitCode !== 0) $.ui.toast(t(v.lang, 'toastCannotOpen'))
  } catch {
    $.ui.toast(t(v.lang, 'toastCannotOpen'))
  }
}

// 作者がしきい値を決めるための評価。キーは /plugin configure の値だけを使う（設計 8 章）。
async function evaluate($: EngineInterface, options: Options): Promise<{ text: string }> {
  if (!options.key) return { text: 'TypeSafe の API キーが設定されていません。/plugin configure で入れてください。' }
  const dir = `${await $.session.cwd()}/evals`
  const source = await $.fs.read(`${dir}/cases.jsonl`).catch(() => undefined)
  if (typeof source !== 'string') return { text: `${dir}/cases.jsonl が読めません。リポジトリの直下で実行してください。` }
  const parsed = parseCases(source)
  if (!parsed.ok) return { text: `cases.jsonl: ${parsed.error}` }
  const unlabeled = parsed.cases.filter(c => c.label === null).map(c => c.id)
  if (unlabeled.length > 0) return { text: `ラベルのない件があります：${unlabeled.join(', ')}` }
  const outcomes = await runEval(jevIO($), options.key, parsed.cases as never)
  const { markdown, threshold } = report(outcomes, { at: new Date(await $.clock.now()).toISOString(), model: 'jev-latest' })
  await $.fs.write(`${dir}/results.md`, markdown)
  const failed = outcomes.filter(o => o.p === undefined).length
  return { text: `${dir}/results.md に書きました。既定のしきい値の候補：${threshold ?? 'なし'}${failed ? `（Jev が答えなかった件：${failed}）` : ''}` }
}

// フックは MOD の処理を待たずに次へ進む。MOD の失敗で Claude と利用者を止めない（設計 10 章）。
// 例外の文はログに書かない（リクエストの中身が載りうるため）。
function background($: EngineInterface, trigger: TriggerKind, work: Promise<unknown>) {
  work.catch(() => {
    $.ui.log('zu-de-clemens: background work failed', { to: 'debug' })
    return log($, { seq: 0, state: 'idle', lang: 'en', trigger }, 'error')
  }).catch(() => {})
}

export const register: Register = (on, rawOptions) => {
  const options = readOptions(rawOptions)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: EVAL_COMMAND, description: 'Run the Jev eval on evals/cases.jsonl (for development)' })
    return next(e)
  })

  on('command.run', { command: EVAL_COMMAND }, $ => evaluate($, options))

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    let seq = -1
    try {
      const questions = (e.questions ?? []) as { question: string; options: { label: string; description?: string }[] }[]
      // 説明まで渡す。名前だけだと短い質問に見え、Jev の確率が下がる（評価データも説明つき）
      const option = (o: { label: string; description?: string }, i: number) => `${i + 1}. ${o.label}${o.description ? `: ${o.description}` : ''}`
      const text = questions.map(q => `${q.question}\n${q.options.map(option).join('\n')}`).join('\n\n')
      seq = (await read($, view)).seq + 1
      background($, 'question', consider($, options, 'question', text, { question: questions.map(q => q.question).join(' / ') }))
    } catch {
      // 判定を始められなくても、質問はそのまま通す
    }
    const ran = await next(e)
    try {
      const answers = (ran as { result?: { answers?: Record<string, string> } }).result?.answers
      if (answers) {
        const answer = Object.values(answers).join(' / ')
        await update($, view, (v): View => (v.seq === seq ? { ...v, answer } : v))
      }
    } catch {
      // 回答の記録に失敗しても、結果はそのまま返す
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    try {
      if (!e.agentId && e.reason === 'answer' && e.answer.trim()) background($, 'answer', consider($, options, 'answer', e.answer))
    } catch {
      // 判定を始められなくても、応答はそのまま通す
    }
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    try {
      const origin = (e as { origin?: { kind?: string } }).origin?.kind
      const text = e.text.trim()
      if (text && (origin === undefined || origin === 'composer' || origin === 'bridge' || origin === 'sdk')) {
        await update($, prompts, list => [...list, text].slice(-3))
        background($, 'prompt', consider($, options, 'prompt', text))
      }
    } catch {
      // 記録に失敗しても、入力はそのまま通す
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const current = await read($, view)
    return renderPane($, e, current, {
      draw: () => startDraw($, options, current.seq),
      dismiss: async () => {
        if ((await read($, view)).seq !== current.seq) return
        await log($, current, 'dismissed')
        await update($, view, (v): View => ({ ...v, state: 'idle' }))
      },
      manual: () => drawManually($, options),
      open: () => openFigure($),
      redraw: instruction => redraw($, options, instruction),
    })
  })
}
