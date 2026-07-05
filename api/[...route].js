import { randomUUID } from 'node:crypto'

// Module-level store — persists while the function is warm.
// Sequential API calls (as an LLM would make them) always hit a warm instance.
const accounts = []
const subscriptions = []
const checkouts = []

// ── Plans ─────────────────────────────────────────────────────────────────

const PLANS = {
  starter: {
    id: 'starter', name: 'Starter',
    description: 'For small teams getting started.',
    maxEmployees: 10, supportsSSO: false,
    priceUSD: 3900, priceCRC: 20900,
  },
  pro: {
    id: 'pro', name: 'Pro',
    description: 'For growing teams that need more capacity.',
    maxEmployees: 50, supportsSSO: false,
    priceUSD: 7900, priceCRC: 41900,
  },
  enterprise: {
    id: 'enterprise', name: 'Enterprise',
    description: 'For large teams with advanced needs including SSO.',
    maxEmployees: Infinity, supportsSSO: true,
    priceUSD: 14900, priceCRC: 149900,
  },
}

function selectPlan(employees, needsSSO) {
  if (needsSSO || employees > 50) return PLANS.enterprise
  if (employees > 10) return PLANS.pro
  return PLANS.starter
}

function planPrice(plan, country) {
  const crc = country && ['CR', 'CRI', 'COSTA RICA'].includes(country.toUpperCase())
  return crc ? { price: plan.priceCRC, currency: 'CRC' } : { price: plan.priceUSD, currency: 'USD' }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function send(res, status, body) {
  res.status(status).json(body)
}

// ── Handlers ──────────────────────────────────────────────────────────────

function handleRecommendPlan(req, res) {
  const { country, employees, needsSSO } = req.body ?? {}

  if (typeof employees !== 'number' || employees < 1) {
    return send(res, 400, { error: '`employees` must be a positive number.' })
  }

  const plan = selectPlan(employees, !!needsSSO)
  const { price, currency } = planPrice(plan, country)

  const reasons = []
  if (needsSSO) reasons.push('SSO required — only Enterprise supports SSO')
  if (employees > 50) reasons.push(`${employees} employees exceeds Pro limit of 50`)
  else if (employees > 10) reasons.push(`${employees} employees exceeds Starter limit of 10`)
  else reasons.push(`${employees} employees fits within Starter limit`)

  send(res, 200, {
    recommendedPlan: plan.name,
    planId: plan.id,
    price, currency,
    billingCycle: 'monthly',
    reasons,
    nextAction: 'create_account',
  })
}

function handleCreateAccount(req, res) {
  const { email, name, company } = req.body ?? {}

  if (!email || !name || !company) {
    return send(res, 400, { error: '`email`, `name`, and `company` are required.' })
  }

  const existing = accounts.find(a => a.email === email)
  if (existing) {
    return send(res, 409, { error: 'An account with this email already exists.', accountId: existing.id })
  }

  const account = { id: randomUUID(), email, name, company, createdAt: new Date().toISOString() }
  accounts.push(account)

  send(res, 201, {
    accountId: account.id,
    email: account.email,
    company: account.company,
    createdAt: account.createdAt,
    nextAction: 'create_subscription',
  })
}

function handleCreateSubscription(req, res) {
  const { accountId, planId } = req.body ?? {}

  if (!accountId || !planId) {
    return send(res, 400, { error: '`accountId` and `planId` are required.' })
  }

  const account = accounts.find(a => a.id === accountId)
  if (!account) return send(res, 404, { error: 'Account not found.' })

  const plan = PLANS[planId]
  if (!plan) {
    return send(res, 400, { error: `Unknown planId. Valid values: ${Object.keys(PLANS).join(', ')}.` })
  }

  const existing = subscriptions.find(s => s.accountId === accountId && s.status === 'pending')
  if (existing) {
    return send(res, 409, {
      error: 'Account already has a pending subscription.',
      subscriptionId: existing.id,
      nextAction: 'confirm_checkout',
    })
  }

  const sub = {
    id: randomUUID(), accountId,
    planId: plan.id, planName: plan.name,
    priceUSD: plan.priceUSD, priceCRC: plan.priceCRC,
    billingCycle: 'monthly', status: 'pending',
    createdAt: new Date().toISOString(),
  }
  subscriptions.push(sub)

  send(res, 201, {
    subscriptionId: sub.id,
    accountId: sub.accountId,
    plan: sub.planName,
    price: sub.priceUSD,
    currency: 'USD',
    billingCycle: sub.billingCycle,
    status: sub.status,
    nextAction: 'confirm_checkout',
    agentNote: 'Present the order summary to the user and wait for explicit confirmation before calling /api/create-checkout.',
  })
}

function handleCreateCheckout(req, res) {
  const { subscriptionId, confirmed } = req.body ?? {}

  if (!subscriptionId) {
    return send(res, 400, { error: '`subscriptionId` is required.' })
  }
  if (confirmed !== true) {
    return send(res, 400, {
      error: 'User confirmation is required. Set `confirmed: true` after the user has explicitly approved the order.',
    })
  }

  const sub = subscriptions.find(s => s.id === subscriptionId)
  if (!sub) return send(res, 404, { error: 'Subscription not found.' })

  if (sub.status === 'active') {
    const existing = checkouts.find(c => c.subscriptionId === subscriptionId)
    return send(res, 409, { error: 'Checkout already exists.', checkoutUrl: existing?.url })
  }

  const checkoutId = randomUUID()
  const checkoutUrl = `https://checkout.example.com/pay/${checkoutId}`
  checkouts.push({ id: checkoutId, subscriptionId, url: checkoutUrl, createdAt: new Date().toISOString() })
  sub.status = 'active'

  send(res, 200, { checkoutUrl, subscriptionId, status: 'active', nextAction: 'completed' })
}

function handleReset(req, res) {
  accounts.length = 0
  subscriptions.length = 0
  checkouts.length = 0
  send(res, 200, { message: 'All data cleared.' })
}

// ── Router ────────────────────────────────────────────────────────────────

const ROUTES = {
  '/api/recommend-plan':    { POST: handleRecommendPlan },
  '/api/create-account':    { POST: handleCreateAccount },
  '/api/create-subscription': { POST: handleCreateSubscription },
  '/api/create-checkout':   { POST: handleCreateCheckout },
  '/api/reset':             { DELETE: handleReset },
}

export default function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end()

  const path = (req.url ?? '').split('?')[0]
  const route = ROUTES[path]

  if (!route) return send(res, 404, { error: 'Not found.' })

  const fn = route[req.method]
  if (!fn) {
    res.setHeader('Allow', Object.keys(route).join(', '))
    return res.status(405).end()
  }

  try {
    fn(req, res)
  } catch (err) {
    send(res, 500, { error: err.message })
  }
}
