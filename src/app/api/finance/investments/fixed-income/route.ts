import { holdingsRoute } from '../holdings-route'

const route = holdingsRoute('finance_fixed_income', 'instruments', 'Fixed income')

export const GET = route.GET
export const POST = route.POST
export const DELETE = route.DELETE
