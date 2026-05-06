import { useEffect, useRef, useState } from 'react'
import { osrmRoute, osrmTable, formatAfstand, formatTijd } from '../lib/routing'

// Leaflet wordt asynchroon geladen om te voorkomen dat React-server-side rendering struikelt
let L = null
let leafletLoaded = false
let leafletLoadPromise = null

function loadLeaflet() {
  if (leafletLoadPromise) return leafletLoadPromise
  leafletLoadPromise = new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }
    
    // CSS dynamisch toevoegen
    if (!document.querySelector('link[href*="leaflet"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      link.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY='
      link.crossOrigin = ''
      document.head.appendChild(link)
    }
    
    // Library importeren
    import('leaflet').then(module => {
      L = module.default || module
      leafletLoaded = true
      resolve(L)
    })
  })
  return leafletLoadPromise
}

// Bedrijfslocatie in Bladel — fallback als instellingen leeg
const DEFAULT_BEDRIJF = { lat: 51.3680, lon: 5.2150, naam: 'Sparidaens BV' }

/**
 * RouteKaart — toont een kaart met markers en route lijntjes
 * 
 * Props:
 *   stops: Array van {id, lat, lon, naam, adres, postcode, tijd_start, dienst_naam} 
 *          in volgorde van bezoek
 *   medewerkerKleur: hex/css color voor de route lijn en markers
 *   bedrijfStart: {lat, lon, naam} startpunt (default Bladel)
 *   showRoute: boolean of de OSRM route getekend moet worden
 *   compact: boolean voor kleinere kaart (default false)
 */
export default function RouteKaart({ 
  stops = [], 
  medewerkerKleur = '#1e4a8a',
  bedrijfStart = DEFAULT_BEDRIJF,
  showRoute = true,
  compact = false,
  hoogte = 280
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const [routeInfo, setRouteInfo] = useState(null)
  const [routeLading, setRouteLading] = useState(false)
  const [error, setError] = useState(null)
  
  // Init kaart bij mount
  useEffect(() => {
    let cancelled = false
    
    async function init() {
      const leaflet = await loadLeaflet()
      if (cancelled || !leaflet || !containerRef.current) return
      
      // Cleanup eventuele bestaande kaart
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      
      const stopsMetCoords = stops.filter(s => s.lat && s.lon)
      
      // Bepaal initiële view
      let center = [bedrijfStart.lat, bedrijfStart.lon]
      let zoom = 11
      
      if (stopsMetCoords.length > 0) {
        const lats = stopsMetCoords.map(s => s.lat)
        const lons = stopsMetCoords.map(s => s.lon)
        const minLat = Math.min(...lats, bedrijfStart.lat)
        const maxLat = Math.max(...lats, bedrijfStart.lat)
        const minLon = Math.min(...lons, bedrijfStart.lon)
        const maxLon = Math.max(...lons, bedrijfStart.lon)
        center = [(minLat + maxLat) / 2, (minLon + maxLon) / 2]
      }
      
      const map = leaflet.map(containerRef.current, {
        center,
        zoom,
        scrollWheelZoom: false,  // niet zoomen bij scrollen op pagina
        zoomControl: true,
      })
      mapRef.current = map
      
      // OpenStreetMap tiles
      leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)
      
      // Bedrijf marker
      const bedrijfIcon = leaflet.divIcon({
        className: 'route-marker route-marker-start',
        html: `<div style="
          background: #111;
          color: white;
          border: 2px solid white;
          border-radius: 50%;
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 800;
          box-shadow: 0 2px 6px rgba(0,0,0,.4);
        ">🏠</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      leaflet.marker([bedrijfStart.lat, bedrijfStart.lon], { icon: bedrijfIcon })
        .addTo(map)
        .bindPopup(`<strong>${bedrijfStart.naam}</strong><br>Startpunt`)
      
      if (stopsMetCoords.length === 0) {
        setError(stops.length > 0 ? 'Klanten hebben nog geen coördinaten' : null)
        return
      }
      
      // Stop markers
      const bounds = [[bedrijfStart.lat, bedrijfStart.lon]]
      stopsMetCoords.forEach((stop, i) => {
        const nummer = i + 1
        const icon = leaflet.divIcon({
          className: 'route-marker route-marker-stop',
          html: `<div style="
            background: ${medewerkerKleur};
            color: white;
            border: 2px solid white;
            border-radius: 50%;
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            font-size: 12px; font-weight: 800;
            box-shadow: 0 2px 6px rgba(0,0,0,.4);
          ">${nummer}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })
        const popupContent = `
          <div style="font-family: system-ui; min-width: 180px;">
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 3px;">
              ${nummer}. ${stop.naam || 'Klant'}
            </div>
            ${stop.dienst_naam ? `<div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">${stop.dienst_naam}</div>` : ''}
            ${stop.adres ? `<div style="font-size: 11px; color: #374151;">📍 ${stop.adres}</div>` : ''}
            ${stop.tijd_start ? `<div style="font-size: 11px; color: ${medewerkerKleur}; margin-top: 4px; font-weight: 700;">⏱️ ${stop.tijd_start.slice(0,5)}</div>` : ''}
            ${stop.bijzondere_instructie ? `<div style="font-size: 10.5px; color: #92400e; background: #fef3c7; padding: 4px 6px; border-radius: 4px; margin-top: 5px;">⚠️ ${stop.bijzondere_instructie}</div>` : ''}
          </div>
        `
        leaflet.marker([stop.lat, stop.lon], { icon })
          .addTo(map)
          .bindPopup(popupContent)
        
        bounds.push([stop.lat, stop.lon])
      })
      
      // Fit bounds met padding
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [25, 25], maxZoom: 14 })
      }
      
      // Route via OSRM tekenen
      if (showRoute && stopsMetCoords.length > 0) {
        setRouteLading(true)
        setError(null)
        
        try {
          // Bouw punten array: bedrijf -> stops -> bedrijf
          const punten = [
            { lat: bedrijfStart.lat, lon: bedrijfStart.lon },
            ...stopsMetCoords,
            { lat: bedrijfStart.lat, lon: bedrijfStart.lon }
          ]
          
          // Vraag OSRM route op met overview voor de polyline
          const coords = punten.map(p => `${p.lon},${p.lat}`).join(';')
          const response = await fetch(`/api/route?coords=${encodeURIComponent(coords)}&overview=full&geometries=geojson`)
          
          if (!response.ok) throw new Error(`Route service error ${response.status}`)
          
          const data = await response.json()
          
          if (cancelled) return
          
          if (data.code === 'Ok' && data.routes && data.routes[0]) {
            const route = data.routes[0]
            
            // Probeer geometrie te krijgen
            if (route.geometry && route.geometry.coordinates) {
              // GeoJSON LineString — coords zijn [lon, lat], Leaflet wil [lat, lon]
              const polyPoints = route.geometry.coordinates.map(c => [c[1], c[0]])
              leaflet.polyline(polyPoints, {
                color: medewerkerKleur,
                weight: 4,
                opacity: 0.7,
                lineCap: 'round',
                lineJoin: 'round',
              }).addTo(map)
            } else {
              // Fallback: rechte lijntjes tussen punten
              const polyPoints = punten.map(p => [p.lat, p.lon])
              leaflet.polyline(polyPoints, {
                color: medewerkerKleur,
                weight: 3,
                opacity: 0.5,
                dashArray: '5,8',
              }).addTo(map)
            }
            
            setRouteInfo({
              afstand_m: route.distance,
              tijd_s: route.duration
            })
          } else {
            // Fallback: rechte lijnen
            const polyPoints = punten.map(p => [p.lat, p.lon])
            leaflet.polyline(polyPoints, {
              color: medewerkerKleur,
              weight: 3,
              opacity: 0.5,
              dashArray: '5,8',
            }).addTo(map)
            setError('Geen autoroute beschikbaar — rechte lijnen getoond')
          }
        } catch (e) {
          if (!cancelled) {
            // Fallback: gewoon rechte lijntjes tonen
            const punten = [
              { lat: bedrijfStart.lat, lon: bedrijfStart.lon },
              ...stopsMetCoords,
              { lat: bedrijfStart.lat, lon: bedrijfStart.lon }
            ]
            const polyPoints = punten.map(p => [p.lat, p.lon])
            leaflet.polyline(polyPoints, {
              color: medewerkerKleur,
              weight: 3,
              opacity: 0.5,
              dashArray: '5,8',
            }).addTo(map)
            console.warn('Route ophalen mislukt:', e.message)
          }
        } finally {
          if (!cancelled) setRouteLading(false)
        }
      }
    }
    
    init()
    
    return () => {
      cancelled = true
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [stops, medewerkerKleur, bedrijfStart, showRoute])
  
  return (
    <div style={{position:'relative', borderRadius:7, overflow:'hidden', border:'1px solid var(--gray-200)'}}>
      <div 
        ref={containerRef} 
        style={{
          width: '100%',
          height: hoogte,
          background: '#f5f5f4',
        }}
      />
      
      {/* Overlay met route info */}
      {routeInfo && (
        <div style={{
          position:'absolute', top:8, right:8,
          background:'rgba(255,255,255,.95)',
          padding:'6px 10px', borderRadius:6,
          fontSize:11, fontWeight:700,
          boxShadow:'0 1px 4px rgba(0,0,0,.15)',
          zIndex:1000,
        }}>
          🛣️ {formatAfstand(routeInfo.afstand_m)} · {formatTijd(routeInfo.tijd_s)}
        </div>
      )}
      
      {routeLading && (
        <div style={{
          position:'absolute', top:8, left:8,
          background:'rgba(255,255,255,.95)',
          padding:'4px 8px', borderRadius:5,
          fontSize:10, fontWeight:600, color:'var(--gray-600)',
          boxShadow:'0 1px 3px rgba(0,0,0,.15)',
          zIndex:1000,
        }}>
          Route berekenen…
        </div>
      )}
      
      {error && (
        <div style={{
          position:'absolute', bottom:8, left:8, right:8,
          background:'rgba(254,242,242,.95)',
          padding:'5px 10px', borderRadius:5,
          fontSize:10.5, fontWeight:600, color:'#991b1b',
          boxShadow:'0 1px 3px rgba(0,0,0,.15)',
          zIndex:1000,
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  )
}
