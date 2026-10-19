import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { View } from '../types'
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

const PANE = 'zu-de-clemens'
// コマンド名にコロンは使えない（CommandSpec.name）
const EVAL_COMMAND = 'zu-de-clemens-eval'
const view = atom({ plugin: 'zu-de-clemens', key: 'view' } as const, { seq: 0, state: 'idle', lang: 'en' } as View)
const guided = atom({ plugin: 'zu-de-clemens', key: 'guided' } as const, false)
const prompts = atom({ plugin: 'zu-de-clemens', key: 'prompts' } as const, [] as string[])

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
    threshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.5,
    auto: options.auto_mode === true,
    imageCheck: options.image_check === true,
    language: typeof options.language === 'string' ? options.language : 'auto',
  }
}

async function log($: EngineInterface, current: View, reaction: LogEntry['reaction']) {
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
  })
}

async function show($: EngineInterface, lang: View['lang']) {
  const opened = await $.ui.open({ id: PANE, title: t(lang, 'title') })
  if (!opened.isPlaced) $.ui.toast(t(lang, 'toastNotPlaced'))
}

async function guide($: EngineInterface, seq: number, lang: View['lang'], message: StringKey) {
  if (await read($, guided)) return
  await update($, guided, () => true)
  await update($, view, () => ({ seq, state: 'guide', lang, message }))
  await show($, lang)
}

async function startDraw($: EngineInterface, options: Options, seq: number) {
  const current = await read($, view)
  if (current.seq !== seq || !current.trigger) return
  await update($, view, v => ({ ...v, state: 'drawing' }))
  const result = await draw(drawIO($), {
    trigger: current.trigger,
    text: current.text ?? '',
    candidates: (current.candidates ?? []) as never,
    lang: current.lang,
    ...(options.imageCheck ? { check: (png: string, kind: DiagramKind) => checkFigure(jevIO($), { key: options.key, png, kind }) } : {}),
  })
  if ((await read($, view)).seq !== seq) return
  if (result.ok) {
    const { d2: _source, ...figure } = result.figure
    await update($, view, v => ({ ...v, state: 'figure', figure }))
    await log($, await read($, view), options.auto ? 'auto' : 'accepted')
    return
  }
  if (result.reason === 'd2-missing') {
    await update($, guided, () => false)
    await guide($, seq, current.lang, 'guideNoD2')
    return
  }
  const message: Record<typeof result.reason, StringKey> = {
    'nothing-to-fork': 'failureNothingToFork',
    'fork-failed': 'failureFork',
    'invalid-reply': 'failureInvalid',
    'unsafe-d2': 'failureUnsafe',
    'd2-failed': 'failureD2',
    'd2-missing': 'guideNoD2',
  }
  await update($, view, v => ({ ...v, state: 'failure', message: message[result.reason] }))
}

async function consider($: EngineInterface, options: Options, trigger: TriggerKind, text: string, extra: Partial<View> = {}) {
  const before = await read($, view)
  const seq = before.seq + 1
  const lang = detectLang(text, options.language)
  // キーがなければ、表示中の案内を消さずに抜ける（案内は 1 セッションに 1 回）
  if (!options.key) return guide($, seq, lang, 'guideNoKey')
  // 提案を出したまま次のきっかけが来たら、放置として記録する
  if (before.state === 'proposal') await log($, before, 'ignored')
  await update($, view, () => ({ seq, state: 'idle', lang }))

  if ((await $.session.surfaces()).length === 0) {
    return log($, { seq, state: 'idle', lang, trigger, ...extra }, 'not-shown')
  }
  const judgement = await judge(jevIO($), { key: options.key, trigger, text, recentPrompts: await read($, prompts) })
  if (!judgement.ok) {
    if (judgement.reason === 'unauthorized') await guide($, seq, lang, 'guideBadKey')
    return
  }
  const probability = trigger === 'prompt' ? judgement.sessionSummary : judgement.needsDiagram
  if (probability === undefined || probability < options.threshold) return
  if ((await read($, view)).seq !== seq) return

  const candidates = trigger === 'prompt' ? [{ id: 'status', p: 1 }] : judgement.kinds ?? []
  await update($, view, () => ({ seq, state: 'proposal', trigger, lang, text, probability, candidates, ...extra }))
  if (options.auto) {
    await show($, lang)
    return startDraw($, options, seq)
  }
  await show($, lang)
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
function background($: EngineInterface, work: Promise<unknown>) {
  work.catch(() => $.ui.log('zu-de-clemens: background work failed', { to: 'debug' }))
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
      const questions = (e.questions ?? []) as { question: string; options: { label: string }[] }[]
      const text = questions.map(q => `${q.question}\n${q.options.map((o, i) => `${i + 1}. ${o.label}`).join('\n')}`).join('\n\n')
      seq = (await read($, view)).seq + 1
      background($, consider($, options, 'question', text, { question: questions.map(q => q.question).join(' / ') }))
    } catch {
      // 判定を始められなくても、質問はそのまま通す
    }
    const ran = await next(e)
    try {
      const answers = (ran as { result?: { answers?: Record<string, string> } }).result?.answers
      if (answers) {
        const answer = Object.values(answers).join(' / ')
        await update($, view, v => (v.seq === seq ? { ...v, answer } : v))
      }
    } catch {
      // 回答の記録に失敗しても、結果はそのまま返す
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    try {
      if (!e.agentId && e.reason === 'answer' && e.answer.trim()) background($, consider($, options, 'answer', e.answer))
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
        background($, consider($, options, 'prompt', text))
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
        await update($, view, v => ({ ...v, state: 'idle' }))
      },
    })
  })
}
