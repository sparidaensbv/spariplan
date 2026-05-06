import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const DAGEN = [
  { key: 1, naam: 'maandag', label: 'Maandag' },
  { key: 2, naam: 'dinsdag', label: 'Dinsdag' },
  { key: 3, naam: 'woensdag', label: 'Woensdag' },
  { key: 4, naam: 'donderdag', label: 'Donderdag' },
  { key: 5, naam: 'vrijdag', label: 'Vrijdag' },
]

function getPasen(jaar) {
  const a = jaar % 19, b = Math.floor(jaar / 100), c = jaar % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const maand = Math.floor((h + l - 7 * m + 114) / 31)
  const dag = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(jaar, maand - 1, dag)
}

function getCAOFeestdagen(jaar) {
  const pasen = getPasen(jaar)
  const tweedePaasdag = new Date(pasen); tweedePaasdag.setDate(pasen.getDate() + 1)
  const hemelvaart = new Date(pasen); hemelvaart.setDate(pasen.getDate() + 39)
  const tweedePinksterdag = new Date(pasen); tweedePinksterdag.setDate(pasen.getDate() + 50)
  const lijst = [
    { datum: new Date(jaar, 0, 1), naam: 'Nieuwjaarsdag' },
    { datum: tweedePaasdag, naam: '2e Paasdag' },
    { datum: new Date(jaar, 3, 27), naam: 'Koningsdag' },
    { datum: hemelvaart, naam: 'Hemelvaartsdag' },
    { datum: tweedePinksterdag, naam: '2e Pinksterdag' },
    { datum: new Date(jaar, 11, 25), naam: '1e Kerstdag' },
    { datum: new Date(jaar, 11, 26), naam: '2e Kerstdag' },
  ]
  if (jaar % 5 === 0) lijst.push({ datum: new Date(jaar, 4, 5), naam: 'Bevrijdingsdag' })
  return lijst
}

function datumVoorDag(jaar, week, dagNr) {
  const jan4 = new Date(jaar, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const week1Monday = new Date(jan4)
  week1Monday.setDate(jan4.getDate() - dayOfWeek + 1)
  const targetMonday = new Date(week1Monday)
  targetMonday.setDate(week1Monday.getDate() + (week - 1) * 7)
  const target = new Date(targetMonday)
  target.setDate(targetMonday.getDate() + (dagNr - 1))
  return target
}

function isFeestdag(date, feestdagen) {
  const dStr = date.toISOString().slice(0, 10)
  return feestdagen.find(f => f.datum.toISOString().slice(0, 10) === dStr)
}

function getISOWeek(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) }
}

export default function Planning() {
  const [taken, setTaken] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [huidigJaar, setHuidigJaar] = useState(2026)
  const [huidigWeek, setHuidigWeek] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [bericht, setBericht] = useState(null)
  const [bevestigen, setBevestigen] = useState(false)
  const [filterMedewerker, setFilterMedewerker] = useState('alle')

  useEffect(() => { laadAlles() }, [])

  async function laadAlles() {
    const [takenRes, medewerkersRes] = await Promise.all([
      supabase.from('taken').select(`
        id, klant_id, dienst_id, jaar, weeknummer, geplande_datum, geplande_tijd_start,
        geplande_minuten, vaste_prijs, status, bijzondere_instructie, medewerker_id, route_volgorde,
        klant:klanten(naam, regio, adres, postcode_cijfers, telefoon),
        dienst:diensten(naam),
        medewerker:medewerkers(naam, kleur)
      `).order('weeknummer').order('geplande_datum').order('route_volgorde'),
      supabase.from('medewerkers').select('*').eq('actief', true).order('naam')
    ])
    setTaken(takenRes.data || [])
    setMedewerkers(medewerkersRes.data || [])
    
    if (takenRes.data && takenRes.data.length > 0 && !huidigWeek) {
      setHuidigJaar(takenRes.data[0].jaar)
      setHuidigWeek(takenRes.data[0].weeknummer)
    }
    setLoading(false)
  }

  const feestdagen = useMemo(() => getCAOFeestdagen(huidigJaar), [huidigJaar])

  const beschikbareWeken = useMemo(() => {
    const set = new Set(taken.map(t => `${t.jaar}-${t.weeknummer}`))
    return Array.from(set).sort()
  }, [taken])

  const takenInWeek = useMemo(() => {
    return taken.filter(t => t.jaar === huidigJaar && t.weeknummer === huidigWeek)
  }, [taken, huidigJaar, huidigWeek])

  // Groepeer per medewerker per dag
  const groepering = useMemo(() => {
    const result = {}
    medewerkers.forEach(m => {
      result[m.id] = {}
      DAGEN.forEach(d => { result[m.id][d.key] = [] })
      result[m.id]['unassigned'] = []
    })
    result['unassigned'] = { unassigned: [] }
    
    takenInWeek.forEach(t => {
      let dagKey = 'unassigned'
      if (t.geplande_datum) {
        const d = new Date(t.geplande_datum)
        const dn = d.getDay() === 0 ? 7 : d.getDay()
        if (dn >= 1 && dn <= 5) dagKey = dn
      }
      const medKey = t.medewerker_id || 'unassigned'
      if (!result[medKey]) result[medKey] = { unassigned: [] }
      if (!result[medKey][dagKey]) result[medKey][dagKey] = []
      result[medKey][dagKey].push(t)
    })
    
    // Sorteer elke groep op route_volgorde / tijd
    Object.keys(result).forEach(medKey => {
      Object.keys(result[medKey]).forEach(dagKey => {
        result[medKey][dagKey].sort((a, b) => {
          if (a.geplande_tijd_start && b.geplande_tijd_start) {
            return a.geplande_tijd_start.localeCompare(b.geplande_tijd_start)
          }
          return (a.route_volgorde || 0) - (b.route_volgorde || 0)
        })
      })
    })
    
    return result
  }, [takenInWeek, medewerkers])

  async function updateTaak(taakId, updates) {
    setSavingId(taakId)
    setTaken(prev => prev.map(t => t.id === taakId ? { ...t, ...updates } : t))
    
    const { error } = await supabase.from('taken').update(updates).eq('id', taakId)
    
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
      laadAlles()
    } else {
      setBericht({type:'success', tekst:'✓ Opgeslagen'})
      setTimeout(() => setBericht(null), 1200)
    }
    setSavingId(null)
  }

  async function bevestigWeek() {
    setBevestigen(true)
    const { error } = await supabase
      .from('taken').update({ status: 'bevestigd' })
      .eq('jaar', huidigJaar).eq('weeknummer', huidigWeek).eq('status', 'concept')
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
    } else {
      setBericht({type:'success', tekst:`✓ Week ${huidigWeek} bevestigd`})
      laadAlles()
      setTimeout(() => setBericht(null), 2500)
    }
    setBevestigen(false)
  }

  function gaNaarWeek(delta) {
    let nw = huidigWeek + delta
    let nj = huidigJaar
    if (nw > 52) { nw = 1; nj += 1 }
    if (nw < 1) { nw = 52; nj -= 1 }
    setHuidigWeek(nw)
    setHuidigJaar(nj)
  }

  function gaNaarDatum(datumStr) {
    const d = new Date(datumStr)
    const { year, week } = getISOWeek(d)
    setHuidigJaar(year)
    setHuidigWeek(week)
  }

  if (loading) return <div className="loading">Planning laden…</div>

  if (beschikbareWeken.length === 0) {
    return (
      <div className="card">
        <div className="cb" style={{textAlign:'center', padding:'40px 20px', color:'var(--gray-500)'}}>
          <div style={{fontSize:32, marginBottom:12, opacity:.5}}>📅</div>
          <div style={{fontWeight:600, fontSize:14}}>Nog geen taken in de planning</div>
          <div style={{fontSize:12, marginTop:6}}>Genereer eerst een planning via Auto-planning</div>
        </div>
      </div>
    )
  }

  const conceptTaken = takenInWeek.filter(t => t.status === 'concept').length
  const klaarTaken = takenInWeek.filter(t => t.status === 'klaar').length
  const totaalUren = takenInWeek.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60
  const maandagDatum = huidigWeek ? datumVoorDag(huidigJaar, huidigWeek, 1) : null

  // Welke medewerkers tonen?
  const zichtbareMedewerkers = filterMedewerker === 'alle' 
    ? medewerkers 
    : medewerkers.filter(m => m.id === filterMedewerker)

  return (
    <div>
      {/* TOOLBAR */}
      <div className="card" style={{marginBottom:14}}>
        <div className="cb" style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', flexWrap:'wrap'}}>
          <button className="btn bg bsm" onClick={() => gaNaarWeek(-1)}>◀</button>
          <div style={{minWidth:140, textAlign:'center'}}>
            <div style={{fontSize:14, fontWeight:700}}>Week {huidigWeek} · {huidigJaar}</div>
            {maandagDatum && (
              <div style={{fontSize:11, color:'var(--gray-500)', marginTop:1}}>
                {maandagDatum.getDate()} {['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][maandagDatum.getMonth()]}
              </div>
            )}
          </div>
          <button className="btn bg bsm" onClick={() => gaNaarWeek(1)}>▶</button>
          
          <input
            type="date"
            className="fi"
            style={{padding:'6px 10px', fontSize:12, width:155}}
            onChange={(e) => e.target.value && gaNaarDatum(e.target.value)}
          />
          <button className="btn bg bsm" onClick={() => { 
            const today = new Date()
            const { year, week } = getISOWeek(today)
            setHuidigJaar(year); setHuidigWeek(week)
          }}>Vandaag</button>
          
          <div style={{width:1, background:'var(--gray-200)', height:28}}></div>
          
          <select 
            className="fi" 
            style={{padding:'6px 10px', fontSize:12, width:'auto'}}
            value={filterMedewerker} 
            onChange={e => setFilterMedewerker(e.target.value)}
          >
            <option value="alle">Alle medewerkers</option>
            {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
          </select>
          
          <div style={{flex:1, fontSize:12, color:'var(--gray-600)', textAlign:'right'}}>
            <strong>{takenInWeek.length}</strong> klussen · <strong>{totaalUren.toFixed(1)}u</strong> · 
            {' '}{klaarTaken} klaar / {conceptTaken} concept
          </div>

          <button className="btn bp bsm" onClick={bevestigWeek} disabled={bevestigen || conceptTaken === 0}>
            {bevestigen ? 'Bezig...' : `✓ Bevestigen (${conceptTaken})`}
          </button>
        </div>
      </div>

      {bericht && (
        <div style={{
          padding:'8px 14px', borderRadius:7, fontSize:12.5, fontWeight:600, marginBottom:10,
          background: bericht.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
          color: bericht.type === 'success' ? 'var(--green)' : 'var(--red)'
        }}>
          {bericht.tekst}
        </div>
      )}

      {/* PER MEDEWERKER */}
      {zichtbareMedewerkers.map(m => {
        const eigenTaken = []
        DAGEN.forEach(d => {
          (groepering[m.id]?.[d.key] || []).forEach(t => eigenTaken.push(t))
        })
        const onassigned = groepering[m.id]?.unassigned || []
        const totaalMedMin = eigenTaken.reduce((s,t) => s + (t.geplande_minuten||0), 0)
        const klaarCount = eigenTaken.filter(t => t.status === 'klaar').length
        
        if (eigenTaken.length === 0 && onassigned.length === 0) return null
        
        const initials = m.naam.split(' ').map(n => n[0]).slice(0,2).join('')
        return (
          <div key={m.id} className="card" style={{marginBottom:14}}>
            <div className="ch">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <div className="av av-blue" style={{background:m.kleur, width:32, height:32, fontSize:11}}>{initials}</div>
                <div>
                  <div className="ct">{m.naam}</div>
                  <div style={{fontSize:11, color:'var(--gray-500)'}}>
                    {eigenTaken.length} klussen · {(totaalMedMin/60).toFixed(1)}u · {klaarCount} klaar
                  </div>
                </div>
              </div>
              <div style={{width:120, height:6, background:'var(--gray-100)', borderRadius:3, overflow:'hidden'}}>
                <div style={{
                  width: eigenTaken.length > 0 ? `${(klaarCount/eigenTaken.length)*100}%` : '0%',
                  height:'100%', background:'var(--green)'
                }}></div>
              </div>
            </div>
            
            {DAGEN.map(d => {
              const dagTaken = groepering[m.id]?.[d.key] || []
              if (dagTaken.length === 0) return null
              const datum = datumVoorDag(huidigJaar, huidigWeek, d.key)
              const feest = isFeestdag(datum, feestdagen)
              const dagMin = dagTaken.reduce((s,t) => s + (t.geplande_minuten||0), 0)
              const dagKlaar = dagTaken.filter(t => t.status === 'klaar').length
              return (
                <div key={d.key} style={{borderTop:'1px solid var(--gray-100)'}}>
                  <div style={{
                    padding:'10px 18px', background: feest ? '#fef2f2' : 'var(--gray-50)',
                    fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:10
                  }}>
                    <span>{d.label} {datum.getDate()}/{datum.getMonth()+1}</span>
                    {feest && <span style={{color:'var(--red)', fontSize:11}}>🎉 {feest.naam}</span>}
                    <span style={{flex:1}}></span>
                    <span style={{fontSize:11, fontWeight:600, color:'var(--gray-500)'}}>
                      {dagKlaar}/{dagTaken.length} klaar · {(dagMin/60).toFixed(1)}u
                    </span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th style={{width:30}}></th>
                        <th style={{width:60}}>Tijd</th>
                        <th style={{width:60}}>PC</th>
                        <th>Klant & adres</th>
                        <th>Dienst</th>
                        <th>Tijd</th>
                        <th>Bijzonderheid</th>
                        <th style={{width:120}}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dagTaken.map(t => (
                        <TaakRij 
                          key={t.id} 
                          taak={t} 
                          medewerker={m}
                          medewerkers={medewerkers}
                          isSaving={savingId === t.id}
                          updateTaak={updateTaak}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        )
      })}

      {/* NIET TOEGEWEZEN */}
      {(groepering['unassigned']?.unassigned || []).length > 0 && (
        <div className="card" style={{marginBottom:14, borderColor:'var(--orange)'}}>
          <div className="ch" style={{background:'var(--orange-50)'}}>
            <div className="ct" style={{color:'var(--orange)'}}>⚠️ Niet toegewezen ({groepering['unassigned'].unassigned.length})</div>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{width:30}}></th>
                <th>Klant & adres</th>
                <th>Dienst</th>
                <th>PC</th>
                <th>Tijd</th>
                <th style={{width:200}}>Toewijzen aan</th>
              </tr>
            </thead>
            <tbody>
              {groepering['unassigned'].unassigned.map(t => (
                <TaakRij 
                  key={t.id} 
                  taak={t} 
                  medewerker={null}
                  medewerkers={medewerkers}
                  isSaving={savingId === t.id}
                  updateTaak={updateTaak}
                  showAssign
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TaakRij({ taak, medewerker, medewerkers, isSaving, updateTaak, showAssign }) {
  const [editTijd, setEditTijd] = useState(false)
  const [tijdInput, setTijdInput] = useState(taak.geplande_tijd_start || '08:00')
  
  function statusKlas(s) {
    return s === 'concept' ? 'plp' : s === 'bevestigd' ? 'plb' : s === 'klaar' ? 'plg' : s === 'bezig' ? 'pla' : 'plgr'
  }
  
  return (
    <tr style={{opacity: isSaving ? .5 : 1, background: taak.status === 'klaar' ? 'var(--green-50)' : 'inherit'}}>
      <td>
        <input 
          type="checkbox" 
          checked={taak.status === 'klaar'}
          onChange={e => updateTaak(taak.id, { status: e.target.checked ? 'klaar' : 'bevestigd' })}
          style={{width:16, height:16, cursor:'pointer'}}
        />
      </td>
      
      {!showAssign && (
        <td 
          style={{fontFamily:'DM Mono, monospace', fontSize:11, cursor:'pointer'}}
          onClick={() => { setEditTijd(true); setTijdInput(taak.geplande_tijd_start?.slice(0,5) || '08:00') }}
          title="Klik om aan te passen"
        >
          {editTijd ? (
            <input 
              type="time" 
              value={tijdInput}
              autoFocus
              onChange={e => setTijdInput(e.target.value)}
              onBlur={() => {
                setEditTijd(false)
                if (tijdInput && tijdInput !== taak.geplande_tijd_start?.slice(0,5)) {
                  updateTaak(taak.id, { geplande_tijd_start: tijdInput + ':00' })
                }
              }}
              onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              style={{padding:'2px 4px', fontSize:11, fontFamily:'DM Mono, monospace', width:75, border:'1px solid var(--brand)', borderRadius:3}}
            />
          ) : (
            taak.geplande_tijd_start?.slice(0,5) || '—'
          )}
        </td>
      )}
      
      {!showAssign && (
        <td style={{fontFamily:'DM Mono, monospace', fontSize:10.5, color:'var(--brand)'}}>
          {taak.klant?.postcode_cijfers || '—'}
        </td>
      )}
      
      <td>
        <div className="tm" style={{textDecoration: taak.status === 'klaar' ? 'line-through' : 'none'}}>
          {taak.klant?.naam || '—'}
        </div>
        <div style={{fontSize:10.5, color:'var(--gray-500)'}}>
          {taak.klant?.adres || taak.klant?.regio || '—'}
        </div>
      </td>
      
      <td style={{fontSize:11.5}}>{taak.dienst?.naam || '—'}</td>
      
      {showAssign && (
        <td style={{fontFamily:'DM Mono, monospace', fontSize:10.5, color:'var(--brand)'}}>
          {taak.klant?.postcode_cijfers || '—'}
        </td>
      )}
      
      <td style={{fontFamily:'DM Mono, monospace', fontSize:11}}>
        {taak.geplande_minuten >= 60
          ? `${Math.floor(taak.geplande_minuten/60)}u${taak.geplande_minuten%60 ? (taak.geplande_minuten%60)+'m' : ''}`
          : `${taak.geplande_minuten}m`}
      </td>
      
      {!showAssign && (
        <td style={{fontSize:10.5, color:'#92400e', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}} title={taak.bijzondere_instructie || ''}>
          {taak.bijzondere_instructie ? `⚠️ ${taak.bijzondere_instructie}` : '—'}
        </td>
      )}
      
      <td>
        {showAssign ? (
          <select 
            className="fi" 
            style={{padding:'4px 8px', fontSize:11, width:'auto'}}
            value={taak.medewerker_id || ''}
            onChange={e => updateTaak(taak.id, { medewerker_id: e.target.value || null })}
          >
            <option value="">Niet toegewezen</option>
            {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
          </select>
        ) : (
          <select 
            className="fi" 
            style={{padding:'4px 8px', fontSize:11, width:'auto'}}
            value={taak.status} 
            onChange={e => updateTaak(taak.id, { status: e.target.value })}
          >
            <option value="concept">Concept</option>
            <option value="bevestigd">Bevestigd</option>
            <option value="bezig">Bezig</option>
            <option value="klaar">Klaar</option>
            <option value="geannuleerd">Geannuleerd</option>
          </select>
        )}
      </td>
    </tr>
  )
}
