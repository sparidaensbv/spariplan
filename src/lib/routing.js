// Geocoding & Routing helpers voor Spariplan
// Gebruikt OpenStreetMap Nominatim (geocoding) en OSRM (routing)
// Beide gratis, open source

import { supabase } from './supabase'

// Nominatim heeft een rate limit van 1 request/sec
// We respecteren dat strikt
const NOMINATIM_DELAY_MS = 1100  // iets meer dan 1s voor zekerheid

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving'
const OSRM_TABLE = 'https://router.project-osrm.org/table/v1/driving'

// ═══════════════════════════════════════════════════════════
// GEOCODING — adres naar lat/lon
// ═══════════════════════════════════════════════════════════

/**
 * Geocodeer 1 adres via Nominatim
 * @param {string} adres - bijv. "Lupinestraat 33, 5561 AD Riethoven"
 * @returns {{lat, lon, display_name} | null}
 */
export async function geocodeerAdres(adres) {
  if (!adres || adres.trim() === '') return null
  
  // Voeg "Nederland" toe als het er niet in staat
  let zoekQuery = adres.trim()
  if (!zoekQuery.toLowerCase().includes('nederland') && !zoekQuery.toLowerCase().includes('netherlands')) {
    zoekQuery += ', Nederland'
  }
  
  const params = new URLSearchParams({
    q: zoekQuery,
    format: 'json',
    countrycodes: 'nl',
    limit: '1',
    addressdetails: '1'
  })
  
  try {
    const response = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: {
        'User-Agent': 'Spariplan/1.0 (contact@sparidaensbv.nl)',
        'Accept-Language': 'nl'
      }
    })
    
    if (!response.ok) throw new Error(`Status ${response.status}`)
    
    const data = await response.json()
    if (!data || data.length === 0) return null
    
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name
    }
  } catch (e) {
    console.error('Geocoding fout voor:', adres, e)
    return null
  }
}

/**
 * Geocodeer alle openstaande klanten in batch
 * Met progress callback en respect voor rate limit
 */
export async function geocodeerAlleKlanten(onProgress, onError) {
  // Haal openstaande klanten op
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
    
    // Rate limit
    if (i < klanten.length - 1) {
      await new Promise(r => setTimeout(r, NOMINATIM_DELAY_MS))
    }
  }
  
  return { totaal, gelukt, mislukt }
}

// ═══════════════════════════════════════════════════════════
// ROUTING — afstanden tussen punten via OSRM
// ═══════════════════════════════════════════════════════════

/**
 * Vraag een afstandsmatrix op voor een lijst coördinaten
 * @param {Array<{lat, lon}>} punten 
 * @returns {Array<Array<{distance_m, duration_s}>>}
 */
export async function osrmTable(punten) {
  if (!punten || punten.length < 2) return null
  
  const coords = punten.map(p => `${p.lon},${p.lat}`).join(';')
  const url = `${OSRM_TABLE}/${coords}?annotations=duration,distance`
  
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`OSRM status ${response.status}`)
    
    const data = await response.json()
    if (data.code !== 'Ok') throw new Error(data.message || 'OSRM error')
    
    // Bouw matrix
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

/**
 * Vraag de werkelijke route op tussen punten in de gegeven volgorde
 * Geeft totale afstand, tijd en eventueel polyline
 */
export async function osrmRoute(punten) {
  if (!punten || punten.length < 2) return null
  
  const coords = punten.map(p => `${p.lon},${p.lat}`).join(';')
  const url = `${OSRM_BASE}/${coords}?overview=false`
  
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`OSRM status ${response.status}`)
    
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
// ROUTE OPTIMALISATIE — nearest neighbor algorithm
// ═══════════════════════════════════════════════════════════

/**
 * Optimaliseer volgorde van bezoekpunten via nearest-neighbor
 * Met optionele 2-opt verbetering
 * 
 * @param {{lat, lon}} startPunt - vertrekpunt (bedrijf)
 * @param {Array<{id, lat, lon, ...}>} bezoeken - klantbezoeken
 * @param {boolean} terug - keren we terug naar startpunt aan het eind?
 * @returns {Array} - bezoeken in optimale volgorde + meta info
 */
export async function optimaliseerRoute(startPunt, bezoeken, terug = false) {
  if (!bezoeken || bezoeken.length === 0) {
    return { volgorde: [], totaal_afstand_m: 0, totaal_tijd_s: 0 }
  }
  if (bezoeken.length === 1) {
    return { volgorde: bezoeken, totaal_afstand_m: 0, totaal_tijd_s: 0, debug: 'maar 1 bezoek' }
  }
  
  // Bouw alle punten: start + bezoeken (+ eindterugkeer)
  const punten = [startPunt, ...bezoeken]
  
  // Vraag afstandsmatrix op
  const matrix = await osrmTable(punten)
  if (!matrix) {
    // Fallback: gewoon op postcode/index sorteren
    return { 
      volgorde: bezoeken, 
      totaal_afstand_m: 0, 
      totaal_tijd_s: 0,
      error: 'OSRM niet beschikbaar, geen optimalisatie toegepast'
    }
  }
  
  // Nearest neighbor vanaf start
  const N = punten.length
  const bezocht = new Array(N).fill(false)
  bezocht[0] = true  // start is al "bezocht"
  
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
    volgorde.push(bezoeken[best - 1])  // -1 want index 0 is startpunt
    totaalAfstand += matrix[huidig][best].distance_m
    totaalTijd += matrix[huidig][best].duration_s
    huidig = best
  }
  
  // 2-opt verbetering (probeer paren om te draaien voor betere route)
  if (volgorde.length >= 3) {
    const verbeterd = await twoOpt(volgorde, matrix, punten, startPunt)
    if (verbeterd && verbeterd.totaal_tijd_s < totaalTijd) {
      return verbeterd
    }
  }
  
  // Optioneel: terug naar start meetellen
  if (terug && huidig !== 0) {
    totaalAfstand += matrix[huidig][0].distance_m
    totaalTijd += matrix[huidig][0].duration_s
  }
  
  return {
    volgorde,
    totaal_afstand_m: totaalAfstand,
    totaal_tijd_s: totaalTijd
  }
}

/**
 * 2-opt verbetering — probeer paren om te draaien
 * Dit verbetert nearest-neighbor vaak met 5-15%
 */
async function twoOpt(volgorde, matrix, punten, startPunt) {
  const indexLookup = new Map()
  punten.forEach((p, i) => {
    if (i === 0) indexLookup.set('START', 0)
    else indexLookup.set(volgorde[i-1]?.id, i)
  })
  
  // Maak een map: bezoek-id naar matrix-index
  const bezoekIndex = new Map()
  punten.slice(1).forEach((p, i) => {
    bezoekIndex.set(p.id, i + 1)
  })
  
  let huidigeRoute = [...volgorde]
  let verbeterd = true
  let iteraties = 0
  const maxIteraties = 20
  
  function berekenTotaal(route) {
    let t = 0
    let prev = 0  // start
    for (const r of route) {
      const idx = bezoekIndex.get(r.id)
      t += matrix[prev][idx].duration_s
      prev = idx
    }
    return t
  }
  
  let bestTijd = berekenTotaal(huidigeRoute)
  let bestAfstand = 0
  
  while (verbeterd && iteraties < maxIteraties) {
    verbeterd = false
    iteraties++
    
    for (let i = 0; i < huidigeRoute.length - 1; i++) {
      for (let j = i + 1; j < huidigeRoute.length; j++) {
        // Probeer i..j om te draaien
        const nieuweRoute = [...huidigeRoute]
        const segment = nieuweRoute.slice(i, j + 1).reverse()
        nieuweRoute.splice(i, segment.length, ...segment)
        
        const nieuweTijd = berekenTotaal(nieuweRoute)
        if (nieuweTijd < bestTijd) {
          bestTijd = nieuweTijd
          huidigeRoute = nieuweRoute
          verbeterd = true
        }
      }
    }
  }
  
  // Herbereken afstand
  let prev = 0
  for (const r of huidigeRoute) {
    const idx = bezoekIndex.get(r.id)
    bestAfstand += matrix[prev][idx].distance_m
    prev = idx
  }
  
  return {
    volgorde: huidigeRoute,
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
