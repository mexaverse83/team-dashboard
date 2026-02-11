# Dashboard V2 — QA Plan
**QA Lead: MANN** | **Design: TOM** | **Dev: COOPER**

---

## Testing Strategy Per Phase

### Phase 1: Foundation
- Color system CSS variables resolve correctly (dark theme)
- Sidebar collapse/expand: 48px → 240px transition, no layout shift
- AnimatedNumber: renders target value, handles 0, negative, large numbers, NaN
- Component stubs render without crashing

### Phase 2: Overview Page
- KPI cards: sparkline renders with data, empty data shows fallback
- RadialProgress: 0%, 50%, 100%, >100% edge cases
- Activity timeline: horizontal scroll, auto-scroll to "now"
- Bento grid: responsive breakpoints (mobile stacks, desktop grids)
- Delta badges: correct color for positive/negative/zero

### Phase 3: Mission Control
- Agent station cards: all 6 agents render with correct signature colors
- Online/busy/offline states render distinct visual treatments
- GlassCard: backdrop-filter support check
- Live feed: messages slide in, grouped within 5min clusters
- Global status bar: correct counts

### Phase 4: Data Viz
- Recharts renders: team performance ring, radar charts, bar charts
- Chart animations don't jank (no >16ms frames)
- Sparklines handle: empty data, single point, negative values
- TrendBadge: "+12% ↑" green, "-3% ↓" red, "0%" neutral

### Phase 5: Polish
- Page transitions don't break navigation
- Loading skeletons show during data fetch
- Empty states render when no data
- Mobile responsive: 320px, 375px, 768px, 1024px, 1440px
- Accessibility: WCAG AA contrast (4.5:1 text, 3:1 large), focus visible, aria labels, keyboard nav

---

## WCAG AA Contrast Checks (from design spec)

| Element | Foreground | Background | Ratio Needed |
|---------|-----------|------------|-------------|
| Primary text | --text-primary (95% white) | --bg-base (3% dark) | ≥4.5:1 |
| Secondary text | --text-secondary (55%) | --bg-base (3%) | ≥4.5:1 ⚠️ |
| Tertiary text | --text-tertiary (35%) | --bg-base (3%) | ≥4.5:1 ⚠️ |

**⚠️ FLAG**: `--text-secondary` at 55% lightness on 3% background may be borderline. `--text-tertiary` at 35% will almost certainly FAIL AA. Need to verify exact computed values.

---

## Edge Cases Checklist

- [ ] Agent goes offline mid-session (real-time update)
- [ ] 0 tasks, 0 messages, 0 agents online
- [ ] Agent name with special characters/long names
- [ ] KPI with negative delta
- [ ] Timeline with 100+ events (performance)
- [ ] Sidebar collapse on mobile viewport
- [ ] Chart with single data point
- [ ] Radial progress >100% (overflow case)
- [ ] Network failure during real-time subscription
- [ ] Browser without backdrop-filter support (fallback)

---

## Test Infrastructure

- **Framework**: Vitest 4.0.18 + @testing-library/react
- **Baseline**: 133 existing tests (all passing)
- **New tests per phase**: ~20-30 estimated
- **Target**: 250+ tests by Phase 5

---

*Tests ship with the code, not after it.*
