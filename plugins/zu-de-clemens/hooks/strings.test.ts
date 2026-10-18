import { expect, test } from 'claude-code/testing'

import { STRINGS, detectLang, t } from './strings'

test('日本語と英語の文言のキーが一致する', async () => {
  expect(Object.keys(STRINGS.ja).sort()).toEqual(Object.keys(STRINGS.en).sort())
})

test('auto では、ひらがな・カタカナがあれば ja、なければ en', async () => {
  expect(detectLang('図にして', 'auto')).toBe('ja')
  expect(detectLang('draw it', 'auto')).toBe('en')
})

test('設定が ja・en なら文に関係なくそれに従う', async () => {
  expect(detectLang('図にして', 'en')).toBe('en')
  expect(detectLang('draw it', 'ja')).toBe('ja')
})

test('auto・ja・en 以外の設定は auto として扱う', async () => {
  expect(detectLang('図にして', 'fr')).toBe('ja')
  expect(detectLang('draw it', '')).toBe('en')
})

test('{名前} に値を差し込む', async () => {
  expect(t('ja', 'probability', { p: '0.76' })).toBe('確率 0.76')
  expect(t('en', 'probability', { p: '0.76' })).toBe('probability 0.76')
})
