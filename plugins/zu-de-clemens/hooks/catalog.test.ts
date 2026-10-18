import { expect, test } from 'claude-code/testing'

import { KINDS, kindById } from './catalog'

const IDS = ['decision', 'comparison', 'matrix', 'layers', 'containment', 'hub', 'flow',
  'swimlane', 'sequence', 'tree', 'relations', 'steps', 'er', 'status']

test('図の種類は設計 5 章の 14 個で、重複しない', async () => {
  expect(KINDS.map(k => k.id)).toEqual(IDS)
})

test('すべての種類に日英の名前・使う場面・D2 の見本がある', async () => {
  for (const kind of KINDS) {
    expect(kind.name.ja.length > 0 && kind.name.en.length > 0).toBe(true)
    expect(kind.when.ja.length > 0 && kind.when.en.length > 0).toBe(true)
    expect(kind.sample.trim().length > 0).toBe(true)
  }
})

test('見本に色や装飾の指定を入れない', async () => {
  for (const kind of KINDS) expect(/style\.|fill:|stroke:|icon:/.test(kind.sample)).toBe(false)
})

test('kindById は知らない ID に undefined を返す', async () => {
  expect(kindById('flow')?.id).toBe('flow')
  expect(kindById('nope')).toBe(undefined)
})
