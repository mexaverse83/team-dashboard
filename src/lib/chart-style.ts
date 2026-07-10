/** Shared recharts tooltip style — was copy-pasted across finance components. */
export const CHART_TOOLTIP_STYLE = {
  background: 'hsl(0, 0%, 100%)',
  border: '1px solid hsl(34, 22%, 83%)',
  borderRadius: '8px',
  fontSize: '12px',
} as const

export const tooltipStyle = { contentStyle: CHART_TOOLTIP_STYLE }
