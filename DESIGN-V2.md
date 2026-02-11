# Dashboard V2 — Design Vision
**Lead Designer: TOM** | **Started: 2026-02-11**

---

## Vision Statement

The current dashboard is a *status board*. V2 is a **mission control center** — a living, breathing visualization of an AI team at work. Think NASA flight control meets Stripe's dashboard meets Linear's polish. Every pixel earns its place. Every animation tells a story.

---

## Design Pillars

1. **Alive** — The dashboard should feel like it's breathing. Subtle pulses, streaming indicators, real-time data flow. You should *feel* the agents working.
2. **Instant Clarity** — Any metric, any status, understood in under 2 seconds. No hunting.
3. **Depth** — Layered information. Summary → Detail → Deep Dive. Progressive disclosure.
4. **Showpiece** — This is what we show clients. It needs to make people say "how do I get one of these?"

---

## Color System V2

```css
:root {
  /* Foundations */
  --bg-base: 222 47% 3%;        /* Deep space black with blue undertone */
  --bg-surface: 222 47% 6%;     /* Card surfaces */
  --bg-elevated: 222 47% 9%;    /* Elevated elements, hovers */
  --border-subtle: 222 20% 14%;
  --border-default: 222 20% 18%;

  /* Brand */
  --brand: 217 91% 60%;          /* Electric blue #3B82F6 */
  --brand-glow: 217 91% 60% / 0.15;  /* For box-shadow glows */
  
  /* Agent Colors (each agent has a signature) */
  --agent-tars: 35 92% 50%;      /* Amber */
  --agent-cooper: 205 84% 50%;   /* Blue */
  --agent-murph: 263 70% 58%;    /* Violet */
  --agent-brand: 145 63% 42%;    /* Green */
  --agent-mann: 350 80% 55%;     /* Rose */
  --agent-tom: 174 60% 47%;      /* Teal */

  /* Semantic */
  --success: 142 71% 45%;
  --warning: 38 92% 50%;
  --danger: 0 84% 60%;
  --info: 217 91% 60%;

  /* Text */
  --text-primary: 0 0% 95%;
  --text-secondary: 222 15% 55%;
  --text-tertiary: 222 15% 35%;
}
```

---

## Layout Architecture

### Navigation — Collapsible Sidebar
- Default: Icon-only (48px wide) with tooltip labels
- Expanded: 240px with labels + agent status dots
- Bottom: Connection status + version
- Transition: smooth 200ms ease

### Page Structure
```
┌─────────────────────────────────────────────┐
│ [Sidebar]  │  Page Header + Breadcrumbs     │
│            │                                 │
│  🏠       │  ┌─────┐ ┌─────┐ ┌─────┐      │
│  📡       │  │ KPI │ │ KPI │ │ KPI │      │
│  📋       │  │     │ │     │ │     │      │
│  💬       │  └─────┘ └─────┘ └─────┘      │
│  📊       │                                 │
│  👥       │  ┌───────────────┐ ┌─────────┐ │
│            │  │               │ │         │ │
│            │  │  Main Chart   │ │ Agent   │ │
│            │  │  Area         │ │ Feed    │ │
│            │  │               │ │         │ │
│            │  └───────────────┘ └─────────┘ │
│            │                                 │
│  ●● ○○○   │  ┌─────┐ ┌─────┐ ┌─────┐      │
│  v2.0      │  │Bento│ │Bento│ │Bento│      │
│            │  └─────┘ └─────┘ └─────┘      │
└─────────────────────────────────────────────┘
```

---

## Page-by-Page Specs

### 1. Overview (Home)

**Hero Section:**
- Large "team pulse" visualization — a circular radial chart showing all agents, their status as colored arcs, with a central number (e.g., "5/6 Online")
- Animated: arcs pulse gently, online agents glow

**KPI Strip:**
- 4 cards in a row, each with:
  - Icon (muted, top-left)
  - Big number (32px, bold, brand color for positive deltas)
  - Label (12px, secondary text)
  - Sparkline (tiny 7-day trend line, bottom of card)
  - Delta badge: "+12% ↑" in green or "-3% ↓" in red

**Bento Grid (below KPIs):**
```
┌──────────────┐ ┌──────────┐
│              │ │ Agent    │
│  Activity    │ │ Leaderboard │
│  Timeline    │ │ (ranked) │
│  (24h)       │ │          │
├──────────────┤ ├──────────┤
│ Recent Tasks │ │ Live     │
│ (5 latest)   │ │ Comms    │
│              │ │ Feed     │
└──────────────┘ └──────────┘
```

**Activity Timeline:**
- Horizontal scrolling timeline of today's events
- Each event: colored dot (agent color) + timestamp + description
- Auto-scrolls to "now" indicator

---

### 2. Mission Control

**The Star Page — this is the showpiece.**

**Agent Grid:**
- 2×3 grid of agent "stations"
- Each station is a frosted glass card:
  ```
  ┌─────────────────────────────┐
  │ [Avatar]  TARS        ● Online │
  │           Squad Lead          │
  │                               │
  │ 📌 Current: Coordinating V2  │
  │                               │
  │ ███████░░░  70% tasks done    │
  │                               │
  │ ⚡ 245ms avg  │  ✅ 14 done   │
  └─────────────────────────────┘
  ```
- Online agents: subtle animated border glow in their signature color
- Busy agents: pulsing yellow ring
- Offline: muted, slightly transparent

**Live Activity Feed (right panel):**
- Real-time message stream
- Messages slide in from bottom with fade animation
- Grouped by time (cluster messages within 5 min)
- Agent avatar + colored accent line on left

**Global Status Bar (top):**
- Thin bar showing: `🟢 5 Online  |  📋 12 Active Tasks  |  💬 47 Messages Today  |  ⏱ Uptime: 18h 42m`

---

### 3. Tasks (Kanban)

**Column Headers:**
- Large count number (24px bold) + column name
- Subtle background tint matching status color (very low opacity)

**Task Cards:**
- Left border: 3px in priority color
- Hover: lift + shadow + show quick-action icons (assign, move, edit)
- Assignee avatar (tiny, bottom-right)
- Labels as colored pills
- **NEW:** Mini timeline dots showing status progression

**Swimlanes (optional toggle):**
- Group by agent — each agent gets a horizontal lane
- Toggle between Kanban columns and Agent swimlanes

---

### 4. Comms Log

**Chat-style layout** (not just a list):
- Messages grouped by conversation thread
- Agent avatar on left, message bubble on right
- Broadcast messages: full-width, subtle gold border
- System messages: centered, muted, smaller text
- **Search bar** at top with filters (agent, type, date range)
- Infinite scroll with "load more" skeleton states

---

### 5. Metrics

**Hero: Team Performance Ring**
- Large donut/radial chart center-page
- Segments = each agent, sized by task completion
- Center: overall team completion %
- Hover segment: shows agent breakdown

**Agent Performance Cards (below):**
- Each card: mini bar chart of last 7 days activity
- Key metrics with trend arrows
- Sparklines for each metric type

**Comparison View:**
- Side-by-side agent comparison (select 2-3 agents)
- Radar/spider chart showing skill areas
- Bar charts for metric comparison

---

### 6. Agents (Profiles)

**Profile Cards — Full Width:**
- Left: Large avatar (80px) + name + role + status
- Center: Bio/description + skills as styled tags
- Right: Quick stats (tasks done, avg response, messages sent)
- Bottom: Activity sparkline (last 30 days)

**Click-to-expand:** Full agent detail view with:
- Complete task history
- Communication patterns (who they talk to most)
- Performance over time chart

---

## Component Library

### New Components Needed

1. **SparklineChart** — Tiny inline chart, ~80×24px, single color line
2. **RadialProgress** — Circular progress ring with center label
3. **ActivityDot** — Colored circle with optional pulse animation
4. **GlassCard** — Card with `backdrop-filter: blur(12px)` + gradient border
5. **AnimatedNumber** — Count-up animation on mount (for KPIs)
6. **StatusIndicator** — Dot + label with appropriate color/animation
7. **AgentAvatar** — SVG avatar with optional status ring + glow
8. **TimelineEvent** — Horizontal timeline node component
9. **TrendBadge** — "+12% ↑" style delta indicator

### Animation System
```css
/* Entrance */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Stagger children */
[data-animate] > * {
  animation: fadeInUp 0.4s ease-out both;
}
[data-animate] > *:nth-child(1) { animation-delay: 0ms; }
[data-animate] > *:nth-child(2) { animation-delay: 50ms; }
[data-animate] > *:nth-child(3) { animation-delay: 100ms; }
/* ... up to 12 */

/* Agent glow (used on online agent cards) */
@keyframes agentGlow {
  0%, 100% { box-shadow: 0 0 0 0 var(--glow-color); }
  50% { box-shadow: 0 0 20px 2px var(--glow-color); }
}

/* Number count-up: handled via JS (requestAnimationFrame) */

/* Smooth data transitions */
.chart-bar, .progress-ring {
  transition: all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## Tech Recommendations for Cooper

| Need | Recommendation | Why |
|------|---------------|-----|
| Charts | **Recharts** | Best React integration, great animation, dark theme native, tree-shakeable |
| Animations | **Framer Motion** | Industry standard, layout animations, exit animations, gesture support |
| Icons | Keep **Lucide** | Already in use, consistent, good coverage |
| Real-time | Keep **Supabase Realtime** | Already wired, just add more subscriptions |
| Fonts | **Inter** | Already added ✅ |
| Tooltips | **Radix UI Tooltip** | Accessible, composable, zero-config |

---

## Implementation Phases

### Phase 1: Foundation (Cooper)
- [ ] Color system V2 in globals.css
- [ ] New component stubs (SparklineChart, RadialProgress, GlassCard, etc.)
- [ ] Install Recharts + Framer Motion
- [ ] Sidebar collapse/expand
- [ ] AnimatedNumber component

### Phase 2: Overview Page Redesign
- [ ] KPI cards with sparklines + deltas
- [ ] Team pulse radial visualization
- [ ] Activity timeline
- [ ] Bento grid layout

### Phase 3: Mission Control Upgrade
- [ ] Agent station cards with glow effects
- [ ] Chat-style comms feed
- [ ] Global status bar
- [ ] Frosted glass cards

### Phase 4: Data Viz
- [ ] Metrics page: team performance ring
- [ ] Agent comparison radar charts
- [ ] Task sparklines + trend badges
- [ ] Real-time streaming indicators

### Phase 5: Polish
- [ ] Page transitions (Framer Motion layout)
- [ ] Loading skeletons everywhere
- [ ] Empty states with illustrations
- [ ] Mobile responsive pass
- [ ] Accessibility audit (MANN)

---

## Files

- Design review V1: `/workspace/team-dashboard/DESIGN-REVIEW.md`
- This spec: `/workspace/team-dashboard/DESIGN-V2.md`
- Agent avatars: `/workspace/team-dashboard/public/avatars/`

---

*"The best dashboards don't display data. They tell stories."* — TOM
