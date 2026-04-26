import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Sidebar({ user, profile }) {
  const initials = profile?.naam?.split(' ').map(n => n[0]).slice(0, 2).join('') || '??'
  return (
    <div className="sidebar">
      <div className="sb-logo">
        <div className="sb-li">🪟</div>
        <div className="sb-ln">Sparidaens BV</div>
      </div>
      <nav className="sb-nav">
        <div className="sb-sec">Overzicht</div>
        <NavLink to="/" className={({isActive}) => 'si' + (isActive ? ' active' : '')} end>
          <span className="si-ic">📊</span>Dashboard
        </NavLink>
        <NavLink to="/auto-planning" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
          <span className="si-ic">🤖</span>Auto-planning
        </NavLink>
        <NavLink to="/planning" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
          <span className="si-ic">📅</span>Planning
        </NavLink>
        <div className="sb-sec">Klanten & werk</div>
        <NavLink to="/klanten" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
          <span className="si-ic">👥</span>Klanten
        </NavLink>
        <NavLink to="/taken" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
          <span className="si-ic">📋</span>Taken
        </NavLink>
        <div className="sb-sec">Beheer</div>
        <NavLink to="/medewerkers" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
          <span className="si-ic">👤</span>Medewerkers
        </NavLink>
        <NavLink to="/instellingen" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
          <span className="si-ic">⚙️</span>Instellingen
        </NavLink>
      </nav>
      <div className="sb-foot">
        <div className="sb-usr">
          <div className="av av-blue" style={{background: profile?.kleur || 'var(--brand-light)'}}>{initials}</div>
          <div>
            <div className="sb-un">{profile?.naam || user.email}</div>
            <div className="sb-ur">{profile?.rol === 'admin' ? 'Beheerder' : 'Medewerker'}</div>
          </div>
          <button className="sb-out" onClick={() => supabase.auth.signOut()} title="Uitloggen">⏏</button>
        </div>
      </div>
    </div>
  )
}
