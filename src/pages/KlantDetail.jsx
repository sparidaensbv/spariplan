import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const DAGDELEN = [
  { value: 'ochtend', label: 'Ochtend (06:00-12:00)' },
  { value: 'middag', label: 'Middag (12:00-18:00)' },
  { value: 'avond', label: 'Avond (18:00-20:00)' },
]

const DAGEN_OPTIES = [
  { value: 'maandag', label: 'Maandag' },
  { value: 'dinsdag', label: 'Dinsdag' },
  { value: 'woensdag', label: 'Woensdag' },
  { value: 'donderdag', label: 'Donderdag' },
  { value: 'vrijdag', label: 'Vrijdag' },
]

export default function KlantDetail() {
  const { id } = useParams()
  const [klant, setKlant] = useState(null)
  const [diensten, setDiensten] = useState([])
  const [taken, setTaken] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [bericht, setBericht] = useState(null)

  useEffect(() => {
    laadAlles()
  }, [id])

  async function laadAlles() {
    const [klantRes, dienstenRes, takenRes, medewerkersRes] = await Promise.all([
      supabase.from('klanten').select('*').eq('id', id).maybeSingle(),
      supabase.from('klant_diensten').select('*, dienst:diensten(naam)').eq('klant_id', id),
      supabase.from('taken').select('*, dienst:diensten(naam), medewerker:medewerkers(naam)').eq('klant_id', id).order('jaar', {ascending:false}).order('weeknummer', {ascending:false}),
      supabase.from('medewerkers').select('*').eq('actief', true).order('naam'),
    ])
    setKlant(klantRes.data)
    setDiensten(dienstenRes.data || [])
    setTaken(takenRes.data || [])
    setMedewerkers(medewerkersRes.data || [])
    setLoading(false)
  }

  async function updateDienst(dienstId, veld, waarde) {
    setSavingId(dienstId)
    setDiensten(prev => prev.map(d => d.id === dienstId ? { ...d, [veld]: waarde } : d))
    
    const { error } = await supabase
      .from('klant_diensten')
      .update({ [veld]: waarde === '' ? null : waarde })
      .eq('id', dienstId)
    
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
      laadAlles()
    } else {
      setBericht({type:'success', tekst:'✓ Voorkeur opgeslagen'})
      setTimeout(() => setBericht(null), 1500)
    }
    setSavingId(null)
  }

  if (loading) return <div className="loading">Klant laden…</div>
  if (!klant) return <div className="loading">Klant niet gevonden</div>

  const totaalOmzet = taken.reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)
  const totaalUren = taken.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60

  return (
    <div>
      <Link to="/klanten" style={{fontSize:12, color:'var(--gray-500)', textDecoration:'none', marginBottom:12, display:'inline-block'}}>
        ← Terug naar klanten
      </Link>

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
          <div>
            <div className="ct">{klant.naam}</div>
            <div style={{fontSize:11, color:'var(--gray-400)', marginTop:2}}>
              {klant.klantnummer} · {klant.type === 'zakelijk' ? 'Zakelijke klant' : 'Particuliere klant'}
            </div>
          </div>
        </div>
        <div className="cb">
          <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14}}>
            <div>
              <div style={{fontSize:10, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4}}>Adres</div>
              <div style={{fontSize:13}}>{klant.adres || '—'}</div>
              {klant.plaats && <div style={{fontSize:12, color:'var(--gray-500)'}}>{klant.postcode} {klant.plaats}</div>}
              {klant.regio && <div style={{fontSize:11, color:'var(--gray-400)', marginTop:3}}>Regio: {klant.regio}</div>}
            </div>
            <div>
              <div style={{fontSize:10, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4}}>Contact</div>
              <div style={{fontSize:13}}>{klant.telefoon || '—'}</div>
              <div style={{fontSize:12, color:'var(--gray-500)'}}>{klant.email || '—'}</div>
            </div>
          </div>
          {klant.notitie && (
            <div style={{marginTop:14, padding:'10px 14px', background:'var(--accent-50)', borderRadius:7, fontSize:12, color:'#92400e'}}>
              <strong>Notitie:</strong> {klant.notitie}
            </div>
          )}
        </div>
      </div>

      <div className="sg s4" style={{marginBottom:14}}>
        <div className="stat sb1">
          <div className="sl">Vaste diensten</div>
          <div className="sv">{diensten.length}</div>
          <div className="sd">terugkerende klussen</div>
        </div>
        <div className="stat sg1">
          <div className="sl">Geplande taken</div>
          <div className="sv">{taken.length}</div>
          <div className="sd">in de planning</div>
        </div>
        <div className="stat sa1">
          <div className="sl">Totaal uren</div>
          <div className="sv">{totaalUren.toFixed(1)}u</div>
          <div className="sd">historisch + gepland</div>
        </div>
        <div className="stat sr1">
          <div className="sl">Totaal omzet</div>
          <div className="sv">€{totaalOmzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}</div>
          <div className="sd">historisch + gepland</div>
        </div>
      </div>

      {/* VASTE DIENSTEN MET VOORKEUREN */}
      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div className="ct">📋 Vaste diensten & planningsvoorkeuren</div>
          <div style={{fontSize:11, color:'var(--gray-400)'}}>Wijzig voorkeuren — direct opgeslagen</div>
        </div>
        {diensten.length === 0 ? (
          <div style={{padding:20, textAlign:'center', color:'var(--gray-400)', fontSize:12}}>
            Geen vaste diensten
          </div>
        ) : (
          <div className="cb" style={{display:'flex', flexDirection:'column', gap:14}}>
            {diensten.map(d => (
              <div key={d.id} style={{
                padding:14,
                border:'1px solid var(--gray-200)',
                borderRadius:8,
                background: savingId === d.id ? 'var(--brand-50)' : 'white',
                transition:'background .2s'
              }}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, paddingBottom:10, borderBottom:'1px solid var(--gray-100)'}}>
                  <div>
                    <div style={{fontSize:14, fontWeight:700}}>{d.dienst?.naam}</div>
                    <div style={{fontSize:11, color:'var(--gray-500)', marginTop:2}}>
                      Weken: {(d.weeknummers || []).join(', ')} · {d.geplande_minuten} min · €{parseFloat(d.vaste_prijs||0).toFixed(2)}
                    </div>
                  </div>
                </div>
                
                <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:12, marginBottom:12}}>
                  <div>
                    <label style={{display:'block', fontSize:10, fontWeight:700, color:'var(--gray-600)', marginBottom:4, textTransform:'uppercase', letterSpacing:.5}}>
                      📅 Voorkeursdag
                    </label>
                    <select 
                      className="fi" 
                      style={{padding:'7px 10px', fontSize:12}}
                      value={d.voorkeur_dag || ''} 
                      onChange={e => updateDienst(d.id, 'voorkeur_dag', e.target.value)}
                    >
                      <option value="">Geen voorkeur</option>
                      {DAGEN_OPTIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label style={{display:'block', fontSize:10, fontWeight:700, color:'var(--gray-600)', marginBottom:4, textTransform:'uppercase', letterSpacing:.5}}>
                      ⏰ Voorkeursdagdeel
                    </label>
                    <select 
                      className="fi" 
                      style={{padding:'7px 10px', fontSize:12}}
                      value={d.voorkeur_dagdeel || ''} 
                      onChange={e => updateDienst(d.id, 'voorkeur_dagdeel', e.target.value)}
                    >
                      <option value="">Geen voorkeur</option>
                      {DAGDELEN.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label style={{display:'block', fontSize:10, fontWeight:700, color:'var(--gray-600)', marginBottom:4, textTransform:'uppercase', letterSpacing:.5}}>
                      👤 Vaste medewerker
                    </label>
                    <select 
                      className="fi" 
                      style={{padding:'7px 10px', fontSize:12}}
                      value={d.voorkeur_medewerker_id || ''} 
                      onChange={e => updateDienst(d.id, 'voorkeur_medewerker_id', e.target.value)}
                    >
                      <option value="">Geen voorkeur</option>
                      {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
                    </select>
                  </div>
                  
                  <div>
                    <label style={{display:'block', fontSize:10, fontWeight:700, color:'var(--gray-600)', marginBottom:4, textTransform:'uppercase', letterSpacing:.5}}>
                      🔒 Hardheid
                    </label>
                    <select 
                      className="fi" 
                      style={{padding:'7px 10px', fontSize:12}}
                      value={d.voorkeur_hardheid || 'liefst'} 
                      onChange={e => updateDienst(d.id, 'voorkeur_hardheid', e.target.value)}
                    >
                      <option value="liefst">Liefst (advies)</option>
                      <option value="verplicht">Verplicht (mag niet anders)</option>
                    </select>
                  </div>
                </div>
                
                {d.bijzondere_instructie && (
                  <div style={{padding:'8px 12px', background:'var(--accent-50)', borderRadius:6, fontSize:11.5, color:'#92400e'}}>
                    ⚠️ <strong>Instructie:</strong> {d.bijzondere_instructie}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GEPLANDE TAKEN */}
      <div className="card">
        <div className="ch"><div className="ct">📅 Geplande taken</div></div>
        {taken.length === 0 ? (
          <div style={{padding:20, textAlign:'center', color:'var(--gray-400)', fontSize:12}}>Geen geplande taken</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Week</th><th>Dienst</th><th>Medewerker</th><th>Tijd</th><th>Prijs</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {taken.map(t => (
                <tr key={t.id}>
                  <td className="tm">Wk {t.weeknummer} · {t.jaar}</td>
                  <td>{t.dienst?.naam || '—'}</td>
                  <td>{t.medewerker?.naam || <span style={{color:'var(--gray-400)'}}>Nog niet toegewezen</span>}</td>
                  <td style={{fontFamily:'DM Mono, monospace'}}>{t.geplande_minuten}m</td>
                  <td style={{fontFamily:'DM Mono, monospace', fontWeight:600}}>€{parseFloat(t.vaste_prijs||0).toFixed(2)}</td>
                  <td>
                    <span className={'pl ' + (t.status==='concept'?'plp':t.status==='bevestigd'?'plb':t.status==='klaar'?'plg':'plgr')}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
