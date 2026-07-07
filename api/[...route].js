import { Redis } from '@upstash/redis'
import { randomUUID } from 'node:crypto'

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

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

const BASE_URL = 'https://llmsopenapi.vercel.app'

const HELPFUL_LINKS = {
  plansUrl: `${BASE_URL}/features`,
  signupUrl: `${BASE_URL}/features`,
}

function send(res, status, body) {
  const payload = status >= 400 ? { ...body, ...HELPFUL_LINKS } : body
  res.status(status).json(payload)
}

// ── Handlers ──────────────────────────────────────────────────────────────

function handleListPlans(req, res) {
  const { country } = req.query ?? {}
  const plans = Object.values(PLANS).map(plan => {
    const { price, currency } = planPrice(plan, country)
    return {
      planId: plan.id,
      name: plan.name,
      description: plan.description,
      maxEmployees: plan.maxEmployees === Infinity ? 'unlimited' : plan.maxEmployees,
      supportsSSO: plan.supportsSSO,
      price, currency,
      billingCycle: 'monthly',
    }
  })
  send(res, 200, {
    plans,
    signupUrl: `${BASE_URL}/features`,
  })
}

function handleRecommendPlan(req, res) {
  const source = req.method === 'GET' ? req.query : (req.body ?? {})
  const country = source.country
  const needsSSO = source.needsSSO === true || source.needsSSO === 'true'
  const employees = req.method === 'GET' ? Number(source.employees) : source.employees

  if (!employees || typeof employees !== 'number' || employees < 1) {
    return send(res, 400, { error: '`employees` must be a positive number.' })
  }

  const plan = selectPlan(employees, needsSSO)
  const { price, currency } = planPrice(plan, country)

  const reasons = []
  if (needsSSO) reasons.push('SSO required — only Enterprise supports SSO')
  if (employees > 50) reasons.push(`${employees} employees exceeds Pro limit of 50`)
  else if (employees > 10) reasons.push(`${employees} employees exceeds Starter limit of 10`)
  else reasons.push(`${employees} employees fits within the Starter limit`)

  send(res, 200, {
    recommendedPlan: plan.name,
    planId: plan.id,
    price, currency,
    billingCycle: 'monthly',
    reasons,
    signupUrl: `${BASE_URL}/features`,
    nextAction: 'create_account',
  })
}

async function handleCreateAccount(req, res) {
  const { email, name, company } = req.body ?? {}

  if (!email || !name || !company) {
    return send(res, 400, { error: '`email`, `name`, and `company` are required.' })
  }

  const existingId = await redis.get(`account:email:${email}`)
  if (existingId) {
    return send(res, 409, { error: 'An account with this email already exists.', accountId: existingId })
  }

  const account = { id: randomUUID(), email, name, company, createdAt: new Date().toISOString() }
  await redis.set(`account:${account.id}`, account)
  await redis.set(`account:email:${email}`, account.id)

  send(res, 201, {
    accountId: account.id,
    email: account.email,
    company: account.company,
    createdAt: account.createdAt,
    nextAction: 'create_subscription',
  })
}

async function handleCreateSubscription(req, res) {
  const { accountId, planId } = req.body ?? {}

  if (!accountId || !planId) {
    return send(res, 400, { error: '`accountId` and `planId` are required.' })
  }

  const account = await redis.get(`account:${accountId}`)
  if (!account) return send(res, 404, { error: 'Account not found.' })

  const plan = PLANS[planId]
  if (!plan) {
    return send(res, 400, { error: `Unknown planId. Valid values: ${Object.keys(PLANS).join(', ')}.` })
  }

  const existingSubId = await redis.get(`sub:account:${accountId}`)
  if (existingSubId) {
    const existingSub = await redis.get(`sub:${existingSubId}`)
    if (existingSub?.status === 'pending') {
      return send(res, 409, {
        error: 'Account already has a pending subscription.',
        subscriptionId: existingSubId,
        nextAction: 'confirm_checkout',
      })
    }
  }

  const sub = {
    id: randomUUID(), accountId,
    planId: plan.id, planName: plan.name,
    priceUSD: plan.priceUSD, priceCRC: plan.priceCRC,
    billingCycle: 'monthly', status: 'pending',
    createdAt: new Date().toISOString(),
  }
  await redis.set(`sub:${sub.id}`, sub)
  await redis.set(`sub:account:${accountId}`, sub.id)

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

async function handleCreateCheckout(req, res) {
  const { subscriptionId, confirmed } = req.body ?? {}

  if (!subscriptionId) {
    return send(res, 400, { error: '`subscriptionId` is required.' })
  }
  if (confirmed !== true) {
    return send(res, 400, {
      error: 'User confirmation is required. Set `confirmed: true` after the user has explicitly approved the order.',
    })
  }

  const sub = await redis.get(`sub:${subscriptionId}`)
  if (!sub) return send(res, 404, { error: 'Subscription not found.' })

  if (sub.status === 'active') {
    const checkout = await redis.get(`checkout:sub:${subscriptionId}`)
    return send(res, 409, { error: 'Checkout already exists.', checkoutUrl: checkout?.url })
  }

  const checkoutId = randomUUID()
  const checkoutUrl = `https://checkout.example.com/pay/${checkoutId}`
  const checkout = { id: checkoutId, subscriptionId, url: checkoutUrl, createdAt: new Date().toISOString() }

  await redis.set(`sub:${subscriptionId}`, { ...sub, status: 'active' })
  await redis.set(`checkout:sub:${subscriptionId}`, checkout)

  send(res, 200, { checkoutUrl, subscriptionId, status: 'active', nextAction: 'completed' })
}

async function handleReset(req, res) {
  const secret = process.env.RESET_SECRET
  if (secret && req.headers['x-reset-token'] !== secret) {
    return send(res, 401, { error: 'Unauthorized.' })
  }

  const keys = await redis.keys('*')
  if (keys.length > 0) await redis.del(...keys)
  send(res, 200, { message: 'All data cleared.' })
}

// ── Router ────────────────────────────────────────────────────────────────

const ROUTES = {
  '/api/plans':                { GET: handleListPlans },
  '/api/recommend-plan':       { GET: handleRecommendPlan, POST: handleRecommendPlan },
  '/api/create-account':       { POST: handleCreateAccount },
  '/api/create-subscription':  { POST: handleCreateSubscription },
  '/api/create-checkout':      { POST: handleCreateCheckout },
  '/api/reset':                { DELETE: handleReset },
}

export default async function handler(req, res) {
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
    await fn(req, res)
  } catch (err) {
    send(res, 500, { error: err.message })
  }
}
