import './App.css'

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <span className="nav-logo">Acme SaaS</span>
        <div style={{display:'flex',gap:'10px'}}>
          <a href="/features" className="nav-link">Plans</a>
          <a href="/signup" className="nav-cta">Sign up</a>
        </div>
      </nav>

      <section className="plans-section">
        <div className="plans-inner">
          <div className="plan-card">
            <div className="plan-top">
              <h2 className="plan-name">Team UI Advantage</h2>
              <p className="plan-tagline">Get actionable insights with robust tools.</p>
              <a href="/signup" className="plan-btn">Sign up</a>
            </div>
            <ul className="plan-features">
              <li>3+ users</li>
              <li>50,000 responses per year</li>
            </ul>
          </div>

          <div className="plan-card">
            <div className="plan-top">
              <h2 className="plan-name">Team UI Premier</h2>
              <p className="plan-tagline">Unlock deeper, richer data analysis.</p>
              <a href="/signup" className="plan-btn">Sign up</a>
            </div>
            <ul className="plan-features">
              <li>5+ users</li>
              <li>100,000 responses per year</li>
            </ul>
          </div>

          <div className="plan-card">
            <div className="plan-top">
              <h2 className="plan-name">Team UI Enterprise</h2>
              <p className="plan-tagline">Powerful admin tools, integrations, and collaboration for your organization.</p>
              <a href="/signup" className="plan-btn plan-btn--outline">Get a demo</a>
            </div>
            <ul className="plan-features">
              <li>10+ users</li>
              <li>200,000 responses per year</li>
              <li>Single sign-on (SSO)</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  )
}
