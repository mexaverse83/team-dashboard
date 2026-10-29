// Category name → lucide icon (VIS-10). The DB emoji stays as a fallback for
// categories this map doesn't know, so new categories still get a glyph.
import {
  Baby, Banknote, Briefcase, Building2, Car, Clapperboard, CreditCard, Droplets, Dumbbell, Fuel, Gift,
  GraduationCap, HeartPulse, House, Landmark, Laptop, Package, PawPrint, PiggyBank, Plane, Plug, Receipt,
  Shield, Shirt, ShoppingBag, ShoppingCart, Smartphone, TrendingUp, UtensilsCrossed, Wallet, Wifi, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react'

/** Exact (case-insensitive) category names. */
const BY_NAME: Record<string, LucideIcon> = {
  'rent/mortgage': House,
  rent: House,
  mortgage: House,
  housing: House,
  groceries: ShoppingCart,
  'dining out': UtensilsCrossed,
  restaurants: UtensilsCrossed,
  transport: Car,
  transportation: Car,
  // Utilities and Electricity sit side by side on Budgets: distinct glyphs.
  utilities: Plug,
  electricity: Zap,
  subscriptions: Smartphone,
  entertainment: Clapperboard,
  health: HeartPulse,
  shopping: ShoppingBag,
  travel: Plane,
  business: Briefcase,
  education: GraduationCap,
  gifts: Gift,
  maintenance: Wrench,
  other: Package,
  baby: Baby,
  salary: Wallet,
  freelance: Laptop,
  investments: TrendingUp,
  'other income': Landmark,
  savings: PiggyBank,
  west: Building2,
  insurance: Shield,
  internet: Wifi,
  water: Droplets,
  gas: Fuel,
  fuel: Fuel,
  gym: Dumbbell,
  clothing: Shirt,
  pets: PawPrint,
  msi: CreditCard,
  'credit card': CreditCard,
  fees: Receipt,
  cash: Banknote,
}

/** Keyword fallbacks for names that aren't an exact match ("Dining & Bars", "Car insurance"). */
const BY_KEYWORD: Array<[RegExp, LucideIcon]> = [
  [/baby|beb[eé]|prenatal|pa[ñn]al/i, Baby],
  [/rent|mortgage|hipoteca|renta|house|home/i, House],
  [/grocer|super|despensa/i, ShoppingCart],
  [/dining|restaurant|food|comida|caf[eé]|bar\b/i, UtensilsCrossed],
  [/uber|taxi|transport|car\b|auto/i, Car],
  [/electric|luz|cfe/i, Zap],
  [/util/i, Plug],
  [/phone|cel|subscri|streaming/i, Smartphone],
  [/health|medic|doctor|pharma|farmacia|salud|dental/i, HeartPulse],
  [/insur|seguro/i, Shield],
  [/travel|viaje|flight|hotel/i, Plane],
  [/gift|regalo/i, Gift],
  [/school|educa|tuition|colegiatura/i, GraduationCap],
  [/shop|amazon|ropa|cloth/i, ShoppingBag],
  [/movie|cine|entertain|ocio/i, Clapperboard],
  [/invest|gbm|crypto/i, TrendingUp],
  [/salary|n[oó]mina|sueldo/i, Wallet],
  [/repair|maint|manten/i, Wrench],
  [/internet|wifi/i, Wifi],
]

export function getCategoryIcon(name: string | null | undefined): LucideIcon | null {
  const key = String(name ?? '').trim().toLowerCase()
  if (!key) return null
  if (BY_NAME[key]) return BY_NAME[key]
  for (const [pattern, icon] of BY_KEYWORD) if (pattern.test(key)) return icon
  return null
}

/**
 * Item-name icons (a subscription or transaction's own name) that are more
 * specific than its category: "Internet" and "Celular" under Utilities.
 */
const BY_ITEM: Array<[RegExp, LucideIcon]> = [
  [/internet|wi-?fi|izzi|totalplay|telmex|megacable|infinitum/i, Wifi],
  [/celular|\bcel\b|telcel|movistar|at&t|iphone|phone|tel[eé]fono/i, Smartphone],
  [/\bagua\b|water/i, Droplets],
  [/\bgas\b|gasolina|fuel/i, Fuel],
]

export function getItemIcon(itemName: string | null | undefined): LucideIcon | null {
  const key = String(itemName ?? '').trim()
  if (!key) return null
  for (const [pattern, icon] of BY_ITEM) if (pattern.test(key)) return icon
  return null
}

export const CATEGORY_PALETTE_SIZE = 8

/**
 * Token colour for a category's slot in the fixed palette (`--cat-1..8`),
 * chosen by its sort order (or list index) rather than the DB hex colour.
 */
export function categoryColorVar(index: number | null | undefined): string {
  const i = Number.isFinite(index as number) ? Math.abs(Math.trunc(index as number)) : 0
  return `--cat-${(i % CATEGORY_PALETTE_SIZE) + 1}`
}

/** `hsl(var(--cat-N))`, optionally with alpha, for inline styles and chart series. */
export function categoryColor(index: number | null | undefined, alpha?: number): string {
  const v = categoryColorVar(index)
  return alpha == null ? `hsl(var(${v}))` : `hsl(var(${v}) / ${alpha})`
}
