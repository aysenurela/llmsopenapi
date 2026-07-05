import { randomUUID } from './_lib.js'
import { db } from './_store.js'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, name, company } = req.body ?? {}

  if (!email || !name || !company) {
    return res.status(400).json({ error: '`email`, `name`, and `company` are required.' })
  }

  const existing = db.accounts.find(a => a.email === email)
  if (existing) {
    return res.status(409).json({
      error: 'An account with this email already exists.',
      accountId: existing.id,
    })
  }

  const account = {
    id: randomUUID(),
    email,
    name,
    company,
    createdAt: new Date().toISOString(),
  }
  db.accounts.push(account)

  res.status(201).json({
    accountId: account.id,
    email: account.email,
    company: account.company,
    createdAt: account.createdAt,
    nextAction: 'create_subscription',
  })
}
