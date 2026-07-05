import { db } from './_store.js'

export default function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).end()

  db.accounts.length = 0
  db.subscriptions.length = 0
  db.checkouts.length = 0

  res.status(200).json({ message: 'All data cleared.' })
}
