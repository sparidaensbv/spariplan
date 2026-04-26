import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AutoPlanning() {
  const [klantDiensten, setKlantDiensten] = useState([])
  const [bestaande, setBestaande] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [genereren, setGenereren] = useState(false)
  const [resultaat, setResultaat] = useState(null)
  const [doelweek, setDoelweek] = useState(getWeeknummer(new Date()) + 2)
  const [doeljaar, setDoeljaar] = useState(2026)

  useEffect(() => {
    async function load() {
      const [kdRes, takenRes, medRes] = await Promise.all([
        supabase.from('klant_diensten').select(`
          id, weeknummers, vaste_prijs, geplande_minuten, bijzondere_instructie,
          klant:klanten(id, naam, regio, adres),
          dienst:diensten(id, naam)
        `),
        supabase.from('taken').select('klant_id, dienst_id, jaar, weeknummer'),
        supabase.from('medewerkers').select('*').eq('actief', true).order('naam')
      ])
      setKlantDiensten(kdRes.data || [])
      setBestaande(takenRes.data || [])
      setMedewerkers(medRes.data || [])
      setLoading(false)
    }
    load()
  }, [])

  // Welke klant_diensten zijn relevant voor doelweek?
  const teGeneren = klantDiensten.filter(kd => 
    kd.weeknummers && kd.weeknummers.includes(doelweek)
  )

  // Filter al bestaande taken eruit
  const nogTeGeneren = teGeneren.filter(kd => {
    return !bestaande.some(t => 
      t.klant_id === kd.klant?.id && 
      t.dienst_id === kd.dienst?.id && 
      t.jaar === doeljaar && 
      t.weeknummer === doelweek
    )
  })

  async function genereerWeek() {
    if (nogTeGeneren.length === 0) {
      setResultaat({type: 'info', tekst: 'Alle taken voor deze week bestaan al'})
      return
    }
    setGenereren(true)
    setResultaat(null)
    
    // Geografische verdeling: simpel cluster algoritme
    const regioToMedewerker = bepaalRegioVerdeling(nogTeGeneren, medewerkers)
    
    const taken = nogTeGeneren.map(kd => {
      const regio = (kd.klant?.regio || '').toLowerCase()
      const medewerker_id = regioToMedewerker[regio] || medewerkers[0]?.id
      return {
        klant_dienst_id: kd.id,
        klant_id: kd.klant.id,
        dienst_id: kd.dienst.id,
        medewerker_id: medewerker_id,
        jaar: doeljaar,
        weeknummer: doelweek,
        geplande_minuten: kd.geplande_minuten,
        vaste_prijs: kd.vaste_prijs,
        status: 'concept',
        bijzondere_instructie: kd.bijzondere_instructie,
      }
    })
    
    const { data, error } = await supabase.from('taken').insert(taken).select()
    
    if (error) {
      setResultaat({type: 'error', tekst: 'Fout: ' + error.message})
    } else {
      setResultaat({type: 'success', tekst: `${data.length} concept-taken aangemaakt voor week ${doelweek}`})
      // Reload bestaande taken
      const { data: nieuw } = await supabase.from('taken').select('klant_id, dienst_id, jaar, weeknummer')
      setBestaande(nieuw || [])
    }
    setGenereren(false)
  }

  if (loading) return <div className="loading">Laden…</div>

  return (
    <div>
      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div className="ct">🤖 Auto-planning generator</div>
          <div style={{fontSize:11, color:'var(--gray-400)'}}>Genereert concept-taken op basis van vaste weeknummers per klant</div>
        </div>
        <div className="cb">
          <div style={{display:'flex', gap:14, alignItems:'flex-end', marginBottom:14, flexWrap:'wrap'}}>
            <div style={{flex:'0 0 auto'}}>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:'var(--gray-600)', marginBottom:5, textTransform:'uppercase', letterSpacing:.5}}>Jaar</label>
              <input type="number" className="fi" value={doeljaar} onChange={e => setDoeljaar(parseInt(e.target.value))} style={{width:100}} />
            </div>
            <div style={{flex:'0 0 auto'}}>
              <label style={{display:'block', fontSize:11, fontWeight:700, color:'var(--gray-600)', marginBottom:5, textTransform:'uppercase', letterSpacing:.5}}>Week</label>
              <input type="number" min="1" max="52" className="fi" value={doelweek} onChange={e => setDoelweek(parseInt(e.target.value))} style={{width:100}} />
            </div>
            <div style={{flex:1}}></div>
            <button className="btn bp" onClick={genereerWeek} disabled={genereren || nogTeGeneren.length === 0}>
              {genereren ? 'Bezig…' : `🚀 Genereer ${nogTeGeneren.length} taken voor week ${doelweek}`}
            </button>
          </div>

          {resultaat && (
            <div style={{
              padding:'10px 14px', borderRadius:7, fontSize:12.5, fontWeight:600,
              background: resultaat.type === 'success' ? 'var(--green-50)' : resultaat.type === 'error' ? 'var(--red-50)' : 'var(--brand-50)',
              color: resultaat.type === 'success' ? 'var(--green)' : resultaat.type === 'error' ? 'var(--red)' : 'var(--brand)',
              marginBottom:14
            }}>
              {resultaat.type === 'success' ? '✓' : resultaat.type === 'error' ? '✗' : 'ℹ️'} {resultaat.tekst}
            </div>
          )}

          <div className="sg s4">
            <div className="stat sb1">
              <div className="sl">Klanten in week {doelweek}</div>
              <div className="sv">{teGeneren.length}</div>
              <div className="sd">Op basis van weeknummers</div>
            </div>
            <div className="stat sg1">
              <div className="sl">Al gepland</div>
              <div className="sv">{teGeneren.length - nogTeGeneren.length}</div>
              <div className="sd">Reeds aangemaakt</div>
            </div>
            <div className="stat sa1">
              <div className="sl">Te genereren</div>
              <div className="sv">{nogTeGeneren.length}</div>
              <div className="sd">Klaar voor de planning</div>
            </div>
            <div className="stat sr1">
              <div className="sl">Verwachte omzet</div>
              <div className="sv">€{nogTeGeneren.reduce((s,kd)=>s+parseFloat(kd.vaste_prijs||0),0).toLocaleString('nl-NL',{maximumFractionDigits:0})}</div>
              <div className="sd">{(nogTeGeneren.reduce((s,kd)=>s+(kd.geplande_minuten||0),0)/60).toFixed(0)} uur werk</div>
            </div>
          </div>
        </div>
      </div>

      {nogTeGeneren.length > 0 && (
        <div className="card">
          <div className="ch">
            <div className="ct">Klanten in week {doelweek} — preview</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Klant</th><th>Dienst</th><th>Regio</th><th>Tijd</th><th>Prijs</th><th>Bijzonderheid</th>
              </tr>
            </thead>
            <tbody>
              {nogTeGeneren.map(kd => (
                <tr key={kd.id}>
                  <td className="tm">{kd.klant?.naam || '—'}</td>
                  <td>{kd.dienst?.naam || '—'}</td>
                  <td>{kd.klant?.regio || '—'}</td>
                  <td style={{fontFamily:'DM Mono, monospace'}}>
                    {kd.geplande_minuten >= 60
                      ? `${Math.floor(kd.geplande_minuten/60)}u ${kd.geplande_minuten%60 ? (kd.geplande_minuten%60)+'m' : ''}`.trim()
                      : `${kd.geplande_minuten}m`}
                  </td>
                  <td style={{fontFamily:'DM Mono, monospace', fontWeight:600}}>€{parseFloat(kd.vaste_prijs || 0).toFixed(2)}</td>
                  <td style={{fontSize:11, color:'var(--orange)', maxWidth:250, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}
                      title={kd.bijzondere_instructie || ''}>
                    {kd.bijzondere_instructie || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function bepaalRegioVerdeling(klantDiensten, medewerkers) {
  // Geografische verdeling: meest voorkomende regio per medewerker
  // Simpel: rondrekenen op basis van regio
  const regios = {}
  klantDiensten.forEach(kd => {
    const r = (kd.klant?.regio || '').toLowerCase()
    if (!r) return
    regios[r] = (regios[r] || 0) + 1
  })
  
  // Verdeel regio's evenredig over medewerkers
  const verdeling = {}
  const regioLijst = Object.keys(regios).sort((a,b) => regios[b] - regios[a])
  regioLijst.forEach((regio, i) => {
    const med = medewerkers[i % medewerkers.length]
    verdeling[regio] = med?.id
  })
  return verdeling
}

function getWeeknummer(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}
