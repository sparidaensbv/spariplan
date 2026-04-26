import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [weken, setWeken] = useState([])
  const [prognose, setPrognose] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [klantenRes, takenRes, klantDienstenRes] = await Promise.all([
        supabase.from('klanten').select('id, type'),
        supabase.from('taken').select('jaar, weeknummer, geplande_minuten, vaste_prijs, status'),
        supabase.from('klant_diensten').select('weeknummers, vaste_prijs, geplande_minuten'),
      ])

      const klanten = klantenRes.data || []
      const taken = takenRes.data || []
      const klantDiensten = klantDienstenRes.data || []

      const perWeek = {}
      taken.forEach(t => {
        const key = `${t.jaar}-${t.weeknummer}`
        if (!perWeek[key]) perWeek[key] = { jaar: t.jaar, week: t.weeknummer, klussen: 0, minuten: 0, omzet: 0 }
        perWeek[key].klussen += 1
        perWeek[key].minuten += t.geplande_minuten || 0
        perWeek[key].omzet += parseFloat(t.vaste_prijs || 0)
      })

      const huidigeWeek = getWeeknummer(new Date())
      const prognoseWeken = []
      for (let i = 0; i < 10; i++) {
        const wk = huidigeWeek + i
        if (wk > 52) continue
        let klussen = 0, minuten = 0, omzet = 0
        klantDiensten.forEach(kd => {
          if (kd.weeknummers && kd.weeknummers.includes(wk)) {
            klussen += 1
            minuten += kd.geplande_minuten || 0
            omzet += parseFloat(kd.vaste_prijs || 0)
          }
        })
        prognoseWeken.push({ week: wk, klussen, minuten, omzet })
      }

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
      setPrognose(prognoseWeken)
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div className="loading">Data laden vanuit Supabase…</div>

  const maxOmzet = Math.max(...prognose.map(p => p.omzet), 1)

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
          <div className="ct">📈 Prognose omzet komende 10 weken</div>
          <div style={{fontSize:11, color:'var(--gray-400)'}}>Op basis van vaste weeknummers per klant</div>
        </div>
        <div className="cb">
          <div style={{display:'grid', gridTemplateColumns:`60px repeat(${prognose.length}, 1fr)`, gap:4, alignItems:'end', marginBottom:14}}>
            <div style={{fontSize:10, fontWeight:700, color:'var(--gray-400)', textAlign:'right', paddingRight:4}}>Omzet</div>
            {prognose.map(p => {
              const heightPct = p.omzet > 0 ? Math.max((p.omzet / maxOmzet) * 100, 2) : 1
              const isLeeg = p.omzet === 0
              const isWeinig = p.omzet > 0 && p.omzet < maxOmzet * 0.2
              const color = isLeeg ? 'var(--gray-300)' : isWeinig ? 'var(--orange)' : 'var(--brand)'
              return (
                <div key={p.week} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:3}}>
                  <div style={{fontSize:9, fontWeight:700, color: isLeeg ? 'var(--red)' : isWeinig ? 'var(--orange)' : 'var(--brand)'}}>
                    €{p.omzet.toLocaleString('nl-NL', {maximumFractionDigits:0})}
                  </div>
                  <div style={{height:90, width:'100%', display:'flex', alignItems:'flex-end'}}>
                    <div style={{background:color, width:'100%', height:`${heightPct}%`, borderRadius:'4px 4px 0 0', minHeight:3}}></div>
                  </div>
                  <div style={{fontSize:10, fontWeight:600, color: isLeeg ? 'var(--red)' : 'var(--gray-700)'}}>Wk {p.week}</div>
                  <div style={{fontSize:9, color: isLeeg ? 'var(--red)' : 'var(--gray-400)'}}>
                    {isLeeg ? '⚠️ Leeg' : `${p.klussen} klussen`}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div className="ch">
          <div className="ct">⏱️ In te plannen uren komende 10 weken</div>
          <div style={{fontSize:11, color:'var(--gray-400)'}}>Capaciteit: 3 medewerkers × 8u × 5 dagen = 120u/week</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Week</th><th>Klussen</th><th>Uren</th><th>Capaciteit</th><th>Bezetting</th><th>Prognose omzet</th>
            </tr>
          </thead>
          <tbody>
            {prognose.map(p => {
              const uren = p.minuten / 60
              const cap = 120
              const bezetting = (uren / cap) * 100
              return (
                <tr key={p.week}>
                  <td className="tm">Wk {p.week}</td>
                  <td>{p.klussen}</td>
                  <td style={{fontFamily:'DM Mono, monospace', fontWeight:700}}>{uren.toFixed(0)}u</td>
                  <td>{cap}u</td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:6}}>
                      <div style={{width:80, height:6, background:'var(--gray-100)', borderRadius:3, overflow:'hidden'}}>
                        <div style={{width:`${Math.min(bezetting, 100)}%`, height:'100%', background: bezetting > 100 ? 'var(--red)' : bezetting > 80 ? 'var(--brand-light)' : 'var(--orange)'}}></div>
                      </div>
                      <span style={{fontSize:11, fontWeight:700, color: bezetting > 100 ? 'var(--red)' : bezetting > 80 ? 'var(--brand)' : 'var(--orange)'}}>
                        {bezetting.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={{fontFamily:'DM Mono, monospace', fontWeight:600}}>€{p.omzet.toLocaleString('nl-NL', {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {weken.length > 0 && (
        <div className="card">
          <div className="ch">
            <div className="ct">📅 Reeds geplande taken (in database)</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Jaar</th><th>Week</th><th>Klussen</th><th>Geplande uren</th><th>Prognose omzet</th>
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

function getWeeknummer(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}
