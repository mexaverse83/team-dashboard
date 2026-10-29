import { holdingsRoute } from '../holdings-route'

const route = holdingsRoute('finance_real_estate', 'properties', 'Real estate')

export const GET = route.GET
export const POST = route.POST
export const DELETE = route.DELETE
