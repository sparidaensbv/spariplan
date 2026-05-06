// Geocoding & Routing helpers — gaat via Vercel serverless functies
// om CORS-problemen te omzeilen

import { supabase } from './supabase'

// Nominatim heeft 1 request/sec rate limit
const NOMINATIM_DELAY_MS = 1100

// ═══════════════════════════════════════════════════════════
// GEOCODING — adres naar lat/lon
// ═══════════════════════════════════════════════════════════

export async function geocodeerAdres(adres) {
  if (!adres || adres.trim() === '') return null
  
  try {
    const response = await fetch(`/api/geocode?adres=${encodeURIComponent(adres)}`)
    
    if (response.status === 404) return null
    if (!response.ok) {
      console.error('Geocoding response niet ok:', response.status)
      return null
    }
    
    const data = await response.json()
    if (data.error) return null
    
    return {
      lat: data.lat,
      lon: data.lon,
      display_name: data.display_name
    }
  } catch (e) {
    console.error('Geocoding fout voor:', adres, e)
    return null
  }
}

export async function geocodeerAlleKlanten(onProgress, onError) {
  const { data: klanten, error } = await supabase
    .from('klanten')
    .select('id, naam, adres')
    .eq('geocoding_status', 'open')
    .order('naam')
  
  if (error) throw error
  if (!klanten || klanten.length === 0) {
    return { totaal: 0, gelukt: 0, mislukt: 0 }
  }
  
  let gelukt = 0, mislukt = 0
  const totaal = klanten.length
  
  for (let i = 0; i < klanten.length; i++) {
    const klant = klanten[i]
    
    if (onProgress) onProgress({ huidig: i + 1, totaal, klant: klant.naam })
    
    try {
      const result = await geocodeerAdres(klant.adres)
      
      if (result) {
        await supabase.from('klanten').update({
          latitude: result.lat,
          longitude: result.lon,
          geocoding_status: 'gelukt',
          geocoded_at: new Date().toISOString(),
          geocoded_adres: result.display_name
        }).eq('id', klant.id)
        gelukt++
      } else {
        await supabase.from('klanten').update({
          geocoding_status: 'mislukt',
          geocoded_at: new Date().toISOString()
        }).eq('id', klant.id)
        mislukt++
        if (onError) onError({ klant, reden: 'Adres niet gevonden' })
      }
    } catch (e) {
      mislukt++
      if (onError) onError({ klant, reden: e.message })
    }
    
    if (i < klanten.length - 1) {
      await new Promise(r => setTimeout(r, NOMINATIM_DELAY_MS))
    }
  }
  
  return { totaal, gelukt, mislukt }
}

// ═══════════════════════════════════════════════════════════
// ROUTING via API proxies
// ═══════════════════════════════════════════════════════════

export async function osrmTable(punten) {
  if (!punten || punten.length < 2) return null
  
  const coords = punten.map(p => `${p.lon},${p.lat}`).join(';')
  
  try {
    const response = await fetch(`/api/route-table?coords=${encodeURIComponent(coords)}`)
    if (!response.ok) throw new Error(`Status ${response.status}`)
    
    const data = await response.json()
    if (data.code !== 'Ok') throw new Error(data.message || 'OSRM error')
    
    const matrix = []
    for (let i = 0; i < punten.length; i++) {
      matrix[i] = []
      for (let j = 0; j < punten.length; j++) {
        matrix[i][j] = {
          distance_m: data.distances[i][j],
          duration_s: data.durations[i][j]
        }
      }
    }
    return matrix
  } catch (e) {
    console.error('OSRM table fout:', e)
    return null
  }
}

export async function osrmRoute(punten) {
  if (!punten || punten.length < 2) return null
  
  const coords = punten.map(p => `${p.lon},${p.lat}`).join(';')
  
  try {
    const response = await fetch(`/api/route?coords=${encodeURIComponent(coords)}`)
    if (!response.ok) throw new Error(`Status ${response.status}`)
    
    const data = await response.json()
    if (data.code !== 'Ok') throw new Error(data.message || 'OSRM error')
    
    return {
      totaal_afstand_m: data.routes[0].distance,
      totaal_tijd_s: data.routes[0].duration,
      legs: data.routes[0].legs.map(leg => ({
        afstand_m: leg.distance,
        tijd_s: leg.duration
      }))
    }
  } catch (e) {
    console.error('OSRM route fout:', e)
    return null
  }
}

// ═══════════════════════════════════════════════════════════
// ROUTE OPTIMALISATIE — nearest neighbor + 2-opt
// ═══════════════════════════════════════════════════════════

export async function optimaliseerRoute(startPunt, bezoeken, terug = false) {
  if (!bezoeken || bezoeken.length === 0) {
    return { volgorde: [], totaal_afstand_m: 0, totaal_tijd_s: 0 }
  }
  if (bezoeken.length === 1) {
    return { volgorde: bezoeken, totaal_afstand_m: 0, totaal_tijd_s: 0 }
  }
  
  const punten = [startPunt, ...bezoeken]
  const matrix = await osrmTable(punten)
  
  if (!matrix) {
    return { 
      volgorde: bezoeken, 
      totaal_afstand_m: 0, 
      totaal_tijd_s: 0,
      error: 'Route service niet beschikbaar'
    }
  }
  
  const N = punten.length
  const bezocht = new Array(N).fill(false)
  bezocht[0] = true
  
  const volgorde = []
  let huidig = 0
  let totaalAfstand = 0
  let totaalTijd = 0
  
  for (let i = 0; i < bezoeken.length; i++) {
    let best = -1
    let bestTijd = Infinity
    
    for (let j = 1; j < N; j++) {
      if (bezocht[j]) continue
      const tijd = matrix[huidig][j].duration_s
      if (tijd < bestTijd) {
        bestTijd = tijd
        best = j
      }
    }
    
    if (best === -1) break
    
    bezocht[best] = true
    volgorde.push(bezoeken[best - 1])
    totaalAfstand += matrix[huidig][best].distance_m
    totaalTijd += matrix[huidig][best].duration_s
    huidig = best
  }
  
  // 2-opt verbetering
  if (volgorde.length >= 3) {
    const verbeterd = twoOpt(volgorde, matrix, punten)
    if (verbeterd && verbeterd.totaal_tijd_s < totaalTijd) {
      if (terug && verbeterd.volgorde.length > 0) {
        const laatste = bezoekIndex(verbeterd.volgorde[verbeterd.volgorde.length-1], punten)
        verbeterd.totaal_afstand_m += matrix[laatste][0].distance_m
        verbeterd.totaal_tijd_s += matrix[laatste][0].duration_s
      }
      return verbeterd
    }
  }
  
  if (terug && huidig !== 0) {
    totaalAfstand += matrix[huidig][0].distance_m
    totaalTijd += matrix[huidig][0].duration_s
  }
  
  return { volgorde, totaal_afstand_m: totaalAfstand, totaal_tijd_s: totaalTijd }
}

function bezoekIndex(bezoek, punten) {
  for (let i = 1; i < punten.length; i++) {
    if (punten[i].id === bezoek.id) return i
  }
  return -1
}

function twoOpt(volgorde, matrix, punten) {
  const lookup = new Map()
  punten.slice(1).forEach((p, i) => { lookup.set(p.id, i + 1) })
  
  function bereken(route) {
    let t = 0, a = 0, prev = 0
    for (const r of route) {
      const idx = lookup.get(r.id)
      t += matrix[prev][idx].duration_s
      a += matrix[prev][idx].distance_m
      prev = idx
    }
    return { tijd: t, afstand: a }
  }
  
  let huidig = [...volgorde]
  let { tijd: bestTijd, afstand: bestAfstand } = bereken(huidig)
  let verbeterd = true
  let iter = 0
  
  while (verbeterd && iter < 20) {
    verbeterd = false
    iter++
    
    for (let i = 0; i < huidig.length - 1; i++) {
      for (let j = i + 1; j < huidig.length; j++) {
        const nieuw = [...huidig]
        const segm = nieuw.slice(i, j + 1).reverse()
        nieuw.splice(i, segm.length, ...segm)
        
        const { tijd, afstand } = bereken(nieuw)
        if (tijd < bestTijd) {
          bestTijd = tijd
          bestAfstand = afstand
          huidig = nieuw
          verbeterd = true
        }
      }
    }
  }
  
  return {
    volgorde: huidig,
    totaal_afstand_m: bestAfstand,
    totaal_tijd_s: bestTijd
  }
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

export function formatAfstand(meters) {
  if (!meters) return '0 km'
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatTijd(seconden) {
  if (!seconden) return '0m'
  const min = Math.round(seconden / 60)
  if (min < 60) return `${min}m`
  const u = Math.floor(min / 60)
  const m = min % 60
  return `${u}u${m > 0 ? ' ' + m + 'm' : ''}`
}
