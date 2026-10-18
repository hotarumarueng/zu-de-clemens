import type { DiagramKind } from './catalog'
import type { TriggerKind } from './jev'

/** appendLog が外から使う 3 つの働き。$ との接続は register.tsx が行う */
export type LogIO = {
  read: (path: string) => Promise<string | undefined>
  write: (path: string, text: string) => Promise<void>
  log: (text: string) => void
}

export type LogEntry = {
  at: string
  trigger: TriggerKind
  probability: number
  candidates: DiagramKind[]
  reaction: 'accepted' | 'dismissed' | 'ignored' | 'auto' | 'not-shown'
  figure?: { kind: DiagramKind; title: string }
  question?: string
  answer?: string
}

// FNV-1a 32bit。作業フォルダごとにファイルを分けるためだけに使う。
function hash8(text: string): string {
  let h = 0x811c9dc5
  for (const char of text) {
    h ^= char.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

export function logPath(place: { home: string; cwd: string }): string {
  const name = place.cwd.replace(/\/+$/, '').split('/').pop() || 'root'
  return `${place.home}/.claude/plugins/data/zu-de-clemens/${name}-${hash8(place.cwd)}.md`
}

function format(entry: LogEntry): string {
  const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()
  return [
    `## ${entry.at} ${entry.trigger}`,
    '',
    `- probability: ${entry.probability.toFixed(2)}`,
    `- candidates: ${entry.candidates.join(', ') || '-'}`,
    `- reaction: ${entry.reaction}`,
    ...(entry.figure ? [`- figure: ${entry.figure.kind}「${oneLine(entry.figure.title)}」`] : []),
    ...(entry.question ? [`- question: ${oneLine(entry.question)}`] : []),
    ...(entry.answer ? [`- answer: ${oneLine(entry.answer)}`] : []),
    '',
  ].join('\n')
}

export async function appendLog(io: LogIO, place: { home: string; cwd: string }, entry: LogEntry): Promise<void> {
  const path = logPath(place)
  try {
    const before = (await io.read(path)) ?? ''
    await io.write(path, `${before}${before && !before.endsWith('\n\n') ? '\n' : ''}${format(entry)}`)
  } catch {
    io.log('log: could not write the answer log')
  }
}
