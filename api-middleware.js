import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

// ── Plans ────────────────────────────────────────────────────────────────────

const PLANS = {
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

function selectPlan(employees, needsSSO) {
  if (needsSSO || employees > 50) return PLANS.enterprise
  if (employees > 10) return PLANS.pro
  return PLANS.starter
}

function planPrice(plan, country) {
  const useCRC = country && ['CR', 'CRI', 'COSTA RICA'].includes(country.toUpperCase())
  return useCRC
    ? { price: plan.priceCRC, currency: 'CRC' }
    : { price: plan.priceUSD, currency: 'USD' }
}

// ── DB helpers ───────────────────────────────────────────────────────────────

function readDb(name) {
  const path = resolve(`./data/${name}.json`)
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : []
}

function writeDb(name, records) {
  writeFileSync(resolve(`./data/${name}.json`), JSON.stringify(records, null, 2), 'utf-8')
}

function findById(name, id) {
  return readDb(name).find(r => r.id === id) ?? null
}

function insert(name, record) {
  const db = readDb(name)
  db.push(record)
  writeDb(name, db)
  return record
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body, null, 2))
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', c => (raw += c))
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}) }
      catch { reject(new Error('Request body must be valid JSON.')) }
    })
    req.on('error', reject)
  })
}

// ── Route handlers ───────────────────────────────────────────────────────────

async function handleRecommendPlan(req, res) {
  const { country, employees, needsSSO } = await parseBody(req)

  if (typeof employees !== 'number' || employees < 1) {
    return json(res, 400, { error: '`employees` must be a positive number.' })
  }

  const plan = selectPlan(employees, !!needsSSO)
  const { price, currency } = planPrice(plan, country)

  const reasons = []
  if (needsSSO) reasons.push('SSO required — only Enterprise supports SSO')
  if (employees > 50) reasons.push(`${employees} employees exceeds Pro limit of 50`)
  else if (employees > 10) reasons.push(`${employees} employees exceeds Starter limit of 10`)
  if (reasons.length === 0) reasons.push(`${employees} employees fits within Starter limit`)

  return json(res, 200, {
    recommendedPlan: plan.name,
    planId: plan.id,
    price,
    currency,
    billingCycle: 'monthly',
    reasons,
    nextAction: 'create_account',
  })
}

async function handleCreateAccount(req, res) {
  const { email, name, company } = await parseBody(req)

  if (!email || !name || !company) {
    return json(res, 400, { error: '`email`, `name`, and `company` are required.' })
  }

  const existing = readDb('accounts').find(a => a.email === email)
  if (existing) {
    return json(res, 409, { error: 'An account with this email already exists.', accountId: existing.id })
  }

  const account = insert('accounts', {
    id: randomUUID(),
    email,
    name,
    company,
    createdAt: new Date().toISOString(),
  })

  return json(res, 201, {
    accountId: account.id,
    email: account.email,
    company: account.company,
    createdAt: account.createdAt,
    nextAction: 'create_subscription',
  })
}

async function handleCreateSubscription(req, res) {
  const { accountId, planId } = await parseBody(req)

  if (!accountId || !planId) {
    return json(res, 400, { error: '`accountId` and `planId` are required.' })
  }

  const account = findById('accounts', accountId)
  if (!account) return json(res, 404, { error: 'Account not found.' })

  const plan = PLANS[planId]
  if (!plan) {
    return json(res, 400, { error: `Unknown planId. Valid values: ${Object.keys(PLANS).join(', ')}.` })
  }

  const existing = readDb('subscriptions').find(s => s.accountId === accountId && s.status === 'pending')
  if (existing) {
    return json(res, 409, {
      error: 'Account already has a pending subscription.',
      subscriptionId: existing.id,
      nextAction: 'confirm_checkout',
    })
  }

  const subscription = insert('subscriptions', {
    id: randomUUID(),
    accountId,
    planId: plan.id,
    planName: plan.name,
    priceUSD: plan.priceUSD,
    priceCRC: plan.priceCRC,
    billingCycle: 'monthly',
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  return json(res, 201, {
    subscriptionId: subscription.id,
    accountId: subscription.accountId,
    plan: subscription.planName,
    price: subscription.priceUSD,
    currency: 'USD',
    billingCycle: subscription.billingCycle,
    status: subscription.status,
    nextAction: 'confirm_checkout',
    agentNote: 'Present the order summary to the user and wait for explicit confirmation before calling /api/create-checkout.',
  })
}

async function handleCreateCheckout(req, res) {
  const { subscriptionId, confirmed } = await parseBody(req)

  if (!subscriptionId) {
    return json(res, 400, { error: '`subscriptionId` is required.' })
  }

  if (confirmed !== true) {
    return json(res, 400, {
      error: 'User confirmation is required before checkout. Set `confirmed: true` after the user has explicitly approved the order.',
    })
  }

  const subscription = findById('subscriptions', subscriptionId)
  if (!subscription) return json(res, 404, { error: 'Subscription not found.' })

  if (subscription.status === 'active') {
    const existing = readDb('checkouts').find(c => c.subscriptionId === subscriptionId)
    return json(res, 409, { error: 'Subscription already has an active checkout.', checkoutUrl: existing?.url })
  }

  const checkoutId = randomUUID()
  const checkoutUrl = `https://checkout.example.com/pay/${checkoutId}`

  insert('checkouts', {
    id: checkoutId,
    subscriptionId,
    url: checkoutUrl,
    createdAt: new Date().toISOString(),
  })

  // Activate subscription
  const subscriptions = readDb('subscriptions').map(s =>
    s.id === subscriptionId ? { ...s, status: 'active' } : s
  )
  writeDb('subscriptions', subscriptions)

  return json(res, 200, {
    checkoutUrl,
    subscriptionId,
    status: 'active',
    nextAction: 'completed',
  })
}

// ── Plugin ───────────────────────────────────────────────────────────────────

async function handleReset(req, res) {
  writeDb('accounts', [])
  writeDb('subscriptions', [])
  writeDb('checkouts', [])
  return json(res, 200, { message: 'All data cleared.' })
}

const ROUTES = {
  '/api/recommend-plan':   { POST: handleRecommendPlan },
  '/api/create-account':   { POST: handleCreateAccount },
  '/api/create-subscription': { POST: handleCreateSubscription },
  '/api/create-checkout':  { POST: handleCreateCheckout },
  '/api/reset':            { DELETE: handleReset },
}

export function fakeApiPlugin() {
  return {
    name: 'fake-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = ROUTES[req.url]
        if (!route) return next()

        const handler = route[req.method]
        if (!handler) {
          res.statusCode = 405
          res.setHeader('Allow', Object.keys(route).join(', '))
          return res.end()
        }

        try {
          await handler(req, res)
        } catch (err) {
          json(res, 400, { error: err.message })
        }
      })
    },
  }
}
