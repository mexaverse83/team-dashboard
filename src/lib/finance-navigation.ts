import {
  ArrowLeftRight,
  Banknote,
  Bitcoin,
  Calculator,
  CreditCard,
  FileBarChart,
  Landmark,
  MessageCircle,
  PiggyBank,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Wand2,
  type LucideIcon,
} from 'lucide-react'

export interface FinanceNavItem {
  href: string
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

export const wolffNavItem: FinanceNavItem = {
  href: '/finance/ask',
  label: 'Ask Wolff',
  shortLabel: 'Wolff',
  icon: MessageCircle,
  description: 'Your daily financial copilot',
  keywords: ['ai', 'assistant', 'coach', 'question', 'decision'],
}

export const primaryFinanceSections: FinanceNavSection[] = [
  {
    label: 'Daily',
    items: [
      { href: '/finance', label: 'Overview', shortLabel: 'Home', icon: Wallet, description: 'Today’s plan and financial pulse', keywords: ['home', 'dashboard'] },
      { href: '/finance/insights', label: 'Insights', icon: Sparkles, description: 'Wolff’s complete decision brief', keywords: ['brief', 'alerts', 'recommendations'] },
    ],
  },
  {
    label: 'Money',
    items: [
      { href: '/finance/transactions', label: 'Transactions', shortLabel: 'Txns', icon: ArrowLeftRight, description: 'Record and review money movement', keywords: ['expense', 'spending', 'add'] },
      { href: '/finance/budgets', label: 'Budgets', icon: PiggyBank, description: 'Monthly category limits and pace', keywords: ['limits', 'categories'] },
    ],
  },
  {
    label: 'Goals',
    items: [
      { href: '/finance/goals', label: 'Goals', icon: Target, description: 'Bernardo and Laura’s savings goals', keywords: ['savings', 'targets'] },
      { href: '/finance/investments', label: 'Investments', icon: TrendingUp, description: 'WEST and long-term portfolio', keywords: ['west', 'gbm', 'stocks', 'real estate'] },
    ],
  },
]

export const financeToolSections: FinanceNavSection[] = [
  {
    label: 'Cash flow',
    items: [
      { href: '/finance/income', label: 'Income', icon: Banknote, description: 'Salary and recurring income' },
      { href: '/finance/subscriptions', label: 'Subscriptions', icon: RefreshCw, description: 'Recurring bills and services' },
      { href: '/finance/budget-builder', label: 'Budget Builder', icon: Calculator, description: 'Build and rebalance the monthly plan' },
    ],
  },
  {
    label: 'Commitments',
    items: [
      { href: '/finance/installments', label: 'MSI Tracker', icon: CreditCard, description: 'Interest-free installment schedule', keywords: ['meses sin intereses'] },
      { href: '/finance/debt', label: 'Debt Planner', icon: Landmark, description: 'Balances and payoff strategy' },
      { href: '/finance/emergency-fund', label: 'Emergency Fund', icon: ShieldCheck, description: 'Protected liquidity reserve' },
    ],
  },
  {
    label: 'Analysis & automation',
    items: [
      { href: '/finance/crypto', label: 'Crypto', icon: Bitcoin, description: 'Digital-asset positions and risk' },
      { href: '/finance/audit', label: 'Spending Audit', shortLabel: 'Audit', icon: Search, description: 'Patterns, leaks, and anomalies' },
      { href: '/finance/reports', label: 'Reports', icon: FileBarChart, description: 'Monthly and owner-level reporting' },
      { href: '/finance/rules', label: 'Auto Rules', icon: Wand2, description: 'Automatic transaction categorization' },
    ],
  },
]

export const allFinanceNavItems = [
  wolffNavItem,
  ...primaryFinanceSections.flatMap(section => section.items),
  ...financeToolSections.flatMap(section => section.items),
]

export function isFinanceRouteActive(pathname: string, href: string) {
  return href === '/finance' ? pathname === href : pathname.startsWith(href)
}

export function currentFinanceNavItem(pathname: string) {
  return [...allFinanceNavItems]
    .sort((a, b) => b.href.length - a.href.length)
    .find(item => isFinanceRouteActive(pathname, item.href))
}
