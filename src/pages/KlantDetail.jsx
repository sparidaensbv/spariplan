import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function KlantDetail() {
  const { id } = useParams()
  const [klant, setKlant] = useState(null)
  const [diensten, setDiensten] = useState([])
  const [taken, setTaken] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [klantRes, dienstenRes, takenRes] = await Promise.all([
        supabase.from('klanten').select('*').eq('id', id).maybeSingle(),
        supabase.from('klant_diensten').select('*, dienst:diensten(naam)').eq('klant_id', id),
        supabase.from('taken').select('*, dienst:diensten(naam), medewerker:medewerkers(naam)').eq('klant_id', id).order('jaar', {ascending:false}).order('weeknummer', {ascending:false}),
      ])
      setKlant(klantRes.data)
      setDiensten(dienstenRes.data || [])
      setTaken(takenRes.data || [])
      setLoading(false)
    }
    load()
  }, [id])

  if (loading) return <div className="loading">Klant laden…</div>
  if (!klant) return <div className="loading">Klant niet gevonden</div>

  const totaalOmzet = taken.reduce((s, t) => s + parseFloat(t.vaste_prijs || 0), 0)
  const totaalUren = taken.reduce((s, t) => s + (t.geplande_minuten || 0), 0) / 60

  return (
    <div>
      <Link to="/klanten" style={{fontSize:12, color:'var(--gray-500)', textDecoration:'none', marginBottom:12, display:'inline-block'}}>
        ← Terug naar klanten
      </Link>

      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div>
            <div className="ct">{klant.naam}</div>
            <div style={{fontSize:11, color:'var(--gray-400)', marginTop:2}}>
              {klant.klantnummer} · {klant.type === 'zakelijk' ? 'Zakelijke klant' : 'Particuliere klant'}
            </div>
          </div>
        </div>
        <div className="cb">
          <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14}}>
            <div>
              <div style={{fontSize:10, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4}}>Adres</div>
              <div style={{fontSize:13}}>{klant.adres || '—'}</div>
              {klant.plaats && <div style={{fontSize:12, color:'var(--gray-500)'}}>{klant.postcode} {klant.plaats}</div>}
              {klant.regio && <div style={{fontSize:11, color:'var(--gray-400)', marginTop:3}}>Regio: {klant.regio}</div>}
            </div>
            <div>
              <div style={{fontSize:10, fontWeight:700, color:'var(--gray-400)', textTransform:'uppercase', letterSpacing:.5, marginBottom:4}}>Contact</div>
              <div style={{fontSize:13}}>{klant.telefoon || '—'}</div>
              <div style={{fontSize:12, color:'var(--gray-500)'}}>{klant.email || '—'}</div>
            </div>
          </div>
          {klant.notitie && (
            <div style={{marginTop:14, padding:'10px 14px', background:'var(--accent-50)', borderRadius:7, fontSize:12, color:'#92400e'}}>
              <strong>Notitie:</strong> {klant.notitie}
            </div>
          )}
        </div>
      </div>

      <div className="sg s4" style={{marginBottom:14}}>
        <div className="stat sb1">
          <div className="sl">Vaste diensten</div>
          <div className="sv">{diensten.length}</div>
          <div className="sd">terugkerende klussen</div>
        </div>
        <div className="stat sg1">
          <div className="sl">Geplande taken</div>
          <div className="sv">{taken.length}</div>
          <div className="sd">in de planning</div>
        </div>
        <div className="stat sa1">
          <div className="sl">Totaal uren</div>
          <div className="sv">{totaalUren.toFixed(1)}u</div>
          <div className="sd">historisch + gepland</div>
        </div>
        <div className="stat sr1">
          <div className="sl">Totaal omzet</div>
          <div className="sv">€{totaalOmzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}</div>
          <div className="sd">historisch + gepland</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div className="ch"><div className="ct">📋 Vaste diensten</div></div>
        {diensten.length === 0 ? (
          <div style={{padding:20, textAlign:'center', color:'var(--gray-400)', fontSize:12}}>Geen vaste diensten</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Dienst</th><th>Weeknummers</th><th>Tijd per beurt</th><th>Vaste prijs</th><th>Bijzondere instructie</th>
              </tr>
            </thead>
            <tbody>
              {diensten.map(d => (
                <tr key={d.id}>
                  <td className="tm">{d.dienst?.naam || '—'}</td>
                  <td style={{fontFamily:'DM Mono, monospace', fontSize:11}}>{(d.weeknummers || []).join(', ')}</td>
                  <td style={{fontFamily:'DM Mono, monospace'}}>{d.geplande_minuten}m</td>
                  <td style={{fontFamily:'DM Mono, monospace', fontWeight:600}}>€{parseFloat(d.vaste_prijs||0).toFixed(2)}</td>
                  <td style={{fontSize:11, color:'var(--orange)', maxWidth:250}}>{d.bijzondere_instructie || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="ch"><div className="ct">📅 Geplande taken</div></div>
        {taken.length === 0 ? (
          <div style={{padding:20, textAlign:'center', color:'var(--gray-400)', fontSize:12}}>Geen geplande taken</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Week</th><th>Dienst</th><th>Medewerker</th><th>Tijd</th><th>Prijs</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {taken.map(t => (
                <tr key={t.id}>
                  <td className="tm">Wk {t.weeknummer} · {t.jaar}</td>
                  <td>{t.dienst?.naam || '—'}</td>
                  <td>{t.medewerker?.naam || <span style={{color:'var(--gray-400)'}}>Nog niet toegewezen</span>}</td>
                  <td style={{fontFamily:'DM Mono, monospace'}}>{t.geplande_minuten}m</td>
                  <td style={{fontFamily:'DM Mono, monospace', fontWeight:600}}>€{parseFloat(t.vaste_prijs||0).toFixed(2)}</td>
                  <td>
                    <span className={'pl ' + (t.status==='concept'?'plp':t.status==='bevestigd'?'plb':t.status==='klaar'?'plg':'plgr')}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
