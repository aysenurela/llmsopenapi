import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import './App.css'

const STEPS = [
  {
    id: 'step1',
    step: 1,
    endpoint: '/api/recommend-plan',
    title: 'Recommend Plan',
    description: 'Submit a company profile to receive a plan recommendation with localized pricing.',
    fields: [
      { name: 'country',   label: 'Country',    type: 'text',     default: 'CR' },
      { name: 'employees', label: 'Employees',  type: 'number',   default: 15 },
      { name: 'needsSSO',  label: 'Needs SSO',  type: 'checkbox', default: true },
    ],
  },
  {
    id: 'step2',
    step: 2,
    endpoint: '/api/create-account',
    title: 'Create Account',
    description: 'Register a new user account.',
    fields: [
      { name: 'email',   label: 'Email',   type: 'email', default: 'jane@acme.com' },
      { name: 'name',    label: 'Name',    type: 'text',  default: 'Jane Smith' },
      { name: 'company', label: 'Company', type: 'text',  default: 'Acme Corp' },
    ],
  },
  {
    id: 'step3',
    step: 3,
    endpoint: '/api/create-subscription',
    title: 'Create Subscription',
    description: 'Link account to plan. IDs are auto-filled from previous steps.',
    fields: [
      { name: 'accountId', label: 'Account ID', type: 'text', autoFrom: 'step2.accountId' },
      { name: 'planId',    label: 'Plan ID',    type: 'text', autoFrom: 'step1.planId' },
    ],
  },
  {
    id: 'step4',
    step: 4,
    endpoint: '/api/create-checkout',
    title: 'Create Checkout',
    description: 'Generate checkout URL. Requires explicit user confirmation — do not skip.',
    fields: [
      { name: 'subscriptionId', label: 'Subscription ID',     type: 'text',     autoFrom: 'step3.subscriptionId' },
      { name: 'confirmed',      label: 'I confirm this order', type: 'checkbox', default: false },
    ],
  },
]

const FieldShape = PropTypes.shape({
  name:     PropTypes.string.isRequired,
  label:    PropTypes.string.isRequired,
  type:     PropTypes.string.isRequired,
  default:  PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.bool]),
  autoFrom: PropTypes.string,
})

export default function App() {
  const [responses, setResponses] = useState({})

  function handleSuccess(stepId, data) {
    setResponses(r => ({ ...r, [stepId]: data }))
  }

  async function handleReset() {
    await fetch('/api/reset', { method: 'DELETE' })
    setResponses({})
  }

  function getPrefilled(fields) {
    const out = {}
    fields.forEach(f => {
      if (!f.autoFrom) return
      const [stepId, key] = f.autoFrom.split('.')
      const val = responses[stepId]?.[key]
      if (val !== undefined) out[f.name] = val
    })
    return out
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div>
            <h1>Acme SaaS</h1>
            <p>AI Agent Flow Tester</p>
          </div>
          <button className="reset-btn" onClick={handleReset}>↺ Reset Data</button>
        </div>
      </header>
      <main className="main">
        {STEPS.map(s => (
          <ApiPanel
            key={s.id}
            step={s.step}
            endpoint={s.endpoint}
            title={s.title}
            description={s.description}
            fields={s.fields}
            prefilled={getPrefilled(s.fields)}
            onSuccess={data => handleSuccess(s.id, data)}
          />
        ))}
      </main>
    </div>
  )
}

function coerce(type, value) {
  if (type === 'number') return Number(value)
  if (type === 'checkbox') return value
  return value
}

function panelStatus(error, response) {
  if (error) return 'error'
  if (response) return 'success'
  return 'idle'
}

function ApiPanel({ step, endpoint, title, description, fields, prefilled, onSuccess }) {
  const [form, setForm] = useState(
    () => Object.fromEntries(fields.map(f => [f.name, f.default ?? '']))
  )
  const [response, setResponse] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (Object.keys(prefilled).length > 0) {
      setForm(f => ({ ...f, ...prefilled }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(prefilled)])

  function set(name, type, value) {
    setForm(f => ({ ...f, [name]: coerce(type, value) }))
  }

  async function submit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResponse(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setResponse(data)
        onSuccess(data)
      } else {
        setError(data)
      }
    } catch (err) {
      setError({ error: err.message })
    } finally {
      setLoading(false)
    }
  }

  const status = panelStatus(error, response)

  return (
    <div className={`panel panel--${status}`}>
      <div className="panel-head">
        <span className="step-badge">{step}</span>
        <div className="panel-meta">
          <span className="method-badge">POST</span>
          <code>{endpoint}</code>
        </div>
        <span className="panel-title">{title}</span>
      </div>

      <p className="panel-desc">{description}</p>

      <form onSubmit={submit} className="form">
        <div className="fields">
          {fields.map(f => (
            <label key={f.name} className={`field field--${f.type}`}>
              <span className="field-label">{f.label}</span>
              {f.type === 'checkbox' ? (
                <input
                  type="checkbox"
                  checked={!!form[f.name]}
                  onChange={e => set(f.name, 'checkbox', e.target.checked)}
                />
              ) : (
                <input
                  type={f.type}
                  value={form[f.name] ?? ''}
                  onChange={e => set(f.name, f.type, e.target.value)}
                  className={f.autoFrom ? 'auto-filled' : ''}
                  placeholder={f.autoFrom ? 'auto-filled…' : ''}
                />
              )}
            </label>
          ))}
        </div>
        <button type="submit" className="send-btn" disabled={loading}>
          {loading ? 'Sending…' : 'Send →'}
        </button>
      </form>

      {(response || error) && (
        <div className={`response response--${status}`}>
          <pre>{JSON.stringify(response ?? error, null, 2)}</pre>
          {response?.nextAction && (
            <div className="next-action">
              <span className="next-action-label">nextAction</span>
              <span className="next-action-value">{response.nextAction}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

ApiPanel.propTypes = {
  step:        PropTypes.number.isRequired,
  endpoint:    PropTypes.string.isRequired,
  title:       PropTypes.string.isRequired,
  description: PropTypes.string.isRequired,
  fields:      PropTypes.arrayOf(FieldShape).isRequired,
  prefilled:   PropTypes.object.isRequired,
  onSuccess:   PropTypes.func.isRequired,
}
