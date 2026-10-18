export type Lang = 'ja' | 'en'

const ja = {
  title: '図解',
  proposalAnswer: 'この返答は図で解説できます',
  proposalQuestion: 'この質問の選択肢は図で比べられます',
  proposalPrompt: 'このセッションの整理を図にできます',
  candidates: '図の種類の候補: {kinds}',
  probability: '確率 {p}',
  draw: '図にする',
  dismiss: '今回はいらない',
  drawing: '図を作っています…',
  recommend: 'おすすめ: {text}',
  kind: '図の種類: {kind}',
  close: '閉じる',
  failureNothingToFork: '会話が始まってから図にできます。',
  failureFork: '図を作れませんでした（Claude への問い合わせが失敗しました）。',
  failureInvalid: '図を作れませんでした（返事の形が崩れていました）。',
  failureUnsafe: '図を作れませんでした（使えない書き方が含まれていました）。',
  failureD2: '図を作れませんでした（D2 の変換に失敗しました）。',
  guideNoKey: 'Jev の API キーが設定されていません。README の導入手順を見て、/plugin configure zu-de-clemens@zu-de-clemens で設定してください。',
  guideBadKey: 'Jev の API キーが無効です。/plugin configure zu-de-clemens@zu-de-clemens で設定し直してください。',
  guideNoD2: 'D2 が見つかりません。README の導入手順を見て、D2 を入れてください。',
  toastNotPlaced: '図解: 提案があります（ペインを開けませんでした）',
}

const en: Record<keyof typeof ja, string> = {
  title: 'Diagram',
  proposalAnswer: 'This answer can be explained with a diagram',
  proposalQuestion: 'The options of this question can be compared in a diagram',
  proposalPrompt: 'This session can be summarized in a diagram',
  candidates: 'Suggested kinds: {kinds}',
  probability: 'probability {p}',
  draw: 'Draw it',
  dismiss: 'Not now',
  drawing: 'Drawing…',
  recommend: 'Recommended: {text}',
  kind: 'Kind: {kind}',
  close: 'Close',
  failureNothingToFork: 'Diagrams are available once the conversation has started.',
  failureFork: 'Could not draw the diagram (the request to Claude failed).',
  failureInvalid: 'Could not draw the diagram (the reply was malformed).',
  failureUnsafe: 'Could not draw the diagram (it used something that is not allowed).',
  failureD2: 'Could not draw the diagram (D2 failed to render it).',
  guideNoKey: 'The Jev API key is not set. See the README and set it with /plugin configure zu-de-clemens@zu-de-clemens.',
  guideBadKey: 'The Jev API key was rejected. Set it again with /plugin configure zu-de-clemens@zu-de-clemens.',
  guideNoD2: 'D2 was not found. See the README and install D2.',
  toastNotPlaced: 'Diagram: a suggestion is ready (the pane could not open)',
}

export const STRINGS = { ja, en } satisfies Record<Lang, Record<keyof typeof ja, string>>

export type StringKey = keyof typeof ja

export function t(lang: Lang, key: StringKey, values: Record<string, string | number> = {}): string {
  return STRINGS[lang][key].replace(/\{(\w+)\}/g, (whole, name: string) => (name in values ? String(values[name]) : whole))
}

// 設定は userConfig の自由入力なので、auto・ja・en 以外は auto として扱う。
export function detectLang(text: string, setting: string): Lang {
  if (setting === 'ja' || setting === 'en') return setting
  return /[぀-ヿ]/.test(text) ? 'ja' : 'en'
}
