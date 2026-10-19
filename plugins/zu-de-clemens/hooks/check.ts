import { KINDS } from './catalog'
import type { DiagramKind } from './catalog'
import { callJev, isProbability } from './jev'
import type { JevIO } from './jev'

export type CheckResult = { ok: true } | { ok: false; problem: string } | { ok: 'skipped' }

const ASSET = 'FIGURE_PNG'
const MIN_SIDE = 280
const MAX_SIDE = 1568
// shortcut: 合否の境目 0.5 は仮の値。評価データが揃ったら見直す
const LIMIT = 0.5

/** PNG の IHDR から縦横を読む。PNG でなければ undefined */
export function pngSize(base64: string): { width: number; height: number } | undefined {
  try {
    const bytes = Uint8Array.from(atob(base64.slice(0, 44)), c => c.charCodeAt(0))
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (bytes.length < 24 || !signature.every((b, i) => bytes[i] === b)) return undefined
    const view = new DataView(bytes.buffer)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  } catch {
    return undefined
  }
}

export async function checkFigure(io: JevIO, input: { key: string; png: string; kind: DiagramKind }): Promise<CheckResult> {
  const size = pngSize(input.png)
  const fits = (n: number) => n >= MIN_SIDE && n <= MAX_SIDE
  if (!size || !fits(size.width) || !fits(size.height)) return { ok: 'skipped' }
  const response = await callJev(io, input.key, {
    model: 'jev-latest',
    state: { figure: ASSET, intended_kind: input.kind },
    assets: { [ASSET]: { type: 'image', format: 'png', data_base64: input.png } },
    questions: {
      overlap: { type: 'noul', instructions: 'In the diagram image `figure`, do any labels or boxes overlap so that some text is hard to read?' },
      one_direction: { type: 'noul', instructions: 'In the diagram image `figure`, do the arrows mostly flow in one consistent direction?' },
      diagram_kind: {
        type: 'choice',
        instructions: 'What kind of diagram is the image `figure`?',
        criteria: Object.fromEntries(KINDS.map(kind => [kind.id, kind.when.en])),
      },
    },
  }, { 'TypeSafe-Danger-Zone-Images': 'true' })
  if (!response.ok) return { ok: 'skipped' }
  let answers: any
  try {
    answers = JSON.parse(response.text)?.answers
  } catch {
    return { ok: 'skipped' }
  }
  const overlap = answers?.overlap?.noul
  const direction = answers?.one_direction?.noul
  const probabilities = answers?.diagram_kind?.probabilities
  if (!isProbability(overlap) || !isProbability(direction) || !probabilities || typeof probabilities !== 'object') return { ok: 'skipped' }
  const top = Object.entries(probabilities as Record<string, number>).sort((a, b) => b[1] - a[1])[0]?.[0]
  const problems = [
    ...(overlap >= LIMIT ? ['some labels or boxes overlap'] : []),
    ...(direction < LIMIT ? ['the flow does not go in one direction'] : []),
    ...(top !== input.kind ? [`it looks like a ${top} diagram, not ${input.kind}`] : []),
  ]
  return problems.length ? { ok: false, problem: problems.join('; ') } : { ok: true }
}
