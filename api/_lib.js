import { randomUUID } from 'node:crypto'

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams getting started.',
    maxEmployees: 10,
    supportsSSO: false,
    priceUSD: 3900,
    priceCRC: 20900,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description: 'For growing teams that need more capacity.',
    maxEmployees: 50,
    supportsSSO: false,
    priceUSD: 7900,
    priceCRC: 41900,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams with advanced needs including SSO.',
    maxEmployees: Infinity,
    supportsSSO: true,
    priceUSD: 14900,
    priceCRC: 149900,
  },
}

export function selectPlan(employees, needsSSO) {
  if (needsSSO || employees > 50) return PLANS.enterprise
  if (employees > 10) return PLANS.pro
  return PLANS.starter
}

export function planPrice(plan, country) {
  const useCRC = country && ['CR', 'CRI', 'COSTA RICA'].includes(country.toUpperCase())
  return useCRC
    ? { price: plan.priceCRC, currency: 'CRC' }
    : { price: plan.priceUSD, currency: 'USD' }
}

export { randomUUID }
