import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const DAGEN = [
  { key: 1, label: 'Ma', volledig: 'Maandag' },
  { key: 2, label: 'Di', volledig: 'Dinsdag' },
  { key: 3, label: 'Wo', volledig: 'Woensdag' },
  { key: 4, label: 'Do', volledig: 'Donderdag' },
  { key: 5, label: 'Vr', volledig: 'Vrijdag' },
]

// Tijd: 06:00 - 20:00, per kwartier
const SLOT_MIN = 15
const START_UUR = 6
const EIND_UUR = 20
const SLOT_HOOGTE_PX = 14  // hoogte per kwartier
const TOTAAL_SLOTS = ((EIND_UUR - START_UUR) * 60) / SLOT_MIN

// Bereken Pasen (Meeus algoritme) → vandaaruit Hemelvaart, Pinksteren
function getPasen(jaar) {
  const a = jaar % 19
  const b = Math.floor(jaar / 100)
  const c = jaar % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
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
  // Lustrumjaren: 2025, 2030, etc.
  if (jaar % 5 === 0) {
    lijst.push({ datum: new Date(jaar, 4, 5), naam: 'Bevrijdingsdag' })
  }
  return lijst
}

function isFeestdag(date, feestdagen) {
  const dStr = toDateStr(date)
  return feestdagen.find(f => toDateStr(f.datum) === dStr)
}

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getISOWeek(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return {
    year: d.getUTCFullYear(),
    week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  }
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

function tijdNaarSlot(tijdStr) {
  if (!tijdStr) return null
  const [h, m] = tijdStr.split(':').map(Number)
  const totaalMin = h * 60 + m
  return Math.floor((totaalMin - START_UUR * 60) / SLOT_MIN)
}

function slotNaarTijd(slot) {
  const totaalMin = START_UUR * 60 + slot * SLOT_MIN
  const h = Math.floor(totaalMin / 60)
  const m = totaalMin % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

export default function Planning() {
  const [taken, setTaken] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [huidigJaar, setHuidigJaar] = useState(2026)
  const [huidigWeek, setHuidigWeek] = useState(null)
  const [draggedTaak, setDraggedTaak] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [bevestigen, setBevestigen] = useState(false)
  const [bericht, setBericht] = useState(null)
  const [poolZoek, setPoolZoek] = useState('')
  const [werkelijkeTijden, setWerkelijkeTijden] = useState({})
  const datepickerRef = useRef(null)

  useEffect(() => { laadAlles() }, [])

  async function laadAlles() {
    const [takenRes, medewerkersRes, historieRes] = await Promise.all([
      supabase.from('taken').select(`
        id, klant_dienst_id, klant_id, dienst_id, jaar, weeknummer, geplande_datum, geplande_tijd_start, geplande_minuten, vaste_prijs, status, 
        bijzondere_instructie, medewerker_id, route_volgorde, werkelijke_minuten,
        klant:klanten(naam, regio, adres),
        dienst:diensten(naam)
      `).order('weeknummer'),
      supabase.from('medewerkers').select('*').eq('actief', true).order('naam'),
      supabase.from('taken').select('klant_dienst_id, werkelijke_minuten').not('werkelijke_minuten', 'is', null)
    ])
    setTaken(takenRes.data || [])
    setMedewerkers(medewerkersRes.data || [])
    
    // Bereken gemiddelde werkelijke tijd per klant_dienst_id (laatste 3 keer)
    const groepen = {}
    ;(historieRes.data || []).forEach(h => {
      if (!h.klant_dienst_id || !h.werkelijke_minuten) return
      if (!groepen[h.klant_dienst_id]) groepen[h.klant_dienst_id] = []
      groepen[h.klant_dienst_id].push(h.werkelijke_minuten)
    })
    const gemiddelden = {}
    Object.keys(groepen).forEach(id => {
      const laatste = groepen[id].slice(-3)
      gemiddelden[id] = Math.round(laatste.reduce((s,v) => s+v, 0) / laatste.length)
    })
    setWerkelijkeTijden(gemiddelden)
    
    // Initieel week selecteren
    if (takenRes.data && takenRes.data.length > 0 && !huidigWeek) {
      const eersteWeek = takenRes.data[0]
      setHuidigJaar(eersteWeek.jaar)
      setHuidigWeek(eersteWeek.weeknummer)
    }
    setLoading(false)
  }

  const feestdagen = useMemo(() => getCAOFeestdagen(huidigJaar), [huidigJaar])

  const takenInWeek = useMemo(() => {
    return taken.filter(t => t.jaar === huidigJaar && t.weeknummer === huidigWeek)
  }, [taken, huidigJaar, huidigWeek])

  // Splits in pool en grid
  const { grid, pool } = useMemo(() => {
    const result = {}
    medewerkers.forEach(m => {
      result[m.id] = {}
      DAGEN.forEach(d => { result[m.id][d.key] = [] })
    })
    
    const poolTaken = []

    takenInWeek.forEach(t => {
      let dagNr = null
      if (t.geplande_datum) {
        const d = new Date(t.geplande_datum)
        dagNr = d.getDay() === 0 ? 7 : d.getDay()
        if (dagNr > 5) dagNr = null
      }
      
      const heeftMedewerker = !!t.medewerker_id
      const heeftDag = dagNr !== null
      
      if (heeftMedewerker && heeftDag && result[t.medewerker_id]) {
        result[t.medewerker_id][dagNr].push(t)
      } else {
        poolTaken.push(t)
      }
    })
    
    return { grid: result, pool: poolTaken }
  }, [takenInWeek, medewerkers])

  // Bereken positie van taken in tijd-grid (cumulatief stapelen vanaf 8:00)
  const positiesInDag = useMemo(() => {
    const result = {}  // {medId: {dagKey: [{taak, slotStart, slotLengte}]}}
    
    medewerkers.forEach(m => {
      result[m.id] = {}
      DAGEN.forEach(d => {
        const dayTaken = grid[m.id]?.[d.key] || []
        // Sorteer op route_volgorde of geplande_tijd_start
        const sorted = [...dayTaken].sort((a, b) => {
          if (a.geplande_tijd_start && b.geplande_tijd_start) {
            return a.geplande_tijd_start.localeCompare(b.geplande_tijd_start)
          }
          return (a.route_volgorde || 0) - (b.route_volgorde || 0)
        })
        
        // Plaats elke taak: gebruik geplande_tijd_start of stack vanaf 8:00
        let cursor = tijdNaarSlot('08:00')
        const items = []
        sorted.forEach(t => {
          const minuten = t.geplande_minuten || 60
          const slotLengte = Math.max(1, Math.ceil(minuten / SLOT_MIN))
          let slotStart = cursor
          if (t.geplande_tijd_start) {
            const explicietSlot = tijdNaarSlot(t.geplande_tijd_start)
            if (explicietSlot !== null && explicietSlot >= 0) slotStart = explicietSlot
          }
          if (slotStart + slotLengte > TOTAAL_SLOTS) {
            slotStart = Math.max(0, TOTAAL_SLOTS - slotLengte)
          }
          items.push({ taak: t, slotStart, slotLengte })
          cursor = slotStart + slotLengte
        })
        result[m.id][d.key] = items
      })
    })
    return result
  }, [grid, medewerkers])

  const poolGefilterd = useMemo(() => {
    if (!poolZoek) return pool
    const z = poolZoek.toLowerCase()
    return pool.filter(t => 
      (t.klant?.naam || '').toLowerCase().includes(z) ||
      (t.klant?.regio || '').toLowerCase().includes(z) ||
      (t.klant?.adres || '').toLowerCase().includes(z) ||
      (t.dienst?.naam || '').toLowerCase().includes(z)
    )
  }, [pool, poolZoek])

  function medewerkerTotaal(medId) {
    let totaalMin = 0, aantalTaken = 0
    DAGEN.forEach(d => {
      const cellTaken = grid[medId]?.[d.key] || []
      cellTaken.forEach(t => {
        totaalMin += t.geplande_minuten || 0
        aantalTaken += 1
      })
    })
    return { minuten: totaalMin, taken: aantalTaken }
  }

  // === DRAG & DROP ===
  const onDragStart = useCallback((e, taak) => {
    setDraggedTaak(taak)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taak.id)
    
    const dragImage = document.createElement('div')
    dragImage.style.cssText = `
      position: absolute; top: -1000px; left: -1000px;
      padding: 8px 12px; background: #1e4a8a; color: white;
      border-radius: 6px; font-size: 12px; font-weight: 600;
      box-shadow: 0 4px 12px rgba(0,0,0,.3);
      font-family: 'Sora', sans-serif;
    `
    dragImage.textContent = `${taak.klant?.naam || 'Taak'} (${taak.geplande_minuten}m)`
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 10, 10)
    setTimeout(() => document.body.removeChild(dragImage), 0)
  }, [])

  const onDragEnd = useCallback(() => {
    setDraggedTaak(null)
    setDragOver(null)
  }, [])

  const onDragOver = useCallback((e, medId, dagKey, slot) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dragKey = slot !== undefined ? `${medId}-${dagKey}-${slot}` : `${medId}-${dagKey}`
    if (dragOver !== dragKey) setDragOver(dragKey)
  }, [dragOver])

  const onDrop = useCallback(async (e, medId, dagKey, slot) => {
    e.preventDefault()
    setDragOver(null)
    if (!draggedTaak) return

    const newMedewerkerId = medId === 'pool' ? null : medId
    let newDatum = null
    let newTijdStart = null
    if (medId !== 'pool' && dagKey !== null) {
      const d = datumVoorDag(huidigJaar, huidigWeek, dagKey)
      newDatum = d.toISOString().slice(0, 10)
      if (slot !== undefined && slot !== null) {
        newTijdStart = slotNaarTijd(slot)
      }
    }

    setSavingId(draggedTaak.id)
    
    setTaken(prev => prev.map(t => 
      t.id === draggedTaak.id 
        ? { ...t, medewerker_id: newMedewerkerId, geplande_datum: newDatum, geplande_tijd_start: newTijdStart }
        : t
    ))

    const updates = { 
      medewerker_id: newMedewerkerId, 
      geplande_datum: newDatum,
      geplande_tijd_start: newTijdStart
    }
    const { error } = await supabase
      .from('taken')
      .update(updates)
      .eq('id', draggedTaak.id)
    
    if (error) {
      setBericht({type:'error', tekst:'Kon niet opslaan: ' + error.message})
      laadAlles()
    } else {
      setBericht({type:'success', tekst:'✓ Taak verplaatst en opgeslagen'})
      setTimeout(() => setBericht(null), 2000)
    }
    setSavingId(null)
    setDraggedTaak(null)
  }, [draggedTaak, huidigJaar, huidigWeek])

  async function bevestigWeek() {
    setBevestigen(true)
    const { error } = await supabase
      .from('taken')
      .update({ status: 'bevestigd' })
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

  const conceptTaken = takenInWeek.filter(t => t.status === 'concept').length
  const totaalUren = takenInWeek.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60
  const maandagDatum = huidigWeek ? datumVoorDag(huidigJaar, huidigWeek, 1) : null

  // Slots voor uur-labels (alleen op het hele uur)
  const uurLabels = []
  for (let u = START_UUR; u < EIND_UUR; u++) {
    uurLabels.push({ uur: u, slot: ((u - START_UUR) * 60) / SLOT_MIN })
  }

  return (
    <div>
      {/* WEEK NAVIGATIE */}
      <div className="planning-toolbar">
        <button className="btn bg bsm" onClick={() => gaNaarWeek(-1)} title="Vorige week">◀</button>
        <div className="week-nav-title">
          <div style={{fontSize:14, fontWeight:700}}>
            Week {huidigWeek} · {huidigJaar}
          </div>
          {maandagDatum && (
            <div style={{fontSize:11, color:'var(--gray-500)', marginTop:1}}>
              {maandagDatum.getDate()} {['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][maandagDatum.getMonth()]}
            </div>
          )}
        </div>
        <button className="btn bg bsm" onClick={() => gaNaarWeek(1)} title="Volgende week">▶</button>
        
        <input
          ref={datepickerRef}
          type="date"
          className="fi"
          style={{padding:'6px 10px', fontSize:12, marginLeft:6, width:155}}
          onChange={(e) => e.target.value && gaNaarDatum(e.target.value)}
          title="Spring naar datum"
        />
        <button className="btn bg bsm" onClick={() => { 
          const today = new Date()
          const { year, week } = getISOWeek(today)
          setHuidigJaar(year); setHuidigWeek(week)
        }}>Vandaag</button>
        
        <div style={{flex:1}}></div>
        
        <div style={{fontSize:12, color:'var(--gray-600)'}}>
          <strong>{takenInWeek.length}</strong> klussen · <strong>{totaalUren.toFixed(1)}u</strong> · 
          Bezetting: <strong style={{color: totaalUren/120 > 1 ? 'var(--red)' : 'inherit'}}>{(totaalUren/120*100).toFixed(0)}%</strong>
        </div>

        <button className="btn bp bsm" onClick={bevestigWeek} disabled={bevestigen || conceptTaken === 0}>
          {bevestigen ? 'Bezig...' : `✓ Bevestigen (${conceptTaken})`}
        </button>
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

      {/* HOOFDLAYOUT: Pool links, Kalender rechts (volledig scherm) */}
      <div className="planning-layout">
        
        {/* POOL ZIJBALK */}
        <div 
          className={'planning-pool' + (dragOver === 'pool-pool' ? ' drop-target' : '')}
          onDragOver={(e) => onDragOver(e, 'pool', 'pool')}
          onDragLeave={() => setDragOver(null)}
          onDrop={(e) => onDrop(e, 'pool', null)}
        >
          <div className="pool-header">
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <div style={{fontSize:13, fontWeight:700}}>📦 Niet toegewezen</div>
                <div style={{fontSize:11, color:'var(--gray-400)', marginTop:2}}>
                  {pool.length} {pool.length === 1 ? 'klus' : 'klussen'} · {(pool.reduce((s,t)=>s+(t.geplande_minuten||0),0)/60).toFixed(1)}u
                </div>
              </div>
            </div>
            <input
              className="fi"
              style={{marginTop:8, padding:'6px 10px', fontSize:11.5}}
              placeholder="🔍 Zoek in pool…"
              value={poolZoek}
              onChange={e => setPoolZoek(e.target.value)}
            />
          </div>
          <div className="pool-list">
            {poolGefilterd.length === 0 ? (
              <div style={{padding:'20px 14px', textAlign:'center', color:'var(--gray-400)', fontSize:11}}>
                {pool.length === 0 ? '✅ Alle taken toegewezen' : 'Geen taken gevonden'}
              </div>
            ) : (
              poolGefilterd.map(t => (
                <PoolKaart 
                  key={t.id}
                  taak={t}
                  werkelijkeMin={werkelijkeTijden[t.klant_dienst_id]}
                  isSaving={savingId === t.id}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  isDragging={draggedTaak?.id === t.id}
                />
              ))
            )}
          </div>
        </div>

        {/* KALENDER MET TIJDAS */}
        <div className="kalender-wrap">
          <div className="kalender-grid">
            {/* HEADER ROW */}
            <div className="kg-corner">Tijd</div>
            {DAGEN.map(d => {
              const datum = datumVoorDag(huidigJaar, huidigWeek, d.key)
              const feest = isFeestdag(datum, feestdagen)
              return (
                <div key={d.key} className={'kg-day-header' + (feest ? ' is-feest' : '')}>
                  <div style={{fontWeight:700, fontSize:11}}>{d.label} {datum.getDate()}/{datum.getMonth()+1}</div>
                  {feest && (
                    <div style={{fontSize:9, fontWeight:600, marginTop:2, color:'#dc2626'}}>
                      🎉 {feest.naam}
                    </div>
                  )}
                </div>
              )
            })}

            {/* MEDEWERKER NAMEN ROW */}
            <div className="kg-med-corner">Medewerker</div>
            {DAGEN.map(d => (
              <div key={d.key} className="kg-med-row">
                {medewerkers.map(m => {
                  const totalen = medewerkerTotaal(m.id)
                  const initials = m.naam.split(' ').map(n => n[0]).slice(0,2).join('')
                  // Check belasting voor deze dag specifiek
                  const dagMin = (grid[m.id]?.[d.key] || []).reduce((s,t) => s + (t.geplande_minuten||0), 0)
                  return (
                    <div key={m.id} className="kg-med-block" title={`${m.naam} - dag: ${(dagMin/60).toFixed(1)}u`}>
                      <div className="av av-blue" style={{background: m.kleur, width:18, height:18, fontSize:8}}>{initials}</div>
                      <span style={{fontSize:9.5, fontWeight:600}}>{m.naam.split(' ')[0]}</span>
                      <span style={{fontSize:8.5, color:'var(--gray-500)', marginLeft:'auto'}}>{(dagMin/60).toFixed(1)}u</span>
                    </div>
                  )
                })}
              </div>
            ))}

            {/* TIJD ROWS */}
            <div className="kg-time-col">
              {uurLabels.map(({uur, slot}) => (
                <div key={uur} className="kg-time-label" style={{top: slot * SLOT_HOOGTE_PX}}>
                  {String(uur).padStart(2,'0')}:00
                </div>
              ))}
            </div>

            {DAGEN.map(d => {
              const datum = datumVoorDag(huidigJaar, huidigWeek, d.key)
              const feest = isFeestdag(datum, feestdagen)
              return (
                <div key={d.key} className={'kg-day-col' + (feest ? ' is-feest' : '')}>
                  {/* Uur lijnen achtergrond */}
                  {uurLabels.map(({uur, slot}) => (
                    <div key={uur} className="kg-hour-line" style={{top: slot * SLOT_HOOGTE_PX}}></div>
                  ))}
                  
                  {/* Medewerker lanen */}
                  {medewerkers.map((m, mIdx) => (
                    <MedewerkerLaan
                      key={m.id}
                      medewerker={m}
                      mIdx={mIdx}
                      totaalMedewerkers={medewerkers.length}
                      dagKey={d.key}
                      taken={positiesInDag[m.id]?.[d.key] || []}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onDragOver={onDragOver}
                      onDrop={onDrop}
                      onDragLeave={() => setDragOver(null)}
                      dragOver={dragOver}
                      draggedTaak={draggedTaak}
                      savingId={savingId}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        .planning-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: 9px;
          padding: 10px 14px;
          margin-bottom: 10px;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
        }
        .week-nav-title {
          min-width: 130px;
          text-align: center;
        }
        
        .planning-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 10px;
          align-items: flex-start;
          /* Volledig scherm: maak hoogte zo groot mogelijk */
          height: calc(100vh - 180px);
        }
        .planning-pool {
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: 9px;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
          height: 100%;
          display: flex;
          flex-direction: column;
          transition: outline .15s;
        }
        .planning-pool.drop-target {
          outline: 3px dashed var(--brand-light);
          outline-offset: -3px;
          background: var(--brand-50);
        }
        .pool-header {
          padding: 10px 12px;
          border-bottom: 1px solid var(--gray-100);
          background: var(--gray-50);
          border-radius: 9px 9px 0 0;
          flex-shrink: 0;
        }
        .pool-list {
          padding: 8px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .kalender-wrap {
          height: 100%;
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: 9px;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        
        .kalender-grid {
          display: grid;
          grid-template-columns: 60px repeat(5, 1fr);
          grid-template-rows: auto auto 1fr;
          height: 100%;
          overflow: auto;
        }
        
        /* Header row: dagen */
        .kg-corner {
          grid-column: 1; grid-row: 1;
          background: var(--gray-100);
          padding: 8px;
          font-size: 10px;
          font-weight: 700;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: .5px;
          border-bottom: 1px solid var(--gray-200);
          border-right: 1px solid var(--gray-200);
          position: sticky; top: 0; left: 0; z-index: 30;
          text-align: center;
          display: flex; align-items: center; justify-content: center;
        }
        .kg-day-header {
          grid-row: 1;
          background: var(--gray-50);
          padding: 8px 6px;
          text-align: center;
          border-bottom: 1px solid var(--gray-200);
          border-right: 1px solid var(--gray-100);
          position: sticky; top: 0; z-index: 20;
        }
        .kg-day-header.is-feest {
          background: #fef2f2;
        }

        /* Tweede header rij: medewerkers */
        .kg-med-corner {
          grid-column: 1; grid-row: 2;
          background: var(--gray-100);
          padding: 4px;
          font-size: 9px;
          font-weight: 700;
          color: var(--gray-500);
          text-transform: uppercase;
          letter-spacing: .5px;
          border-bottom: 2px solid var(--gray-300);
          border-right: 1px solid var(--gray-200);
          position: sticky; top: 50px; left: 0; z-index: 30;
          text-align: center;
          display: flex; align-items: center; justify-content: center;
        }
        .kg-med-row {
          grid-row: 2;
          background: var(--gray-50);
          border-bottom: 2px solid var(--gray-300);
          border-right: 1px solid var(--gray-100);
          padding: 4px 6px;
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(60px, 1fr));
          gap: 2px;
          position: sticky; top: 50px; z-index: 20;
        }
        .kg-med-block {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 3px 5px;
          background: white;
          border-radius: 4px;
          font-size: 10px;
        }

        /* Tijdkolom links */
        .kg-time-col {
          grid-column: 1; grid-row: 3;
          background: var(--gray-50);
          border-right: 1px solid var(--gray-200);
          position: sticky; left: 0; z-index: 10;
          height: ${TOTAAL_SLOTS * SLOT_HOOGTE_PX}px;
          position: relative;
        }
        .kg-time-label {
          position: absolute;
          left: 0; right: 0;
          font-size: 10px;
          font-weight: 600;
          color: var(--gray-500);
          padding: 2px 6px;
          background: var(--gray-50);
          border-top: 1px solid var(--gray-200);
        }

        /* Dag kolom in tijd-grid */
        .kg-day-col {
          grid-row: 3;
          position: relative;
          border-right: 1px solid var(--gray-100);
          height: ${TOTAAL_SLOTS * SLOT_HOOGTE_PX}px;
          display: flex;
        }
        .kg-day-col.is-feest {
          background: repeating-linear-gradient(
            45deg,
            #f3f4f6,
            #f3f4f6 8px,
            #e5e7eb 8px,
            #e5e7eb 16px
          );
        }
        .kg-hour-line {
          position: absolute;
          left: 0; right: 0;
          height: 1px;
          background: var(--gray-200);
          pointer-events: none;
        }
        
        /* Medewerker laan binnen een dag */
        .med-laan {
          flex: 1;
          position: relative;
          border-right: 1px dashed var(--gray-100);
          min-width: 0;
        }
        .med-laan:last-child {
          border-right: none;
        }
        .med-laan-dropzone {
          position: absolute;
          inset: 0;
        }
        .med-laan.drop-target {
          background: rgba(37, 99, 235, 0.08);
          outline: 2px dashed var(--brand-light);
          outline-offset: -2px;
        }
        
        /* Tijd-blokje */
        .tijd-blok {
          position: absolute;
          left: 1px; right: 1px;
          padding: 3px 5px;
          border-radius: 4px;
          font-size: 9.5px;
          line-height: 1.2;
          color: white;
          cursor: grab;
          user-select: none;
          overflow: hidden;
          z-index: 2;
          box-shadow: 0 1px 3px rgba(0,0,0,.15);
          transition: transform .1s, opacity .15s;
        }
        .tijd-blok:hover {
          transform: scale(1.02);
          z-index: 5;
          box-shadow: 0 2px 8px rgba(0,0,0,.25);
        }
        .tijd-blok:active { cursor: grabbing; }
        .tijd-blok.saving { opacity: .4; pointer-events: none; }
        .tijd-blok.dragging { opacity: .3; }
        .tb-naam { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }
        .tb-meta { opacity: .9; font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
        .tb-instr { font-size: 8.5px; background: rgba(0,0,0,.15); padding: 1px 3px; border-radius: 2px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        /* Pool kaart */
        .pool-kaart {
          padding: 8px 10px;
          background: white;
          border: 1.5px solid var(--gray-200);
          border-left: 4px solid var(--gray-400);
          border-radius: 6px;
          font-size: 11px;
          line-height: 1.4;
          cursor: grab;
          user-select: none;
          transition: all .15s;
        }
        .pool-kaart:hover {
          border-color: var(--brand-light);
          border-left-color: var(--brand);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(0,0,0,.08);
        }
        .pool-kaart:active { cursor: grabbing; }
        .pool-kaart.saving { opacity: .4; pointer-events: none; }
        .pool-kaart.dragging { opacity: .3; }
        .pk-naam { font-weight: 700; color: var(--gray-900); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pk-dienst { color: var(--brand); font-weight: 600; font-size: 10px; margin-top: 2px; }
        .pk-adres { color: var(--gray-500); font-size: 10px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pk-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
        .pk-tag { font-size: 9px; padding: 1px 6px; border-radius: 10px; font-weight: 600; }
        .pk-tag-tijd { background: var(--gray-100); color: var(--gray-600); }
        .pk-tag-werkelijk { background: var(--purple-50); color: var(--purple); }
        .pk-tag-instr { background: var(--accent-50); color: #92400e; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        @media (max-width: 1100px) {
          .planning-layout { grid-template-columns: 1fr; height: auto; }
          .planning-pool { height: auto; max-height: 400px; }
          .kalender-wrap { height: 600px; }
        }
      `}</style>
    </div>
  )
}

function MedewerkerLaan({ medewerker, mIdx, totaalMedewerkers, dagKey, taken, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave, dragOver, draggedTaak, savingId }) {
  // Genereer slot-cellen voor drop targets (per kwartier)
  const dropZones = []
  for (let s = 0; s < TOTAAL_SLOTS; s++) {
    const dragKey = `${medewerker.id}-${dagKey}-${s}`
    dropZones.push(
      <div
        key={s}
        style={{
          position:'absolute',
          left:0, right:0,
          top: s * SLOT_HOOGTE_PX,
          height: SLOT_HOOGTE_PX,
          background: dragOver === dragKey ? 'rgba(37,99,235,.15)' : 'transparent',
          borderTop: dragOver === dragKey ? '2px solid var(--brand-light)' : 'none',
          zIndex: 1,
        }}
        onDragOver={(e) => onDragOver(e, medewerker.id, dagKey, s)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, medewerker.id, dagKey, s)}
      />
    )
  }
  
  return (
    <div className="med-laan">
      <div className="med-laan-dropzone">
        {dropZones}
        {taken.map(({taak, slotStart, slotLengte}) => (
          <TijdBlok
            key={taak.id}
            taak={taak}
            kleur={medewerker.kleur}
            top={slotStart * SLOT_HOOGTE_PX}
            height={slotLengte * SLOT_HOOGTE_PX - 1}
            isSaving={savingId === taak.id}
            isDragging={draggedTaak?.id === taak.id}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  )
}

function TijdBlok({ taak, kleur, top, height, isSaving, isDragging, onDragStart, onDragEnd }) {
  const tijd = taak.geplande_tijd_start || ''
  const compactTijd = taak.geplande_minuten >= 60
    ? `${Math.floor(taak.geplande_minuten/60)}u${taak.geplande_minuten%60 ? (taak.geplande_minuten%60)+'m' : ''}`
    : `${taak.geplande_minuten}m`
  return (
    <div 
      className={'tijd-blok' + (isSaving ? ' saving' : '') + (isDragging ? ' dragging' : '')}
      draggable={!isSaving}
      onDragStart={(e) => onDragStart(e, taak)}
      onDragEnd={onDragEnd}
      style={{
        top, height: Math.max(height, 18),
        background: kleur,
        opacity: taak.status === 'bevestigd' ? 1 : 0.85,
      }}
      title={`${tijd} · ${taak.klant?.naam} — ${taak.dienst?.naam} (${compactTijd})\n${taak.klant?.adres || ''}\n${taak.bijzondere_instructie || ''}`}
    >
      <div className="tb-naam">{tijd && <span style={{opacity:.85}}>{tijd} </span>}{taak.klant?.naam || 'Onbekend'}</div>
      {height >= 28 && <div className="tb-meta">{taak.dienst?.naam} · {compactTijd}</div>}
      {height >= 56 && taak.bijzondere_instructie && (
        <div className="tb-instr">⚠️ {taak.bijzondere_instructie}</div>
      )}
    </div>
  )
}

function PoolKaart({ taak, werkelijkeMin, isSaving, isDragging, onDragStart, onDragEnd }) {
  const tijd = taak.geplande_minuten >= 60
    ? `${Math.floor(taak.geplande_minuten/60)}u${taak.geplande_minuten%60 ? (taak.geplande_minuten%60)+'m' : ''}`
    : `${taak.geplande_minuten}m`
  const werkelijkTijd = werkelijkeMin
    ? (werkelijkeMin >= 60 ? `${Math.floor(werkelijkeMin/60)}u${werkelijkeMin%60 ? (werkelijkeMin%60)+'m' : ''}` : `${werkelijkeMin}m`)
    : null
  return (
    <div 
      className={'pool-kaart' + (isSaving ? ' saving' : '') + (isDragging ? ' dragging' : '')}
      draggable={!isSaving}
      onDragStart={(e) => onDragStart(e, taak)}
      onDragEnd={onDragEnd}
      title={`${taak.klant?.naam}\n${taak.dienst?.naam}\n${taak.klant?.adres || ''}\n${taak.bijzondere_instructie || ''}`}
    >
      <div className="pk-naam">{taak.klant?.naam || 'Onbekend'}</div>
      <div className="pk-dienst">{taak.dienst?.naam}</div>
      <div className="pk-adres">📍 {taak.klant?.adres || taak.klant?.regio || '—'}</div>
      <div className="pk-tags">
        <span className="pk-tag pk-tag-tijd" title="Geplande tijd">⏱️ {tijd}</span>
        {werkelijkTijd && (
          <span className="pk-tag pk-tag-werkelijk" title="Gemiddelde werkelijke tijd (laatste 3x)">
            📊 {werkelijkTijd}
          </span>
        )}
        {taak.bijzondere_instructie && (
          <span className="pk-tag pk-tag-instr">⚠️ {taak.bijzondere_instructie.slice(0, 35)}</span>
        )}
      </div>
    </div>
  )
}
