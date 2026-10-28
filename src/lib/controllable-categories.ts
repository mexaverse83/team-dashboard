// Day-to-day categories the household can actually steer this month. The
// "can we spend?" numbers (daily plan, widget hero, weekly coach) only count
// these; fixed bills, MSI and plans are already committed.
//
// Plain data with no imports, so the same set can be consumed by the
// summary engine, the widget route, daily-plan and (by value) insights-prompt.
export const CONTROLLABLE_CATEGORY_NAMES = [
  'Dining Out',
  'Groceries',
  'Entertainment',
  'Shopping',
  'Transport',
  'Travel',
  'Gifts',
  'Other',
] as const

export type ControllableCategory = (typeof CONTROLLABLE_CATEGORY_NAMES)[number]

export const CONTROLLABLE: ReadonlySet<string> = new Set<string>(CONTROLLABLE_CATEGORY_NAMES)

export function isControllableCategory(name: string | null | undefined): boolean {
  return !!name && CONTROLLABLE.has(name)
}

/** Budget rows that count toward discretionary room: controllable and billed monthly. */
export function controllableBudgetRows<T extends { category: string; is_non_monthly?: boolean | null }>(rows: readonly T[]): T[] {
  return rows.filter(row => CONTROLLABLE.has(row.category) && !row.is_non_monthly)
}
