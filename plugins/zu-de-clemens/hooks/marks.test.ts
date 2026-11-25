import { expect, test } from 'claude-code/testing'

import { markClassesD2, parseList, parseTable, splitMark } from './marks'

test('splitMark は先頭の ✓ ! ? を状態に変え、印の文字を外す', async () => {
  expect(splitMark('! 要対応のこと')).toEqual({ state: 'warn', text: '要対応のこと' })
  expect(splitMark('✓済み')).toEqual({ state: 'ok', text: '済み' })
  expect(splitMark('? 未確認')).toEqual({ state: 'unknown', text: '未確認' })
  expect(splitMark('印なし')).toEqual({ text: '印なし' })
  expect(splitMark('!important が付く設定')).toEqual({ text: '!important が付く設定' })
})

test('markClassesD2 は印の付いた箱に状態の class を付け、印の文字を消す', async () => {
  const out = markClassesD2('a: "! 権限が足りない"\nx: Group {\n  b: ✓ 型チェック通過\n}\na -> b: ! 失敗\n')
  expect(out.includes('a.class: st-warn')).toBe(true)
  expect(out.includes('a: "権限が足りない"')).toBe(true)
  expect(out.includes('  b.class: st-ok')).toBe(true)
  expect(out.includes('  b: 型チェック通過')).toBe(true)
  // 矢印の文字は箱ではないので触らない
  expect(out.includes('a -> b: ! 失敗')).toBe(true)
  expect(out.includes('classes:')).toBe(true)
})

test('markClassesD2 は印が無ければ D2 をそのまま返す', async () => {
  expect(markClassesD2('a -> b')).toBe('a -> b')
})

test('parseList は見出しごとに項目をまとめ、印を状態に変える', async () => {
  const md = '## ! 1. 帯を取り合う\n- ! ボタンが出ない\n- ? 競合は未確認\n- 対処：運用で避ける\n\n## 今の状態\n* ✓ 戻せる\n'
  expect(parseList(md)).toEqual([
    { title: '1. 帯を取り合う', state: 'warn', items: [{ state: 'warn', text: 'ボタンが出ない' }, { state: 'unknown', text: '競合は未確認' }, { text: '対処：運用で避ける' }] },
    { title: '今の状態', items: [{ state: 'ok', text: '戻せる' }] },
  ])
})

test('parseList は見出しのない項目を、題名なしのまとまりに入れる', async () => {
  expect(parseList('- ✓ a\n- b')).toEqual([{ title: '', items: [{ state: 'ok', text: 'a' }, { text: 'b' }] }])
})

test('parseTable は表を行とセルに分け、区切りの行を外す', async () => {
  expect(parseTable('| | A |\n|---|:-:|\n| 形 | ! 戻らない |\n')).toEqual([['', 'A'], ['形', '! 戻らない']])
})
