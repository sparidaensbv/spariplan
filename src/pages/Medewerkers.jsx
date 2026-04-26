import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Medewerkers() {
  const [medewerkers, setMedewerkers] = useState([])
  const [taken, setTaken] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [medRes, takenRes] = await Promise.all([
        supabase.from('medewerkers').select('*').order('naam'),
        supabase.from('taken').select('medewerker_id, geplande_minuten, vaste_prijs, status'),
      ])
      setMedewerkers(medRes.data || [])
      setTaken(takenRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Laden…</div>

  return (
    <div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14}}>
        {medewerkers.map(m => {
          const eigenTaken = taken.filter(t => t.medewerker_id === m.id)
          const uren = eigenTaken.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60
          const omzet = eigenTaken.reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)
          const initials = m.naam.split(' ').map(n => n[0]).slice(0,2).join('')
          return (
            <div key={m.id} className="card">
              <div className="cb" style={{textAlign:'center'}}>
                <div className="av av-blue" style={{
                  width:60, height:60, fontSize:18, background:m.kleur || 'var(--brand)',
                  margin:'0 auto 12px'
                }}>{initials}</div>
                <div style={{fontSize:15, fontWeight:700, marginBottom:3}}>{m.naam}</div>
                <div style={{fontSize:11, color:'var(--gray-400)', marginBottom:14}}>
                  {m.email}
                </div>
                <div style={{display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:10.5, fontWeight:700, background:m.rol === 'admin' ? 'var(--brand-50)' : 'var(--purple-50)', color:m.rol === 'admin' ? 'var(--brand)' : 'var(--purple)', marginBottom:14}}>
                  {m.rol === 'admin' ? '👑 Beheerder' : '🛠️ Medewerker'}
                </div>
                <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginTop:12}}>
                  <div>
                    <div style={{fontSize:18, fontWeight:800}}>{eigenTaken.length}</div>
                    <div style={{fontSize:10, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.4}}>Taken</div>
                  </div>
                  <div>
                    <div style={{fontSize:18, fontWeight:800}}>{uren.toFixed(0)}u</div>
                    <div style={{fontSize:10, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.4}}>Gepland</div>
                  </div>
                  <div>
                    <div style={{fontSize:18, fontWeight:800}}>€{omzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}</div>
                    <div style={{fontSize:10, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.4}}>Omzet</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{marginTop:14, padding:14, background:'var(--brand-50)', borderRadius:9, fontSize:12, color:'var(--brand)'}}>
        💡 Nieuwe medewerkers kun je toevoegen via Supabase Authentication. Daarna verschijnen ze automatisch hier.
      </div>
    </div>
  )
}
