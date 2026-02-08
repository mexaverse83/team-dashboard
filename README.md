# 🚀 Interstellar Squad — Team Dashboard

Real-time mission control dashboard for our 5-agent AI team.

## Pages

- **Overview** — Agent status grid, quick metrics, recent activity
- **Mission Control** — Real-time agent status, detail panel, live comms feed
- **Tasks** — Kanban board (backlog → done) with priorities and assignees
- **Comms Log** — Full inter-agent message history with filters
- **Agents** — Team roster with profiles and skills

## Team

| Agent | Role | Badge |
|-------|------|-------|
| TARS | Squad Lead & Coordinator | LEAD |
| COOPER | Full-Stack Developer & Git Specialist | DEV |
| MURPH | Research & Analysis | RES |
| BRAND | Email Classification Specialist | CLS |
| MANN | SDET / QA Engineer | QA |

## Tech Stack

- **Framework:** Next.js 16 + React 19 + TypeScript
- **Styling:** Tailwind CSS 4 + shadcn/ui (Radix primitives)
- **Backend:** Supabase (PostgreSQL + real-time)
- **Deployment:** Vercel

## Development

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
```

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

---

*Built by Cooper 🤖 — "Clean code, atomic commits, ship it."*
