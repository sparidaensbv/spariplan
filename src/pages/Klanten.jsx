import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Klanten() {
  const navigate = useNavigate()
  const [klanten, setKlanten] = useState([])
  const [loading, setLoading] = useState(true)
  const [zoek, setZoek] = useState('')
  const [filter, setFilter] = useState('alle')
  const [regioFilter, setRegioFilter] = useState('alle')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('klanten').select('*').order('naam')
      setKlanten(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const regios = useMemo(() => {
    const set = new Set(klanten.map(k => k.regio).filter(r => r))
    return Array.from(set).sort()
  }, [klanten])

  const gefilterd = useMemo(() => {
    return klanten.filter(k => {
      if (filter === 'particulier' && k.type !== 'particulier') return false
      if (filter === 'zakelijk' && k.type !== 'zakelijk') return false
      if (regioFilter !== 'alle' && k.regio !== regioFilter) return false
      if (zoek) {
        const z = zoek.toLowerCase()
        return (k.naam || '').toLowerCase().includes(z) ||
               (k.adres || '').toLowerCase().includes(z) ||
               (k.regio || '').toLowerCase().includes(z) ||
               (k.klantnummer || '').includes(z)
      }
      return true
    })
  }, [klanten, zoek, filter, regioFilter])

  if (loading) return <div className="loading">Klanten laden…</div>

  return (
    <div>
      <div className="sr-row">
        <input
          className="si-inp"
          placeholder="🔍 Zoek op naam, adres, regio of klantnummer…"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
        />
      </div>
      <div className="sr-row" style={{flexWrap:'wrap'}}>
        <button className={'btn ' + (filter==='alle'?'bp':'bg') + ' bsm'} onClick={() => setFilter('alle')}>Alle ({klanten.length})</button>
        <button className={'btn ' + (filter==='particulier'?'bp':'bg') + ' bsm'} onClick={() => setFilter('particulier')}>Particulier</button>
        <button className={'btn ' + (filter==='zakelijk'?'bp':'bg') + ' bsm'} onClick={() => setFilter('zakelijk')}>Zakelijk</button>
        <span style={{width:1, background:'var(--gray-200)', margin:'0 4px'}}></span>
        <select className="fi" style={{padding:'6px 10px', fontSize:12, width:'auto'}} value={regioFilter} onChange={e => setRegioFilter(e.target.value)}>
          <option value="alle">Alle regio's</option>
          {regios.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Klantnr.</th><th>Naam</th><th>Type</th><th>Adres</th><th>Regio</th><th></th>
            </tr>
          </thead>
          <tbody>
            {gefilterd.length === 0 ? (
              <tr><td colSpan={6} style={{textAlign:'center', padding:'30px', color:'var(--gray-400)'}}>Geen klanten gevonden</td></tr>
            ) : (
              gefilterd.map(k => (
                <tr key={k.id} onClick={() => navigate(`/klanten/${k.id}`)} style={{cursor:'pointer'}}>
                  <td style={{fontFamily:'DM Mono, monospace', fontSize:11, color:'var(--gray-400)'}}>{k.klantnummer}</td>
                  <td className="tm">{k.naam}</td>
                  <td>
                    <span className={'pl ' + (k.type === 'zakelijk' ? 'plb' : 'plgr')}>
                      {k.type === 'zakelijk' ? 'Zakelijk' : 'Particulier'}
                    </span>
                  </td>
                  <td style={{fontSize:11.5}}>{k.adres || '—'}</td>
                  <td>{k.regio || '—'}</td>
                  <td style={{textAlign:'right', color:'var(--gray-300)'}}>›</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{marginTop:12, fontSize:11, color:'var(--gray-400)', textAlign:'right'}}>
        {gefilterd.length} van {klanten.length} klanten
      </div>
    </div>
  )
}
