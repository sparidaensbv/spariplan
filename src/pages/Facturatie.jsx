import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function Facturatie({ profile }) {
  const [taken, setTaken] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('klaar_voor_factuur')
  const [zoek, setZoek] = useState('')
  const [filterMedewerker, setFilterMedewerker] = useState('alle')
  const [geselecteerd, setGeselecteerd] = useState(new Set())
  const [bezig, setBezig] = useState(false)
  const [bericht, setBericht] = useState(null)
  const [details, setDetails] = useState(null)

  useEffect(() => { laadAlles() }, [])

  async function laadAlles() {
    const [takenRes, medRes] = await Promise.all([
      supabase.from('taken').select(`
        id, jaar, weeknummer, geplande_datum, geplande_minuten, werkelijke_minuten,
        vaste_prijs, status, factuur_status, klaar_op, factuur_verstuurd_op,
        notitie_medewerker, bijzondere_instructie, medewerker_id,
        klant:klanten(naam, klantnummer, adres, factuur_email, factuur_methode),
        dienst:diensten(naam),
        medewerker:medewerkers(naam, kleur, id)
      `)
        .in('factuur_status', ['klaar_voor_factuur', 'verstuurd', 'verwerkt'])
        .limit(2000),
      supabase.from('medewerkers').select('*').order('naam')
    ])
    
    if (takenRes.error) console.error('Facturatie load error:', takenRes.error)
    
    // Sorteer client-side: meest recent eerst, NULLs achteraan
    const sorted = (takenRes.data || []).sort((a, b) => {
      if (!a.klaar_op && !b.klaar_op) return (b.weeknummer || 0) - (a.weeknummer || 0)
      if (!a.klaar_op) return 1
      if (!b.klaar_op) return -1
      return new Date(b.klaar_op) - new Date(a.klaar_op)
    })
    
    setTaken(sorted)
    setMedewerkers(medRes.data || [])
    setLoading(false)
  }

  const gefilterd = useMemo(() => {
    return taken.filter(t => {
      if (t.factuur_status !== filter) return false
      if (filterMedewerker !== 'alle' && t.medewerker?.id !== filterMedewerker) return false
      if (zoek) {
        const z = zoek.toLowerCase()
        return (t.klant?.naam || '').toLowerCase().includes(z) ||
               (t.klant?.klantnummer || '').includes(z) ||
               (t.dienst?.naam || '').toLowerCase().includes(z)
      }
      return true
    })
  }, [taken, filter, filterMedewerker, zoek])

  const stats = useMemo(() => {
    const klaarVoor = taken.filter(t => t.factuur_status === 'klaar_voor_factuur')
    const verstuurd = taken.filter(t => t.factuur_status === 'verstuurd')
    const verwerkt = taken.filter(t => t.factuur_status === 'verwerkt')
    return {
      klaar: klaarVoor.length,
      verstuurd: verstuurd.length,
      verwerkt: verwerkt.length,
      totaal_omzet: klaarVoor.reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)
    }
  }, [taken])

  function toggleSelectie(id) {
    setGeselecteerd(prev => {
      const nieuw = new Set(prev)
      if (nieuw.has(id)) nieuw.delete(id)
      else nieuw.add(id)
      return nieuw
    })
  }

  function selecteerAlle() {
    if (geselecteerd.size === gefilterd.length) {
      setGeselecteerd(new Set())
    } else {
      setGeselecteerd(new Set(gefilterd.map(t => t.id)))
    }
  }

  async function markeerVerstuurd() {
    if (geselecteerd.size === 0) return
    setBezig(true)
    
    const updates = {
      factuur_status: 'verstuurd',
      factuur_verstuurd_op: new Date().toISOString(),
      factuur_verstuurd_door: profile?.id
    }
    
    const { error } = await supabase
      .from('taken')
      .update(updates)
      .in('id', Array.from(geselecteerd))
    
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
    } else {
      setBericht({type:'success', tekst:`✓ ${geselecteerd.size} taken gemarkeerd als verstuurd naar Snelstart`})
      setGeselecteerd(new Set())
      laadAlles()
      setTimeout(() => setBericht(null), 3000)
    }
    setBezig(false)
  }

  async function markeerVerwerkt() {
    if (geselecteerd.size === 0) return
    setBezig(true)
    
    const { error } = await supabase
      .from('taken')
      .update({ factuur_status: 'verwerkt' })
      .in('id', Array.from(geselecteerd))
    
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
    } else {
      setBericht({type:'success', tekst:`✓ ${geselecteerd.size} taken verwerkt`})
      setGeselecteerd(new Set())
      laadAlles()
      setTimeout(() => setBericht(null), 3000)
    }
    setBezig(false)
  }

  async function terugzetten(taak) {
    const { error } = await supabase
      .from('taken')
      .update({ 
        factuur_status: 'klaar_voor_factuur',
        factuur_verstuurd_op: null,
        factuur_verstuurd_door: null
      })
      .eq('id', taak.id)
    if (!error) laadAlles()
  }

  if (loading) return <div className="loading">Laden…</div>

  const totaalGeselecteerdOmzet = Array.from(geselecteerd)
    .map(id => gefilterd.find(t => t.id === id))
    .filter(Boolean)
    .reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)

  return (
    <div>
      {bericht && (
        <div style={{
          padding:'10px 14px', borderRadius:7, fontSize:12.5, fontWeight:600, marginBottom:10,
          background: bericht.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
          color: bericht.type === 'success' ? 'var(--green)' : 'var(--red)'
        }}>
          {bericht.tekst}
        </div>
      )}

      {/* Stats */}
      <div className="sg s4" style={{marginBottom:14}}>
        <div className="stat sa1" style={{cursor:'pointer'}} onClick={() => setFilter('klaar_voor_factuur')}>
          <div className="sl">Klaar voor factuur</div>
          <div className="sv">{stats.klaar}</div>
          <div className="sd">€{stats.totaal_omzet.toLocaleString('nl-NL', {maximumFractionDigits:0})} totaal</div>
        </div>
        <div className="stat sb1" style={{cursor:'pointer'}} onClick={() => setFilter('verstuurd')}>
          <div className="sl">Verstuurd naar Snelstart</div>
          <div className="sv">{stats.verstuurd}</div>
          <div className="sd">Wacht op bevestiging</div>
        </div>
        <div className="stat sg1" style={{cursor:'pointer'}} onClick={() => setFilter('verwerkt')}>
          <div className="sl">Verwerkt</div>
          <div className="sv">{stats.verwerkt}</div>
          <div className="sd">Factuur in Snelstart</div>
        </div>
        <div className="stat sr1">
          <div className="sl">Geselecteerd</div>
          <div className="sv">{geselecteerd.size}</div>
          <div className="sd">€{totaalGeselecteerdOmzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card" style={{marginBottom:10}}>
        <div className="cb" style={{padding:'10px 14px', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
          <input
            className="fi"
            style={{padding:'7px 10px', fontSize:12, flex:'1 1 200px'}}
            placeholder="🔍 Zoek klant, dienst..."
            value={zoek}
            onChange={e => setZoek(e.target.value)}
          />
          <select 
            className="fi" 
            style={{padding:'7px 10px', fontSize:12, width:'auto'}}
            value={filterMedewerker} 
            onChange={e => setFilterMedewerker(e.target.value)}
          >
            <option value="alle">Alle medewerkers</option>
            {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
          </select>
          
          <div style={{flex:1}}></div>
          
          {filter === 'klaar_voor_factuur' && geselecteerd.size > 0 && (
            <button 
              className="btn bp" 
              onClick={markeerVerstuurd}
              disabled={bezig}
            >
              📤 Stuur {geselecteerd.size} naar Snelstart
            </button>
          )}
          
          {filter === 'verstuurd' && geselecteerd.size > 0 && (
            <button 
              className="btn bp" 
              onClick={markeerVerwerkt}
              disabled={bezig}
            >
              ✓ Markeer {geselecteerd.size} als verwerkt
            </button>
          )}
        </div>
      </div>

      {/* Lijst */}
      {gefilterd.length === 0 ? (
        <div className="card">
          <div className="cb" style={{textAlign:'center', padding:'40px 20px', color:'var(--gray-500)'}}>
            <div style={{fontSize:32, marginBottom:10, opacity:.5}}>
              {filter === 'klaar_voor_factuur' ? '⏳' : filter === 'verstuurd' ? '📤' : '✅'}
            </div>
            <div style={{fontWeight:600, fontSize:14}}>
              {filter === 'klaar_voor_factuur' ? 'Geen taken klaar voor facturatie' :
               filter === 'verstuurd' ? 'Geen taken verstuurd' :
               'Geen verwerkte taken'}
            </div>
            <div style={{fontSize:11.5, marginTop:6}}>
              {filter === 'klaar_voor_factuur' ? 'Wanneer Emar werkbonnen afvinkt, verschijnen ze hier' : ''}
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                {(filter === 'klaar_voor_factuur' || filter === 'verstuurd') && (
                  <th style={{width:30}}>
                    <input 
                      type="checkbox"
                      checked={geselecteerd.size === gefilterd.length && gefilterd.length > 0}
                      onChange={selecteerAlle}
                      style={{cursor:'pointer'}}
                    />
                  </th>
                )}
                <th>Klant</th>
                <th>Dienst</th>
                <th>Week</th>
                <th>Medewerker</th>
                <th>Tijd</th>
                <th>Prijs</th>
                <th>Status info</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {gefilterd.map(t => {
                const isGeselecteerd = geselecteerd.has(t.id)
                return (
                  <tr 
                    key={t.id}
                    style={{
                      background: isGeselecteerd ? 'var(--brand-50)' : 'inherit',
                      cursor: 'pointer'
                    }}
                    onClick={() => setDetails(t)}
                  >
                    {(filter === 'klaar_voor_factuur' || filter === 'verstuurd') && (
                      <td onClick={e => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={isGeselecteerd}
                          onChange={() => toggleSelectie(t.id)}
                          style={{cursor:'pointer'}}
                        />
                      </td>
                    )}
                    <td>
                      <div className="tm">{t.klant?.naam}</div>
                      <div style={{fontSize:10.5, color:'var(--gray-500)'}}>
                        #{t.klant?.klantnummer}
                      </div>
                    </td>
                    <td>{t.dienst?.naam}</td>
                    <td className="tm">Wk {t.weeknummer} · {t.jaar}</td>
                    <td>
                      {t.medewerker ? (
                        <span style={{
                          display:'inline-block', padding:'2px 8px', borderRadius:10,
                          background:t.medewerker.kleur, color:'white',
                          fontSize:10.5, fontWeight:700
                        }}>
                          {t.medewerker.naam.split(' ')[0]}
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{fontFamily:'DM Mono, monospace', fontSize:11}}>
                      <div>Gepland: {t.geplande_minuten}m</div>
                      {t.werkelijke_minuten && (
                        <div style={{color: t.werkelijke_minuten > t.geplande_minuten * 1.2 ? 'var(--red)' : 'var(--green)'}}>
                          Werkelijk: {t.werkelijke_minuten}m
                        </div>
                      )}
                    </td>
                    <td style={{fontFamily:'DM Mono, monospace', fontWeight:700}}>
                      €{parseFloat(t.vaste_prijs||0).toFixed(2)}
                    </td>
                    <td style={{fontSize:10.5, color:'var(--gray-500)'}}>
                      {t.klaar_op && (
                        <div>Klaar: {new Date(t.klaar_op).toLocaleDateString('nl-NL')}</div>
                      )}
                      {t.factuur_verstuurd_op && (
                        <div>Verstuurd: {new Date(t.factuur_verstuurd_op).toLocaleDateString('nl-NL')}</div>
                      )}
                      {t.notitie_medewerker && (
                        <div style={{color:'var(--brand)', marginTop:2, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={t.notitie_medewerker}>
                          📝 {t.notitie_medewerker}
                        </div>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {filter !== 'klaar_voor_factuur' && (
                        <button 
                          className="btn bg bsm"
                          onClick={() => terugzetten(t)}
                          title="Terug naar 'klaar voor facturatie'"
                          style={{padding:'4px 8px'}}
                        >
                          ↩
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail modal */}
      {details && (
        <div 
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.4)',
            display:'flex', alignItems:'center', justifyContent:'center',
            zIndex:1000, padding:20
          }}
          onClick={() => setDetails(null)}
        >
          <div 
            style={{
              background:'white', borderRadius:9, maxWidth:600, width:'100%',
              maxHeight:'90vh', overflow:'auto', boxShadow:'0 20px 50px rgba(0,0,0,.3)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{padding:'14px 18px', borderBottom:'1px solid var(--gray-200)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div>
                <div style={{fontSize:15, fontWeight:700}}>Werkbon detail</div>
                <div style={{fontSize:11, color:'var(--gray-500)'}}>{details.klant?.naam}</div>
              </div>
              <button onClick={() => setDetails(null)} style={{background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--gray-500)'}}>×</button>
            </div>
            <div style={{padding:18}}>
              <div style={{display:'grid', gridTemplateColumns:'120px 1fr', gap:8, fontSize:12.5}}>
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Klant:</div>
                <div>{details.klant?.naam} <span style={{color:'var(--gray-400)'}}>(#{details.klant?.klantnummer})</span></div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Adres:</div>
                <div>{details.klant?.adres || '—'}</div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Factuur:</div>
                <div>{details.klant?.factuur_email || '—'} {details.klant?.factuur_methode && <span style={{color:'var(--gray-500)'}}>({details.klant.factuur_methode})</span>}</div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Dienst:</div>
                <div>{details.dienst?.naam}</div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Week:</div>
                <div>Week {details.weeknummer} · {details.jaar}</div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Medewerker:</div>
                <div>{details.medewerker?.naam || '—'}</div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Tijd:</div>
                <div>
                  Gepland {details.geplande_minuten}m
                  {details.werkelijke_minuten && (
                    <span> · Werkelijk <strong>{details.werkelijke_minuten}m</strong></span>
                  )}
                </div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Prijs:</div>
                <div style={{fontFamily:'DM Mono, monospace', fontWeight:700, fontSize:14}}>€{parseFloat(details.vaste_prijs||0).toFixed(2)}</div>
                
                <div style={{fontWeight:700, color:'var(--gray-600)'}}>Klaar op:</div>
                <div>{details.klaar_op ? new Date(details.klaar_op).toLocaleString('nl-NL') : '—'}</div>
              </div>
              
              {details.notitie_medewerker && (
                <div style={{marginTop:14, padding:'10px 12px', background:'var(--brand-50)', borderRadius:7, fontSize:12}}>
                  <div style={{fontSize:10, fontWeight:700, color:'var(--brand)', textTransform:'uppercase', letterSpacing:.4, marginBottom:3}}>📝 Notitie van Emar</div>
                  {details.notitie_medewerker}
                </div>
              )}
              
              {details.bijzondere_instructie && (
                <div style={{marginTop:10, padding:'10px 12px', background:'#fef3c7', borderRadius:7, fontSize:12}}>
                  <div style={{fontSize:10, fontWeight:700, color:'#92400e', textTransform:'uppercase', letterSpacing:.4, marginBottom:3}}>⚠️ Bijzondere instructie</div>
                  {details.bijzondere_instructie}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
