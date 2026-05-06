import { useEffect, useState, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'

const DAGEN_LABELS = ['Zondag', 'Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag']
const DAGEN_KORT = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']
const MAANDEN_KORT = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec']

let L = null
let leafletLoadPromise = null

function loadLeaflet() {
  if (leafletLoadPromise) return leafletLoadPromise
  leafletLoadPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(null)
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    import('leaflet').then(module => {
      L = module.default || module
      resolve(L)
    })
  })
  return leafletLoadPromise
}

function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function vandaagISO() {
  return dateToISO(new Date())
}

function addDays(d, days) {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function isWeekend(d) {
  const dag = d.getDay()
  return dag === 0 || dag === 6
}

function navigatieURL(adres) {
  if (!adres) return null
  // Universele Google Maps URL — werkt op iOS en Android
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adres)}`
}

export default function MijnWerk({ user, profile }) {
  const [taken, setTaken] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [actieveTaak, setActieveTaak] = useState(null)
  const [bericht, setBericht] = useState(null)
  const [huidigeDag, setHuidigeDag] = useState(vandaagISO())
  const [bedrijfsadres, setBedrijfsadres] = useState(null)
  const [contactPaneel, setContactPaneel] = useState(null)
  
  // Pull-to-refresh state
  const [pullStart, setPullStart] = useState(null)
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (profile?.id) laadAlles()
  }, [profile])

  async function laadAlles() {
    if (!profile?.id) return
    
    // Bereken datum-range: vandaag t/m +14 dagen
    const startDatum = vandaagISO()
    const eindDatum = dateToISO(addDays(new Date(), 14))
    
    const [takenRes, instRes] = await Promise.all([
      supabase
        .from('taken')
        .select(`
          id, jaar, weeknummer, geplande_datum, geplande_tijd_start, geplande_minuten,
          vaste_prijs, status, bijzondere_instructie, notitie_medewerker,
          werkelijke_minuten, gestart_op, klaar_op, route_volgorde, factuur_status,
          klant:klanten(naam, adres, regio, telefoon, postcode_cijfers, latitude, longitude),
          dienst:diensten(naam)
        `)
        .eq('medewerker_id', profile.id)
        .gte('geplande_datum', startDatum)
        .lte('geplande_datum', eindDatum)
        .order('geplande_datum')
        .order('route_volgorde')
        .order('geplande_tijd_start')
        .limit(500),
      supabase.from('instellingen').select('*').limit(1).maybeSingle()
    ])
    
    setTaken(takenRes.data || [])
    setBedrijfsadres(instRes.data || null)
    setLoading(false)
  }

  async function refresh() {
    setRefreshing(true)
    await laadAlles()
    setRefreshing(false)
    setPullDistance(0)
  }

  // Pull-to-refresh logica
  function onTouchStart(e) {
    if (window.scrollY > 0) return
    setPullStart(e.touches[0].clientY)
  }
  function onTouchMove(e) {
    if (pullStart === null || refreshing) return
    const distance = Math.max(0, e.touches[0].clientY - pullStart)
    if (distance > 0 && window.scrollY === 0) {
      setPullDistance(Math.min(distance * 0.5, 100))
    }
  }
  function onTouchEnd() {
    if (pullDistance > 70) {
      refresh()
    } else {
      setPullDistance(0)
    }
    setPullStart(null)
  }

  // Beschikbare dagen (vandaag + 14 dagen, geen weekends standaard)
  const beschikbareDagen = useMemo(() => {
    const dagen = []
    for (let i = 0; i < 14; i++) {
      const d = addDays(new Date(), i)
      const datum = dateToISO(d)
      const dagTaken = taken.filter(t => t.geplande_datum === datum)
      // Toon alleen dagen waar Emar taken heeft (skip lege dagen)
      if (dagTaken.length > 0 || i === 0) {
        dagen.push({ datum, dateObj: d, aantal: dagTaken.length })
      }
    }
    return dagen
  }, [taken])

  const huidigIndex = beschikbareDagen.findIndex(d => d.datum === huidigeDag)
  const huidigeData = beschikbareDagen[huidigIndex] || beschikbareDagen[0]

  function gaNaarDag(delta) {
    const nieuweIndex = huidigIndex + delta
    if (nieuweIndex >= 0 && nieuweIndex < beschikbareDagen.length) {
      setHuidigeDag(beschikbareDagen[nieuweIndex].datum)
    }
  }

  const dagTaken = useMemo(() => {
    if (!huidigeData) return []
    return taken
      .filter(t => t.geplande_datum === huidigeData.datum)
      .sort((a, b) => {
        if (a.route_volgorde != null && b.route_volgorde != null) {
          return a.route_volgorde - b.route_volgorde
        }
        return (a.geplande_tijd_start || '').localeCompare(b.geplande_tijd_start || '')
      })
  }, [taken, huidigeData])

  async function start(taak) {
    setSavingId(taak.id)
    const updates = { status: 'bezig', gestart_op: new Date().toISOString() }
    setTaken(prev => prev.map(t => t.id === taak.id ? { ...t, ...updates } : t))
    const { error } = await supabase.from('taken').update(updates).eq('id', taak.id)
    if (error) setBericht({type:'error', tekst:'Fout: ' + error.message})
    else {
      setBericht({type:'success', tekst:'⏱️ Gestart!'})
      setTimeout(() => setBericht(null), 1500)
    }
    setSavingId(null)
  }

  async function rondAf(taak, status, werkelijkeMinuten, notitie) {
    setSavingId(taak.id)
    const updates = { 
      status,
      klaar_op: new Date().toISOString(),
      factuur_status: status === 'klaar' ? 'klaar_voor_factuur' : 'open',
      notitie_medewerker: notitie || null
    }
    if (werkelijkeMinuten != null) {
      updates.werkelijke_minuten = werkelijkeMinuten
    }
    setTaken(prev => prev.map(t => t.id === taak.id ? { ...t, ...updates } : t))
    const { error } = await supabase.from('taken').update(updates).eq('id', taak.id)
    if (error) setBericht({type:'error', tekst:'Fout: ' + error.message})
    else {
      setBericht({type:'success', tekst: status === 'klaar' ? '✅ Klaar!' : '🚪 Gemarkeerd niet thuis'})
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

  return (
    <div 
      style={{padding:'0 6px', paddingTop: pullDistance, transition: refreshing ? 'padding-top .2s' : 'none'}}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || refreshing) && (
        <div style={{
          position:'absolute', top:0, left:0, right:0,
          height: pullDistance, display:'flex', alignItems:'center', justifyContent:'center',
          color:'var(--brand)', fontSize:12, fontWeight:600,
          pointerEvents:'none', zIndex:5
        }}>
          {refreshing ? '🔄 Vernieuwen...' : pullDistance > 70 ? '↓ Loslaten om te vernieuwen' : '↓ Naar beneden trekken'}
        </div>
      )}

      {/* Header */}
      <div style={{
        background: profile.kleur || 'var(--brand)',
        color:'white', borderRadius:9,
        padding:'14px 16px', marginBottom:10,
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
              Komende 2 weken · {beschikbareDagen.reduce((s,d)=>s+d.aantal,0)} taken
            </div>
          </div>
          <button 
            onClick={refresh}
            style={{
              background:'rgba(255,255,255,.2)', border:'none', color:'white',
              width:36, height:36, borderRadius:'50%', cursor:'pointer',
              fontSize:16, display:'flex', alignItems:'center', justifyContent:'center'
            }}
            disabled={refreshing}
            title="Vernieuwen"
          >
            {refreshing ? '⏳' : '🔄'}
          </button>
        </div>
      </div>

      {bericht && (
        <div style={{
          padding:'10px 14px', borderRadius:7, fontSize:13, fontWeight:600, marginBottom:10,
          background: bericht.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
          color: bericht.type === 'success' ? 'var(--green)' : 'var(--red)',
          border: `1px solid ${bericht.type === 'success' ? '#6ee7b7' : '#fca5a5'}`
        }}>
          {bericht.tekst}
        </div>
      )}

      {/* Dag-navigator met pijlen */}
      {beschikbareDagen.length === 0 ? null : (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'white', borderRadius:9, border:'1px solid var(--gray-200)',
          padding:'8px 8px', marginBottom:10
        }}>
          <button 
            onClick={() => gaNaarDag(-1)}
            disabled={huidigIndex <= 0}
            style={{
              minWidth:44, height:44, borderRadius:'50%',
              border:'none', background: huidigIndex <= 0 ? 'var(--gray-100)' : 'var(--brand-50)',
              color: huidigIndex <= 0 ? 'var(--gray-300)' : 'var(--brand)',
              fontSize:18, fontWeight:700, cursor: huidigIndex <= 0 ? 'default' : 'pointer'
            }}
          >◀</button>
          
          <div style={{flex:1, textAlign:'center'}}>
            <div style={{fontSize:11, color:'var(--gray-500)', fontWeight:600, textTransform:'uppercase', letterSpacing:.5}}>
              {huidigeData ? (
                huidigeData.datum === vandaagISO() ? 'Vandaag' : 
                huidigeData.datum === dateToISO(addDays(new Date(),1)) ? 'Morgen' : 
                DAGEN_LABELS[huidigeData.dateObj.getDay()]
              ) : 'Geen dag'}
            </div>
            {huidigeData && (
              <div style={{fontSize:15, fontWeight:700, marginTop:2}}>
                {huidigeData.dateObj.getDate()} {MAANDEN_KORT[huidigeData.dateObj.getMonth()]}
              </div>
            )}
            <div style={{fontSize:10, color:'var(--gray-400)', marginTop:2}}>
              {huidigeData ? `${huidigeData.aantal} ${huidigeData.aantal === 1 ? 'taak' : 'taken'}` : ''}
              {beschikbareDagen.length > 1 && ` · ${huidigIndex + 1} / ${beschikbareDagen.length}`}
            </div>
          </div>
          
          <button 
            onClick={() => gaNaarDag(1)}
            disabled={huidigIndex >= beschikbareDagen.length - 1}
            style={{
              minWidth:44, height:44, borderRadius:'50%',
              border:'none', background: huidigIndex >= beschikbareDagen.length - 1 ? 'var(--gray-100)' : 'var(--brand-50)',
              color: huidigIndex >= beschikbareDagen.length - 1 ? 'var(--gray-300)' : 'var(--brand)',
              fontSize:18, fontWeight:700, cursor: huidigIndex >= beschikbareDagen.length - 1 ? 'default' : 'pointer'
            }}
          >▶</button>
        </div>
      )}

      {/* Kaart toggle + kaart */}
      {dagTaken.some(t => t.klant?.latitude && t.klant?.longitude) && (
        <DagKaart 
          taken={dagTaken} 
          bedrijfsadres={bedrijfsadres}
          medewerkerKleur={profile.kleur}
        />
      )}

      {/* Taken */}
      {dagTaken.length === 0 ? (
        <div style={{
          padding:'40px 20px', textAlign:'center', color:'var(--gray-400)', 
          background:'white', borderRadius:9, border:'1px solid var(--gray-200)'
        }}>
          <div style={{fontSize:36, marginBottom:10}}>🌴</div>
          <div style={{fontWeight:600, fontSize:14}}>Geen taken voor deze dag</div>
        </div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:8}}>
          {dagTaken.map((t, i) => (
            <TaakKaart 
              key={t.id} 
              taak={t} 
              nummer={i + 1}
              isSaving={savingId === t.id}
              isActief={actieveTaak === t.id}
              onStart={() => start(t)}
              onActiveer={() => setActieveTaak(t.id)}
              onSluit={() => setActieveTaak(null)}
              onRondAf={(status, min, notitie) => rondAf(t, status, min, notitie)}
              onContact={() => setContactPaneel(t)}
            />
          ))}
        </div>
      )}

      {/* Contact paneel modal */}
      {contactPaneel && (
        <ContactPaneel 
          taak={contactPaneel} 
          onSluit={() => setContactPaneel(null)}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// CONTACT PANEEL — bel of navigeer
// ═══════════════════════════════════════════════════════════
function ContactPaneel({ taak, onSluit }) {
  const tel = taak.klant?.telefoon
  const adres = taak.klant?.adres
  const navUrl = navigatieURL(adres)
  
  return (
    <div 
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
        display:'flex', alignItems:'flex-end', justifyContent:'center',
        zIndex:1000, padding:0
      }}
      onClick={onSluit}
    >
      <div 
        style={{
          background:'white', width:'100%', maxWidth:500,
          borderRadius:'14px 14px 0 0', padding:'18px 18px 28px',
          boxShadow:'0 -10px 40px rgba(0,0,0,.3)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          width:40, height:4, background:'var(--gray-300)', borderRadius:2,
          margin:'0 auto 14px'
        }}></div>
        
        <div style={{textAlign:'center', marginBottom:18}}>
          <div style={{fontSize:18, fontWeight:800}}>{taak.klant?.naam}</div>
          {adres && <div style={{fontSize:12, color:'var(--gray-500)', marginTop:3}}>{adres}</div>}
        </div>

        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {tel ? (
            <a 
              href={`tel:${tel}`}
              style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'14px 16px', background:'var(--brand-50)', borderRadius:9,
                textDecoration:'none', color:'var(--brand)', fontWeight:700, fontSize:15
              }}
            >
              <span style={{fontSize:24}}>📞</span>
              <div style={{flex:1}}>
                <div>Bellen</div>
                <div style={{fontSize:11, color:'var(--gray-500)', fontWeight:500}}>{tel}</div>
              </div>
              <span style={{fontSize:18, color:'var(--gray-400)'}}>›</span>
            </a>
          ) : (
            <div style={{
              padding:'14px 16px', background:'var(--gray-50)', borderRadius:9,
              color:'var(--gray-400)', fontSize:13, textAlign:'center'
            }}>
              📞 Geen telefoonnummer bekend
            </div>
          )}
          
          {navUrl ? (
            <a 
              href={navUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display:'flex', alignItems:'center', gap:14,
                padding:'14px 16px', background:'var(--green-50)', borderRadius:9,
                textDecoration:'none', color:'var(--green)', fontWeight:700, fontSize:15
              }}
            >
              <span style={{fontSize:24}}>🗺️</span>
              <div style={{flex:1}}>
                <div>Navigeer hierheen</div>
                <div style={{fontSize:11, color:'var(--gray-500)', fontWeight:500}}>Open Google Maps</div>
              </div>
              <span style={{fontSize:18, color:'var(--gray-400)'}}>›</span>
            </a>
          ) : (
            <div style={{
              padding:'14px 16px', background:'var(--gray-50)', borderRadius:9,
              color:'var(--gray-400)', fontSize:13, textAlign:'center'
            }}>
              🗺️ Geen adres bekend
            </div>
          )}
        </div>

        <button 
          onClick={onSluit}
          style={{
            marginTop:16, width:'100%', padding:'12px',
            border:'none', background:'var(--gray-100)', borderRadius:9,
            fontSize:14, fontWeight:600, color:'var(--gray-600)', cursor:'pointer'
          }}
        >
          Annuleer
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// DAG KAART (uitklapbaar)
// ═══════════════════════════════════════════════════════════
function DagKaart({ taken, bedrijfsadres, medewerkerKleur }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  
  const stopsMetCoords = taken.filter(t => t.klant?.latitude && t.klant?.longitude)
  if (stopsMetCoords.length === 0) return null
  
  useEffect(() => {
    if (!open) return
    let cancelled = false
    
    async function init() {
      const leaflet = await loadLeaflet()
      if (cancelled || !containerRef.current) return
      
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      
      const bedrijfStart = {
        lat: bedrijfsadres?.bedrijf_latitude || 51.3680,
        lon: bedrijfsadres?.bedrijf_longitude || 5.2150
      }
      
      const lats = stopsMetCoords.map(t => t.klant.latitude).concat([bedrijfStart.lat])
      const lons = stopsMetCoords.map(t => t.klant.longitude).concat([bedrijfStart.lon])
      const center = [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lons) + Math.max(...lons)) / 2]
      
      const map = leaflet.map(containerRef.current, {
        center, zoom: 11,
        scrollWheelZoom: false,
        zoomControl: true,
      })
      mapRef.current = map
      
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OSM', maxZoom: 18,
      }).addTo(map)
      
      // Bedrijf marker
      const bedrijfIcon = leaflet.divIcon({
        className: 'route-marker-start',
        html: `<div style="background:#111; color:white; border:2px solid white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 2px 6px rgba(0,0,0,.4);">🏠</div>`,
        iconSize: [30, 30], iconAnchor: [15, 15],
      })
      leaflet.marker([bedrijfStart.lat, bedrijfStart.lon], { icon: bedrijfIcon }).addTo(map)
      
      // Stops
      const bounds = [[bedrijfStart.lat, bedrijfStart.lon]]
      stopsMetCoords.forEach((t, i) => {
        const icon = leaflet.divIcon({
          className: 'route-marker-stop',
          html: `<div style="background:${medewerkerKleur||'#1e4a8a'}; color:white; border:2px solid white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; box-shadow:0 2px 6px rgba(0,0,0,.4);">${i+1}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15],
        })
        leaflet.marker([t.klant.latitude, t.klant.longitude], { icon })
          .addTo(map)
          .bindPopup(`<strong>${i+1}. ${t.klant.naam}</strong><br>${t.dienst?.naam || ''}<br>${t.klant.adres || ''}`)
        bounds.push([t.klant.latitude, t.klant.longitude])
      })
      
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 })
      }
      
      // Route via OSRM
      try {
        const punten = [
          { lat: bedrijfStart.lat, lon: bedrijfStart.lon },
          ...stopsMetCoords.map(t => ({ lat: t.klant.latitude, lon: t.klant.longitude })),
          { lat: bedrijfStart.lat, lon: bedrijfStart.lon }
        ]
        const coords = punten.map(p => `${p.lon},${p.lat}`).join(';')
        const response = await fetch(`/api/route?coords=${encodeURIComponent(coords)}&overview=full&geometries=geojson`)
        if (response.ok) {
          const data = await response.json()
          if (!cancelled && data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
            const polyPoints = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]])
            leaflet.polyline(polyPoints, {
              color: medewerkerKleur || '#1e4a8a',
              weight: 4, opacity: 0.7
            }).addTo(map)
          }
        }
      } catch (e) {
        console.warn('Route mislukt:', e)
      }
    }
    
    init()
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [open, stopsMetCoords.length])
  
  return (
    <div style={{marginBottom:10}}>
      <button 
        onClick={() => setOpen(!open)}
        style={{
          width:'100%', padding:'10px 14px',
          background:'white', border:'1px solid var(--gray-200)',
          borderRadius: open ? '7px 7px 0 0' : 7,
          fontSize:13, fontWeight:600, color:'var(--gray-700)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          cursor:'pointer'
        }}
      >
        <span>🗺️ {open ? 'Verberg' : 'Toon'} kaart van deze dag</span>
        <span style={{fontSize:11, color:'var(--gray-400)'}}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div 
          ref={containerRef} 
          style={{
            width:'100%', height:280,
            border:'1px solid var(--gray-200)',
            borderTop:'none', borderRadius:'0 0 7px 7px',
            overflow:'hidden'
          }}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// TAAK KAART
// ═══════════════════════════════════════════════════════════
function TaakKaart({ taak, nummer, isSaving, isActief, onStart, onActiveer, onSluit, onRondAf, onContact }) {
  const [tijdAnders, setTijdAnders] = useState(false)
  const [werkelijkeUren, setWerkelijkeUren] = useState('')
  const [werkelijkeMinuten, setWerkelijkeMinuten] = useState('')
  const [notitie, setNotitie] = useState('')
  const [bezigSeconden, setBezigSeconden] = useState(0)
  
  // Bezig-timer als hij gestart is
  useEffect(() => {
    if (taak.status !== 'bezig' || !taak.gestart_op) return
    function updateTimer() {
      const start = new Date(taak.gestart_op)
      const nu = new Date()
      setBezigSeconden(Math.floor((nu - start) / 1000))
    }
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [taak.status, taak.gestart_op])
  
  // Bij openen: reset velden
  useEffect(() => {
    if (isActief) {
      setNotitie(taak.notitie_medewerker || '')
      // Bereken tijd vanaf start als hij bezig is
      if (taak.gestart_op) {
        const start = new Date(taak.gestart_op)
        const nu = new Date()
        const diffMin = Math.max(1, Math.round((nu - start) / 60000))
        setWerkelijkeUren(String(Math.floor(diffMin / 60)))
        setWerkelijkeMinuten(String(diffMin % 60))
      } else {
        setWerkelijkeUren(String(Math.floor((taak.geplande_minuten || 60) / 60)))
        setWerkelijkeMinuten(String((taak.geplande_minuten || 60) % 60))
      }
      setTijdAnders(false)
    }
  }, [isActief, taak])

  function bevestigKlaar() {
    let werkelijkeMin = null
    if (tijdAnders) {
      werkelijkeMin = (parseInt(werkelijkeUren || 0) * 60) + parseInt(werkelijkeMinuten || 0) || taak.geplande_minuten
    }
    onRondAf('klaar', werkelijkeMin, notitie)
  }

  function nietThuis() {
    onRondAf('niet_thuis', null, notitie || 'Klant niet thuis')
  }

  const isKlaar = taak.status === 'klaar'
  const isBezig = taak.status === 'bezig'
  const isNietThuis = taak.status === 'niet_thuis'
  const tijdLabel = taak.geplande_tijd_start ? taak.geplande_tijd_start.slice(0,5) : '—'
  
  function formatTimer(s) {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
  }

  return (
    <div style={{
      background: isKlaar ? '#f0fdf4' : isBezig ? '#fffbeb' : isNietThuis ? '#fef2f2' : 'white',
      border: `1px solid ${isBezig ? '#fcd34d' : 'var(--gray-200)'}`,
      borderRadius: 9,
      opacity: isSaving ? 0.6 : 1,
      transition: 'opacity .2s, background .2s',
      overflow: 'hidden'
    }}>
      {/* Hoofd-rij */}
      <div style={{padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start'}}>
        {/* Nummer/status */}
        <div style={{
          minWidth:36, height:36, borderRadius:'50%',
          background: isKlaar ? 'var(--green)' : isBezig ? 'var(--orange)' : isNietThuis ? 'var(--red)' : 'var(--gray-200)',
          color: isKlaar || isBezig || isNietThuis ? 'white' : 'var(--gray-600)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight:800, fontSize:14, flexShrink:0
        }}>
          {isKlaar ? '✓' : isBezig ? '▶' : isNietThuis ? '🚪' : nummer}
        </div>

        {/* Inhoud — klikbaar voor contact */}
        <div 
          style={{flex:1, minWidth:0, cursor: 'pointer'}}
          onClick={onContact}
        >
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:2}}>
            <span style={{fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--gray-500)', fontWeight:700}}>
              {tijdLabel}
            </span>
            {isBezig && (
              <span style={{
                fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10,
                background:'#fcd34d', color:'#92400e',
                fontFamily:'DM Mono, monospace',
                animation: 'pulse 2s infinite'
              }}>
                ⏱️ {formatTimer(bezigSeconden)}
              </span>
            )}
            {!isBezig && (
              <span style={{
                fontSize:9.5, fontWeight:700, padding:'1px 6px', borderRadius:10,
                background: isKlaar ? 'var(--green-50)' : isNietThuis ? 'var(--red-50)' : 'var(--gray-100)',
                color: isKlaar ? 'var(--green)' : isNietThuis ? 'var(--red)' : 'var(--gray-600)',
                textTransform:'uppercase', letterSpacing:.4
              }}>
                {taak.status}
              </span>
            )}
          </div>
          
          <div style={{
            fontSize:15, fontWeight:700, 
            textDecoration: isKlaar ? 'line-through' : 'none',
            color: isKlaar ? 'var(--gray-500)' : 'var(--gray-900)',
            lineHeight:1.3, wordBreak:'break-word'
          }}>
            {taak.klant?.naam || '—'}
            <span style={{fontSize:11, marginLeft:6, color:'var(--gray-400)'}}>📞</span>
          </div>
          
          <div style={{fontSize:12.5, color:'var(--gray-600)', marginTop:2}}>
            {taak.dienst?.naam}
          </div>
          
          {taak.klant?.adres && (
            <div style={{fontSize:12, color:'var(--gray-500)', marginTop:3, display:'flex', alignItems:'center', gap:4}}>
              📍 {taak.klant.adres}
            </div>
          )}
          
          <div style={{fontSize:11, color:'var(--gray-500)', marginTop:4, display:'flex', flexWrap:'wrap', gap:8}}>
            <span>⏱️ Gepland: {taak.geplande_minuten}m</span>
            {taak.werkelijke_minuten && <span style={{color:'var(--brand)'}}>✓ Werkelijk: {taak.werkelijke_minuten}m</span>}
          </div>
          
          {taak.bijzondere_instructie && (
            <div style={{
              marginTop:6, padding:'7px 10px',
              background:'#fef3c7', borderRadius:5, 
              fontSize:12, color:'#92400e',
              borderLeft:'3px solid #f59e0b'
            }}>
              ⚠️ {taak.bijzondere_instructie}
            </div>
          )}

          {taak.notitie_medewerker && (
            <div style={{
              marginTop:6, padding:'7px 10px',
              background:'var(--brand-50)', borderRadius:5, 
              fontSize:12, color:'var(--brand)'
            }}>
              📝 {taak.notitie_medewerker}
            </div>
          )}
        </div>
      </div>

      {/* Actie knoppen onderaan */}
      {!isActief && !isKlaar && !isNietThuis && (
        <div style={{
          padding:'10px 14px', borderTop:'1px solid var(--gray-100)',
          display:'flex', gap:8
        }}>
          {!isBezig && (
            <button 
              onClick={onStart}
              disabled={isSaving}
              style={{
                flex:1, padding:'10px',
                background:'var(--gray-100)', border:'none', borderRadius:7,
                fontSize:13, fontWeight:700, color:'var(--gray-700)',
                cursor:'pointer'
              }}
            >
              ▶ Start
            </button>
          )}
          <button 
            onClick={onActiveer}
            disabled={isSaving}
            style={{
              flex:2, padding:'10px',
              background:'var(--brand)', border:'none', borderRadius:7,
              fontSize:13, fontWeight:700, color:'white',
              cursor:'pointer'
            }}
          >
            ✓ Klaar
          </button>
        </div>
      )}

      {/* Klaar-formulier */}
      {isActief && (
        <div style={{
          padding:'14px',
          borderTop:'1px solid var(--gray-100)',
          background:'var(--brand-50)',
        }}>
          <div style={{fontSize:12, fontWeight:700, color:'var(--brand)', marginBottom:12, textTransform:'uppercase', letterSpacing:.4}}>
            Werkbon afronden
          </div>
          
          {/* Tijd anders dan gepland */}
          <label style={{
            display:'flex', alignItems:'center', gap:10,
            padding:'10px 12px',
            background:'white', borderRadius:7, marginBottom:12,
            cursor:'pointer'
          }}>
            <input 
              type="checkbox"
              checked={tijdAnders}
              onChange={e => setTijdAnders(e.target.checked)}
              style={{width:18, height:18, cursor:'pointer'}}
            />
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>Werkelijke tijd anders dan gepland</div>
              <div style={{fontSize:11, color:'var(--gray-500)', marginTop:2}}>
                Standaard wordt {taak.geplande_minuten}m geregistreerd. Aanvinken bij regiewerk.
              </div>
            </div>
          </label>
          
          {tijdAnders && (
            <div style={{marginBottom:12, padding:'10px 12px', background:'white', borderRadius:7}}>
              <label style={{fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:6}}>
                Hoeveel tijd heb je echt gewerkt?
              </label>
              <div style={{display:'flex', gap:6, alignItems:'center'}}>
                <input 
                  type="number"
                  min="0"
                  inputMode="numeric"
                  style={{padding:'10px 12px', fontSize:16, width:70, textAlign:'center', border:'1.5px solid var(--gray-300)', borderRadius:6}}
                  value={werkelijkeUren}
                  onChange={e => setWerkelijkeUren(e.target.value)}
                  placeholder="0"
                />
                <span style={{fontSize:13, fontWeight:600}}>uur</span>
                <input 
                  type="number"
                  min="0"
                  max="59"
                  inputMode="numeric"
                  style={{padding:'10px 12px', fontSize:16, width:70, textAlign:'center', border:'1.5px solid var(--gray-300)', borderRadius:6}}
                  value={werkelijkeMinuten}
                  onChange={e => setWerkelijkeMinuten(e.target.value)}
                  placeholder="0"
                />
                <span style={{fontSize:13, fontWeight:600}}>min</span>
              </div>
            </div>
          )}
          
          <div style={{marginBottom:14}}>
            <label style={{fontSize:11, fontWeight:600, color:'var(--gray-600)', display:'block', marginBottom:6}}>
              Notitie (optioneel)
            </label>
            <textarea
              style={{padding:'10px 12px', fontSize:14, width:'100%', minHeight:70, resize:'vertical', border:'1.5px solid var(--gray-300)', borderRadius:6, fontFamily:'inherit'}}
              value={notitie}
              onChange={e => setNotitie(e.target.value)}
              placeholder="Bijv. extra werk, gemerkte schade, ..."
            />
          </div>
          
          <div style={{display:'flex', flexDirection:'column', gap:8}}>
            <button 
              onClick={bevestigKlaar}
              disabled={isSaving}
              style={{
                padding:'14px', background:'var(--green)', border:'none', borderRadius:7,
                fontSize:15, fontWeight:700, color:'white', cursor:'pointer'
              }}
            >
              {isSaving ? 'Opslaan…' : '✅ Klaar & doorsturen'}
            </button>
            <button 
              onClick={nietThuis}
              disabled={isSaving}
              style={{
                padding:'12px', background:'white', border:'1.5px solid var(--red)', borderRadius:7,
                fontSize:13, fontWeight:600, color:'var(--red)', cursor:'pointer'
              }}
            >
              🚪 Klant was niet thuis
            </button>
            <button 
              onClick={onSluit}
              style={{
                padding:'10px', background:'transparent', border:'none', borderRadius:7,
                fontSize:12, fontWeight:600, color:'var(--gray-500)', cursor:'pointer'
              }}
            >
              Annuleer
            </button>
          </div>
        </div>
      )}
      
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
