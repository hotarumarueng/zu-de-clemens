import { expect, test } from 'claude-code/testing'

import { judge } from './jev'
import type { JevIO } from './jev'

const KEY = 'test-key-1234567890'

type Sent = { url: string; headers: Record<string, string>; body: any }

// 偽の Jev。送られた中身とログを記録し、決めた返事を返す。
function fakeIO(reply: { status: number; text: string } | 'hang' | 'throw', options: { timeoutFires?: boolean } = {}) {
  const sent: Sent[] = []
  const logs: string[] = []
  const sleeps: number[] = []
  const io: JevIO = {
    fetch: async (url, init) => {
      sent.push({ url, headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body)) })
      if (reply === 'hang') return new Promise(() => {})
      if (reply === 'throw') throw new Error(`network down ${KEY}`)
      return { status: reply.status, ok: reply.status < 300, headers: {}, text: reply.text } as never
    },
    sleep: ms => {
      sleeps.push(ms)
      return options.timeoutFires ? Promise.resolve() : new Promise(() => {})
    },
    log: text => { logs.push(text) },
  }
  return { io, sent, logs, sleeps }
}

const ok = (answers: object) => ({ status: 200, text: JSON.stringify({ model: 'jev-1.13.0', answers }) })
const input = (over: object = {}) => ({ key: KEY, trigger: 'answer' as const, text: 'x', recentPrompts: [] as string[], ...over })

test('質問のときは needs_diagram と diagram_kind を jev-latest に聞く', async () => {
  const { io, sent } = fakeIO(ok({ needs_diagram: { type: 'noul', noul: 0.5 }, diagram_kind: { type: 'choice', probabilities: { flow: 1 } } }))
  await judge(io, input({ trigger: 'question', text: 'A案とB案のどちら？' }))
  expect(sent[0]!.url).toBe('https://api.typesafe.ai/v1/systemone')
  expect(sent[0]!.headers.Authorization).toBe(`Bearer ${KEY}`)
  expect(sent[0]!.body.model).toBe('jev-latest')
  expect(Object.keys(sent[0]!.body.questions).sort()).toEqual(['diagram_kind', 'needs_diagram'])
  expect(sent[0]!.body.questions.needs_diagram.type).toBe('noul')
  expect(sent[0]!.body.questions.diagram_kind.type).toBe('choice')
  expect(Object.keys(sent[0]!.body.questions.diagram_kind.criteria).length).toBe(15)
  expect('none' in sent[0]!.body.questions.diagram_kind.criteria).toBe(true)
  expect(sent[0]!.body.state.target).toEqual({ kind: 'question', text: 'A案とB案のどちら？' })
})

test('入力のときは session_summary だけを聞く', async () => {
  const { io, sent } = fakeIO(ok({ session_summary: { type: 'noul', noul: 0.9 } }))
  const r = await judge(io, input({ trigger: 'prompt', text: '今どうなってる？', recentPrompts: ['前の指示'] }))
  expect(Object.keys(sent[0]!.body.questions)).toEqual(['session_summary'])
  expect(sent[0]!.body.state.recent_prompts).toEqual(['前の指示'])
  expect(r).toEqual({ ok: true, sessionSummary: 0.9 })
})

test('確率と、none を除いた図の種類を高い順に返す', async () => {
  const { io } = fakeIO(ok({
    needs_diagram: { type: 'noul', noul: 0.76 },
    diagram_kind: { type: 'choice', probabilities: { flow: 0.6, none: 0.1, layers: 0.3 }, confidence: 0.5 },
  }))
  expect(await judge(io, input())).toEqual({ ok: true, needsDiagram: 0.76, kinds: [{ id: 'flow', p: 0.6 }, { id: 'layers', p: 0.3 }] })
})

test('401 は unauthorized', async () => {
  expect(await judge(fakeIO({ status: 401, text: '{}' }).io, input())).toEqual({ ok: false, reason: 'unauthorized' })
})

test('503 は unavailable', async () => {
  expect(await judge(fakeIO({ status: 503, text: 'overloaded' }).io, input())).toEqual({ ok: false, reason: 'unavailable' })
})

test('通信そのものが失敗したら unavailable', async () => {
  expect(await judge(fakeIO('throw').io, input())).toEqual({ ok: false, reason: 'unavailable' })
})

test('壊れた JSON は malformed', async () => {
  expect(await judge(fakeIO({ status: 200, text: 'not json' }).io, input())).toEqual({ ok: false, reason: 'malformed' })
})

test('確率が 1 を超えたら malformed', async () => {
  const { io } = fakeIO(ok({ needs_diagram: { type: 'noul', noul: 1.4 }, diagram_kind: { type: 'choice', probabilities: { flow: 1 } } }))
  expect(await judge(io, input())).toEqual({ ok: false, reason: 'malformed' })
})

test('答えに質問 ID がなければ malformed', async () => {
  expect(await judge(fakeIO(ok({})).io, input())).toEqual({ ok: false, reason: 'malformed' })
})

test('10 秒返らなければ unavailable', async () => {
  const { io, sleeps } = fakeIO('hang', { timeoutFires: true })
  expect(await judge(io, input())).toEqual({ ok: false, reason: 'unavailable' })
  expect(sleeps).toEqual([10_000])
})

test('長い文は末尾を残して 6,000 文字に、直近の入力は 600 文字・3 件に切り詰める', async () => {
  const { io, sent } = fakeIO(ok({ needs_diagram: { type: 'noul', noul: 0.1 }, diagram_kind: { type: 'choice', probabilities: { none: 1 } } }))
  const long = 'あ'.repeat(19_990) + '末尾の10文字です。'
  await judge(io, input({ text: long, recentPrompts: ['1', '2', 'い'.repeat(700), '4'] }))
  const target: string = sent[0]!.body.state.target.text
  expect(target.length <= 6_000).toBe(true)
  expect(target.endsWith('末尾の10文字です。')).toBe(true)
  const prompts: string[] = sent[0]!.body.state.recent_prompts
  expect(prompts.length).toBe(3)
  expect(prompts.every(p => p.length <= 600)).toBe(true)
  expect(prompts[2]).toBe('4')
})

test('どの失敗でも、結果とログにキーの値が出ない', async () => {
  for (const reply of [{ status: 401, text: `bad key ${KEY}` }, 'throw' as const]) {
    const { io, logs } = fakeIO(reply)
    const r = await judge(io, input())
    expect(JSON.stringify(r).includes(KEY)).toBe(false)
    expect(logs.some(line => line.includes(KEY))).toBe(false)
  }
})
