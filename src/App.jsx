import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AutoPlanning from './pages/AutoPlanning'
import Planning from './pages/Planning'
import Klanten from './pages/Klanten'
import KlantDetail from './pages/KlantDetail'
import Taken from './pages/Taken'
import Medewerkers from './pages/Medewerkers'
import Instellingen from './pages/Instellingen'
import Sidebar from './components/Sidebar'

function ConfigError() {
  return (
    <div className="cfg-err">
      <div className="cfg-box">
        <div className="cfg-title">⚠️ Configuratie ontbreekt</div>
        <div className="cfg-text">
          De app kan geen verbinding maken met Supabase. Stel de environment variabelen in.
        </div>
        <div className="cfg-code">VITE_SUPABASE_URL=https://...supabase.co</div>
        <div className="cfg-code">VITE_SUPABASE_KEY=sb_publishable_...</div>
      </div>
    </div>
  )
}

const titels = {
  '/': 'Dashboard',
  '/auto-planning': 'Auto-planning',
  '/planning': 'Planning weekoverzicht',
  '/klanten': 'Klanten',
  '/taken': 'Taken',
  '/medewerkers': 'Medewerkers',
  '/instellingen': 'Instellingen',
}

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_KEY) {
    return <ConfigError />
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) { setProfile(null); return }
      const { data } = await supabase
        .from('medewerkers')
        .select('*')
        .eq('email', session.user.email)
        .maybeSingle()
      setProfile(data)
    }
    loadProfile()
  }, [session])

  if (loading) return <div className="loading">Laden…</div>
  if (!session) return <Login />

  let titel = titels[location.pathname] || 'Spariplan'
  if (location.pathname.startsWith('/klanten/')) titel = 'Klantdetail'

  return (
    <div className="shell">
      <Sidebar user={session.user} profile={profile} />
      <div className="main">
        <div className="tb">
          <div className="tb-t">{titel}</div>
          <div className="tb-acts">
            <span style={{fontSize:11, color:'var(--gray-400)'}}>{session.user.email}</span>
          </div>
        </div>
        <div className="con">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auto-planning" element={<AutoPlanning />} />
            <Route path="/planning" element={<Planning />} />
            <Route path="/klanten" element={<Klanten />} />
            <Route path="/klanten/:id" element={<KlantDetail />} />
            <Route path="/taken" element={<Taken />} />
            <Route path="/medewerkers" element={<Medewerkers />} />
            <Route path="/instellingen" element={<Instellingen />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
