import {
  ArrowLeftRight,
  Baby,
  Banknote,
  Bitcoin,
  Calculator,
  CreditCard,
  FileBarChart,
  Home,
  Landmark,
  MessageCircle,
  PiggyBank,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  Wand2,
  type LucideIcon,
} from 'lucide-react'
import { FINANCE_EVENTS, type QuickAddPrefill } from '@/lib/finance-events'

export interface FinanceNavItem {
  href: string
  /** Matches the page's H1 (VIS-20, UX-09). */
  label: string
  shortLabel?: string
  icon: LucideIcon
  description: string
  keywords?: string[]
}

export interface FinanceNavSection {
  label: string
  items: FinanceNavItem[]
}

export const homeNavItem: FinanceNavItem = {
  href: '/finance',
  label: 'Home',
  icon: Home,
  description: 'This month, what you can spend, and what needs attention',
  keywords: ['overview', 'dashboard', 'today'],
}

export const wolffNavItem: FinanceNavItem = {
  href: '/finance/ask',
  label: 'Ask Mona',
  shortLabel: 'Mona',
  icon: MessageCircle,
  description: 'Your daily financial copilot',
  keywords: ['ai', 'assistant', 'coach', 'question', 'decision', 'chat'],
}

export const briefNavItem: FinanceNavItem = {
  href: '/finance/insights',
  label: 'Daily Brief',
  shortLabel: 'Brief',
  icon: Sparkles,
  description: 'Mona’s full brief and budget table',
  keywords: ['insights', 'alerts', 'recommendations'],
}

// Home / Activity / Plan / Wealth / Mona, plus a collapsed "More" (NU-9: nav
// regrouping only; every route stays where it is).
export const primaryFinanceSections: FinanceNavSection[] = [
  {
    label: 'Activity',
    items: [
      { href: '/finance/transactions', label: 'Transactions', shortLabel: 'Activity', icon: ArrowLeftRight, description: 'Record and review money movement', keywords: ['expense', 'spending', 'add', 'purchases'] },
      { href: '/finance/budgets', label: 'Budgets', icon: PiggyBank, description: 'Monthly category limits and pace', keywords: ['limits', 'categories'] },
      { href: '/finance/subscriptions', label: 'Subscriptions', icon: RefreshCw, description: 'Recurring bills and services', keywords: ['bills', 'recurring'] },
      { href: '/finance/installments', label: 'MSI Installments', shortLabel: 'MSI', icon: CreditCard, description: 'Interest-free installment schedule', keywords: ['meses sin intereses', 'msi'] },
      { href: '/finance/income', label: 'Income', icon: Banknote, description: 'Salary and recurring income', keywords: ['salary', 'payroll', 'freelance'] },
    ],
  },
  {
    label: 'Plan',
    items: [
      { href: '/finance/goals', label: 'Goals & WEST', shortLabel: 'Goals', icon: Target, description: 'Savings goals and the WEST apartment', keywords: ['savings', 'targets', 'west', 'apartment'] },
      { href: '/finance/family', label: 'Family & Baby', shortLabel: 'Family', icon: Baby, description: 'Baby 2027, the education fund, and protection', keywords: ['baby', 'education', 'tec', '2045', 'insurance', 'protection'] },
      { href: '/finance/emergency-fund', label: 'Emergency Fund', icon: ShieldCheck, description: 'Protected liquidity reserve', keywords: ['runway', 'reserve'] },
    ],
  },
  {
    label: 'Wealth',
    items: [
      { href: '/finance/investments', label: 'Investments', icon: TrendingUp, description: 'Portfolio, crypto, real estate and retirement', keywords: ['west', 'gbm', 'stocks', 'real estate', 'net worth'] },
      { href: '/finance/debt', label: 'Debt Planner', icon: Landmark, description: 'Balances and payoff strategy' },
      { href: '/finance/reports', label: 'Reports', icon: FileBarChart, description: 'Monthly and owner-level reporting' },
    ],
  },
  { label: 'Mona', items: [wolffNavItem, briefNavItem] },
]

export const moreFinanceSection: FinanceNavSection = {
  label: 'More',
  items: [
    { href: '/finance/audit', label: 'Spending Audit', shortLabel: 'Audit', icon: Search, description: 'Patterns, leaks, and anomalies' },
    { href: '/finance/rules', label: 'Auto Rules', icon: Wand2, description: 'Automatic transaction categorization' },
    { href: '/finance/budget-builder', label: 'Budget Builder', icon: Calculator, description: 'Build and rebalance the monthly plan' },
  ],
}

/** Destinations that only live in the command palette (not in the sidebar). */
export const paletteOnlyItems: FinanceNavItem[] = [
  { href: '/finance/investments?tab=Crypto', label: 'Crypto', icon: Bitcoin, description: 'Digital-asset positions (Investments › Crypto)', keywords: ['bitcoin', 'btc', 'eth', 'hype', 'coins'] },
  { href: '/finance/investments?tab=Real%20Estate', label: 'WEST tracker', icon: Home, description: 'Apartment funding plan (Investments › Real Estate)', keywords: ['west', 'apartment', 'delivery'] },
]

export interface FinanceAction {
  id: 'add-expense' | 'tag-baby'
  label: string
  href: string
  icon: LucideIcon
  description: string
  keywords?: string[]
}

export const financeActions: FinanceAction[] = [
  { id: 'add-expense', label: 'Add expense', href: '/finance/transactions?add=1', icon: Plus, description: 'Record a purchase or income', keywords: ['new transaction', 'add', 'expense', 'income', 'log'] },
  { id: 'tag-baby', label: 'Tag baby expenses', href: '/finance/family#baby-review', icon: Tag, description: 'Review prenatal spend that is missing the baby tag', keywords: ['baby', 'prenatal', 'tag'] },
]

export const allFinanceNavItems = [
  homeNavItem,
  ...primaryFinanceSections.flatMap(section => section.items),
  ...moreFinanceSection.items,
]

export function isFinanceRouteActive(pathname: string, href: string) {
  const path = href.split(/[?#]/)[0]
  return path === '/finance' ? pathname === path : pathname === path || pathname.startsWith(`${path}/`)
}

export function currentFinanceNavItem(pathname: string) {
  return [...allFinanceNavItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => isFinanceRouteActive(pathname, item.href))
}

export function isMoreRouteActive(pathname: string) {
  return moreFinanceSection.items.some(item => isFinanceRouteActive(pathname, item.href))
}

/**
 * Ask the global quick-add sheet to open. The sheet's host claims the event
 * with preventDefault(); returns false when nothing did (host not mounted),
 * so callers can fall back to the `/finance/transactions?add=1` deep link.
 */
export function requestQuickAdd(prefill?: QuickAddPrefill): boolean {
  if (typeof window === 'undefined') return false
  const event = new CustomEvent(FINANCE_EVENTS.quickAdd, { detail: prefill ?? {}, cancelable: true })
  return !window.dispatchEvent(event)
}
