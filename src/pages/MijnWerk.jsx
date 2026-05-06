import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const DAGEN_LABELS = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']

function vandaagISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getISOWeek(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) }
}

export default function MijnWerk({ user, profile }) {
  const [taken, setTaken] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [filter, setFilter] = useState('vandaag')
  const [actieveTaak, setActieveTaak] = useState(null)
  const [bericht, setBericht] = useState(null)

  useEffect(() => {
    if (profile?.id) laadTaken()
  }, [profile])

  async function laadTaken() {
    if (!profile?.id) return
    const { data } = await supabase
      .from('taken')
      .select(`
        id, jaar, weeknummer, geplande_datum, geplande_tijd_start, geplande_minuten,
        vaste_prijs, status, bijzondere_instructie, notitie_medewerker,
        werkelijke_minuten, gestart_op, klaar_op, route_volgorde, factuur_status,
        klant:klanten(naam, adres, regio, telefoon, postcode_cijfers),
        dienst:diensten(naam)
      `)
      .eq('medewerker_id', profile.id)
      .order('geplande_datum')
      .order('route_volgorde')
      .order('geplande_tijd_start')
      .limit(500)
    
    setTaken(data || [])
    setLoading(false)
  }

  const today = vandaagISO()
  const { year: huidigJaar, week: huidigWeek } = getISOWeek(new Date())

  const gefilterd = useMemo(() => {
    if (filter === 'vandaag') {
      return taken.filter(t => t.geplande_datum === today)
    }
    if (filter === 'deze_week') {
      return taken.filter(t => t.jaar === huidigJaar && t.weeknummer === huidigWeek)
    }
    if (filter === 'open') {
      return taken.filter(t => t.status !== 'klaar' && t.status !== 'geannuleerd')
    }
    return taken
  }, [taken, filter, today, huidigJaar, huidigWeek])

  // Group per dag
  const perDag = useMemo(() => {
    const groepen = {}
    gefilterd.forEach(t => {
      const datum = t.geplande_datum || 'geen-datum'
      if (!groepen[datum]) groepen[datum] = []
      groepen[datum].push(t)
    })
    return Object.entries(groepen).sort(([a], [b]) => a.localeCompare(b))
  }, [gefilterd])

  async function start(taak) {
    setSavingId(taak.id)
    const updates = { 
      status: 'bezig', 
      gestart_op: new Date().toISOString() 
    }
    setTaken(prev => prev.map(t => t.id === taak.id ? { ...t, ...updates } : t))
    const { error } = await supabase.from('taken').update(updates).eq('id', taak.id)
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
      laadTaken()
    } else {
      setBericht({type:'success', tekst:'⏱️ Gestart!'})
      setTimeout(() => setBericht(null), 1500)
    }
    setSavingId(null)
  }

  async function rondeAf(taak, werkelijkeMinuten, notitie) {
    setSavingId(taak.id)
    const updates = { 
      status: 'klaar',
      klaar_op: new Date().toISOString(),
      factuur_status: 'klaar_voor_factuur',
      werkelijke_minuten: werkelijkeMinuten || taak.werkelijke_minuten || taak.geplande_minuten,
      notitie_medewerker: notitie || null
    }
    setTaken(prev => prev.map(t => t.id === taak.id ? { ...t, ...updates } : t))
    const { error } = await supabase.from('taken').update(updates).eq('id', taak.id)
    if (error) {
      setBericht({type:'error', tekst:'Fout: ' + error.message})
      laadTaken()
    } else {
      setBericht({type:'success', tekst:'✅ Klaar! Doorgestuurd naar facturatie'})
      setTimeout(() => setBericht(null), 2000)
    }
    setSavingId(null)
    setActieveTaak(null)
  }

  if (loading) return <div className="loading">Laden…</div>

  if (!profile) {
    return (
      <div style={{padding:20, textAlign:'center', color:'var(--gray-500)'}}>
        <div style={{fontSize:32, marginBottom:10}}>👤</div>
        <div>Je profiel kon niet geladen worden</div>
      </div>
    )
  }

  const tellingen = {
    vandaag: taken.filter(t => t.geplande_datum === today).length,
    week: taken.filter(t => t.jaar === huidigJaar && t.weeknummer === huidigWeek).length,
    open: taken.filter(t => t.status !== 'klaar' && t.status !== 'geannuleerd').length,
  }

  return (
    <div style={{padding:'0 6px'}}>
      {/* Header */}
      <div style={{
        background:profile.kleur || 'var(--brand)',
        color:'white',
        borderRadius:9,
        padding:'14px 16px',
        marginBottom:10,
        boxShadow:'0 2px 6px rgba(0,0,0,.1)'
      }}>
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div className="av av-blue" style={{
            background:'rgba(255,255,255,.25)', 
            width:40, height:40, fontSize:14,
            border:'2px solid rgba(255,255,255,.5)'
          }}>{profile.naam.split(' ').map(n => n[0]).slice(0,2).join('')}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:16, fontWeight:700}}>Hallo {profile.naam.split(' ')[0]}!</div>
            <div style={{fontSize:11.5, opacity:.85}}>
              {tellingen.open} taken open · {tellingen.vandaag} vandaag
            </div>
          </div>
        </div>
      </div>

      {bericht && (
        <div style={{
          padding:'10px 14px', borderRadius:7, fontSize:13, fontWeight:600, marginBottom:10,
          background: bericht.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
          color: bericht.type === 'success' ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${bericht.type === 'success' ? 'var(--green-light, #6ee7b7)' : '#fca5a5'}`
        }}>
          {bericht.tekst}
        </div>
      )}

      {/* Filter knoppen */}
      <div style={{display:'flex', gap:6, marginBottom:12, overflowX:'auto', paddingBottom:4}}>
        <button 
          className={'btn ' + (filter==='vandaag'?'bp':'bg') + ' bsm'}
          style={{whiteSpace:'nowrap'}}
          onClick={() => setFilter('vandaag')}>
          Vandaag ({tellingen.vandaag})
        </button>
        <button 
          className={'btn ' + (filter==='deze_week'?'bp':'bg') + ' bsm'}
          style={{whiteSpace:'nowrap'}}
          onClick={() => setFilter('deze_week')}>
          Deze week ({tellingen.week})
        </button>
        <button 
          className={'btn ' + (filter==='open'?'bp':'bg') + ' bsm'}
          style={{whiteSpace:'nowrap'}}
          onClick={() => setFilter('open')}>
          Alle open ({tellingen.open})
        </button>
        <button 
          className={'btn ' + (filter==='alles'?'bp':'bg') + ' bsm'}
          style={{whiteSpace:'nowrap'}}
          onClick={() => setFilter('alles')}>
          Alles ({taken.length})
        </button>
      </div>

      {/* Taken per dag */}
      {perDag.length === 0 ? (
        <div style={{padding:'40px 20px', textAlign:'center', color:'var(--gray-400)', background:'white', borderRadius:9, border:'1px solid var(--gray-200)'}}>
          <div style={{fontSize:32, marginBottom:10}}>🌴</div>
          <div style={{fontWeight:600, fontSize:14}}>
            {filter === 'vandaag' ? 'Geen taken voor vandaag' : 
             filter === 'deze_week' ? 'Geen taken deze week' : 
             'Geen taken'}
          </div>
        </div>
      ) : (
        perDag.map(([datum, dagTaken]) => {
          const isVandaag = datum === today
          const dateObj = new Date(datum)
          const dagNaam = isNaN(dateObj.getTime()) ? 'Geen datum' : DAGEN_LABELS[dateObj.getDay()]
          const dagDatum = isNaN(dateObj.getTime()) ? '' : `${dateObj.getDate()}/${dateObj.getMonth()+1}`
          const klaarCount = dagTaken.filter(t => t.status === 'klaar').length
          const totaalMin = dagTaken.reduce((s, t) => s + (t.geplande_minuten || 0), 0)
          
          return (
            <div key={datum} style={{marginBottom:14}}>
              {/* Dag-header */}
              <div style={{
                padding:'8px 12px',
                background: isVandaag ? 'var(--brand-50)' : 'var(--gray-50)',
                border: `1px solid ${isVandaag ? 'var(--brand-light)' : 'var(--gray-200)'}`,
                borderRadius: '7px 7px 0 0',
                fontSize:12,
                fontWeight:700,
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
                color: isVandaag ? 'var(--brand)' : 'var(--gray-700)'
              }}>
                <span>{isVandaag && '👉 '}{dagNaam} {dagDatum}</span>
                <span style={{fontSize:11, fontWeight:600, opacity:.8}}>
                  {klaarCount}/{dagTaken.length} · {(totaalMin/60).toFixed(1)}u
                </span>
              </div>
              
              {/* Taken */}
              <div style={{
                background:'white',
                border:'1px solid var(--gray-200)',
                borderTop:'none',
                borderRadius:'0 0 7px 7px'
              }}>
                {dagTaken.map((t, idx) => (
                  <TaakKaart 
                    key={t.id} 
                    taak={t} 
                    nummer={idx + 1}
                    isSaving={savingId === t.id}
                    isActief={actieveTaak === t.id}
                    onStart={() => start(t)}
                    onActiveer={() => setActieveTaak(t.id)}
                    onSluit={() => setActieveTaak(null)}
                    onRondAf={(min, notitie) => rondeAf(t, min, notitie)}
                    isLast={idx === dagTaken.length - 1}
                  />
                ))}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

function TaakKaart({ taak, nummer, isSaving, isActief, onStart, onActiveer, onSluit, onRondAf, isLast }) {
  const [werkelijkeUren, setWerkelijkeUren] = useState('')
  const [werkelijkeMinuten, setWerkelijkeMinuten] = useState('')
  const [notitie, setNotitie] = useState(taak.notitie_medewerker || '')

  // Bij openen: bereken default werkelijke tijd uit gestart_op
  useEffect(() => {
    if (isActief && taak.gestart_op && !werkelijkeUren && !werkelijkeMinuten) {
      const start = new Date(taak.gestart_op)
      const nu = new Date()
      const diffMin = Math.max(1, Math.round((nu - start) / 60000))
      setWerkelijkeUren(String(Math.floor(diffMin / 60)))
      setWerkelijkeMinuten(String(diffMin % 60))
    } else if (isActief && !werkelijkeUren && !werkelijkeMinuten) {
      // Default: geplande tijd
      setWerkelijkeUren(String(Math.floor((taak.geplande_minuten || 60) / 60)))
      setWerkelijkeMinuten(String((taak.geplande_minuten || 60) % 60))
    }
  }, [isActief, taak])

  function bevestig() {
    const totaalMin = (parseInt(werkelijkeUren || 0) * 60) + parseInt(werkelijkeMinuten || 0)
    onRondAf(totaalMin || taak.geplande_minuten, notitie)
  }

  const isKlaar = taak.status === 'klaar'
  const isBezig = taak.status === 'bezig'
  const isConcept = taak.status === 'concept'
  const tijdLabel = taak.geplande_tijd_start ? taak.geplande_tijd_start.slice(0,5) : '—'

  return (
    <div style={{
      borderBottom: !isLast ? '1px solid var(--gray-100)' : 'none',
      background: isKlaar ? '#f0fdf4' : isBezig ? '#fffbeb' : 'white',
      opacity: isSaving ? 0.6 : 1,
      transition: 'opacity .2s, background .2s'
    }}>
      {/* Hoofd-rij */}
      <div style={{padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start'}}>
        {/* Nummer/status */}
        <div style={{
          minWidth:32, height:32, borderRadius:'50%',
          background: isKlaar ? 'var(--green)' : isBezig ? 'var(--orange)' : 'var(--gray-200)',
          color: isKlaar || isBezig ? 'white' : 'var(--gray-600)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight:800, fontSize:13,
          flexShrink:0
        }}>
          {isKlaar ? '✓' : isBezig ? '▶' : nummer}
        </div>

        {/* Inhoud */}
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:2}}>
            <span style={{fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--gray-500)', fontWeight:700}}>
              {tijdLabel}
            </span>
            <span style={{
              fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius:10,
              background: isKlaar ? 'var(--green-50)' : isBezig ? '#fef3c7' : 'var(--gray-100)',
              color: isKlaar ? 'var(--green)' : isBezig ? '#92400e' : 'var(--gray-600)',
              textTransform:'uppercase', letterSpacing:.4
            }}>
              {taak.status}
            </span>
          </div>
          
          <div style={{
            fontSize:14, fontWeight:700, 
            textDecoration: isKlaar ? 'line-through' : 'none',
            color: isKlaar ? 'var(--gray-500)' : 'var(--gray-900)',
            lineHeight:1.3,
            wordBreak:'break-word'
          }}>
            {taak.klant?.naam || '—'}
          </div>
          
          <div style={{fontSize:12, color:'var(--gray-600)', marginTop:2}}>
            {taak.dienst?.naam}
          </div>
          
          {taak.klant?.adres && (
            <div style={{fontSize:11.5, color:'var(--gray-500)', marginTop:3, display:'flex', alignItems:'center', gap:4}}>
              📍 {taak.klant.adres}
            </div>
          )}
          
          <div style={{fontSize:11, color:'var(--gray-500)', marginTop:4, display:'flex', flexWrap:'wrap', gap:8}}>
            <span>⏱️ Gepland: {taak.geplande_minuten}m</span>
            {taak.werkelijke_minuten && <span>✓ Werkelijk: {taak.werkelijke_minuten}m</span>}
          </div>
          
          {taak.bijzondere_instructie && (
            <div style={{
              marginTop:6, padding:'6px 10px',
              background:'#fef3c7', borderRadius:5, 
              fontSize:11.5, color:'#92400e',
              borderLeft:'3px solid #f59e0b'
            }}>
              ⚠️ {taak.bijzondere_instructie}
            </div>
          )}

          {taak.notitie_medewerker && (
            <div style={{
              marginTop:6, padding:'6px 10px',
              background:'var(--brand-50)', borderRadius:5, 
              fontSize:11.5, color:'var(--brand)'
            }}>
              📝 {taak.notitie_medewerker}
            </div>
          )}
        </div>

        {/* Actie knoppen */}
        {!isActief && !isKlaar && (
          <div style={{display:'flex', flexDirection:'column', gap:6, flexShrink:0}}>
            {isConcept && (
              <button 
                className="btn bg bsm"
                style={{minWidth:70, padding:'6px 10px'}}
                onClick={onStart}
                disabled={isSaving}
              >
                ▶ Start
              </button>
            )}
            <button 
              className="btn bp bsm"
              style={{minWidth:70, padding:'6px 10px'}}
              onClick={onActiveer}
              disabled={isSaving}
            >
              ✓ Klaar
            </button>
          </div>
        )}
        
        {/* Telefoon-knop */}
        {!isActief && taak.klant?.telefoon && (
          <a 
            href={`tel:${taak.klant.telefoon}`}
            className="btn bg bsm"
            style={{minWidth:40, padding:'6px 8px', textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center'}}
            title={taak.klant.telefoon}
          >
            📞
          </a>
        )}
      </div>

      {/* Klaar-formulier (uitschuifbaar) */}
      {isActief && (
        <div style={{
          padding:'12px 14px',
          borderTop:'1px solid var(--gray-100)',
          background:'var(--brand-50)',
        }}>
          <div style={{fontSize:12, fontWeight:700, color:'var(--brand)', marginBottom:10, textTransform:'uppercase', letterSpacing:.4}}>
            Werkbon afronden
          </div>
          
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:4}}>
              Werkelijke tijd (gepland: {taak.geplande_minuten}m)
            </label>
            <div style={{display:'flex', gap:6, alignItems:'center'}}>
              <input 
                type="number"
                min="0"
                className="fi"
                style={{padding:'8px 10px', fontSize:14, width:60, textAlign:'center'}}
                value={werkelijkeUren}
                onChange={e => setWerkelijkeUren(e.target.value)}
                placeholder="0"
              />
              <span style={{fontSize:12, fontWeight:600}}>uur</span>
              <input 
                type="number"
                min="0"
                max="59"
                className="fi"
                style={{padding:'8px 10px', fontSize:14, width:60, textAlign:'center'}}
                value={werkelijkeMinuten}
                onChange={e => setWerkelijkeMinuten(e.target.value)}
                placeholder="0"
              />
              <span style={{fontSize:12, fontWeight:600}}>min</span>
            </div>
          </div>
          
          <div style={{marginBottom:12}}>
            <label style={{fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:4}}>
              Notitie (optioneel)
            </label>
            <textarea
              className="fi"
              style={{padding:'8px 10px', fontSize:13, width:'100%', minHeight:60, resize:'vertical'}}
              value={notitie}
              onChange={e => setNotitie(e.target.value)}
              placeholder="Bijv. extra werk, gemerkte schade, klant niet thuis..."
            />
          </div>
          
          <div style={{display:'flex', gap:8}}>
            <button 
              className="btn bg"
              style={{flex:1, padding:'10px'}}
              onClick={onSluit}
            >
              Annuleer
            </button>
            <button 
              className="btn bp"
              style={{flex:2, padding:'10px', fontSize:13, fontWeight:700}}
              onClick={bevestig}
              disabled={isSaving}
            >
              {isSaving ? 'Opslaan…' : '✅ Klaar & doorsturen'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
