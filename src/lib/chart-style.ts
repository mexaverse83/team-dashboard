/** Shared recharts tooltip style — was copy-pasted across finance components. */
export const CHART_TOOLTIP_STYLE = {
  background: 'hsl(222, 47%, 6%)',
  border: '1px solid hsl(222, 20%, 18%)',
  borderRadius: '8px',
  fontSize: '12px',
} as const

export const tooltipStyle = { contentStyle: CHART_TOOLTIP_STYLE }
