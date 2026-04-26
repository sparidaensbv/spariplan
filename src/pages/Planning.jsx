import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function Planning() {
  const [taken, setTaken] = useState([])
  const [medewerkers, setMedewerkers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedWeek, setSelectedWeek] = useState(null)

  useEffect(() => {
    async function load() {
      const [takenRes, medewerkersRes] = await Promise.all([
        supabase.from('taken').select(`
          id, jaar, weeknummer, geplande_minuten, vaste_prijs, status, bijzondere_instructie, medewerker_id,
          klant:klanten(naam, regio, adres),
          dienst:diensten(naam),
          medewerker:medewerkers(naam, kleur)
        `).order('weeknummer'),
        supabase.from('medewerkers').select('*').eq('actief', true).order('naam')
      ])
      setTaken(takenRes.data || [])
      setMedewerkers(medewerkersRes.data || [])
      if (takenRes.data && takenRes.data.length > 0) {
        const eersteWeek = takenRes.data[0]
        setSelectedWeek(`${eersteWeek.jaar}-${eersteWeek.weeknummer}`)
      }
      setLoading(false)
    }
    load()
  }, [])

  const weken = useMemo(() => {
    const set = new Set(taken.map(t => `${t.jaar}-${t.weeknummer}`))
    return Array.from(set).sort()
  }, [taken])

  const takenInWeek = useMemo(() => {
    if (!selectedWeek) return []
    const [jaar, week] = selectedWeek.split('-').map(Number)
    return taken.filter(t => t.jaar === jaar && t.weeknummer === week)
  }, [taken, selectedWeek])

  // Per medewerker
  const perMedewerker = useMemo(() => {
    const map = {}
    medewerkers.forEach(m => {
      map[m.id] = { medewerker: m, taken: [], minuten: 0, omzet: 0 }
    })
    map['unassigned'] = { medewerker: null, taken: [], minuten: 0, omzet: 0 }
    takenInWeek.forEach(t => {
      const key = t.medewerker_id || 'unassigned'
      if (!map[key]) map[key] = { medewerker: t.medewerker, taken: [], minuten: 0, omzet: 0 }
      map[key].taken.push(t)
      map[key].minuten += t.geplande_minuten || 0
      map[key].omzet += parseFloat(t.vaste_prijs || 0)
    })
    return Object.values(map)
  }, [takenInWeek, medewerkers])

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

  const totaalKlussen = takenInWeek.length
  const totaalUren = takenInWeek.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60
  const totaalOmzet = takenInWeek.reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)

  return (
    <div>
      <div className="sr-row">
        {weken.map(w => {
          const [jaar, week] = w.split('-')
          const aantal = taken.filter(t => `${t.jaar}-${t.weeknummer}` === w).length
          return (
            <button
              key={w}
              className={'btn ' + (selectedWeek===w?'bp':'bg') + ' bsm'}
              onClick={() => setSelectedWeek(w)}>
              Wk {week} · {jaar} ({aantal})
            </button>
          )
        })}
      </div>

      <div className="sg s4" style={{marginBottom:14}}>
        <div className="stat sb1">
          <div className="sl">Totaal klussen</div>
          <div className="sv">{totaalKlussen}</div>
          <div className="sd">in deze week</div>
        </div>
        <div className="stat sa1">
          <div className="sl">Geplande uren</div>
          <div className="sv">{totaalUren.toFixed(1)}u</div>
          <div className="sd">{(totaalUren/120*100).toFixed(0)}% van capaciteit</div>
        </div>
        <div className="stat sg1">
          <div className="sl">Prognose omzet</div>
          <div className="sv">€{totaalOmzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}</div>
          <div className="sd">vaste prijzen</div>
        </div>
        <div className="stat sr1">
          <div className="sl">Niet toegewezen</div>
          <div className="sv">{takenInWeek.filter(t => !t.medewerker_id).length}</div>
          <div className="sd">nog te verdelen</div>
        </div>
      </div>

      {perMedewerker.map(({medewerker, taken: medTaken, minuten, omzet}) => {
        if (!medewerker && medTaken.length === 0) return null
        const isUnassigned = !medewerker
        return (
          <div key={medewerker?.id || 'unassigned'} className="card" style={{marginBottom:12}}>
            <div className="ch">
              <div style={{display:'flex', alignItems:'center', gap:10}}>
                <div className="av av-blue" style={{background: medewerker?.kleur || 'var(--gray-400)'}}>
                  {isUnassigned ? '?' : medewerker.naam.split(' ').map(n => n[0]).slice(0,2).join('')}
                </div>
                <div>
                  <div className="ct">{medewerker?.naam || 'Niet toegewezen'}</div>
                  <div style={{fontSize:11, color:'var(--gray-400)'}}>
                    {medTaken.length} {medTaken.length === 1 ? 'klus' : 'klussen'} · {(minuten/60).toFixed(1)}u · €{omzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}
                  </div>
                </div>
              </div>
              <div style={{display:'flex', gap:6, alignItems:'center'}}>
                <div style={{width:120, height:6, background:'var(--gray-100)', borderRadius:3, overflow:'hidden'}}>
                  <div style={{width:`${Math.min((minuten/60)/40*100, 100)}%`, height:'100%', background: medewerker?.kleur || 'var(--gray-400)'}}></div>
                </div>
                <span style={{fontSize:11, color:'var(--gray-500)'}}>
                  {((minuten/60)/40*100).toFixed(0)}% van 40u
                </span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Klant</th><th>Dienst</th><th>Regio</th><th>Tijd</th><th>Prijs</th><th>Status</th><th>Bijzonderheid</th>
                </tr>
              </thead>
              <tbody>
                {medTaken.map(t => (
                  <tr key={t.id}>
                    <td className="tm">{t.klant?.naam || '—'}</td>
                    <td>{t.dienst?.naam || '—'}</td>
                    <td>{t.klant?.regio || '—'}</td>
                    <td style={{fontFamily:'DM Mono, monospace'}}>
                      {t.geplande_minuten >= 60
                        ? `${Math.floor(t.geplande_minuten/60)}u ${t.geplande_minuten%60 ? (t.geplande_minuten%60)+'m' : ''}`.trim()
                        : `${t.geplande_minuten}m`}
                    </td>
                    <td style={{fontFamily:'DM Mono, monospace', fontWeight:600}}>€{parseFloat(t.vaste_prijs || 0).toFixed(2)}</td>
                    <td>
                      <span className={'pl ' + (t.status==='concept'?'plp':t.status==='bevestigd'?'plb':t.status==='klaar'?'plg':'plgr')}>
                        {t.status}
                      </span>
                    </td>
                    <td style={{fontSize:11, color:'var(--orange)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}
                        title={t.bijzondere_instructie || ''}>
                      {t.bijzondere_instructie || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
