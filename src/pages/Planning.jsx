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

  // Bereken datum van een dag in de week
  function datumVoorDag(jaar, week, dagNr) {
    // ISO week → datum
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

  // Groepeer taken per medewerker × dag
  const grid = useMemo(() => {
    if (!selectedWeek) return {}
    const [jaar, week] = selectedWeek.split('-').map(Number)
    const result = {}
    
    // Init lege cellen
    medewerkers.forEach(m => {
      result[m.id] = {}
      DAGEN.forEach(d => {
        result[m.id][d.key] = []
      })
    })
    result['unassigned'] = {}
    DAGEN.forEach(d => {
      result['unassigned'][d.key] = []
    })

    // Vul met taken
    takenInWeek.forEach(t => {
      const medKey = t.medewerker_id || 'unassigned'
      let dagNr = null
      if (t.geplande_datum) {
        const d = new Date(t.geplande_datum)
        dagNr = d.getDay() === 0 ? 7 : d.getDay()
        if (dagNr > 5) dagNr = null  // Geen weekend
      }
      
      if (dagNr === null) {
        // Niet ingedeeld in een dag
        if (!result[medKey]['unassigned']) result[medKey]['unassigned'] = []
        result[medKey]['unassigned'].push(t)
      } else {
        if (!result[medKey][dagNr]) result[medKey][dagNr] = []
        result[medKey][dagNr].push(t)
      }
    })
    
    return result
  }, [takenInWeek, medewerkers, selectedWeek])

  // Bereken belasting per cel
  function celBelasting(medId, dagKey) {
    const cellTaken = grid[medId]?.[dagKey] || []
    return cellTaken.reduce((s, t) => s + (t.geplande_minuten || 0), 0)
  }

  // Bereken totaal per medewerker
  function medewerkerTotaal(medId) {
    let totaalMin = 0, aantalTaken = 0, omzet = 0
    DAGEN.forEach(d => {
      const cellTaken = grid[medId]?.[d.key] || []
      cellTaken.forEach(t => {
        totaalMin += t.geplande_minuten || 0
        aantalTaken += 1
        omzet += parseFloat(t.vaste_prijs || 0)
      })
    })
    // Niet-ingedeelde taken voor deze medewerker
    const unassignedTaken = grid[medId]?.['unassigned'] || []
    unassignedTaken.forEach(t => {
      totaalMin += t.geplande_minuten || 0
      aantalTaken += 1
      omzet += parseFloat(t.vaste_prijs || 0)
    })
    return { minuten: totaalMin, taken: aantalTaken, omzet }
  }

  // === DRAG & DROP ===
  const onDragStart = useCallback((e, taak) => {
    setDraggedTaak(taak)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taak.id)
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
    const newMedewerkerId = medId === 'unassigned' ? null : medId
    let newDatum = null
    if (dagKey !== 'unassigned') {
      const d = datumVoorDag(jaar, week, dagKey)
      newDatum = d.toISOString().slice(0, 10)
    }

    // Check of er echt iets verandert
    const huidigDagKey = (() => {
      if (!draggedTaak.geplande_datum) return 'unassigned'
      const d = new Date(draggedTaak.geplande_datum)
      const dn = d.getDay() === 0 ? 7 : d.getDay()
      return dn > 5 ? 'unassigned' : dn
    })()
    if (draggedTaak.medewerker_id === newMedewerkerId && huidigDagKey === dagKey) {
      setDraggedTaak(null)
      return
    }

    // Optimistic update
    setSavingId(draggedTaak.id)
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
      // Revert
      laadAlles()
    } else {
      setBericht({type:'success', tekst:'✓ Taak verplaatst en opgeslagen'})
      setTimeout(() => setBericht(null), 2500)
    }
    setSavingId(null)
    setDraggedTaak(null)
  }, [draggedTaak, selectedWeek])

  // Bevestig week
  async function bevestigWeek() {
    setBevestigen(true)
    const [jaar, week] = selectedWeek.split('-').map(Number)
    const { error } = await supabase
      .from('taken')
      .update({ status: 'bevestigd' })
      .eq('jaar', jaar)
      .eq('weeknummer', week)
      .eq('status', 'concept')
    
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
  const totaalKlussen = takenInWeek.length
  const totaalUren = takenInWeek.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60
  const totaalOmzet = takenInWeek.reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)
  const conceptTaken = takenInWeek.filter(t => t.status === 'concept').length

  return (
    <div>
      <div className="sr-row" style={{flexWrap:'wrap'}}>
        {weken.map(w => {
          const [jr, wk] = w.split('-')
          const aantal = taken.filter(t => `${t.jaar}-${t.weeknummer}` === w).length
          return (
            <button
              key={w}
              className={'btn ' + (selectedWeek===w?'bp':'bg') + ' bsm'}
              onClick={() => setSelectedWeek(w)}>
              Wk {wk} · {jr} ({aantal})
            </button>
          )
        })}
      </div>

      <div className="sg s4" style={{marginBottom:14}}>
        <div className="stat sb1">
          <div className="sl">Totaal klussen</div>
          <div className="sv">{totaalKlussen}</div>
          <div className="sd">in week {week}</div>
        </div>
        <div className="stat sa1">
          <div className="sl">Geplande uren</div>
          <div className="sv">{totaalUren.toFixed(1)}u</div>
          <div className="sd">{(totaalUren/120*100).toFixed(0)}% van capaciteit</div>
        </div>
        <div className="stat sg1">
          <div className="sl">Prognose omzet</div>
          <div className="sv">€{totaalOmzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}</div>
          <div className="sd">{conceptTaken} concept</div>
        </div>
        <div className="stat sr1">
          <div className="sl">Acties</div>
          <button 
            className="btn bp bsm" 
            style={{marginTop:8, width:'100%', justifyContent:'center'}}
            onClick={bevestigWeek}
            disabled={bevestigen || conceptTaken === 0}
          >
            {bevestigen ? 'Bezig...' : `✓ Week ${week} bevestigen`}
          </button>
        </div>
      </div>

      {bericht && (
        <div style={{
          padding:'10px 14px', borderRadius:7, fontSize:12.5, fontWeight:600, marginBottom:14,
          background: bericht.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
          color: bericht.type === 'success' ? 'var(--green)' : 'var(--red)'
        }}>
          {bericht.tekst}
        </div>
      )}

      <div className="card" style={{marginBottom:14, padding:'10px 14px', fontSize:11.5, color:'var(--gray-600)', display:'flex', alignItems:'center', gap:8}}>
        <span style={{fontSize:14}}>💡</span>
        <span><strong>Tip:</strong> Sleep een taak naar een andere dag of medewerker om de planning aan te passen. Wijzigingen worden direct opgeslagen.</span>
      </div>

      {/* GRID */}
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
                    background: m.kleur
                  }}></div>
                </div>
              </div>

              {DAGEN.map(d => {
                const cellTaken = grid[m.id]?.[d.key] || []
                const belastingMin = celBelasting(m.id, d.key)
                const dragKey = `${m.id}-${d.key}`
                const isDropTarget = dragOver === dragKey
                const isOverloaded = belastingMin > 480 // > 8 uur
                return (
                  <div 
                    key={d.key} 
                    className={'pg-cell pg-day-cell' + (isDropTarget ? ' pg-drop-target' : '')}
                    onDragOver={(e) => onDragOver(e, m.id, d.key)}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => onDrop(e, m.id, d.key)}
                  >
                    {cellTaken.length === 0 ? (
                      <div style={{fontSize:10, color:'var(--gray-300)', textAlign:'center', padding:'14px 4px'}}>
                        {isDropTarget ? '↓ neerzetten' : ''}
                      </div>
                    ) : (
                      <>
                        {cellTaken.map(t => (
                          <TaakKaart 
                            key={t.id}
                            taak={t} 
                            kleur={m.kleur}
                            isSaving={savingId === t.id}
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

        {/* Niet-toegewezen rij */}
        <div className="pg-row pg-row-unassigned">
          <div className="pg-cell pg-med-cell">
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <div className="av av-blue" style={{background:'var(--gray-400)', width:28, height:28, fontSize:10}}>?</div>
              <div>
                <div style={{fontWeight:700, fontSize:12}}>Niet toegewezen</div>
                <div style={{fontSize:10, color:'var(--gray-500)'}}>
                  {(grid['unassigned']?.unassigned || []).length + DAGEN.reduce((s,d) => s + (grid['unassigned']?.[d.key] || []).length, 0)} klussen
                </div>
              </div>
            </div>
          </div>
          {DAGEN.map(d => {
            const cellTaken = grid['unassigned']?.[d.key] || []
            const dragKey = `unassigned-${d.key}`
            const isDropTarget = dragOver === dragKey
            return (
              <div 
                key={d.key} 
                className={'pg-cell pg-day-cell' + (isDropTarget ? ' pg-drop-target' : '')}
                onDragOver={(e) => onDragOver(e, 'unassigned', d.key)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, 'unassigned', d.key)}
              >
                {cellTaken.length === 0 ? (
                  <div style={{fontSize:10, color:'var(--gray-300)', textAlign:'center', padding:'14px 4px'}}>
                    {isDropTarget ? '↓ neerzetten' : ''}
                  </div>
                ) : cellTaken.map(t => (
                  <TaakKaart 
                    key={t.id}
                    taak={t}
                    kleur="var(--gray-400)"
                    isSaving={savingId === t.id}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>

      {/* POOL: Taken zonder dag (per medewerker) en niet-toegewezen */}
      {(() => {
        const allUnassigned = []
        Object.keys(grid).forEach(medId => {
          (grid[medId]?.unassigned || []).forEach(t => allUnassigned.push({ taak: t, medId }))
        })
        if (allUnassigned.length === 0) return null
        return (
          <div className="card" style={{marginTop:14}}>
            <div className="ch">
              <div className="ct">📦 Pool: taken zonder dag-toewijzing ({allUnassigned.length})</div>
              <div style={{fontSize:11, color:'var(--gray-400)'}}>Sleep ze naar een dag in de kalender hierboven</div>
            </div>
            <div className="cb" style={{display:'flex', flexWrap:'wrap', gap:8}}>
              {allUnassigned.map(({taak, medId}) => {
                const med = medewerkers.find(m => m.id === medId)
                return (
                  <TaakKaart 
                    key={taak.id}
                    taak={taak}
                    kleur={med?.kleur || 'var(--gray-400)'}
                    isSaving={savingId === taak.id}
                    onDragStart={onDragStart}
                    onDragEnd={onDragEnd}
                    pool
                  />
                )
              })}
            </div>
          </div>
        )
      })()}

      <style>{`
        .planning-grid {
          background: white;
          border: 1px solid var(--gray-200);
          border-radius: 9px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,.05);
        }
        .pg-header, .pg-row {
          display: grid;
          grid-template-columns: 180px repeat(5, 1fr);
        }
        .pg-row { border-top: 1px solid var(--gray-100); }
        .pg-row-unassigned { background: var(--gray-50); }
        .pg-cell {
          padding: 10px;
          border-right: 1px solid var(--gray-100);
          min-height: 70px;
        }
        .pg-cell:last-child { border-right: none; }
        .pg-corner { background: var(--gray-50); font-weight: 700; font-size: 11px; color: var(--gray-500); text-transform: uppercase; letter-spacing: .5px; display: flex; align-items: center; }
        .pg-day-header { background: var(--gray-50); text-align: center; padding: 12px 10px; min-height: auto; }
        .pg-med-cell { background: var(--gray-50); display: flex; flex-direction: column; justify-content: center; }
        .pg-day-cell { 
          transition: background .15s; 
          min-height: 90px; 
          display: flex; 
          flex-direction: column; 
          gap: 4px;
        }
        .pg-drop-target { background: var(--brand-50); outline: 2px dashed var(--brand-light); outline-offset: -3px; }
        .taak-kaart {
          padding: 6px 8px;
          border-radius: 5px;
          font-size: 10.5px;
          line-height: 1.3;
          cursor: grab;
          color: white;
          user-select: none;
          transition: opacity .15s, transform .15s;
          border-left: 3px solid rgba(0,0,0,.2);
        }
        .taak-kaart:hover { transform: translateY(-1px); box-shadow: 0 2px 6px rgba(0,0,0,.15); }
        .taak-kaart:active { cursor: grabbing; }
        .taak-kaart.saving { opacity: .5; }
        .taak-kaart.pool { display: inline-block; max-width: 220px; }
        .tk-naam { font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .tk-meta { opacity: .85; font-size: 9.5px; margin-top: 1px; }
        .tk-instr { background: rgba(255,255,255,.2); padding: 2px 5px; border-radius: 3px; font-size: 9px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  )
}

function TaakKaart({ taak, kleur, isSaving, onDragStart, onDragEnd, pool }) {
  const tijd = taak.geplande_minuten >= 60
    ? `${Math.floor(taak.geplande_minuten/60)}u${taak.geplande_minuten%60 ? (taak.geplande_minuten%60)+'m' : ''}`
    : `${taak.geplande_minuten}m`
  return (
    <div 
      className={'taak-kaart' + (isSaving ? ' saving' : '') + (pool ? ' pool' : '')}
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
