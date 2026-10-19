import { expect, test } from 'claude-code/testing'

import { appendLog, logPath } from './log'
import type { LogEntry, LogIO } from './log'

function fakeFs(options: { writeFails?: boolean } = {}) {
  const files = new Map<string, string>()
  const logs: string[] = []
  const io: LogIO = {
    read: async path => files.get(path),
    write: async (path, text) => {
      if (options.writeFails) throw new Error('disk full')
      files.set(path, text)
    },
    log: text => { logs.push(text) },
  }
  return { io, files, logs }
}

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
  at: '2026-10-18T10:00:00.000Z',
  trigger: 'question',
  probability: 0.76,
  candidates: ['flow', 'layers'],
  reaction: 'accepted',
  figure: { kind: 'flow', title: '流れ' },
  question: 'A案とB案のどちら？',
  answer: 'B案',
  ...over,
})

const place = { home: '/home/u', cwd: '/home/u/develop/projects/app' }

test('置き場所はデータ置き場の下で、作業フォルダ名とハッシュ 8 桁の名前', async () => {
  expect(/^\/home\/u\/\.claude\/plugins\/data\/zu-de-clemens\/app-[0-9a-f]{8}\.md$/.test(logPath(place))).toBe(true)
})

test('作業フォルダが違えば別のファイルになる', async () => {
  expect(logPath(place) === logPath({ home: '/home/u', cwd: '/home/u/other/app' })).toBe(false)
})

test('2 件追記すると同じファイルに 2 件並ぶ', async () => {
  const { io, files } = fakeFs()
  await appendLog(io, place, entry())
  await appendLog(io, place, entry({ at: '2026-10-18T10:05:00.000Z', reaction: 'dismissed', figure: undefined }))
  const text = files.get(logPath(place))!
  expect(text.match(/^## /gm)?.length).toBe(2)
  expect(text.includes('- reaction: accepted')).toBe(true)
  expect(text.includes('- reaction: dismissed')).toBe(true)
  expect(text.includes('- figure: flow「流れ」')).toBe(true)
  expect(text.includes('- answer: B案')).toBe(true)
})

test('書き込みに失敗しても例外を投げず、ログに 1 行残す', async () => {
  const { io, logs } = fakeFs({ writeFails: true })
  await appendLog(io, place, entry())
  expect(logs.length).toBe(1)
})

test('確率のない記録（表示されなかった）は - と書く', async () => {
  const { io, files } = fakeFs()
  await appendLog(io, place, entry({ probability: undefined, candidates: [], reaction: 'not-shown', figure: undefined }))
  expect(files.get(logPath(place))!.includes('- probability: -')).toBe(true)
})
