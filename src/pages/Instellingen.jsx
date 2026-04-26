import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Instellingen() {
  const [instelling, setInstelling] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [bericht, setBericht] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('instellingen').select('*').limit(1).maybeSingle()
      setInstelling(data)
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    setSaving(true)
    setBericht(null)
    const { error } = await supabase
      .from('instellingen')
      .update({
        bedrijfsnaam: instelling.bedrijfsnaam,
        adres: instelling.adres,
        telefoon: instelling.telefoon,
        email: instelling.email,
        werkgebied_radius_km: instelling.werkgebied_radius_km,
        zaterdag_werkdag: instelling.zaterdag_werkdag,
        max_uur_per_dag: instelling.max_uur_per_dag,
        max_plantijd_per_dag: instelling.max_plantijd_per_dag,
        afwijking_signaal_factor: instelling.afwijking_signaal_factor,
        auto_bijstellen_na_x_keer: instelling.auto_bijstellen_na_x_keer,
      })
      .eq('id', instelling.id)
    
    if (error) {
      setBericht({type:'error', tekst: 'Fout: ' + error.message})
    } else {
      setBericht({type:'success', tekst: '✓ Instellingen opgeslagen'})
    }
    setSaving(false)
  }

  function update(field, value) {
    setInstelling({...instelling, [field]: value})
  }

  if (loading) return <div className="loading">Laden…</div>
  if (!instelling) return <div className="loading">Geen instellingen gevonden</div>

  return (
    <div>
      <div className="card" style={{marginBottom:14}}>
        <div className="ch"><div className="ct">🏢 Bedrijfsgegevens</div></div>
        <div className="cb">
          <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14}}>
            <div className="fg">
              <label className="fl">Bedrijfsnaam</label>
              <input className="fi" value={instelling.bedrijfsnaam || ''} onChange={e => update('bedrijfsnaam', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">E-mailadres</label>
              <input className="fi" value={instelling.email || ''} onChange={e => update('email', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Adres</label>
              <input className="fi" value={instelling.adres || ''} onChange={e => update('adres', e.target.value)} />
            </div>
            <div className="fg">
              <label className="fl">Telefoonnummer</label>
              <input className="fi" value={instelling.telefoon || ''} onChange={e => update('telefoon', e.target.value)} />
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div className="ch"><div className="ct">📍 Werkgebied</div></div>
        <div className="cb">
          <div className="fg">
            <label className="fl">Straal werkgebied (km)</label>
            <input type="number" className="fi" style={{maxWidth:120}} value={instelling.werkgebied_radius_km || 30} onChange={e => update('werkgebied_radius_km', parseInt(e.target.value))} />
          </div>
          <div className="fg">
            <label style={{display:'flex', alignItems:'center', gap:8, fontSize:13, cursor:'pointer'}}>
              <input type="checkbox" checked={instelling.zaterdag_werkdag || false} onChange={e => update('zaterdag_werkdag', e.target.checked)} />
              Zaterdag is een werkdag
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{marginBottom:14}}>
        <div className="ch"><div className="ct">⏱️ Planning regels</div></div>
        <div className="cb">
          <div style={{display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:14}}>
            <div className="fg">
              <label className="fl">Max werkelijke uren per dag</label>
              <input type="number" step="0.5" className="fi" value={instelling.max_uur_per_dag || 8} onChange={e => update('max_uur_per_dag', parseFloat(e.target.value))} />
            </div>
            <div className="fg">
              <label className="fl">Max planning uren per dag</label>
              <input type="number" step="0.5" className="fi" value={instelling.max_plantijd_per_dag || 12} onChange={e => update('max_plantijd_per_dag', parseFloat(e.target.value))} />
            </div>
            <div className="fg">
              <label className="fl">Afwijking signaal factor</label>
              <input type="number" step="0.05" className="fi" value={instelling.afwijking_signaal_factor || 1.75} onChange={e => update('afwijking_signaal_factor', parseFloat(e.target.value))} />
              <div style={{fontSize:10.5, color:'var(--gray-400)', marginTop:4}}>Bijv. 1.75 = signaal als gepland 1,75× werkelijk is</div>
            </div>
            <div className="fg">
              <label className="fl">Auto-bijstellen na x keer</label>
              <input type="number" className="fi" value={instelling.auto_bijstellen_na_x_keer || 3} onChange={e => update('auto_bijstellen_na_x_keer', parseInt(e.target.value))} />
              <div style={{fontSize:10.5, color:'var(--gray-400)', marginTop:4}}>Aantal opvolgende afwijkingen voor automatische aanpassing</div>
            </div>
          </div>
        </div>
      </div>

      {bericht && (
        <div style={{
          padding:'10px 14px', borderRadius:7, fontSize:12.5, fontWeight:600, marginBottom:14,
          background: bericht.type === 'success' ? 'var(--green-50)' : 'var(--red-50)',
          color: bericht.type === 'success' ? 'var(--green)' : 'var(--red)'
        }}>
          {bericht.tekst}
        </div>
      )}

      <button className="btn bp" onClick={save} disabled={saving} style={{padding:'10px 20px'}}>
        {saving ? 'Opslaan…' : '💾 Instellingen opslaan'}
      </button>
    </div>
  )
}
