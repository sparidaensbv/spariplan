import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials' ? 'Onjuist e-mailadres of wachtwoord' : error.message)
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-side">
        <div>
          <div className="login-logo">
            <div className="login-logo-icon">🪟</div>
            <div style={{fontSize:20,fontWeight:800,letterSpacing:'-.4px'}}>Sparidaens BV</div>
          </div>
          <div className="login-tagline">Jouw planningssysteem op maat</div>
          <div className="login-sub">Gebouwd voor Sparidaens — planning, daglijsten, route en klantportaal in één systeem.</div>
        </div>
        <div className="login-feats">
          <div className="login-feat">Automatisch inplannen op basis van weeknummers</div>
          <div className="login-feat">Daglijst op telefoon voor Rik, Twan en Emar</div>
          <div className="login-feat">Route-optimalisatie met Google Maps</div>
          <div className="login-feat">Klantportaal met live ETA</div>
          <div className="login-feat">Werkbonnen direct naar Snelstart</div>
        </div>
      </div>
      <div className="login-form-wrap">
        <div className="login-box">
          <div className="login-title">Inloggen</div>
          <div className="login-subtitle">Log in met je e-mailadres en wachtwoord</div>
          {error && <div className="login-error">{error}</div>}
          <form onSubmit={handleLogin}>
            <div className="fg">
              <label className="fl">E-mailadres</label>
              <input className="fi" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="jouw@sparidaensbv.nl" />
            </div>
            <div className="fg">
              <label className="fl">Wachtwoord</label>
              <input className="fi" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </div>
            <button className="lbtn" type="submit" disabled={loading}>
              {loading ? 'Bezig met inloggen…' : 'Inloggen →'}
            </button>
          </form>
          <div className="login-info">
            <strong>Eerste keer inloggen?</strong><br/>
            Maak je account aan via Supabase Authentication, of vraag Rik om je een uitnodiging te sturen.
          </div>
        </div>
      </div>
    </div>
  )
}
