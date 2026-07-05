import { PLANS, randomUUID } from './_lib.js'
import { db } from './_store.js'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { accountId, planId } = req.body ?? {}

  if (!accountId || !planId) {
    return res.status(400).json({ error: '`accountId` and `planId` are required.' })
  }

  const account = db.accounts.find(a => a.id === accountId)
  if (!account) return res.status(404).json({ error: 'Account not found.' })

  const plan = PLANS[planId]
  if (!plan) {
    return res.status(400).json({
      error: `Unknown planId. Valid values: ${Object.keys(PLANS).join(', ')}.`,
    })
  }

  const existing = db.subscriptions.find(s => s.accountId === accountId && s.status === 'pending')
  if (existing) {
    return res.status(409).json({
      error: 'Account already has a pending subscription.',
      subscriptionId: existing.id,
      nextAction: 'confirm_checkout',
    })
  }

  const subscription = {
    id: randomUUID(),
    accountId,
    planId: plan.id,
    planName: plan.name,
    priceUSD: plan.priceUSD,
    billingCycle: 'monthly',
    status: 'pending',
    createdAt: new Date().toISOString(),
  }
  db.subscriptions.push(subscription)

  res.status(201).json({
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
