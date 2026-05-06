import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Medewerkers() {
  const [medewerkers, setMedewerkers] = useState([])
  const [taken, setTaken] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [bericht, setBericht] = useState(null)

  useEffect(() => { laadAlles() }, [])

  async function laadAlles() {
    const [medRes, takenRes] = await Promise.all([
      supabase.from('medewerkers').select('*').order('prioriteit', { nullsLast: true }).order('naam'),
      supabase.from('taken').select('medewerker_id, geplande_minuten, vaste_prijs, status').limit(5000),
    ])
    setMedewerkers(medRes.data || [])
    setTaken(takenRes.data || [])
    setLoading(false)
  }

  async function updatePrioriteit(medewerkerId, nieuwePrioriteit) {
    setSavingId(medewerkerId)
    setMedewerkers(prev => prev.map(m => m.id === medewerkerId ? { ...m, prioriteit: nieuwePrioriteit } : m))
    
    const { error } = await supabase.from('medewerkers').update({ prioriteit: nieuwePrioriteit }).eq('id', medewerkerId)
    
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
      laadAlles()
    } else {
      setBericht({type:'success', tekst:'✓ Prioriteit opgeslagen'})
      setTimeout(() => setBericht(null), 1500)
    }
    setSavingId(null)
  }

  if (loading) return <div className="loading">Laden…</div>

  // Sorteer naar prioriteit voor visualisatie
  const gesorteerd = [...medewerkers].sort((a, b) => (a.prioriteit ?? 99) - (b.prioriteit ?? 99))

  return (
    <div>
      {bericht && (
        <div style={{
          padding:'8px 14px', borderRadius:7, fontSize:12.5, fontWeight:600, marginBottom:10,
          background: bericht.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
          color: bericht.type === 'success' ? 'var(--green)' : 'var(--red)'
        }}>
          {bericht.tekst}
        </div>
      )}

      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div className="ct">🎯 Planningsvolgorde — wie wordt eerst ingepland?</div>
          <div style={{fontSize:11, color:'var(--gray-400)'}}>
            Lager getal = hogere prioriteit. De auto-planning vult eerst medewerkers met prio 1 helemaal vol, daarna pas de volgende.
          </div>
        </div>
        <div className="cb">
          <div style={{fontSize:11.5, color:'var(--brand)', padding:'10px 14px', background:'var(--brand-50)', borderRadius:7, marginBottom:10}}>
            💡 <strong>Voorbeeld:</strong> Emar = prio 1 (vol inplannen), Twan = prio 2, Rik = prio 3 (alleen als nodig).
            Bij schaarste werkt Emar fulltime en blijven Rik &amp; Twan beschikbaar voor kantoorwerk.
          </div>
        </div>
      </div>
      
      <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:14}}>
        {gesorteerd.map((m, idx) => {
          const eigenTaken = taken.filter(t => t.medewerker_id === m.id)
          const uren = eigenTaken.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60
          const omzet = eigenTaken.reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)
          const initials = m.naam.split(' ').map(n => n[0]).slice(0,2).join('')
          const prio = m.prioriteit ?? 5
          const isSaving = savingId === m.id
          
          return (
            <div key={m.id} className="card" style={{
              opacity: isSaving ? 0.7 : 1,
              border: prio === 1 ? '2px solid var(--green)' : '1px solid var(--gray-200)',
              transition:'opacity .2s'
            }}>
              <div className="cb" style={{textAlign:'center'}}>
                <div style={{position:'relative', display:'inline-block', marginBottom:12}}>
                  <div className="av av-blue" style={{
                    width:60, height:60, fontSize:18, background:m.kleur || 'var(--brand)',
                    margin:'0 auto'
                  }}>{initials}</div>
                  <div style={{
                    position:'absolute', top:-6, right:-12, 
                    background: prio === 1 ? 'var(--green)' : prio === 2 ? 'var(--brand)' : 'var(--gray-400)',
                    color:'white', borderRadius:'50%', width:28, height:28,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:13, fontWeight:800,
                    border:'2px solid white',
                    boxShadow:'0 1px 3px rgba(0,0,0,.2)'
                  }}>{prio}</div>
                </div>
                <div style={{fontSize:15, fontWeight:700, marginBottom:3}}>{m.naam}</div>
                <div style={{fontSize:11, color:'var(--gray-400)', marginBottom:14}}>
                  {m.email}
                </div>
                <div style={{display:'inline-block', padding:'3px 10px', borderRadius:20, fontSize:10.5, fontWeight:700, background:m.rol === 'admin' ? 'var(--brand-50)' : 'var(--purple-50)', color:m.rol === 'admin' ? 'var(--brand)' : 'var(--purple)', marginBottom:14}}>
                  {m.rol === 'admin' ? '👑 Beheerder' : '🛠️ Medewerker'}
                </div>
                
                {/* PRIORITEIT EDITOR */}
                <div style={{
                  padding:'10px 12px',
                  background:'var(--gray-50)', borderRadius:7, marginBottom:14,
                  display:'flex', alignItems:'center', justifyContent:'space-between', gap:8
                }}>
                  <span style={{fontSize:11.5, fontWeight:700, color:'var(--gray-600)', textTransform:'uppercase', letterSpacing:.5}}>
                    Prioriteit
                  </span>
                  <select 
                    className="fi" 
                    style={{padding:'4px 8px', fontSize:12, width:'auto'}}
                    value={prio}
                    onChange={e => updatePrioriteit(m.id, parseInt(e.target.value))}
                    disabled={isSaving}
                  >
                    <option value="1">1 - Primair (vol inplannen)</option>
                    <option value="2">2 - Secundair</option>
                    <option value="3">3 - Tertiair</option>
                    <option value="5">5 - Standaard</option>
                    <option value="9">9 - Alleen overschot</option>
                  </select>
                </div>
                
                <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8}}>
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
