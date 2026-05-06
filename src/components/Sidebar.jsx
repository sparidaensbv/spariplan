import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Sidebar({ user, profile }) {
  const [klaarVoorFactuur, setKlaarVoorFactuur] = useState(0)
  const [openTaken, setOpenTaken] = useState(0)
  
  const initials = profile?.naam?.split(' ').map(n => n[0]).slice(0, 2).join('') || '??'
  const isAdmin = profile?.rol === 'admin'

  useEffect(() => {
    if (!profile) return
    laadBadges()
    
    // Refresh elke 30 sec
    const interval = setInterval(laadBadges, 30000)
    return () => clearInterval(interval)
  }, [profile])
  
  async function laadBadges() {
    if (!profile?.id) return
    
    if (isAdmin) {
      const { count } = await supabase
        .from('taken')
        .select('id', { count: 'exact', head: true })
        .eq('factuur_status', 'klaar_voor_factuur')
      setKlaarVoorFactuur(count || 0)
    } else {
      // Voor medewerker: tellen open taken
      const { count } = await supabase
        .from('taken')
        .select('id', { count: 'exact', head: true })
        .eq('medewerker_id', profile.id)
        .neq('status', 'klaar')
        .neq('status', 'geannuleerd')
      setOpenTaken(count || 0)
    }
  }
  
  return (
    <div className="sidebar">
      <div className="sb-logo">
        <div className="sb-li">🪟</div>
        <div className="sb-ln">Sparidaens BV</div>
      </div>
      <nav className="sb-nav">
        {isAdmin ? (
          <>
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
            <NavLink to="/facturatie" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
              <span className="si-ic">💰</span>
              <span style={{flex:1}}>Facturatie</span>
              {klaarVoorFactuur > 0 && (
                <span style={{
                  background:'var(--orange)', color:'white',
                  padding:'1px 7px', borderRadius:10,
                  fontSize:10, fontWeight:800,
                  minWidth:20, textAlign:'center'
                }}>{klaarVoorFactuur}</span>
              )}
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
            <NavLink to="/geocoding" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
              <span className="si-ic">📍</span>Geocoding & route
            </NavLink>
            <NavLink to="/instellingen" className={({isActive}) => 'si' + (isActive ? ' active' : '')}>
              <span className="si-ic">⚙️</span>Instellingen
            </NavLink>
          </>
        ) : (
          <>
            <div className="sb-sec">Mijn werk</div>
            <NavLink to="/" className={({isActive}) => 'si' + (isActive ? ' active' : '')} end>
              <span className="si-ic">✅</span>
              <span style={{flex:1}}>Mijn taken</span>
              {openTaken > 0 && (
                <span style={{
                  background:'var(--brand)', color:'white',
                  padding:'1px 7px', borderRadius:10,
                  fontSize:10, fontWeight:800,
                  minWidth:20, textAlign:'center'
                }}>{openTaken}</span>
              )}
            </NavLink>
          </>
        )}
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
