export type ViewState = 'idle' | 'proposal' | 'drawing' | 'figure' | 'guide' | 'failure'

export type View = {
  /** きっかけの通し番号。今の値と違う結果は表示しない */
  seq: number
  state: ViewState
  /** 描き始めたときの seq。描き終えたとき、まだ自分の描画が表示中かを見分ける */
  drawId?: number
  trigger?: 'question' | 'answer' | 'prompt'
  lang: 'ja' | 'en'
  text?: string
  probability?: number
  candidates?: { id: string; p: number }[]
  figure?: { kind: string; title: string; recommend?: string; svg: string; ascii: string }
  /** 案内・失敗のときに出す文言のキー */
  message?: string
  question?: string
  answer?: string
}

declare module 'claude-code' {
  interface PluginState {
    'zu-de-clemens': {
      view: View
      /** このセッションで案内を出したか */
      guided: boolean
      /** 利用者の直近の入力（新しいものが末尾） */
      prompts: string[]
      /** 利用者の直近の入力のときに、セッションを映す画面があったか */
      watched: boolean
    }
  }
}
