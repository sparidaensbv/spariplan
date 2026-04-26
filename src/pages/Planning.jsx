import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const DAGEN = [
  { key: 1, label: 'Ma', volledig: 'Maandag' },
  { key: 2, label: 'Di', volledig: 'Dinsdag' },
  { key: 3, label: 'Wo', volledig: 'Woensdag' },
  { key: 4, label: 'Do', volledig: 'Donderdag' },
  { key: 5, label: 'Vr', volledig: 'Vrijdag' },
]

export default function Planning() {
  const [taken, setTaken] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(null)
  const [draggedTaak, setDraggedTaak] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [bevestigen, setBevestigen] = useState(false)
  const [bericht, setBericht] = useState(null)
  const [poolZoek, setPoolZoek] = useState('')

  useEffect(() => { laadAlles() }, [])

  async function laadAlles() {
    const [takenRes, medewerkersRes] = await Promise.all([
      supabase.from('taken').select(`
        id, jaar, weeknummer, geplande_datum, geplande_minuten, vaste_prijs, status, 
        bijzondere_instructie, medewerker_id, route_volgorde,
        klant:klanten(naam, regio, adres),
        dienst:diensten(naam)
      `).order('weeknummer'),
      supabase.from('medewerkers').select('*').eq('actief', true).order('naam')
    ])
    setTaken(takenRes.data || [])
    setMedewerkers(medewerkersRes.data || [])
    if (takenRes.data && takenRes.data.length > 0 && !selectedWeek) {
      const eersteWeek = takenRes.data[0]
      setSelectedWeek(`${eersteWeek.jaar}-${eersteWeek.weeknummer}`)
    }
    setLoading(false)
  }

  const weken = useMemo(() => {
    const set = new Set(taken.map(t => `${t.jaar}-${t.weeknummer}`))
    return Array.from(set).sort()
  }, [taken])

  const takenInWeek = useMemo(() => {
    if (!selectedWeek) return []
    const [jaar, week] = selectedWeek.split('-').map(Number)
    return taken.filter(t => t.jaar === jaar && t.weeknummer === week)
  }, [taken, selectedWeek])

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

  // Wat zit waar?
  const grid = useMemo(() => {
    const result = {}
    medewerkers.forEach(m => {
      result[m.id] = {}
      DAGEN.forEach(d => { result[m.id][d.key] = [] })
    })
    
    const pool = []  // Niet-toegewezen of geen dag = pool

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
        pool.push(t)
      }
    })
    
    return { grid: result, pool }
  }, [takenInWeek, medewerkers])

  const poolGefilterd = useMemo(() => {
    if (!poolZoek) return grid.pool
    const z = poolZoek.toLowerCase()
    return grid.pool.filter(t => 
      (t.klant?.naam || '').toLowerCase().includes(z) ||
      (t.klant?.regio || '').toLowerCase().includes(z) ||
      (t.dienst?.naam || '').toLowerCase().includes(z)
    )
  }, [grid.pool, poolZoek])

  function celBelasting(medId, dagKey) {
    const cellTaken = grid.grid[medId]?.[dagKey] || []
    return cellTaken.reduce((s, t) => s + (t.geplande_minuten || 0), 0)
  }

  function medewerkerTotaal(medId) {
    let totaalMin = 0, aantalTaken = 0, omzet = 0
    DAGEN.forEach(d => {
      const cellTaken = grid.grid[medId]?.[d.key] || []
      cellTaken.forEach(t => {
        totaalMin += t.geplande_minuten || 0
        aantalTaken += 1
        omzet += parseFloat(t.vaste_prijs || 0)
      })
    })
    return { minuten: totaalMin, taken: aantalTaken, omzet }
  }

  // === DRAG & DROP ===
  const onDragStart = useCallback((e, taak) => {
    setDraggedTaak(taak)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taak.id)
    
    // Maak een mooi sleep-image
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

  const onDragOver = useCallback((e, medId, dagKey) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dragKey = `${medId}-${dagKey}`
    if (dragOver !== dragKey) setDragOver(dragKey)
  }, [dragOver])

  const onDrop = useCallback(async (e, medId, dagKey) => {
    e.preventDefault()
    setDragOver(null)
    if (!draggedTaak) return

    const [jaar, week] = selectedWeek.split('-').map(Number)
    const newMedewerkerId = medId === 'pool' ? null : medId
    let newDatum = null
    if (medId !== 'pool' && dagKey !== null) {
      const d = datumVoorDag(jaar, week, dagKey)
      newDatum = d.toISOString().slice(0, 10)
    }

    setSavingId(draggedTaak.id)
    
    // Optimistic update voor snelle visuele feedback
    setTaken(prev => prev.map(t => 
      t.id === draggedTaak.id 
        ? { ...t, medewerker_id: newMedewerkerId, geplande_datum: newDatum }
        : t
    ))

    const { error } = await supabase
      .from('taken')
      .update({ medewerker_id: newMedewerkerId, geplande_datum: newDatum })
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
  }, [draggedTaak, selectedWeek])

  async function bevestigWeek() {
    setBevestigen(true)
    const [jaar, week] = selectedWeek.split('-').map(Number)
    const { error } = await supabase
      .from('taken')
      .update({ status: 'bevestigd' })
      .eq('jaar', jaar).eq('weeknummer', week).eq('status', 'concept')
    
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
    } else {
      setBericht({type:'success', tekst:`✓ Week ${week} bevestigd`})
      laadAlles()
      setTimeout(() => setBericht(null), 2500)
    }
    setBevestigen(false)
  }

  if (loading) return <div className="loading">Planning laden…</div>

  if (weken.length === 0) {
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

  const [jaar, week] = selectedWeek ? selectedWeek.split('-').map(Number) : [null, null]
  const conceptTaken = takenInWeek.filter(t => t.status === 'concept').length
  const totaalUren = takenInWeek.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60

  return (
    <div>
      <div className="sr-row" style={{flexWrap:'wrap'}}>
        {weken.map(w => {
          const [jr, wk] = w.split('-')
          const aantal = taken.filter(t => `${t.jaar}-${t.weeknummer}` === w).length
          return (
            <button key={w}
              className={'btn ' + (selectedWeek===w?'bp':'bg') + ' bsm'}
              onClick={() => setSelectedWeek(w)}>
              Wk {wk} · {jr} ({aantal})
            </button>
          )
        })}
        <div style={{flex:1}}></div>
        <button className="btn bp bsm" onClick={bevestigWeek} disabled={bevestigen || conceptTaken === 0}>
          {bevestigen ? 'Bezig...' : `✓ Week ${week} bevestigen (${conceptTaken})`}
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

      {/* HOOFDLAYOUT: Pool links, Kalender rechts */}
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
                  {grid.pool.length} {grid.pool.length === 1 ? 'klus' : 'klussen'} · {(grid.pool.reduce((s,t)=>s+(t.geplande_minuten||0),0)/60).toFixed(1)}u
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
                {grid.pool.length === 0 
                  ? '✅ Alle taken toegewezen' 
                  : 'Geen taken gevonden'}
              </div>
            ) : (
              poolGefilterd.map(t => (
                <PoolKaart 
                  key={t.id}
                  taak={t}
                  isSaving={savingId === t.id}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  isDragging={draggedTaak?.id === t.id}
                />
              ))
            )}
          </div>
        </div>

        {/* KALENDER */}
        <div className="planning-grid-wrap">
          <div className="pg-stats">
            <span><strong>{takenInWeek.length}</strong> klussen</span>
            <span style={{marginLeft:14}}><strong>{totaalUren.toFixed(1)}u</strong> gepland</span>
            <span style={{marginLeft:14}}>Bezetting: <strong style={{color: totaalUren/120 > 1 ? 'var(--red)' : 'inherit'}}>{(totaalUren/120*100).toFixed(0)}%</strong></span>
            <span style={{marginLeft:14, color:'var(--gray-500)', fontSize:11}}>💡 Sleep een taak vanuit de pool of tussen dagen</span>
          </div>

          <div className="planning-grid">
            <div className="pg-header">
              <div className="pg-cell pg-corner">Medewerker</div>
              {DAGEN.map(d => {
                const datum = datumVoorDag(jaar, week, d.key)
                return (
                  <div key={d.key} className="pg-cell pg-day-header">
                    <div style={{fontWeight:700, fontSize:11}}>{d.label}</div>
                    <div style={{fontSize:10, color:'var(--gray-400)', marginTop:2}}>
                      {datum.getDate()} {['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][datum.getMonth()]}
                    </div>
                  </div>
                )
              })}
            </div>

            {medewerkers.map(m => {
              const totalen = medewerkerTotaal(m.id)
              const initials = m.naam.split(' ').map(n => n[0]).slice(0,2).join('')
              return (
                <div key={m.id} className="pg-row">
                  <div className="pg-cell pg-med-cell">
                    <div style={{display:'flex', alignItems:'center', gap:8}}>
                      <div className="av av-blue" style={{background: m.kleur, width:28, height:28, fontSize:10}}>{initials}</div>
                      <div>
                        <div style={{fontWeight:700, fontSize:12}}>{m.naam.split(' ')[0]}</div>
                        <div style={{fontSize:10, color:'var(--gray-500)'}}>
                          {totalen.taken} klus · {(totalen.minuten/60).toFixed(1)}u
                        </div>
                      </div>
                    </div>
                    <div style={{marginTop:6, height:4, background:'var(--gray-100)', borderRadius:2, overflow:'hidden'}}>
                      <div style={{
                        width: Math.min((totalen.minuten/60)/40*100, 100) + '%',
                        height:'100%',
                        background: m.kleur,
                        transition:'width .3s'
                      }}></div>
                    </div>
                  </div>

                  {DAGEN.map(d => {
                    const cellTaken = grid.grid[m.id]?.[d.key] || []
                    const belastingMin = celBelasting(m.id, d.key)
                    const dragKey = `${m.id}-${d.key}`
                    const isDropTarget = dragOver === dragKey
                    const isOverloaded = belastingMin > 480
                    return (
                      <div 
                        key={d.key} 
                        className={'pg-cell pg-day-cell' + (isDropTarget ? ' drop-target' : '')}
                        onDragOver={(e) => onDragOver(e, m.id, d.key)}
                        onDragLeave={() => setDragOver(null)}
                        onDrop={(e) => onDrop(e, m.id, d.key)}
                      >
                        {cellTaken.length === 0 ? (
                          <div style={{fontSize:10, color:'var(--gray-300)', textAlign:'center', padding:'14px 4px', minHeight:60, display:'flex', alignItems:'center', justifyContent:'center'}}>
                            {isDropTarget ? '↓ neerzetten' : '·'}
                          </div>
                        ) : (
                          <>
                            {cellTaken.map(t => (
                              <TaakKaart 
                                key={t.id}
                                taak={t} 
                                kleur={m.kleur}
                                isSaving={savingId === t.id}
                                isDragging={draggedTaak?.id === t.id}
                                onDragStart={onDragStart}
                                onDragEnd={onDragEnd}
                              />
                            ))}
                            <div style={{
                              marginTop:4, fontSize:9.5, fontWeight:700,
                              color: isOverloaded ? 'var(--red)' : 'var(--gray-500)',
                              textAlign:'right'
                            }}>
                              {(belastingMin/60).toFixed(1)}u {isOverloaded ? '⚠️' : ''}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        .planning-layout {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 14px;
          align-items: flex-start;
        }
        .planning-pool {
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: 9px;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
          max-height: calc(100vh - 220px);
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 70px;
          transition: outline .15s;
        }
        .planning-pool.drop-target {
          outline: 3px dashed var(--brand-light);
          outline-offset: -3px;
          background: var(--brand-50);
        }
        .pool-header {
          padding: 12px 14px;
          border-bottom: 1px solid var(--gray-100);
          background: var(--gray-50);
          border-radius: 9px 9px 0 0;
        }
        .pool-list {
          padding: 8px;
          overflow-y: auto;
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .planning-grid-wrap {
          min-width: 0;
        }
        .pg-stats {
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: 9px;
          padding: 10px 14px;
          margin-bottom: 10px;
          font-size: 12px;
          color: var(--gray-700);
        }
        .planning-grid {
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: 9px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
        }
        .pg-header, .pg-row {
          display: grid;
          grid-template-columns: 150px repeat(5, 1fr);
        }
        .pg-row { border-top: 1px solid var(--gray-100); }
        .pg-cell {
          padding: 8px;
          border-right: 1px solid var(--gray-100);
        }
        .pg-cell:last-child { border-right: none; }
        .pg-corner { background: var(--gray-50); font-weight: 700; font-size: 11px; color: var(--gray-500); text-transform: uppercase; letter-spacing: .5px; display: flex; align-items: center; padding: 12px; }
        .pg-day-header { background: var(--gray-50); text-align: center; padding: 12px 8px; }
        .pg-med-cell { background: var(--gray-50); display: flex; flex-direction: column; justify-content: center; padding: 10px 12px; }
        .pg-day-cell { 
          transition: background .15s, outline .15s;
          min-height: 90px; 
          display: flex; 
          flex-direction: column; 
          gap: 4px;
          position: relative;
        }
        .pg-day-cell.drop-target { 
          background: var(--brand-50); 
          outline: 3px dashed var(--brand-light); 
          outline-offset: -3px;
        }
        .taak-kaart {
          padding: 6px 8px;
          border-radius: 5px;
          font-size: 10.5px;
          line-height: 1.3;
          cursor: grab;
          color: white;
          user-select: none;
          transition: opacity .15s, transform .15s, box-shadow .15s;
          border-left: 3px solid rgba(0,0,0,.2);
        }
        .taak-kaart:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.15); }
        .taak-kaart:active { cursor: grabbing; }
        .taak-kaart.saving { opacity: .4; pointer-events: none; }
        .taak-kaart.dragging { opacity: .3; }
        .tk-naam { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tk-meta { opacity: .85; font-size: 9.5px; margin-top: 1px; }
        .tk-instr { background: rgba(255,255,255,.2); padding: 2px 5px; border-radius: 3px; font-size: 9px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
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
        .pk-meta { color: var(--gray-500); font-size: 10px; margin-top: 2px; }
        .pk-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
        .pk-tag { font-size: 9px; padding: 1px 6px; border-radius: 10px; font-weight: 600; }
        .pk-tag-tijd { background: var(--gray-100); color: var(--gray-600); }
        .pk-tag-prijs { background: var(--green-50); color: var(--green); }
        .pk-tag-instr { background: var(--accent-50); color: #92400e; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        @media (max-width: 1100px) {
          .planning-layout { grid-template-columns: 1fr; }
          .planning-pool { position: static; max-height: 400px; }
        }
      `}</style>
    </div>
  )
}

function TaakKaart({ taak, kleur, isSaving, isDragging, onDragStart, onDragEnd }) {
  const tijd = taak.geplande_minuten >= 60
    ? `${Math.floor(taak.geplande_minuten/60)}u${taak.geplande_minuten%60 ? (taak.geplande_minuten%60)+'m' : ''}`
    : `${taak.geplande_minuten}m`
  return (
    <div 
      className={'taak-kaart' + (isSaving ? ' saving' : '') + (isDragging ? ' dragging' : '')}
      draggable={!isSaving}
      onDragStart={(e) => onDragStart(e, taak)}
      onDragEnd={onDragEnd}
      style={{
        background: kleur,
        opacity: taak.status === 'bevestigd' ? 1 : 0.85,
      }}
      title={`${taak.klant?.naam} — ${taak.dienst?.naam}\n${taak.bijzondere_instructie || ''}`}
    >
      <div className="tk-naam">{taak.klant?.naam || 'Onbekend'}</div>
      <div className="tk-meta">{taak.dienst?.naam} · {tijd} · €{parseFloat(taak.vaste_prijs||0).toFixed(0)}</div>
      {taak.bijzondere_instructie && (
        <div className="tk-instr">⚠️ {taak.bijzondere_instructie}</div>
      )}
    </div>
  )
}

function PoolKaart({ taak, isSaving, isDragging, onDragStart, onDragEnd }) {
  const tijd = taak.geplande_minuten >= 60
    ? `${Math.floor(taak.geplande_minuten/60)}u${taak.geplande_minuten%60 ? (taak.geplande_minuten%60)+'m' : ''}`
    : `${taak.geplande_minuten}m`
  return (
    <div 
      className={'pool-kaart' + (isSaving ? ' saving' : '') + (isDragging ? ' dragging' : '')}
      draggable={!isSaving}
      onDragStart={(e) => onDragStart(e, taak)}
      onDragEnd={onDragEnd}
      title={`${taak.klant?.naam}\n${taak.dienst?.naam}\n${taak.bijzondere_instructie || ''}`}
    >
      <div className="pk-naam">{taak.klant?.naam || 'Onbekend'}</div>
      <div className="pk-meta">
        {taak.dienst?.naam}{taak.klant?.regio ? ` · ${taak.klant.regio}` : ''}
      </div>
      <div className="pk-tags">
        <span className="pk-tag pk-tag-tijd">{tijd}</span>
        <span className="pk-tag pk-tag-prijs">€{parseFloat(taak.vaste_prijs||0).toFixed(0)}</span>
        {taak.bijzondere_instructie && (
          <span className="pk-tag pk-tag-instr">⚠️ {taak.bijzondere_instructie.slice(0, 40)}</span>
        )}
      </div>
    </div>
  )
}
