// Vercel Serverless Function — geocoding via Nominatim
// Wordt automatisch beschikbaar op /api/geocode

export default async function handler(req, res) {
  // CORS headers (sta requests vanaf onze eigen app toe)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  const { adres } = req.query
  
  if (!adres || adres.trim() === '') {
    return res.status(400).json({ error: 'Geen adres opgegeven' })
  }
  
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
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'Spariplan/1.0 (info@sparidaensbv.nl)',
        'Accept-Language': 'nl'
      }
    })
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `Nominatim status ${response.status}` })
    }
    
    const data = await response.json()
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Adres niet gevonden' })
    }
    
    // Cache 1 dag
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate')
    
    return res.status(200).json({
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
