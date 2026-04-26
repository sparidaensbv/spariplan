import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

export default function Taken() {
  const [taken, setTaken] = useState([])
  const [loading, setLoading] = useState(true)
  const [weekFilter, setWeekFilter] = useState('alle')

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('taken')
        .select(`
          id, jaar, weeknummer, geplande_minuten, vaste_prijs, status, bijzondere_instructie,
          klant:klanten(naam, regio, adres),
          dienst:diensten(naam)
        `)
        .order('jaar')
        .order('weeknummer')
      if (!error) setTaken(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const weken = useMemo(() => {
    const set = new Set(taken.map(t => `${t.jaar}-${t.weeknummer}`))
    return Array.from(set).sort()
  }, [taken])

  const gefilterd = useMemo(() => {
    if (weekFilter === 'alle') return taken
    const [jaar, week] = weekFilter.split('-').map(Number)
    return taken.filter(t => t.jaar === jaar && t.weeknummer === week)
  }, [taken, weekFilter])

  if (loading) return <div className="loading">Taken laden…</div>

  return (
    <div>
      <div className="sr-row">
        <button className={'btn ' + (weekFilter==='alle'?'bp':'bg') + ' bsm'} onClick={() => setWeekFilter('alle')}>
          Alle ({taken.length})
        </button>
        {weken.map(w => {
          const [jaar, week] = w.split('-')
          const aantal = taken.filter(t => `${t.jaar}-${t.weeknummer}` === w).length
          return (
            <button
              key={w}
              className={'btn ' + (weekFilter===w?'bp':'bg') + ' bsm'}
              onClick={() => setWeekFilter(w)}>
              Week {week} ({aantal})
            </button>
          )
        })}
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Klant</th>
              <th>Dienst</th>
              <th>Regio</th>
              <th>Tijd</th>
              <th>Prijs</th>
              <th>Status</th>
              <th>Bijzonderheid</th>
            </tr>
          </thead>
          <tbody>
            {gefilterd.length === 0 ? (
              <tr><td colSpan={8} style={{textAlign:'center', padding:'30px', color:'var(--gray-400)'}}>Geen taken gevonden</td></tr>
            ) : (
              gefilterd.map(t => (
                <tr key={t.id}>
                  <td className="tm">Wk {t.weeknummer}</td>
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:12, fontSize:11, color:'var(--gray-400)', textAlign:'right'}}>
        {gefilterd.length} van {taken.length} taken
      </div>
    </div>
  )
}
