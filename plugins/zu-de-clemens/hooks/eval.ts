import { kindById } from './catalog'
import type { DiagramKind } from './catalog'
import { judge } from './jev'
import type { JevIO, TriggerKind } from './jev'

/** evals/cases.jsonl の 1 行。label と kind は作者が付ける */
export type Case = { id: string; trigger: TriggerKind; text: string; recent_prompts: string[]; label: 'want' | 'no' | null; kind: DiagramKind | null }

/** 1 件の結果。p がないのは Jev が答えなかった件 */
export type Outcome = { id: string; label: 'want' | 'no'; kind: DiagramKind | null; p?: number; kinds: DiagramKind[] }

const TRIGGERS: TriggerKind[] = ['question', 'answer', 'prompt']
// 0.30〜0.90 を 0.05 刻み。0.05 を足し重ねる誤差を避けるため百分率の整数で持つ
const THRESHOLDS = Array.from({ length: 13 }, (_, i) => 30 + i * 5)
const MAX_MISS = 0.1

// 作者が手で書くファイルなので、形の崩れは行番号つきで返す。
export function parseCases(text: string): { ok: true; cases: Case[] } | { ok: false; error: string } {
  const cases: Case[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (!line) continue
    let c: Case
    try {
      c = JSON.parse(line)
    } catch {
      return { ok: false, error: `${i + 1} 行目が JSON として読めません` }
    }
    const shapeOk = typeof c.id === 'string' && TRIGGERS.includes(c.trigger) && typeof c.text === 'string'
      && Array.isArray(c.recent_prompts) && (c.label === null || c.label === 'want' || c.label === 'no')
      && (c.kind === null || kindById(c.kind) !== undefined)
    if (!shapeOk) return { ok: false, error: `${i + 1} 行目（${String(c.id)}）の形が違います` }
    cases.push(c)
  }
  return { ok: true, cases }
}

// Jev の同時接続の上限が分からないため、1 件ずつ順に聞く（30 件で 30 秒ほど）。
export async function runEval(io: JevIO, key: string, cases: (Case & { label: 'want' | 'no' })[]): Promise<Outcome[]> {
  const outcomes: Outcome[] = []
  for (const c of cases) {
    const j = await judge(io, { key, trigger: c.trigger, text: c.text, recentPrompts: c.recent_prompts })
    const base = { id: c.id, label: c.label, kind: c.kind }
    if (!j.ok) outcomes.push({ ...base, kinds: [] })
    else if (c.trigger === 'prompt') outcomes.push({ ...base, p: j.sessionSummary, kinds: ['status'] })
    else outcomes.push({ ...base, p: j.needsDiagram, kinds: (j.kinds ?? []).map(k => k.id) })
  }
  return outcomes
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`)

/** results.md の本文と、見逃し率 10% 以下の中で外れ（見逃し＋空振り）が最も少ないしきい値 */
export function report(outcomes: Outcome[], meta: { at: string; model: string }): { markdown: string; threshold?: number } {
  const answered = outcomes.filter(o => o.p !== undefined)
  const want = answered.filter(o => o.label === 'want')
  const no = answered.filter(o => o.label === 'no')
  const rows = THRESHOLDS.map(t => {
    const missed = want.filter(o => o.p! < t / 100).length
    const falseAlarms = no.filter(o => o.p! >= t / 100).length
    return { t, missed, falseAlarms }
  })
  // 外れの数が同じなら、提案が少なく済む高いほうを選ぶ
  const best = rows
    .filter(r => want.length > 0 && r.missed / want.length <= MAX_MISS)
    .reduce<typeof rows[number] | undefined>((b, r) => (!b || r.missed + r.falseAlarms <= b.missed + b.falseAlarms ? r : b), undefined)
  const kinded = want.filter(o => o.kind)
  const hits = kinded.filter(o => o.kinds.slice(0, 3).includes(o.kind!)).length
  const failed = outcomes.filter(o => o.p === undefined)

  const markdown = [
    '# 評価の結果',
    '',
    `- 実行日時：${meta.at}`,
    `- モデル：${meta.model}`,
    `- 件数：${outcomes.length} 件（want ${want.length}・no ${no.length}・Jev が答えなかった ${failed.length}）`,
    `- 正解の種類が上位 3 つに入った割合：${pct(hits, kinded.length)}（${hits}/${kinded.length}）`,
    `- 既定のしきい値：${best ? (best.t / 100).toFixed(2) : '見逃し率 10% 以下を満たす値なし'}`,
    '',
    '| しきい値 | 見逃し率 | 空振り率 |',
    '| --- | --- | --- |',
    ...rows.map(r => `| ${(r.t / 100).toFixed(2)} | ${pct(r.missed, want.length)}（${r.missed}/${want.length}） | ${pct(r.falseAlarms, no.length)}（${r.falseAlarms}/${no.length}） |`),
    '',
    '## 1 件ごと',
    '',
    '| id | ラベル | 確率 | 正解の種類 | Jev の上位 3 つ |',
    '| --- | --- | --- | --- | --- |',
    ...outcomes.map(o => `| ${o.id} | ${o.label} | ${o.p === undefined ? '失敗' : o.p.toFixed(2)} | ${o.kind ?? ''} | ${o.kinds.slice(0, 3).join(', ')} |`),
    '',
  ].join('\n')
  return { markdown, ...(best ? { threshold: best.t / 100 } : {}) }
}
