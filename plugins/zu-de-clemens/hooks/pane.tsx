import type { EngineInterface, RenderInputOf } from 'claude-code'

import type { View } from '../types'
import { kindById } from './catalog'
import { t } from './strings'
import type { StringKey } from './strings'

export type PaneActions = {
  draw: () => Promise<void>
  dismiss: () => Promise<void>
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

export function renderPane($: EngineInterface, e: RenderInputOf<'Pane'>, view: View, actions: PaneActions) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const lang = view.lang
  const kindName = (id: string) => kindById(id)?.name[lang] ?? id

  if (view.state === 'proposal') {
    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{t(lang, PROPOSAL_KEY[view.trigger ?? 'answer'])}</Text>
        <Text dimColor>
          {t(lang, 'candidates', { kinds: (view.candidates ?? []).map(c => kindName(c.id)).join(' / ') || '-' })}
          {'  '}
          {t(lang, 'probability', { p: (view.probability ?? 0).toFixed(2) })}
        </Text>
        <Box flexDirection="row" gap={1}>
          <Button key="draw" label={t(lang, 'draw')} onPress={() => actions.draw()} />
          <Button key="dismiss" plain label={t(lang, 'dismiss')} onPress={() => actions.dismiss()} />
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
      </Box>
    )
  }

  if ((view.state === 'guide' || view.state === 'failure') && view.message) {
    return <Text color={view.state === 'failure' ? 'red' : undefined}>{t(lang, view.message as StringKey)}</Text>
  }

  return <Text dimColor>{t(lang, 'title')}</Text>
}
