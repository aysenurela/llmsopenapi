import { PLANS, selectPlan, planPrice } from './_lib.js'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { country, employees, needsSSO } = req.body ?? {}

  if (typeof employees !== 'number' || employees < 1) {
    return res.status(400).json({ error: '`employees` must be a positive number.' })
  }

  const plan = selectPlan(employees, !!needsSSO)
  const { price, currency } = planPrice(plan, country)

  const reasons = []
  if (needsSSO) reasons.push('SSO required — only Enterprise supports SSO')
  if (employees > 50) reasons.push(`${employees} employees exceeds Pro limit of 50`)
  else if (employees > 10) reasons.push(`${employees} employees exceeds Starter limit of 10`)
  else reasons.push(`${employees} employees fits within the Starter limit`)

  res.status(200).json({
    recommendedPlan: plan.name,
    planId: plan.id,
    price,
    currency,
    billingCycle: 'monthly',
    reasons,
    nextAction: 'create_account',
  })
}
