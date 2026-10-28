import { holdingsRoute } from '../holdings-route'

const route = holdingsRoute('finance_stock_holdings', 'stocks', 'Stocks')

export const GET = route.GET
export const POST = route.POST
export const DELETE = route.DELETE
