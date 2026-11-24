import type { EngineInterface, RenderInput } from 'claude-code'

import type { View } from '../types'
import { kindById } from './catalog'
import { t } from './strings'
import type { StringKey } from './strings'

export type PaneActions = {
  draw: () => Promise<void>
  dismiss: () => Promise<void>
  manual: () => Promise<void>
  open: () => Promise<void>
  /** 入力欄の指示で描き直す */
  redraw: (instruction: string) => Promise<void>
}

const PROPOSAL_KEY: Record<NonNullable<View['trigger']>, StringKey> = {
  question: 'proposalQuestion',
  answer: 'proposalAnswer',
  prompt: 'proposalPrompt',
}

// d2 の SVG は幅の属性を持たず、指定しないとペインいっぱいに拡大される（タスク 0 で確認）。
export function svgWidth(svg: string): number | undefined {
  const width = Number(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+)/.exec(svg)?.[1])
  return Number.isFinite(width) && width > 0 ? Math.round(width) : undefined
}

export function renderPane($: EngineInterface, e: RenderInput<'Pane'>, view: View, actions: PaneActions) {
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const lang = view.lang
  const kindName = (id: string) => kindById(id)?.name[lang] ?? id
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
    let picture
    if (e.surface === 'desktop') {
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
        {figure.recommend && <Text color="green">{t(lang, 'recommend', { text: figure.recommend })}</Text>}
        <Text dimColor>
          {t(lang, 'kind', { kind: kindName(figure.kind) })}
          {'  '}
          {t(lang, 'probability', { p: (view.probability ?? 0).toFixed(2) })}
        </Text>
        <Box flexDirection="row" flexWrap="wrap" gap={2}>
          <Button key="open" variant="secondary" label={t(lang, 'open')} onPress={() => actions.open()} />
        </Box>
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
