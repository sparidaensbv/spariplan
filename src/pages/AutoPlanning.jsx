import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import RouteKaart from '../components/RouteKaart'

const DAGEN_WERKDAGEN = [
  { key: 1, naam: 'maandag', label: 'Ma' },
  { key: 2, naam: 'dinsdag', label: 'Di' },
  { key: 3, naam: 'woensdag', label: 'Wo' },
  { key: 4, naam: 'donderdag', label: 'Do' },
  { key: 5, naam: 'vrijdag', label: 'Vr' },
]
const ZATERDAG = { key: 6, naam: 'zaterdag', label: 'Za' }
// Voor compatibiliteit met bestaande code
const DAGEN = DAGEN_WERKDAGEN

// Pasen → feestdagen
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

function isFeestdag(jaar, week, dagNr, feestdagen) {
  const datum = datumVoorDag(jaar, week, dagNr)
  const dStr = datum.toISOString().slice(0, 10)
  return feestdagen.find(f => f.datum.toISOString().slice(0, 10) === dStr)
}

function getISOWeek(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return { year: d.getUTCFullYear(), week: Math.ceil((((d - yearStart) / 86400000) + 1) / 7) }
}

export default function AutoPlanning() {
  const [klantDiensten, setKlantDiensten] = useState([])
  const [bestaande, setBestaande] = useState([])
  const [historie, setHistorie] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [genereren, setGenereren] = useState(false)
  const [resultaat, setResultaat] = useState(null)
  const [doelweek, setDoelweek] = useState(getISOWeek(new Date()).week + 1)
  const [doeljaar, setDoeljaar] = useState(2026)
  const [voorbeeld, setVoorbeeld] = useState(null)
  const [instelling, setInstelling] = useState(null)

  useEffect(() => { laadAlles() }, [])

  async function laadAlles() {
    const [kdRes, takenRes, historieRes, medRes, instRes] = await Promise.all([
      supabase.from('klant_diensten').select(`
        id, weeknummers, vaste_prijs, geplande_minuten, bijzondere_instructie,
        voorkeur_dag, voorkeur_dagdeel, voorkeur_medewerker_id, voorkeur_hardheid,
        klant:klanten(id, naam, regio, adres, postcode_cijfers, latitude, longitude),
        dienst:diensten(id, naam)
      `).limit(5000),
      supabase.from('taken').select('klant_id, dienst_id, jaar, weeknummer').limit(5000),
      supabase.from('taken').select('klant_dienst_id, medewerker_id, status').not('medewerker_id', 'is', null).limit(5000),
      supabase.from('medewerkers').select('*').eq('actief', true).order('prioriteit'),
      supabase.from('instellingen').select('*').limit(1).maybeSingle()
    ])
    setKlantDiensten(kdRes.data || [])
    setBestaande(takenRes.data || [])
    setHistorie(historieRes.data || [])
    setMedewerkers(medRes.data || [])
    setInstelling(instRes.data || null)
    setLoading(false)
  }

  // Bepaal welke klant-diensten in de doelweek vallen en nog niet bestaan
  const teGenereren = useMemo(() => {
    const inWeek = klantDiensten.filter(kd => {
      if (!kd.weeknummers) return false
      // Werk met zowel number als string array
      return kd.weeknummers.some(w => Number(w) === Number(doelweek))
    })
    return inWeek.filter(kd => !bestaande.some(t => 
      t.klant_id === kd.klant?.id && t.dienst_id === kd.dienst?.id && 
      t.jaar === doeljaar && t.weeknummer === doelweek
    ))
  }, [klantDiensten, bestaande, doelweek, doeljaar])

  // Bereken historische voorkeur medewerker per klant_dienst
  const historischeVoorkeur = useMemo(() => {
    const groepen = {}
    historie.forEach(h => {
      if (!h.klant_dienst_id || !h.medewerker_id) return
      if (!groepen[h.klant_dienst_id]) groepen[h.klant_dienst_id] = {}
      groepen[h.klant_dienst_id][h.medewerker_id] = (groepen[h.klant_dienst_id][h.medewerker_id] || 0) + 1
    })
    const result = {}
    Object.keys(groepen).forEach(kdId => {
      const counts = groepen[kdId]
      const top = Object.entries(counts).sort((a,b) => b[1] - a[1])[0]
      result[kdId] = top[0]  // medewerker_id die het meest deed
    })
    return result
  }, [historie])

  // Voorbeeld genereren (preview, niet opslaan)
  const [optimaliseren, setOptimaliseren] = useState(false)
  const [optimProgress, setOptimProgress] = useState(null)
  
  async function genereerVoorbeeld() {
    const feestdagen = getCAOFeestdagen(doeljaar)
    const result = doSmartPlanning(teGenereren, medewerkers, doeljaar, doelweek, feestdagen, historischeVoorkeur, instelling?.zaterdag_werkdag || false)
    
    // Toon eerst de basis-planning
    setVoorbeeld(result)
    
    // Dan async route-optimalisatie via OSRM
    setOptimaliseren(true)
    setOptimProgress(null)
    try {
      const bedrijfStart = {
        lat: instelling?.bedrijf_latitude || 51.3680,
        lon: instelling?.bedrijf_longitude || 5.2150
      }
      const geoptimaliseerd = await optimaliseerVolgordes(result, bedrijfStart, (p) => setOptimProgress(p))
      // Zorg dat React re-rendert door nieuw object te maken
      setVoorbeeld({ ...geoptimaliseerd, taken: [...geoptimaliseerd.taken] })
    } catch (e) {
      console.error('Route-optimalisatie mislukt:', e)
    }
    setOptimaliseren(false)
    setOptimProgress(null)
  }

  async function genereerEnOpslaan() {
    if (!voorbeeld) {
      genereerVoorbeeld()
      return
    }
    setGenereren(true)
    setResultaat(null)
    
    const taken = voorbeeld.taken.map(t => ({
      klant_dienst_id: t.kd_id,
      klant_id: t.klant_id,
      dienst_id: t.dienst_id,
      medewerker_id: t.medewerker_id,
      jaar: doeljaar,
      weeknummer: doelweek,
      geplande_datum: t.datum,
      geplande_tijd_start: t.tijd_start,
      geplande_minuten: t.minuten,
      vaste_prijs: t.prijs,
      status: 'concept',
      bijzondere_instructie: t.bijzondere_instructie,
      route_volgorde: t.route_volgorde,
    }))
    
    const { data, error } = await supabase.from('taken').insert(taken).select()
    
    if (error) {
      setResultaat({type: 'error', tekst: 'Fout: ' + error.message})
    } else {
      setResultaat({type: 'success', tekst: `${data.length} taken aangemaakt voor week ${doelweek}. Bekijk de Planning pagina om ze te zien en eventueel aan te passen.`})
      setVoorbeeld(null)
      laadAlles()
    }
    setGenereren(false)
  }

  if (loading) return <div className="loading">Laden…</div>

  return (
    <div>
      {/* TOOLBAR */}
      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div className="ct">🤖 Slimme auto-planning</div>
          <div style={{fontSize:11, color:'var(--gray-400)'}}>
            Past voorkeuren toe + clustert op postcode + verdeelt evenredig
          </div>
        </div>
        <div className="cb">
          <div style={{display:'flex', gap:14, alignItems:'flex-end', flexWrap:'wrap'}}>
            <div>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:'var(--gray-600)', marginBottom:5, textTransform:'uppercase', letterSpacing:.5}}>Jaar</label>
              <input type="number" className="fi" value={doeljaar} onChange={e => {setDoeljaar(parseInt(e.target.value)); setVoorbeeld(null)}} style={{width:100}} />
            </div>
            <div>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:'var(--gray-600)', marginBottom:5, textTransform:'uppercase', letterSpacing:.5}}>Week</label>
              <input type="number" min="1" max="52" className="fi" value={doelweek} onChange={e => {setDoelweek(parseInt(e.target.value)); setVoorbeeld(null)}} style={{width:100}} />
            </div>
            <div style={{flex:1}}></div>
            {!voorbeeld ? (
              <button className="btn bp" onClick={genereerVoorbeeld} disabled={teGenereren.length === 0 || optimaliseren}>
                {optimaliseren ? 'Bezig met genereren…' : '🔮 Toon voorbeeld'}
              </button>
            ) : (
              <>
                <button className="btn bg bsm" onClick={() => setVoorbeeld(null)}>
                  Annuleer
                </button>
                <button className="btn bp" onClick={genereerEnOpslaan} disabled={genereren || optimaliseren}>
                  {genereren ? 'Bezig…' : optimaliseren ? `🛣️ Route optimaliseren ${optimProgress ? `${optimProgress.huidig}/${optimProgress.totaal}` : ''}` : `✓ Bevestig & opslaan (${voorbeeld.taken.length})`}
                </button>
              </>
            )}
          </div>
          
          {optimaliseren && (
            <div style={{marginTop:10, padding:'8px 14px', background:'var(--brand-50)', borderRadius:7, fontSize:12, color:'var(--brand)', display:'flex', alignItems:'center', gap:10}}>
              <div className="spinner" style={{width:14, height:14, border:'2px solid var(--brand-light)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite'}}></div>
              <span>🛣️ Route optimaliseren via OSRM... {optimProgress && `(${optimProgress.huidig} / ${optimProgress.totaal} dagen)`}</span>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}

          {resultaat && (
            <div style={{
              marginTop:14, padding:'10px 14px', borderRadius:7, fontSize:12.5, fontWeight:600,
              background: resultaat.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
              color: resultaat.type === 'success' ? 'var(--green)' : 'var(--red)'
            }}>
              {resultaat.type === 'success' ? '✓' : '✗'} {resultaat.tekst}
            </div>
          )}

          <div className="sg s4" style={{marginTop:14}}>
            <div className="stat sb1">
              <div className="sl">Klanten in week {doelweek}</div>
              <div className="sv">{teGenereren.length + (klantDiensten.filter(kd => kd.weeknummers?.some(w => Number(w) === Number(doelweek))).length - teGenereren.length)}</div>
              <div className="sd">Op basis van weeknummers</div>
            </div>
            <div className="stat sg1">
              <div className="sl">Al gepland</div>
              <div className="sv">{klantDiensten.filter(kd => kd.weeknummers?.some(w => Number(w) === Number(doelweek))).length - teGenereren.length}</div>
              <div className="sd">Reeds aangemaakt</div>
            </div>
            <div className="stat sa1">
              <div className="sl">Nog te plannen</div>
              <div className="sv">{teGenereren.length}</div>
              <div className="sd">Klaar om te genereren</div>
            </div>
            <div className="stat sr1">
              <div className="sl">Totaal uren</div>
              <div className="sv">{(teGenereren.reduce((s,kd)=>s+(kd.geplande_minuten||0),0)/60).toFixed(0)}u</div>
              <div className="sd">€{teGenereren.reduce((s,kd)=>s+parseFloat(kd.vaste_prijs||0),0).toLocaleString('nl-NL',{maximumFractionDigits:0})}</div>
            </div>
          </div>
        </div>
      </div>

      {/* VOORBEELD */}
      {voorbeeld && <Voorbeeld voorbeeld={voorbeeld} medewerkers={medewerkers} doeljaar={doeljaar} doelweek={doelweek} instelling={instelling} />}

      {/* TE GENEREREN LIJST */}
      {!voorbeeld && teGenereren.length > 0 && (
        <div className="card">
          <div className="ch">
            <div className="ct">Klanten in week {doelweek} — preview</div>
            <div style={{fontSize:11, color:'var(--gray-400)'}}>Met hun ingestelde voorkeuren</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Klant</th><th>Dienst</th><th>Postcode</th><th>Voorkeursdag</th><th>Vaste medewerker</th><th>Tijd</th>
              </tr>
            </thead>
            <tbody>
              {teGenereren.map(kd => {
                const med = medewerkers.find(m => m.id === kd.voorkeur_medewerker_id)
                return (
                  <tr key={kd.id}>
                    <td className="tm">{kd.klant?.naam || '—'}</td>
                    <td>{kd.dienst?.naam || '—'}</td>
                    <td style={{fontFamily:'DM Mono, monospace', fontSize:11}}>{kd.klant?.postcode_cijfers || kd.klant?.regio || '—'}</td>
                    <td>{kd.voorkeur_dag ? <span className="pl plb">{kd.voorkeur_dag}</span> : <span style={{color:'var(--gray-400)'}}>—</span>}</td>
                    <td>{med ? <span className="pl pla">{med.naam.split(' ')[0]}</span> : <span style={{color:'var(--gray-400)'}}>—</span>}</td>
                    <td style={{fontFamily:'DM Mono, monospace'}}>{kd.geplande_minuten}m</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{marginTop:14, padding:14, background:'var(--brand-50)', borderRadius:9, fontSize:11.5, color:'var(--brand)'}}>
        💡 <strong>Hoe het werkt:</strong> Klik op "Toon voorbeeld" om te zien hoe het systeem de week gaat invullen. 
        Als de planning klopt, klik je op "Bevestig & opslaan" om de taken aan te maken. 
        Daarna kun je in de Planning-pagina nog handmatig aanpassen indien nodig.
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// SLIMME PLANNING ALGORITME
// ═══════════════════════════════════════════════════════════
function doSmartPlanning(klantDiensten, medewerkers, jaar, week, feestdagen, historischeVoorkeur, zaterdagToegestaan = false) {
  // Stap 1: Bepaal beschikbare werkdagen (ma-vr, eventueel zaterdag, geen feestdagen)
  const basisDagen = zaterdagToegestaan 
    ? [...DAGEN_WERKDAGEN, ZATERDAG]
    : DAGEN_WERKDAGEN
  const werkdagen = basisDagen.filter(d => !isFeestdag(jaar, week, d.key, feestdagen))
  const geblokkeerdeDagen = basisDagen.filter(d => isFeestdag(jaar, week, d.key, feestdagen))
    .map(d => ({...d, feest: isFeestdag(jaar, week, d.key, feestdagen)}))
  
  // Stap 2: Verzamel medewerker-belasting
  const belasting = {}
  medewerkers.forEach(m => {
    belasting[m.id] = {}
    werkdagen.forEach(d => {
      belasting[m.id][d.key] = 0
    })
  })

  // Stap 3: Sorteer klant-diensten op prioriteit
  // Verplichte voorkeuren eerst
  const sorted = [...klantDiensten].sort((a, b) => {
    const aHard = a.voorkeur_hardheid === 'verplicht' ? 1 : 0
    const bHard = b.voorkeur_hardheid === 'verplicht' ? 1 : 0
    if (aHard !== bHard) return bHard - aHard
    // Dan op postcode (zelfde postcode bij elkaar voor clustering)
    return (a.klant?.postcode_cijfers || 'zzzz').localeCompare(b.klant?.postcode_cijfers || 'zzzz')
  })

  // Stap 4: Verdeel
  const taken = []
  const onmogelijk = []  // taken die niet ingepland konden worden
  
  sorted.forEach(kd => {
    // Bepaal beste medewerker volgens voorkeursvolgorde
    let medewerker_id = null
    
    // 1. Verplichte vaste medewerker
    if (kd.voorkeur_medewerker_id && kd.voorkeur_hardheid === 'verplicht') {
      medewerker_id = kd.voorkeur_medewerker_id
    }
    // 2. Liefst-voorkeur medewerker
    else if (kd.voorkeur_medewerker_id) {
      medewerker_id = kd.voorkeur_medewerker_id
    }
    // 3. Historische voorkeur
    else if (historischeVoorkeur[kd.id]) {
      medewerker_id = historischeVoorkeur[kd.id]
    }
    // 4. Geografisch — postcode-cluster
    else {
      // Vind welke medewerker al taken heeft in dezelfde postcode
      const eigenPostcode = kd.klant?.postcode_cijfers
      if (eigenPostcode) {
        const clusterMed = taken.find(t => t.postcode === eigenPostcode)
        if (clusterMed) medewerker_id = clusterMed.medewerker_id
      }
    }
    // 5. Op basis van PRIORITEIT — laagste prioriteit-getal eerst (1 = primair)
    // Met ruimte-check: lagere prioriteit pas aan de beurt als hogere prioriteit vol zit
    if (!medewerker_id) {
      const maxPerWeek = 40 * 60  // 40 uur in minuten
      
      // Sorteer medewerkers op prioriteit (laagste getal = hoogste prio)
      const gesorteerd = [...medewerkers].sort((a, b) => {
        const pa = a.prioriteit ?? 5
        const pb = b.prioriteit ?? 5
        if (pa !== pb) return pa - pb
        // Bij gelijke prio: minst belast eerst
        const ta = Object.values(belasting[a.id]).reduce((s,v) => s+v, 0)
        const tb = Object.values(belasting[b.id]).reduce((s,v) => s+v, 0)
        return ta - tb
      })
      
      // Loop door gesorteerde lijst — eerste die nog ruimte heeft krijgt de klus
      for (const med of gesorteerd) {
        const totaal = Object.values(belasting[med.id]).reduce((s,v) => s+v, 0)
        if (totaal + (kd.geplande_minuten || 0) <= maxPerWeek) {
          medewerker_id = med.id
          break
        }
      }
      
      // Als helemaal niemand ruimte heeft: minst belaste sowieso
      if (!medewerker_id) {
        medewerker_id = gesorteerd[0]?.id
      }
    }
    
    if (!medewerker_id) {
      onmogelijk.push({...kd, reden: 'Geen medewerker beschikbaar'})
      return
    }

    // Bepaal beste dag voor deze medewerker
    let dagKey = null
    
    // 1. Verplichte voorkeursdag
    if (kd.voorkeur_dag) {
      const dag = werkdagen.find(d => d.naam === kd.voorkeur_dag)
      if (dag) dagKey = dag.key
      else if (kd.voorkeur_hardheid === 'verplicht') {
        onmogelijk.push({...kd, reden: `Voorkeursdag ${kd.voorkeur_dag} is feestdag`})
        return
      }
    }
    
    // 2. Anders: minst belaste dag voor deze medewerker, voorrang aan dagen waar al iemand uit zelfde postcode zit
    if (!dagKey) {
      const eigenPostcode = kd.klant?.postcode_cijfers
      
      // Eerst alleen ma-vr proberen (zaterdag uitsluiten als overflow)
      const wekendagen = werkdagen.filter(d => d.key !== 6)
      const zaterdagen = werkdagen.filter(d => d.key === 6)
      
      function vindBesteDag(dagenLijst) {
        const opties = dagenLijst.map(d => {
          const taakInDag = taken.find(t => 
            t.medewerker_id === medewerker_id && 
            t.dag === d.key && 
            t.postcode === eigenPostcode
          )
          return { dag: d, heeftCluster: !!taakInDag, belasting: belasting[medewerker_id][d.key] }
        })
        .filter(x => x.belasting + (kd.geplande_minuten || 0) <= 480)
        .sort((a, b) => {
          if (a.heeftCluster !== b.heeftCluster) return b.heeftCluster - a.heeftCluster
          return a.belasting - b.belasting
        })
        return opties[0]?.dag.key || null
      }
      
      // Probeer eerst werkdagen ma-vr
      dagKey = vindBesteDag(wekendagen)
      
      // Als dat niet lukt: probeer een andere medewerker met ma-vr
      if (!dagKey) {
        let beste = { mid: null, dag: null, total: Infinity }
        medewerkers.forEach(m => {
          wekendagen.forEach(d => {
            const t = belasting[m.id][d.key]
            if (t + (kd.geplande_minuten || 0) <= 480 && t < beste.total) {
              beste = { mid: m.id, dag: d.key, total: t }
            }
          })
        })
        if (beste.mid) {
          medewerker_id = beste.mid
          dagKey = beste.dag
        }
      }
      
      // Pas als laatste resort: zaterdag (alleen als toegestaan)
      if (!dagKey && zaterdagen.length > 0) {
        dagKey = vindBesteDag(zaterdagen)
        if (!dagKey) {
          // Andere medewerker op zaterdag
          let beste = { mid: null, dag: null, total: Infinity }
          medewerkers.forEach(m => {
            zaterdagen.forEach(d => {
              const t = belasting[m.id][d.key]
              if (t + (kd.geplande_minuten || 0) <= 480 && t < beste.total) {
                beste = { mid: m.id, dag: d.key, total: t }
              }
            })
          })
          if (beste.mid) {
            medewerker_id = beste.mid
            dagKey = beste.dag
          }
        }
      }
    }
    
    if (!dagKey) {
      onmogelijk.push({...kd, reden: 'Geen capaciteit beschikbaar (alle dagen vol)'})
      return
    }

    // Bepaal tijdstart op basis van dagdeel-voorkeur
    const cumulatief = belasting[medewerker_id][dagKey]
    let baseStart = 8 * 60  // 8:00 default
    if (kd.voorkeur_dagdeel === 'ochtend') baseStart = 8 * 60
    else if (kd.voorkeur_dagdeel === 'middag') baseStart = 13 * 60
    else if (kd.voorkeur_dagdeel === 'avond') baseStart = 18 * 60
    
    // Tijd start = base + wat er al gepland is
    const startMin = baseStart + cumulatief
    const h = Math.floor(startMin / 60)
    const m = startMin % 60
    const tijd_start = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
    
    // Update belasting
    belasting[medewerker_id][dagKey] += (kd.geplande_minuten || 0)
    
    const datum = datumVoorDag(jaar, week, dagKey)
    
    taken.push({
      kd_id: kd.id,
      klant_id: kd.klant.id,
      dienst_id: kd.dienst.id,
      medewerker_id,
      dag: dagKey,
      datum: datum.toISOString().slice(0, 10),
      tijd_start,
      minuten: kd.geplande_minuten || 60,
      prijs: kd.vaste_prijs || 0,
      bijzondere_instructie: kd.bijzondere_instructie || null,
      klant_naam: kd.klant.naam,
      klant_adres: kd.klant.adres,
      lat: kd.klant.latitude,
      lon: kd.klant.longitude,
      postcode: kd.klant.postcode_cijfers,
      regio: kd.klant.regio,
      dienst_naam: kd.dienst.naam,
      voorkeur_dag: kd.voorkeur_dag,
      voorkeur_dagdeel: kd.voorkeur_dagdeel,
      voorkeur_medewerker_id: kd.voorkeur_medewerker_id,
      hardheid: kd.voorkeur_hardheid,
      route_volgorde: 0,  // wordt later gezet
    })
  })
  
  // Stap 5: Per medewerker per dag → eerste sortering op postcode
  // (echte OSRM route-optimalisatie gebeurt later async via optimaliseerVolgordes)
  const groepen = {}
  taken.forEach(t => {
    const key = `${t.medewerker_id}_${t.dag}`
    if (!groepen[key]) groepen[key] = []
    groepen[key].push(t)
  })
  Object.values(groepen).forEach(items => {
    items.sort((a, b) => (a.postcode || 'zzzz').localeCompare(b.postcode || 'zzzz'))
    items.forEach((t, idx) => { t.route_volgorde = idx })
    hertelStartTijden(items)
  })

  return { taken, onmogelijk, geblokkeerdeDagen, belasting }
}

// Hulpmethode: tijd-start opnieuw berekenen op basis van volgorde
function hertelStartTijden(items) {
  let cursor = null
  items.forEach(t => {
    let startMin = 8 * 60
    if (t.voorkeur_dagdeel === 'middag') startMin = 13 * 60
    else if (t.voorkeur_dagdeel === 'avond') startMin = 18 * 60
    
    if (cursor !== null && cursor > startMin) startMin = cursor
    
    const h = Math.floor(startMin / 60)
    const m = startMin % 60
    t.tijd_start = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`
    cursor = startMin + t.minuten + 15  // 15 min reistijd inschatting
  })
}

/**
 * Async route-optimalisatie: per medewerker per dag de volgorde optimaliseren via OSRM
 * Gebruikt nearest-neighbor + 2-opt vanaf het bedrijfspunt
 */
async function optimaliseerVolgordes(voorbeeld, bedrijfStart, onProgress) {
  const { taken } = voorbeeld
  
  // Importeer OSRM functie
  const { optimaliseerRoute } = await import('../lib/routing')
  
  // Groepeer per medewerker per dag
  const groepen = {}
  taken.forEach(t => {
    const key = `${t.medewerker_id}_${t.dag}`
    if (!groepen[key]) groepen[key] = []
    groepen[key].push(t)
  })
  
  const groupKeys = Object.keys(groepen)
  let huidig = 0
  
  for (const key of groupKeys) {
    huidig++
    const items = groepen[key]
    if (items.length < 2) continue
    
    // Filter alleen taken met coördinaten
    const metCoords = items.filter(t => t.lat && t.lon)
    const zonderCoords = items.filter(t => !t.lat || !t.lon)
    
    if (metCoords.length < 2) continue
    
    if (onProgress) onProgress({ huidig, totaal: groupKeys.length })
    
    try {
      const bezoeken = metCoords.map(t => ({
        id: t.kd_id,
        lat: t.lat,
        lon: t.lon
      }))
      
      const result = await optimaliseerRoute(bedrijfStart, bezoeken, true)
      
      if (result && result.volgorde && !result.error) {
        // Reorder taken volgens result.volgorde
        const lookup = new Map(metCoords.map(t => [t.kd_id, t]))
        const nieuweVolgorde = result.volgorde
          .map(b => lookup.get(b.id))
          .filter(Boolean)
        
        // Plaats taken zonder coördinaten achteraan
        const finaleVolgorde = [...nieuweVolgorde, ...zonderCoords]
        
        // Update route_volgorde en tijd_start in originele items array
        finaleVolgorde.forEach((t, idx) => { t.route_volgorde = idx })
        hertelStartTijden(finaleVolgorde)
        
        // Vervang in items
        items.length = 0
        items.push(...finaleVolgorde)
      }
    } catch (e) {
      console.warn('Route optimalisatie mislukt voor', key, e)
    }
  }
  
  return voorbeeld
}

// VOORBEELD COMPONENT
function Voorbeeld({ voorbeeld, medewerkers, doeljaar, doelweek, instelling }) {
  const { taken, onmogelijk, geblokkeerdeDagen, belasting } = voorbeeld
  
  const bedrijfStart = {
    lat: instelling?.bedrijf_latitude || 51.3680,
    lon: instelling?.bedrijf_longitude || 5.2150,
    naam: instelling?.bedrijfsnaam || 'Sparidaens BV'
  }
  
  // Groepeer per medewerker per dag (per dag: route_volgorde sortering)
  const groepen = {}
  medewerkers.forEach(m => {
    groepen[m.id] = {}
    DAGEN.forEach(d => { groepen[m.id][d.key] = [] })
  })
  taken.forEach(t => {
    if (!groepen[t.medewerker_id]) groepen[t.medewerker_id] = {}
    if (!groepen[t.medewerker_id][t.dag]) groepen[t.medewerker_id][t.dag] = []
    groepen[t.medewerker_id][t.dag].push(t)
  })
  // Sorteer elke dag op route_volgorde
  Object.keys(groepen).forEach(medId => {
    Object.keys(groepen[medId]).forEach(dagKey => {
      groepen[medId][dagKey].sort((a, b) => (a.route_volgorde || 0) - (b.route_volgorde || 0))
    })
  })

  return (
    <div>
      {/* Onmogelijke taken waarschuwing */}
      {onmogelijk.length > 0 && (
        <div className="card" style={{marginBottom:14, borderColor:'var(--red)'}}>
          <div className="ch" style={{background:'var(--red-50)'}}>
            <div className="ct" style={{color:'var(--red)'}}>⚠️ {onmogelijk.length} taken konden niet ingepland worden</div>
          </div>
          <div className="cb">
            {onmogelijk.map((kd, i) => (
              <div key={i} style={{padding:'8px 10px', fontSize:12, borderBottom: i < onmogelijk.length-1 ? '1px solid var(--gray-100)' : 'none'}}>
                <strong>{kd.klant?.naam}</strong> — {kd.dienst?.naam}: <span style={{color:'var(--red)'}}>{kd.reden}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feestdagen */}
      {geblokkeerdeDagen.length > 0 && (
        <div style={{padding:'10px 14px', background:'#fef2f2', borderRadius:7, marginBottom:14, fontSize:12, color:'#991b1b'}}>
          🎉 <strong>Feestdagen deze week:</strong> {geblokkeerdeDagen.map(d => `${d.label} = ${d.feest.naam}`).join(', ')}
        </div>
      )}

      {/* Per medewerker een sectie met daarin per dag een kaart */}
      {medewerkers.map(m => {
        const dagenMetTaken = DAGEN.filter(d => (groepen[m.id]?.[d.key] || []).length > 0)
        if (dagenMetTaken.length === 0) return null
        
        const totaalMin = DAGEN.reduce((s, d) => s + (belasting[m.id]?.[d.key] || 0), 0)
        const aantalTaken = DAGEN.reduce((s, d) => s + (groepen[m.id]?.[d.key]?.length || 0), 0)
        const initials = m.naam.split(' ').map(n => n[0]).slice(0,2).join('')
        
        return (
          <div key={m.id} style={{marginBottom:18}}>
            {/* Medewerker header */}
            <div style={{
              display:'flex', alignItems:'center', gap:12,
              padding:'10px 14px',
              background:m.kleur,
              color:'white',
              borderRadius:'9px 9px 0 0',
              fontWeight:700,
            }}>
              <div className="av av-blue" style={{
                background:'rgba(255,255,255,.25)', 
                width:32, height:32, fontSize:12,
                border:'2px solid rgba(255,255,255,.5)'
              }}>{initials}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14}}>{m.naam}</div>
                <div style={{fontSize:11, opacity:.85}}>
                  {aantalTaken} klussen · {(totaalMin/60).toFixed(1)}u over {dagenMetTaken.length} {dagenMetTaken.length === 1 ? 'dag' : 'dagen'}
                </div>
              </div>
            </div>
            
            {/* Per dag een card met kaart en lijst */}
            {dagenMetTaken.map((d, dIdx) => {
              const dagTaken = groepen[m.id]?.[d.key] || []
              const datum = datumVoorDag(doeljaar, doelweek, d.key)
              const dagMin = belasting[m.id]?.[d.key] || 0
              const isFeest = geblokkeerdeDagen.find(g => g.key === d.key)
              const isLast = dIdx === dagenMetTaken.length - 1
              
              // Stops voor de kaart
              const stops = dagTaken.map(t => ({
                id: t.kd_id,
                lat: t.lat,
                lon: t.lon,
                naam: t.klant_naam,
                adres: t.klant_adres,
                postcode: t.postcode,
                tijd_start: t.tijd_start,
                dienst_naam: t.dienst_naam,
                bijzondere_instructie: t.bijzondere_instructie,
              }))
              const stopsMetCoords = stops.filter(s => s.lat && s.lon)
              
              return (
                <div key={d.key} style={{
                  background:'white',
                  border:'1px solid var(--gray-200)',
                  borderTop:'none',
                  borderRadius: isLast ? '0 0 9px 9px' : '0',
                }}>
                  {/* Dag header */}
                  <div style={{
                    padding:'10px 14px',
                    background: isFeest ? '#fef2f2' : 'var(--gray-50)',
                    borderBottom:'1px solid var(--gray-200)',
                    display:'flex', alignItems:'center', gap:10,
                  }}>
                    <div style={{
                      background: isFeest ? 'var(--red)' : m.kleur,
                      color:'white',
                      padding:'4px 10px',
                      borderRadius:5,
                      fontSize:11,
                      fontWeight:700,
                      minWidth:50,
                      textAlign:'center'
                    }}>{d.label}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13, fontWeight:700}}>
                        {d.naam.charAt(0).toUpperCase() + d.naam.slice(1)} {datum.getDate()} {['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'][datum.getMonth()]}
                        {isFeest && <span style={{marginLeft:8, color:'var(--red)', fontSize:11}}>🎉 {isFeest.feest.naam}</span>}
                      </div>
                      <div style={{fontSize:11, color:'var(--gray-500)'}}>
                        {dagTaken.length} {dagTaken.length === 1 ? 'klus' : 'klussen'} · {(dagMin/60).toFixed(1)}u
                        {stopsMetCoords.length < dagTaken.length && (
                          <span style={{color:'var(--orange)'}}>
                            {' '}· {dagTaken.length - stopsMetCoords.length} zonder coördinaten
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:0}}>
                    {/* Linker kant: lijst met stops */}
                    <div style={{padding:'10px 14px', borderRight:'1px solid var(--gray-100)'}}>
                      <div style={{fontSize:10, fontWeight:700, color:'var(--gray-500)', textTransform:'uppercase', letterSpacing:.5, marginBottom:8}}>
                        Volgorde
                      </div>
                      <div style={{display:'flex', flexDirection:'column', gap:6}}>
                        {dagTaken.map((t, i) => (
                          <div key={t.kd_id} style={{
                            display:'flex', alignItems:'flex-start', gap:8,
                            padding:'6px 8px',
                            background:'var(--gray-50)', borderRadius:5,
                            borderLeft:`3px solid ${m.kleur}`
                          }}>
                            <div style={{
                              minWidth:22, height:22, borderRadius:'50%',
                              background:m.kleur, color:'white',
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:10, fontWeight:800
                            }}>{i + 1}</div>
                            <div style={{flex:1, minWidth:0}}>
                              <div style={{fontSize:11.5, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                {t.klant_naam}
                              </div>
                              <div style={{fontSize:10.5, color:'var(--gray-500)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                {t.dienst_naam} · {t.minuten}m
                              </div>
                              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:2, fontSize:10}}>
                                <span style={{fontFamily:'DM Mono, monospace', color:'var(--brand)', fontWeight:700}}>
                                  ⏱️ {t.tijd_start?.slice(0,5)}
                                </span>
                                {t.postcode && (
                                  <span style={{fontFamily:'DM Mono, monospace', color:'var(--gray-500)'}}>
                                    📍 {t.postcode}
                                  </span>
                                )}
                                {(!t.lat || !t.lon) && (
                                  <span style={{color:'var(--orange)'}} title="Geen coördinaten beschikbaar">⚠️</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Rechter kant: kaart */}
                    <div style={{padding:10}}>
                      {stopsMetCoords.length > 0 ? (
                        <RouteKaart 
                          stops={stops}
                          medewerkerKleur={m.kleur}
                          bedrijfStart={bedrijfStart}
                          showRoute={true}
                          hoogte={Math.max(180, Math.min(280, 80 + dagTaken.length * 30))}
                        />
                      ) : (
                        <div style={{
                          height:180, display:'flex', alignItems:'center', justifyContent:'center',
                          background:'var(--gray-50)', borderRadius:7,
                          border:'1px dashed var(--gray-300)',
                          fontSize:11.5, color:'var(--gray-400)', textAlign:'center', padding:20
                        }}>
                          ⚠️ Klanten hebben nog geen coördinaten
                          <br/>
                          <span style={{fontSize:10, marginTop:4}}>Draai eerst geocoding op Geocoding pagina</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
