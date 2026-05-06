import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { geocodeerAlleKlanten, geocodeerAdres, optimaliseerRoute, formatAfstand, formatTijd } from '../lib/routing'
import RouteKaart from '../components/RouteKaart'

export default function Geocoding() {
  const [stats, setStats] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [progress, setProgress] = useState(null)
  const [resultaat, setResultaat] = useState(null)
  const [fouten, setFouten] = useState([])
  const [klantenZonder, setKlantenZonder] = useState([])
  const [bedrijfsadres, setBedrijfsadres] = useState(null)

  useEffect(() => { laadStats() }, [])

  async function laadStats() {
    const { data: klanten } = await supabase.from('klanten').select('id, naam, adres, latitude, longitude, geocoding_status')
    const { data: instellingen } = await supabase.from('instellingen').select('*').limit(1).maybeSingle()
    
    setStats({
      totaal: klanten.length,
      gelukt: klanten.filter(k => k.geocoding_status === 'gelukt' || k.geocoding_status === 'handmatig').length,
      mislukt: klanten.filter(k => k.geocoding_status === 'mislukt').length,
      open: klanten.filter(k => k.geocoding_status === 'open').length,
    })
    setKlantenZonder(klanten.filter(k => k.geocoding_status === 'mislukt' || (k.adres && !k.latitude)))
    setBedrijfsadres(instellingen)
  }

  async function startGeocoding() {
    setBezig(true)
    setFouten([])
    setResultaat(null)
    
    try {
      const result = await geocodeerAlleKlanten(
        ({ huidig, totaal, klant }) => setProgress({ huidig, totaal, klant }),
        ({ klant, reden }) => setFouten(prev => [...prev, { klant, reden }])
      )
      setResultaat(result)
      laadStats()
    } catch (e) {
      setResultaat({ error: e.message })
    }
    setBezig(false)
    setProgress(null)
  }

  async function geocodeerEen(klant) {
    const result = await geocodeerAdres(klant.adres)
    if (result) {
      await supabase.from('klanten').update({
        latitude: result.lat,
        longitude: result.lon,
        geocoding_status: 'gelukt',
        geocoded_at: new Date().toISOString(),
        geocoded_adres: result.display_name
      }).eq('id', klant.id)
      laadStats()
    }
  }

  if (!stats) return <div className="loading">Laden…</div>

  return (
    <div>
      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div className="ct">📍 Geocoding — adressen omzetten naar coördinaten</div>
          <div style={{fontSize:11, color:'var(--gray-400)'}}>OpenStreetMap Nominatim (gratis, ~1 sec per klant)</div>
        </div>
        <div className="cb">
          <div className="sg s4" style={{marginBottom:14}}>
            <div className="stat sb1">
              <div className="sl">Totaal klanten</div>
              <div className="sv">{stats.totaal}</div>
            </div>
            <div className="stat sg1">
              <div className="sl">Gecodeerd</div>
              <div className="sv">{stats.gelukt}</div>
              <div className="sd">Heeft coördinaten</div>
            </div>
            <div className="stat sa1">
              <div className="sl">Open</div>
              <div className="sv">{stats.open}</div>
              <div className="sd">Klaar voor geocoding</div>
            </div>
            <div className="stat sr1">
              <div className="sl">Mislukt</div>
              <div className="sv">{stats.mislukt}</div>
              <div className="sd">Adres niet vindbaar</div>
            </div>
          </div>

          {!bezig && (
            <button 
              className="btn bp" 
              onClick={startGeocoding} 
              disabled={stats.open === 0}
            >
              {stats.open === 0 
                ? '✓ Alle adressen al gecodeerd' 
                : `🚀 Geocodeer ${stats.open} openstaande klanten (~${Math.ceil(stats.open / 60)} minuut)`}
            </button>
          )}
          
          {bezig && progress && (
            <div>
              <div style={{fontSize:13, fontWeight:700, marginBottom:8}}>
                Bezig: {progress.huidig} / {progress.totaal}
              </div>
              <div style={{fontSize:11.5, color:'var(--gray-500)', marginBottom:10}}>
                Huidige klant: {progress.klant}
              </div>
              <div style={{height:8, background:'var(--gray-100)', borderRadius:4, overflow:'hidden'}}>
                <div style={{
                  width: `${(progress.huidig/progress.totaal)*100}%`,
                  height:'100%', background:'var(--brand-light)',
                  transition:'width .3s'
                }}></div>
              </div>
              <div style={{fontSize:11, color:'var(--gray-400)', marginTop:6}}>
                ⏱️ Geschatte resterende tijd: {Math.ceil((progress.totaal - progress.huidig) / 60)} minuut
              </div>
            </div>
          )}

          {resultaat && !resultaat.error && (
            <div style={{marginTop:14, padding:'10px 14px', background:'var(--green-50)', borderRadius:7, fontSize:12.5}}>
              <strong style={{color:'var(--green)'}}>✓ Klaar!</strong> {resultaat.gelukt} gelukt, {resultaat.mislukt} mislukt
            </div>
          )}
          
          {resultaat && resultaat.error && (
            <div style={{marginTop:14, padding:'10px 14px', background:'var(--red-50)', borderRadius:7, fontSize:12.5}}>
              <strong style={{color:'var(--red)'}}>✗ Fout:</strong> {resultaat.error}
            </div>
          )}
        </div>
      </div>

      {/* MISLUKTE / ONBEKENDE ADRESSEN */}
      {klantenZonder.length > 0 && (
        <div className="card" style={{marginBottom:14}}>
          <div className="ch">
            <div className="ct">⚠️ Klanten zonder coördinaten ({klantenZonder.length})</div>
            <div style={{fontSize:11, color:'var(--gray-400)'}}>Mogelijk onvolledig adres — handmatig oplossen</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Klant</th><th>Adres in database</th><th></th>
              </tr>
            </thead>
            <tbody>
              {klantenZonder.slice(0, 30).map(k => (
                <tr key={k.id}>
                  <td className="tm">{k.naam}</td>
                  <td style={{fontSize:11.5, color:'var(--gray-500)'}}>{k.adres || '— geen adres —'}</td>
                  <td style={{textAlign:'right'}}>
                    {k.adres && (
                      <button className="btn bg bsm" onClick={() => geocodeerEen(k)}>
                        🔄 Probeer opnieuw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {klantenZonder.length > 30 && (
            <div style={{padding:10, textAlign:'center', fontSize:11, color:'var(--gray-400)'}}>
              + {klantenZonder.length - 30} meer
            </div>
          )}
        </div>
      )}

      {/* ROUTE TEST */}
      <RouteTest stats={stats} bedrijfsadres={bedrijfsadres} />
    </div>
  )
}

function RouteTest({ stats, bedrijfsadres }) {
  const [klantenLijst, setKlantenLijst] = useState([])
  const [geselecteerd, setGeselecteerd] = useState([])
  const [zoek, setZoek] = useState('')
  const [optimaliseren, setOptimaliseren] = useState(false)
  const [resultaat, setResultaat] = useState(null)

  useEffect(() => {
    if (stats?.gelukt > 0) laadKlanten()
  }, [stats])

  async function laadKlanten() {
    const { data } = await supabase
      .from('klanten')
      .select('id, naam, adres, regio, postcode_cijfers, latitude, longitude')
      .not('latitude', 'is', null)
      .order('naam')
    setKlantenLijst(data || [])
  }

  function toggleKlant(klant) {
    setGeselecteerd(prev => {
      if (prev.find(k => k.id === klant.id)) {
        return prev.filter(k => k.id !== klant.id)
      }
      return [...prev, klant]
    })
    setResultaat(null)
  }

  async function bereken() {
    if (geselecteerd.length < 2 || !bedrijfsadres?.bedrijf_latitude) return
    setOptimaliseren(true)
    setResultaat(null)
    
    const startPunt = {
      lat: bedrijfsadres.bedrijf_latitude,
      lon: bedrijfsadres.bedrijf_longitude
    }
    const bezoeken = geselecteerd.map(k => ({
      id: k.id,
      lat: k.latitude,
      lon: k.longitude,
      naam: k.naam,
      adres: k.adres,
      postcode: k.postcode_cijfers
    }))
    
    const result = await optimaliseerRoute(startPunt, bezoeken, true)
    setResultaat(result)
    setOptimaliseren(false)
  }

  const gefilterd = klantenLijst.filter(k => {
    if (geselecteerd.find(g => g.id === k.id)) return false
    if (!zoek) return true
    const z = zoek.toLowerCase()
    return (k.naam || '').toLowerCase().includes(z) ||
           (k.adres || '').toLowerCase().includes(z) ||
           (k.regio || '').toLowerCase().includes(z)
  }).slice(0, 50)

  return (
    <div className="card">
      <div className="ch">
        <div className="ct">🧪 Test route optimalisatie</div>
        <div style={{fontSize:11, color:'var(--gray-400)'}}>Selecteer 5-15 klanten om de route te zien</div>
      </div>
      <div className="cb">
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14}}>
          <div>
            <div style={{fontSize:11, fontWeight:700, color:'var(--gray-600)', textTransform:'uppercase', letterSpacing:.5, marginBottom:6}}>
              Beschikbare klanten ({klantenLijst.length} met coördinaten)
            </div>
            <input 
              className="fi" 
              style={{padding:'7px 10px', fontSize:12, marginBottom:8}}
              placeholder="🔍 Zoek klant…" 
              value={zoek} 
              onChange={e => setZoek(e.target.value)} 
            />
            <div style={{maxHeight:300, overflowY:'auto', border:'1px solid var(--gray-200)', borderRadius:7}}>
              {gefilterd.map(k => (
                <div 
                  key={k.id}
                  onClick={() => toggleKlant(k)}
                  style={{
                    padding:'8px 12px', 
                    borderBottom:'1px solid var(--gray-100)',
                    cursor:'pointer',
                    fontSize:12
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <div style={{fontWeight:600}}>{k.naam}</div>
                  <div style={{fontSize:10.5, color:'var(--gray-500)'}}>{k.adres || '—'}</div>
                </div>
              ))}
              {gefilterd.length === 0 && (
                <div style={{padding:20, textAlign:'center', color:'var(--gray-400)', fontSize:12}}>
                  Geen klanten gevonden
                </div>
              )}
            </div>
          </div>
          
          <div>
            <div style={{fontSize:11, fontWeight:700, color:'var(--gray-600)', textTransform:'uppercase', letterSpacing:.5, marginBottom:6, display:'flex', justifyContent:'space-between'}}>
              <span>Geselecteerd ({geselecteerd.length})</span>
              {geselecteerd.length > 0 && (
                <span 
                  style={{cursor:'pointer', color:'var(--red)', textTransform:'none', letterSpacing:0}}
                  onClick={() => { setGeselecteerd([]); setResultaat(null) }}
                >Wis alles</span>
              )}
            </div>
            <div style={{height: 38, marginBottom: 8}}></div>
            <div style={{maxHeight:300, overflowY:'auto', border:'1px solid var(--gray-200)', borderRadius:7}}>
              {geselecteerd.length === 0 ? (
                <div style={{padding:20, textAlign:'center', color:'var(--gray-400)', fontSize:12}}>
                  Klik op een klant om toe te voegen
                </div>
              ) : (
                geselecteerd.map(k => (
                  <div 
                    key={k.id}
                    onClick={() => toggleKlant(k)}
                    style={{
                      padding:'8px 12px',
                      borderBottom:'1px solid var(--gray-100)',
                      cursor:'pointer',
                      fontSize:12,
                      background: 'var(--brand-50)'
                    }}
                  >
                    <div style={{fontWeight:600}}>{k.naam}</div>
                    <div style={{fontSize:10.5, color:'var(--gray-500)'}}>{k.adres || '—'}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        
        <button 
          className="btn bp" 
          onClick={bereken} 
          disabled={geselecteerd.length < 2 || optimaliseren}
        >
          {optimaliseren ? 'Bezig met optimaliseren…' : `🗺️ Bereken optimale route (${geselecteerd.length} klanten)`}
        </button>
        
        {resultaat && (
          <div style={{marginTop:14}}>
            {resultaat.error ? (
              <div style={{padding:'10px 14px', background:'var(--red-50)', borderRadius:7, fontSize:12.5, color:'var(--red)'}}>
                {resultaat.error}
              </div>
            ) : (
              <div>
                <div style={{padding:'12px 14px', background:'var(--green-50)', borderRadius:7, marginBottom:10, fontSize:13}}>
                  <strong style={{color:'var(--green)'}}>✓ Optimale route berekend</strong><br/>
                  <span style={{fontSize:12}}>
                    Totaal: <strong>{formatAfstand(resultaat.totaal_afstand_m)}</strong> · 
                    Rijtijd: <strong>{formatTijd(resultaat.totaal_tijd_s)}</strong>
                    {resultaat.volgorde.length > 1 && (
                      <> · Gemiddeld <strong>{formatAfstand(resultaat.totaal_afstand_m / resultaat.volgorde.length)}</strong> per stop</>
                    )}
                  </span>
                </div>
                
                {/* KAART met route */}
                <div style={{marginBottom:14}}>
                  <RouteKaart 
                    stops={resultaat.volgorde.map(k => ({
                      id: k.id, lat: k.lat, lon: k.lon, naam: k.naam, adres: k.adres, postcode: k.postcode
                    }))}
                    medewerkerKleur="#1e4a8a"
                    bedrijfStart={bedrijfsadres ? {
                      lat: bedrijfsadres.bedrijf_latitude, 
                      lon: bedrijfsadres.bedrijf_longitude,
                      naam: bedrijfsadres.bedrijfsnaam || 'Sparidaens BV'
                    } : undefined}
                    showRoute={true}
                    hoogte={400}
                  />
                </div>
                
                <div style={{fontSize:11, fontWeight:700, color:'var(--gray-600)', textTransform:'uppercase', letterSpacing:.5, marginBottom:8}}>
                  Optimale volgorde:
                </div>
                <div style={{display:'flex', flexDirection:'column', gap:6}}>
                  <div style={{padding:'8px 12px', background:'var(--brand-50)', borderRadius:6, fontSize:12, display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:24, height:24, borderRadius:'50%', background:'var(--brand)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0}}>🏠</div>
                    <div>
                      <div style={{fontWeight:700}}>Bedrijf — startpunt</div>
                      <div style={{fontSize:10.5, color:'var(--gray-500)'}}>Sparidaens BV, Bladel</div>
                    </div>
                  </div>
                  {resultaat.volgorde.map((k, i) => (
                    <div key={k.id} style={{padding:'8px 12px', background:'white', border:'1px solid var(--gray-200)', borderRadius:6, fontSize:12, display:'flex', alignItems:'center', gap:10}}>
                      <div style={{width:24, height:24, borderRadius:'50%', background:'var(--brand-light)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0}}>{i+1}</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700}}>{k.naam}</div>
                        <div style={{fontSize:10.5, color:'var(--gray-500)'}}>{k.adres || '—'}</div>
                      </div>
                      {k.postcode && (
                        <div style={{fontFamily:'DM Mono, monospace', fontSize:10, color:'var(--brand)'}}>
                          {k.postcode}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{padding:'8px 12px', background:'var(--brand-50)', borderRadius:6, fontSize:12, display:'flex', alignItems:'center', gap:10}}>
                    <div style={{width:24, height:24, borderRadius:'50%', background:'var(--brand)', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0}}>🏠</div>
                    <div>
                      <div style={{fontWeight:700}}>Terug naar bedrijf</div>
                      <div style={{fontSize:10.5, color:'var(--gray-500)'}}>Einde route</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
