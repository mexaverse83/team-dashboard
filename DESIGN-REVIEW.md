# Team Dashboard — Design Review & Specs
**By: TOM** | **Date: 2026-02-11**

---

## Overall Assessment

Solid foundation. Cooper built clean, well-structured Next.js with proper component architecture. The dark theme works. But it's currently **functional, not memorable**. Here's how we elevate it.

**Current grade: B-**
**Target grade: A**

---

## 1. Color System — Needs a Brand Identity

### Problem
The palette is pure shadcn/ui defaults — grayscale with no brand color. Every dark dashboard looks like this. It's invisible.

### Fix
Introduce a **brand accent** and **semantic color tokens**.

```css
:root {
  /* Brand — Electric Blue (Nexaminds identity) */
  --brand: 217 91% 60%;         /* #3B82F6 */
  --brand-muted: 217 91% 15%;   /* For subtle backgrounds */
  --brand-foreground: 0 0% 100%;

  /* Keep existing grays but warm them slightly */
  --background: 220 14% 4%;     /* Slightly blue-black, not pure black */
  --card: 220 14% 7%;
  --border: 220 14% 14%;
  --muted: 220 14% 12%;

  /* Semantic status colors (already good, just formalize) */
  --status-online: 142 71% 45%;
  --status-busy: 38 92% 50%;
  --status-offline: 0 0% 40%;
}
```

### Why
Pure `0 0% 3.9%` black feels dead. A subtle blue undertone (`220 14% 4%`) gives it depth without being obvious. Apple does this. Vercel does this. It works.

---

## 2. Typography — Add Hierarchy

### Problem
`system-ui` is fine but generic. All text sizes feel similar.

### Fix
```css
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

/* Import Inter from Google Fonts — it's the standard for dashboards */
```

**Scale:**
- Page titles: `text-3xl font-bold tracking-tight` ✅ (already good)
- Section headers: `text-xl font-semibold` ✅
- Card titles: Bump to `text-base font-semibold` (currently medium)
- Body: `text-sm` ✅
- Labels: `text-xs font-medium uppercase tracking-wider text-[hsl(var(--muted-foreground))]`

---

## 3. Layout — Sidebar Needs Polish

### Current
The sidebar is functional but flat. Logo area is just an emoji in a gradient box.

### Fix
- Add a subtle `border-b` separator after the logo section
- Add agent status dots in the sidebar (show who's online at a glance)
- Bottom of sidebar: show connection status indicator
- Consider adding the Nexaminds logo when available

```tsx
// Sidebar footer upgrade
<div className="mt-auto space-y-3 px-2">
  <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
    <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
    <span>Connected · {onlineCount} agents</span>
  </div>
  <p className="text-xs text-[hsl(var(--muted-foreground))] text-center opacity-50">v1.0 · Nexaminds</p>
</div>
```

---

## 4. Agent Cards — The Hero Component

### Current
Agent cards work but all look the same shape. The gradient icon squares are the only differentiator.

### Fix: Add Agent Avatars
Each agent needs a unique visual identity beyond a Lucide icon. Options:
1. **Generated avatars** — Use DiceBear or similar for consistent style
2. **Custom illustrations** — I'll design 6 minimal agent portraits
3. **Monogram circles** — Large letter + gradient background (quick win)

**Quick win implementation:**
```tsx
// Replace icon squares with larger, more expressive avatars
<div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${config.gradient} shadow-lg shadow-${baseColor}/20`}>
  <span className="text-2xl font-bold text-white">{config.name[0]}</span>
</div>
```

### Also add:
- Hover: `hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 transition-all duration-200`
- Active task should have a subtle left border accent: `border-l-2 border-l-yellow-500`

---

## 5. Mission Control — The Star Page

### Current
Good real-time concept but the agent selector bar feels like buttons, not a control panel.

### Fix
- Agent selector: Use a **pill-style toggle group** instead of rectangular buttons
- Selected agent panel: Add a subtle glow effect matching agent's gradient
- Comms feed: Add message grouping by time (group messages within 5 min)
- Add a "typing indicator" placeholder for when agents are active

---

## 6. Tasks Board — Kanban Upgrade

### Current
Functional Kanban. Cards are plain.

### Fix
- Column headers: Add task count as a larger number, make it scannable
- Cards: Add a colored left border matching priority (critical=red, high=orange, etc.)
- Add drag-and-drop (future — tell Cooper to prep with `@dnd-kit`)
- Empty columns: Show a subtle dashed border + "No tasks" placeholder

```tsx
// Priority accent on cards
<Card className={`cursor-pointer hover:border-blue-500/50 transition-all duration-200 
  border-l-2 ${priorityBorderColors[ticket.priority]}`}>
```

---

## 7. Metrics Page — Make Numbers Pop

### Current
Numbers are there but don't create impact.

### Fix
- Completion rate card: Use a **radial progress ring** instead of a flat bar
- Big numbers: `text-4xl font-bold` with the brand color for positive metrics
- Add sparkline mini-charts next to key metrics (use `recharts` or inline SVG)
- Agent performance cards: Add a subtle rank indicator (🥇🥈🥉) for top performers

---

## 8. Micro-Interactions

Add these globally:
```css
/* Skeleton loading states */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted)/0.5) 50%, hsl(var(--muted)) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

/* Status dot pulse for online agents */
.status-online {
  animation: pulse 2s infinite;
}

/* Card entrance animation */
[class*="grid"] > * {
  animation: fadeInUp 0.3s ease-out both;
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

---

## 9. Missing: TOM in Agent Config

I'm not in `src/lib/agents.ts`. Add:

```ts
{
  id: 'tom',
  name: 'TOM',
  role: 'Visual Architect & Document Designer',
  icon: Palette, // from lucide-react
  gradient: 'from-teal-500 to-cyan-600',
  badge: 'DES',
  badgeColor: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
  skills: ['UI design', 'Tailwind CSS', 'typography', 'color systems', 'document styling'],
  description: 'Visual architect. Designs interfaces, documents, and data presentations with modern minimalist aesthetics.',
}
```

---

## Priority Implementation Order

1. **Add TOM to agents config** (5 min — Cooper)
2. **Color system upgrade** (15 min — globals.css changes)
3. **Card hover effects + priority borders** (15 min)
4. **Agent avatar upgrade** (30 min)
5. **Typography: Import Inter** (5 min)
6. **Micro-interactions CSS** (15 min)
7. **Metrics page number styling** (30 min)
8. **Mission Control polish** (1h)

Total estimate: ~3h of Cooper's time for a significant visual upgrade.

---

*White space is not empty space. It's breathing room for brilliance.* — TOM
