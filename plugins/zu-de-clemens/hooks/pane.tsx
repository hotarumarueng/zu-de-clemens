import type { EngineInterface, RenderInput } from 'claude-code'

import type { View } from '../types'
import { kindById } from './catalog'
import { parseList, parseTable, splitMark } from './marks'
import type { MarkState } from './marks'
import { t } from './strings'
import type { StringKey } from './strings'

export type PaneActions = {
  draw: () => Promise<void>
  dismiss: () => Promise<void>
  manual: () => Promise<void>
  open: () => Promise<void>
  /** 入力欄の指示で描き直す */
  redraw: (instruction: string) => Promise<void>
  /** 図の i 番目の問いへの返答を保存する */
  answer: (i: number, text: string) => Promise<void>
  /** 返答をまとめて本スレッドの入力欄に入れる・コピーする */
  fillReplies: () => Promise<void>
  copyReplies: (surface?: string) => Promise<void>
}

type Reply = { section: string; question: string }

/** 書いた返答だけを「問い → 返答」の 1 行ずつにまとめる */
export function replyText(replies: Reply[], answers: string[]): string {
  return replies.flatMap((r, i) => (answers[i]?.trim() ? [`「${r.question}」→ ${answers[i]!.trim()}`] : [])).join('\n')
}

const PROPOSAL_KEY: Record<NonNullable<View['trigger']>, StringKey> = {
  question: 'proposalQuestion',
  answer: 'proposalAnswer',
  prompt: 'proposalPrompt',
}

// d2 の SVG は幅の属性を持たず、指定しないとペインいっぱいに拡大される（タスク 0 で確認）。
const STATE_COLOR: Record<MarkState, string> = { ok: 'success', warn: 'warning', unknown: 'inactive' }
const STATE_LABEL: Record<MarkState, StringKey> = { ok: 'stateOk', warn: 'stateWarn', unknown: 'stateUnknown' }

const TEXT_KIND_NAME: Record<View['lang'], Record<string, string>> = {
  ja: { list: '一覧', table: '表' },
  en: { list: 'List', table: 'Table' },
}

export function svgWidth(svg: string): number | undefined {
  const width = Number(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/.exec(svg)?.[1])
  return Number.isFinite(width) && width > 0 ? Math.round(width) : undefined
}

export function renderPane($: EngineInterface, e: RenderInput<'Pane'>, view: View, actions: PaneActions) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const lang = view.lang
  const kindName = (id: string) => kindById(id)?.name[lang] ?? TEXT_KIND_NAME[lang][id] ?? id
  // しきい値未満だった直近のきっかけを、利用者が頼めば図にできるようにする（#5）
  const manual = view.latest && (
    <Box key="manualRow" flexDirection="column" gap={1}>
      <Text dimColor>{t(lang, 'manualHint')}</Text>
      <Box flexDirection="row">
        <Button key="manual" variant="secondary" label={t(lang, 'manual')} onPress={() => actions.manual()} />
      </Box>
    </Box>
  )

  if (view.state === 'proposal') {
    // Button に大きさ・色の指定はない。主ボタンの印・枠・絵文字つきの長いラベル・ボタン間の余白で、押せる範囲と見分けやすさを稼ぐ（#7）
    return (
      <Box flexDirection="column" gap={1} borderStyle="round" borderColor="claude" paddingX={1}>
        <Text bold>{t(lang, PROPOSAL_KEY[view.trigger ?? 'answer'])}</Text>
        <Text dimColor>
          {t(lang, 'candidates', { kinds: (view.candidates ?? []).map(c => kindName(c.id)).join(' / ') || '-' })}
          {'  '}
          {t(lang, 'probability', { p: (view.probability ?? 0).toFixed(2) })}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          <Button key="draw" variant="primary" label={t(lang, 'draw')} onPress={() => actions.draw()} />
          <Button key="dismiss" variant="secondary" label={t(lang, 'dismiss')} onPress={() => actions.dismiss()} />
        </Box>
      </Box>
    )
  }

  if (view.state === 'drawing') return <Text dimColor>{t(lang, 'drawing')}</Text>

  if (view.state === 'figure' && view.figure) {
    const figure = view.figure
    // 状態を色の札にして、文字の前に置く
    const marked = (key: string, { state, text }: { state?: MarkState; text: string }, weight?: 'semibold') => {
      return (
        <Box key={key} flexDirection="row" gap={1} alignItems="flex-start">
          {state && <Text key={`${key}b`} color={STATE_COLOR[state]} weight="semibold">{t(lang, STATE_LABEL[state])}</Text>}
          <Text key={`${key}t`} {...(weight ? { weight } : {})}>{text}</Text>
        </Box>
      )
    }
    // 部品で組む図の共通のカード。角丸の枠で囲み、文章でなく図に見せる（2026-11-25 本人の要望）。
    // 枠の色は既定だとダークの背景とのコントラストが約 1.1:1 で見えなかったため、灰色の文字と同じ inactive にする
    const card = (key: string, title: string | undefined, children: unknown, extra: Record<string, unknown> = {}) => (
      <Box key={key} flexDirection="column" gap={1} borderStyle="round" borderColor="inactive" paddingX={1} {...extra}>
        {title && <Text key={`${key}h`} color="claude" weight="semibold">{title}</Text>}
        {children}
      </Box>
    )
    // 図の問いへの返答欄。見出しのある種類は、その見出しのまとまりのカードの中に置く
    const replies = figure.replies ?? []
    const answers = view.answers ?? []
    const grouped = figure.markdown && ['list', 'checklist', 'kanban', 'procon'].includes(figure.kind)
    const titles = grouped ? parseList(figure.markdown!).map(group => group.title) : []
    const replyBox = (key: string, indexes: number[]) => indexes.length > 0 && (
      <Box key={key} flexDirection="column" gap={1}>
        {indexes.map(i => (
          <Box key={`rq${i}`} flexDirection="column">
            <Text key={`rqt${i}`} color="claude">{replies[i]!.question}</Text>
            <Input
              key={`reply${i}`}
              value={answers[i] ?? ''}
              placeholder={t(lang, 'replyPlaceholder')}
              onInput={text => { actions.answer(i, text) }}
              onSubmit={text => { actions.answer(i, text) }}
            />
          </Box>
        ))}
      </Box>
    )
    // 返答をまとめて送る 2 つのボタンと結果の 1 行。見出しに属さない問いがあれば、そのカードの中に置く
    const replyActions = (replyText(replies, answers) || view.replyNote) && (
      <Box key="replyActions" flexDirection="column" gap={1}>
        {replyText(replies, answers) && (
          <Box key="replyRow" flexDirection="row" flexWrap="wrap" gap={2}>
            <Button key="fillReplies" label={t(lang, 'replyFill')} onPress={() => actions.fillReplies()} />
            <Button key="copyReplies" variant="secondary" label={t(lang, 'replyCopy')} onPress={press => actions.copyReplies(press?.surface)} />
          </Box>
        )}
        {view.replyNote && <Text key="replyNote" dimColor>{t(lang, view.replyNote as StringKey)}</Text>}
      </Box>
    )
    const under = (title: string) => replies.flatMap((r, i) => (r.section && r.section === title ? [i] : []))
    const loose = replies.flatMap((r, i) => (r.section && titles.includes(r.section) ? [] : [i]))
    let picture
    if (figure.markdown && figure.kind === 'timeline') {
      // 時刻と出来事を分けて、出来事ごとのカードを矢印でつなぐ。fork は「時刻 | 出来事」で書く
      picture = (
        <Box key="figure" flexDirection="column">
          {parseList(figure.markdown).flatMap(group => group.items).flatMap((item, i) => {
            const [when, ...rest] = item.text.split('|')
            const what = rest.join('|').trim()
            return [
              ...(i > 0 ? [<Text key={`a${i}`} dimColor>{'  ↓'}</Text>] : []),
              <Box key={`r${i}`} flexDirection="row" gap={2} alignItems="flex-start" borderStyle="round" borderColor="inactive" paddingX={1}>
                <Text key={`w${i}`} color="claude" weight="semibold">{(what ? when! : '').trim()}</Text>
                <Text key={`e${i}`}>{what || item.text}</Text>
              </Box>,
            ]
          })}
        </Box>
      )
    } else if (figure.markdown && (figure.kind === 'kanban' || figure.kind === 'procon')) {
      // 段階（カンバン）や良い点・悪い点（長所と短所）を、見出しごとの列に分けて横に並べる
      picture = (
        <Box key="figure" flexDirection="row" flexWrap="wrap" gap={2}>
          {parseList(figure.markdown).map((group, g) => card(`col${g}`, group.title, [
            ...group.items.map((item, i) => marked(`ci${g}-${i}`, item)),
            replyBox(`g${g}replies`, under(group.title)),
          ], { flexGrow: 1, minWidth: 160 }))}
        </Box>
      )
    } else if (figure.markdown && (figure.kind === 'list' || figure.kind === 'checklist')) {
      // 一覧はまとまりごとのカードを縦に積む。ペインは狭く、横に並べると長い文の折り返しが増える。
      // 印は文字でなく色の札にし、箇条書きの点と二重にならないようにする
      picture = (
        <Box key="figure" flexDirection="column" gap={1}>
          {parseList(figure.markdown).map((group, g) => card(`g${g}`, group.title, [
            <Box key={`gi${g}`} flexDirection="column">
              {group.items.map((item, i) => (
                <Box key={`i${g}-${i}`} flexDirection="row" gap={1} alignItems="flex-start">
                  {item.state
                    ? <Text key={`b${g}-${i}`} color={STATE_COLOR[item.state]} weight="semibold">{t(lang, STATE_LABEL[item.state])}</Text>
                    : <Text key={`b${g}-${i}`} dimColor>・</Text>}
                  <Text key={`t${g}-${i}`}>{item.text}</Text>
                </Box>
              ))}
            </Box>,
            replyBox(`g${g}replies`, under(group.title)),
          ]))}
        </Box>
      )
    } else if (figure.markdown && figure.kind === 'table') {
      // 表も部品で組む。Markdown のままだとセルの印が文字で出る（2026-11-24 実機）。
      // セルごとに枠を付けてマス目に見せ、見出しの行は枠の色で分ける
      const rows = parseTable(figure.markdown)
      const width = `${Math.floor(100 / Math.max(1, ...rows.map(r => r.length)))}%`
      picture = (
        <Box key="figure" flexDirection="column">
          {rows.map((cells, r) => (
            <Box key={`r${r}`} flexDirection="row" alignItems="stretch">
              {cells.map((cell, c) => (
                <Box key={`c${r}-${c}`} width={width} borderStyle="round" borderColor={r === 0 ? 'claude' : 'inactive'} paddingX={1}>
                  {marked(`m${r}-${c}`, splitMark(cell), r === 0 || c === 0 ? 'semibold' : undefined)}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      )
    } else if (figure.markdown && e.surface === 'desktop') {
      const { Markdown } = $.ui.resolve(e)
      picture = <Markdown key="figure" text={figure.markdown} />
    } else if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      const width = svgWidth(figure.svg)
      picture = <Svg key="figure" source={figure.svg} alt={figure.title} {...(width ? { width } : {})} />
    } else {
      picture = <Text key="figure">{figure.ascii}</Text>
    }
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{figure.title}</Text>
        {picture}
        {loose.length > 0 ? card('replies', t(lang, 'replyHeading'), [replyBox('looseReplies', loose), replyActions]) : replyActions}
        {/st-(ok|warn|unknown)/.test(figure.d2 ?? '') && <Text key="legend" dimColor>{t(lang, 'legend')}</Text>}
        {figure.recommend && <Text color="green">{t(lang, 'recommend', { text: figure.recommend })}</Text>}
        <Text dimColor>
          {t(lang, 'kind', { kind: kindName(figure.kind) })}
          {'  '}
          {t(lang, 'probability', { p: (view.probability ?? 0).toFixed(2) })}
        </Text>
        {figure.svg && (
          <Box key="openRow" flexDirection="row" flexWrap="wrap" gap={2}>
            <Button key="open" variant="secondary" label={t(lang, 'open')} onPress={() => actions.open()} />
          </Box>
        )}
        <Input
          key="redraw"
          placeholder={t(lang, 'redrawPlaceholder')}
          submitLabel={t(lang, 'redraw')}
          onSubmit={text => { actions.redraw(text) }}
        />
        {manual}
      </Box>
    )
  }

  if ((view.state === 'guide' || view.state === 'failure') && view.message) {
    const message = <Text color={view.state === 'failure' ? 'red' : undefined}>{t(lang, view.message as StringKey)}</Text>
    return manual ? <Box flexDirection="column" gap={1}>{message}{manual}</Box> : message
  }

  return manual || <Text dimColor>{t(lang, 'title')}</Text>
}
