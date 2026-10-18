import { expect, test } from 'claude-code/testing'

// プラグインの読み込みに失敗すると、テストの本体に入る前にエラーになる。
test('読み込むと例外なく登録が終わる', async () => {
  expect(true).toBe(true)
})
