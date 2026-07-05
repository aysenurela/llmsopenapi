import { randomUUID } from './_lib.js'
import { db } from './_store.js'

export default function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { subscriptionId, confirmed } = req.body ?? {}

  if (!subscriptionId) {
    return res.status(400).json({ error: '`subscriptionId` is required.' })
  }

  if (confirmed !== true) {
    return res.status(400).json({
      error: 'User confirmation is required. Set `confirmed: true` after the user has explicitly approved the order.',
    })
  }

  const subscription = db.subscriptions.find(s => s.id === subscriptionId)
  if (!subscription) return res.status(404).json({ error: 'Subscription not found.' })

  if (subscription.status === 'active') {
    const existing = db.checkouts.find(c => c.subscriptionId === subscriptionId)
    return res.status(409).json({
      error: 'Subscription already has an active checkout.',
      checkoutUrl: existing?.url,
    })
  }

  const checkoutId = randomUUID()
  const checkoutUrl = `https://checkout.example.com/pay/${checkoutId}`

  db.checkouts.push({ id: checkoutId, subscriptionId, url: checkoutUrl, createdAt: new Date().toISOString() })
  subscription.status = 'active'

  res.status(200).json({
    checkoutUrl,
    subscriptionId,
    status: 'active',
    nextAction: 'completed',
  })
}
