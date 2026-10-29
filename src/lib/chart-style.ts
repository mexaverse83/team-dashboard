// Legacy entry point kept for existing chart callers; everything resolves
// through the token-driven theme in chart-theme.ts (VIS-01), so tooltips read
// correctly in both the dark and light themes.
import { chartTooltipProps } from './chart-theme'

export const CHART_TOOLTIP_STYLE = chartTooltipProps.contentStyle

export const tooltipStyle = {
  contentStyle: chartTooltipProps.contentStyle,
  labelStyle: chartTooltipProps.labelStyle,
  itemStyle: chartTooltipProps.itemStyle,
  wrapperStyle: chartTooltipProps.wrapperStyle,
}
