// One rule for real-estate equity, shared by the net-worth snapshot writer and
// the Investments page (Portfolio card, Real Estate tab). For the pre-sale WEST
// unit the amount still owed is the WEST tracker's target − paid-to-date
// (posted payments roll in monthly); the row's mortgage_balance is a static
// February figure (F13). Every other property owes its mortgage_balance.

export interface WestPaidToDate {
  /** Total purchase price owed to the developer. */
  target: number
  /** Paid to date (WEST tracker current_status.amount_paid). */
  paid: number
}

export interface PropertyLike {
  name?: string | null
  property_type?: string | null
  current_value?: number | null
  mortgage_balance?: number | null
}

export function isWestProperty(p: PropertyLike): boolean {
  return p.property_type === 'pre_sale' || /west/i.test(p.name || '')
}

/** What is still owed on the property (mortgage, or the developer balance for WEST). */
export function propertyOwed(p: PropertyLike, west?: WestPaidToDate | null): number {
  if (west && isWestProperty(p)) return Math.max(0, west.target - west.paid)
  return Number(p.mortgage_balance) || 0
}

export function propertyEquity(p: PropertyLike, west?: WestPaidToDate | null): number {
  return (Number(p.current_value) || 0) - propertyOwed(p, west)
}

/** Pulls { target, paid } out of a /investments/west-projection response. */
export function westPaidToDate(projection: unknown): WestPaidToDate | null {
  const p = projection as { target?: unknown; current_status?: { amount_paid?: unknown } } | null
  const target = Number(p?.target)
  const paid = Number(p?.current_status?.amount_paid)
  return Number.isFinite(target) && target > 0 && Number.isFinite(paid) ? { target, paid } : null
}
