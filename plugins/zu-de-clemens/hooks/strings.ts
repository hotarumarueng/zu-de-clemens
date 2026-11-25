export type Lang = 'ja' | 'en'

const ja = {
  title: '図解',
  proposalAnswer: 'この返答は図で解説できます',
  proposalQuestion: 'この質問の選択肢は図で比べられます',
  proposalPrompt: 'このセッションの整理を図にできます',
  candidates: '図の種類の候補: {kinds}',
  probability: '確率 {p}',
  draw: '🎨 図にする',
  dismiss: '🙅 今回はいらない',
  manual: '🎨 図にして',
  manualHint: '提案は出ませんでしたが、直近の内容を図にできます',
  open: '🔍 大きく開く',
  redraw: '✏️ 描き直す',
  redrawPlaceholder: 'どう直すか（例: AとBは同時に起きる）',
  toastCannotOpen: '図解: この環境では図を開けません',
  drawing: '図を作っています…',
  recommend: 'おすすめ: {text}',
  kind: '図の種類: {kind}',
  replyHeading: '返答が要る問い',
  replyPlaceholder: '返答を書く',
  replyFill: '返答を入力欄に入れる',
  replyCopy: 'コピー',
  replyFilled: '入力欄に入れました。送るときは Enter を押してください',
  replyFillFailed: '入力欄に入れられませんでした。［コピー］で写して貼ってください',
  replyCopied: 'コピーしました。本スレッドの入力欄に貼ってください',
  replyCopyFailed: 'コピーできませんでした',
  stateOk: '済み',
  stateWarn: '要対応',
  stateUnknown: '未確認',
  legend: '枠の色：緑＝済み／橙の太枠＝要対応／点線＝未確認',
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
  draw: '🎨 Draw it',
  dismiss: '🙅 Not now',
  manual: '🎨 Draw this',
  manualHint: 'No suggestion this time, but you can still draw the latest one',
  open: '🔍 Open larger',
  redraw: '✏️ Redraw',
  redrawPlaceholder: 'What to change (e.g. A and B happen at once)',
  toastCannotOpen: 'Diagram: the diagram cannot be opened here',
  drawing: 'Drawing…',
  recommend: 'Recommended: {text}',
  kind: 'Kind: {kind}',
  replyHeading: 'Questions to answer',
  replyPlaceholder: 'Write your answer',
  replyFill: 'Put answers in the prompt box',
  replyCopy: 'Copy',
  replyFilled: 'Added to the prompt box. Press Enter to send',
  replyFillFailed: 'Could not add them to the prompt box. Use Copy and paste',
  replyCopied: 'Copied. Paste it into the prompt box',
  replyCopyFailed: 'Could not copy',
  stateOk: 'Done',
  stateWarn: 'Action',
  stateUnknown: 'Unchecked',
  legend: 'Borders: green = done / thick orange = needs action / dashed = unchecked',
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
