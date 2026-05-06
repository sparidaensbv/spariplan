// Vercel Serverless Function — route matrix via OSRM
// Wordt beschikbaar op /api/route-table?coords=lon1,lat1;lon2,lat2

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }
  
  const { coords } = req.query
  
  if (!coords) {
    return res.status(400).json({ error: 'Geen coords opgegeven' })
  }
  
  try {
    const url = `https://router.project-osrm.org/table/v1/driving/${coords}?annotations=duration,distance`
    const response = await fetch(url)
    
    if (!response.ok) {
      return res.status(response.status).json({ error: `OSRM status ${response.status}` })
    }
    
    const data = await response.json()
    
    res.setHeader('Cache-Control', 's-maxage=3600')
    return res.status(200).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
