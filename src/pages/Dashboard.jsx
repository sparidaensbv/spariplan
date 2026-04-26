import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [weken, setWeken] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [klantenRes, takenRes] = await Promise.all([
        supabase.from('klanten').select('id, type', { count: 'exact', head: false }),
        supabase.from('taken').select('jaar, weeknummer, geplande_minuten, vaste_prijs, status'),
      ])

      const klanten = klantenRes.data || []
      const taken = takenRes.data || []

      // Per week
      const perWeek = {}
      taken.forEach(t => {
        const key = `${t.jaar}-${t.weeknummer}`
        if (!perWeek[key]) perWeek[key] = { jaar: t.jaar, week: t.weeknummer, klussen: 0, minuten: 0, omzet: 0 }
        perWeek[key].klussen += 1
        perWeek[key].minuten += t.geplande_minuten || 0
        perWeek[key].omzet += parseFloat(t.vaste_prijs || 0)
      })
      const wekenArr = Object.values(perWeek).sort((a, b) => a.jaar - b.jaar || a.week - b.week)

      setStats({
        klanten: klanten.length,
        klanten_zakelijk: klanten.filter(k => k.type === 'zakelijk').length,
        klanten_particulier: klanten.filter(k => k.type === 'particulier').length,
        taken_totaal: taken.length,
        taken_concept: taken.filter(t => t.status === 'concept').length,
        omzet_totaal: taken.reduce((sum, t) => sum + parseFloat(t.vaste_prijs || 0), 0),
        uren_totaal: taken.reduce((sum, t) => sum + (t.geplande_minuten || 0), 0) / 60,
      })
      setWeken(wekenArr)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Data laden vanuit Supabase…</div>

  return (
    <div>
      <div className="sg s4">
        <div className="stat sb1">
          <div className="sl">Klanten in database</div>
          <div className="sv">{stats.klanten}</div>
          <div className="sd">{stats.klanten_zakelijk} zakelijk · {stats.klanten_particulier} particulier</div>
        </div>
        <div className="stat sg1">
          <div className="sl">Taken (concept)</div>
          <div className="sv">{stats.taken_totaal}</div>
          <div className="sd">{stats.taken_concept} wachten op bevestiging</div>
        </div>
        <div className="stat sa1">
          <div className="sl">Geplande uren</div>
          <div className="sv">{stats.uren_totaal.toFixed(0)}u</div>
          <div className="sd">over alle weken</div>
        </div>
        <div className="stat sr1">
          <div className="sl">Prognose omzet</div>
          <div className="sv">€{stats.omzet_totaal.toLocaleString('nl-NL', {maximumFractionDigits:0})}</div>
          <div className="sd">geschatte vaste prijzen</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div className="ct">📊 Live data uit jouw Supabase database</div>
          <span className="pl plg">✓ Verbonden</span>
        </div>
        <div className="cb" style={{fontSize:12.5, color:'var(--gray-600)', lineHeight:1.6}}>
          Deze app draait nu op echte data. Alle klanten, taken en planningen komen rechtstreeks uit jullie Supabase database.
          Wijzigingen blijven bewaard. Wijzig iets in het Table Editor en klik op refresh — je ziet de update meteen hier.
        </div>
      </div>

      {weken.length > 0 && (
        <div className="card">
          <div className="ch">
            <div className="ct">📅 Taken per week (uit database)</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Jaar</th>
                <th>Week</th>
                <th>Klussen</th>
                <th>Geplande uren</th>
                <th>Prognose omzet</th>
              </tr>
            </thead>
            <tbody>
              {weken.map(w => (
                <tr key={`${w.jaar}-${w.week}`}>
                  <td>{w.jaar}</td>
                  <td className="tm">Week {w.week}</td>
                  <td>{w.klussen}</td>
                  <td style={{fontFamily:'DM Mono, monospace'}}>{(w.minuten / 60).toFixed(1)}u</td>
                  <td style={{fontFamily:'DM Mono, monospace', fontWeight:600}}>€{w.omzet.toLocaleString('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
