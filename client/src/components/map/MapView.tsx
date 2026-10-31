/**
 * MapView — Interactive MapLibre GL JS map (centerpiece of the dashboard)
 * Module 1: Satellite basemap with navigation controls
 * Module 3: Custom polygon drawing and FlyTo functionality
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import type { FlyToOptions } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion } from 'framer-motion';
import {
  Maximize2,
  Minimize2,
  Crosshair,
  RotateCcw,
  Pentagon,
  Trash2,
} from 'lucide-react';
import { formatCoordinate } from '@/lib/utils';
import { useMapDraw } from '@/hooks/useMapDraw';

type Corners = [[number, number], [number, number], [number, number], [number, number]];
type RasterSpec = { kind: 'tiles'; url: string } | { kind: 'image'; url: string; coordinates: Corners };

export interface MapOverlays {
  bounds: Corners;
  ndviStart?: string;
  ndviEnd?: string;
  change?: string;
}

interface MapViewProps {
  flyToOptions?: FlyToOptions | null;
  onPolygonComplete?: (geojson: GeoJSON.FeatureCollection | null) => void;
  activeLayers?: string[];
  layerOpacities?: Record<string, number>;
  ndviTileUrl?: string | null;
  changeTileUrl?: string | null;
  /** Georeferenced PNG overlays of a precomputed case study. */
  overlays?: MapOverlays | null;
  /** Study area (role: 'site') and control ring (role: 'control') to outline. */
  studyArea?: GeoJSON.FeatureCollection | null;
}

export default function MapView({ 
  flyToOptions, 
  onPolygonComplete,
  activeLayers = ['satellite'],
  layerOpacities = {},
  ndviTileUrl,
  changeTileUrl,
  overlays,
  studyArea,
}: MapViewProps) {
  const layerKeys = useRef<Record<string, string | null>>({});
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(3);
  const [isLoaded, setIsLoaded] = useState(false);

  const { drawMode, startDrawing, clearDrawing } = useMapDraw(mapRef, onPolygonComplete);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      canvasContextAttributes: { preserveDrawingBuffer: true }, // Required for PDF map capture via toDataURL()
      style: {
        version: 8,
        name: 'Satellite',
        sources: {
          'satellite': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            maxzoom: 19,
            attribution: '&copy; Esri, Maxar, Earthstar Geographics',
          },
          'labels': {
            type: 'raster',
            tiles: [
              'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
            ],
            tileSize: 256,
            maxzoom: 19,
          },
        },
        layers: [
          {
            id: 'satellite-layer',
            type: 'raster',
            source: 'satellite',
            paint: {
              'raster-opacity': 1,
            },
          },
          {
            id: 'labels-layer',
            type: 'raster',
            source: 'labels',
            paint: {
              'raster-opacity': 0.85,
            },
          },
        ],
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
      },
      center: [78.9629, 20.5937], // India center (common mining regions)
      zoom: 3,
      minZoom: 2,
      maxZoom: 18,
      pitch: 0,
      bearing: 0,
    });

    // Navigation controls
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 200 }), 'bottom-left');
    map.addControl(new maplibregl.FullscreenControl(), 'top-right');

    // Track cursor position
    map.on('mousemove', (e) => {
      setCursorCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    map.on('zoom', () => {
      setZoom(Math.round(map.getZoom() * 10) / 10);
    });

    map.on('load', () => {
      setIsLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Handle EE Tile Layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    // A raster overlay is either Earth Engine tiles (live API) or a georeferenced PNG
    // (precomputed case studies). Sources are rebuilt whenever the URL changes.
    const manageLayer = (id: string, spec: RasterSpec | null, isActive: boolean, opacity: number) => {
      const sourceId = `${id}-source`;
      const layerId = `${id}-layer`;
      const key = spec ? spec.url : null;

      if (layerKeys.current[id] !== key || !isActive || !spec) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        layerKeys.current[id] = null;
      }
      if (!isActive || !spec) return;

      if (!map.getSource(sourceId)) {
        if (spec.kind === 'tiles') {
          map.addSource(sourceId, { type: 'raster', tiles: [spec.url], tileSize: 256 });
        } else {
          map.addSource(sourceId, { type: 'image', url: spec.url, coordinates: spec.coordinates });
        }
        layerKeys.current[id] = key;
      }
      if (!map.getLayer(layerId)) {
        // Add below the study-area outline and labels so they stay on top
        map.addLayer({
          id: layerId,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': opacity },
        }, map.getLayer('study-area-line') ? 'study-area-fill' : 'labels-layer');
      } else {
        map.setPaintProperty(layerId, 'raster-opacity', opacity);
      }
    };

    const tiles = (url?: string | null): RasterSpec | null => (url ? { kind: 'tiles', url } : null);
    const image = (url?: string): RasterSpec | null =>
      url && overlays ? { kind: 'image', url, coordinates: overlays.bounds } : null;

    manageLayer('ndvi', tiles(ndviTileUrl) ?? image(overlays?.ndviEnd), activeLayers.includes('ndvi'), layerOpacities['ndvi'] ?? 0.8);
    manageLayer('ndvi-start', image(overlays?.ndviStart), activeLayers.includes('ndvi-start'), layerOpacities['ndvi-start'] ?? 0.8);
    manageLayer('vegetation-loss', tiles(changeTileUrl) ?? image(overlays?.change), activeLayers.includes('vegetation-loss'), layerOpacities['vegetation-loss'] ?? 0.8);

    // Study area (and control ring) outline
    const showArea = activeLayers.includes('study-area') && !!studyArea;
    if (map.getSource('study-area')) {
      (map.getSource('study-area') as maplibregl.GeoJSONSource).setData(studyArea ?? { type: 'FeatureCollection', features: [] });
    } else if (studyArea) {
      map.addSource('study-area', { type: 'geojson', data: studyArea });
      map.addLayer({
        id: 'study-area-fill', type: 'fill', source: 'study-area',
        paint: { 'fill-color': ['match', ['get', 'role'], 'control', '#2ecc71', '#a855f7'], 'fill-opacity': 0.08 },
      }, 'labels-layer');
      map.addLayer({
        id: 'study-area-line', type: 'line', source: 'study-area',
        paint: {
          'line-color': ['match', ['get', 'role'], 'control', '#2ecc71', '#a855f7'],
          'line-width': 2,
          'line-dasharray': ['match', ['get', 'role'], 'control', ['literal', [2, 2]], ['literal', [1, 0]]],
        },
      }, 'labels-layer');
    }
    for (const l of ['study-area-fill', 'study-area-line']) {
      if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', showArea ? 'visible' : 'none');
    }

    // Also handle satellite base layer toggle if we want
    if (map.getLayer('satellite-layer')) {
      const satActive = activeLayers.includes('satellite');
      map.setLayoutProperty('satellite-layer', 'visibility', satActive ? 'visible' : 'none');
    }

  }, [isLoaded, activeLayers, layerOpacities, ndviTileUrl, changeTileUrl, overlays, studyArea]);

  // Handle flyToOptions prop changes
  useEffect(() => {
    if (mapRef.current && flyToOptions) {
      mapRef.current.flyTo({
        duration: 2000,
        ...flyToOptions,
      });
    }
  }, [flyToOptions]);

  const handleResetView = useCallback(() => {
    mapRef.current?.flyTo({
      center: [78.9629, 20.5937],
      zoom: 3,
      pitch: 0,
      bearing: 0,
      duration: 1500,
    });
  }, []);

  const handleCenterOnUser = useCallback(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          mapRef.current?.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 12,
            duration: 2000,
          });
        },
        () => {
          // Silently fail — not critical
        }
      );
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!mapContainer.current) return;
    if (!document.fullscreenElement) {
      mapContainer.current.parentElement?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  return (
    <motion.div
      className="mapview"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2 }}
    >
      {/* Map container */}
      <div ref={mapContainer} className="mapview-container" />

      {/* Loading overlay */}
      {!isLoaded && (
        <div className="mapview-loading">
          <div className="mapview-loading-spinner" />
          <span>Loading satellite imagery...</span>
        </div>
      )}

      {/* Custom controls overlay */}
      <div className="mapview-controls-left">
        <button
          className="mapview-ctrl-btn focus-ring"
          onClick={handleResetView}
          title="Reset view"
        >
          <RotateCcw size={16} />
        </button>
        <button
          className="mapview-ctrl-btn focus-ring"
          onClick={handleCenterOnUser}
          title="Center on my location"
        >
          <Crosshair size={16} />
        </button>
        <button
          className={`mapview-ctrl-btn focus-ring ${drawMode === 'drawing' ? 'active' : ''}`}
          onClick={startDrawing}
          title="Draw polygon"
        >
          <Pentagon size={16} />
        </button>
        <button
          className="mapview-ctrl-btn focus-ring"
          onClick={clearDrawing}
          title="Clear drawing"
        >
          <Trash2 size={16} />
        </button>
        <button
          className="mapview-ctrl-btn focus-ring"
          onClick={toggleFullscreen}
          title="Toggle fullscreen"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      {/* Drawing mode indicator */}
      {drawMode === 'drawing' && (
        <div className="mapview-draw-indicator glass">
          <Pentagon size={14} />
          <span>Click to add points · Double-click to finish</span>
        </div>
      )}

      {/* Coordinate & zoom bar */}
      <div className="mapview-infobar glass">
        <div className="mapview-infobar-item">
          <span className="mapview-infobar-label">Cursor</span>
          <span className="mapview-infobar-value font-mono">
            {cursorCoords ? formatCoordinate(cursorCoords.lat, cursorCoords.lng) : '—'}
          </span>
        </div>
        <div className="mapview-infobar-divider" />
        <div className="mapview-infobar-item">
          <span className="mapview-infobar-label">Zoom</span>
          <span className="mapview-infobar-value font-mono">{zoom.toFixed(1)}x</span>
        </div>
      </div>

      <style>{`
        .mapview {
          flex: 1;
          position: relative;
          overflow: hidden;
          background: var(--bg-primary);
        }

        .mapview-container {
          width: 100%;
          height: 100%;
        }

        /* Loading overlay */
        .mapview-loading {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--space-3);
          background: var(--bg-primary);
          z-index: 10;
          color: var(--text-secondary);
          font-size: 13px;
        }

        .mapview-loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Left controls */
        .mapview-controls-left {
          position: absolute;
          top: var(--space-3);
          left: var(--space-3);
          display: flex;
          flex-direction: column;
          gap: 2px;
          z-index: 5;
          background: var(--bg-glass);
          backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
          box-shadow: var(--shadow-md);
        }

        .mapview-ctrl-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .mapview-ctrl-btn:hover {
          background: var(--bg-glass-hover);
          color: var(--text-primary);
        }

        .mapview-ctrl-btn.active {
          background: hsla(160, 84%, 39%, 0.2);
          color: var(--accent-primary);
        }

        .mapview-ctrl-btn + .mapview-ctrl-btn {
          border-top: 1px solid var(--border);
        }

        /* Draw indicator */
        .mapview-draw-indicator {
          position: absolute;
          top: var(--space-3);
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 8px 16px;
          border-radius: var(--radius-full);
          font-size: 12px;
          color: var(--accent-primary);
          z-index: 5;
          animation: pulse-glow 2s ease-in-out infinite;
        }

        /* Info bar */
        .mapview-infobar {
          position: absolute;
          bottom: var(--space-3);
          right: var(--space-3);
          display: flex;
          align-items: center;
          gap: var(--space-3);
          padding: 6px var(--space-3);
          border-radius: var(--radius-sm);
          z-index: 5;
          font-size: 11px;
        }

        .mapview-infobar-item {
          display: flex;
          align-items: center;
          gap: var(--space-2);
        }

        .mapview-infobar-label {
          color: var(--text-tertiary);
          font-weight: 500;
          text-transform: uppercase;
          font-size: 9px;
          letter-spacing: 0.05em;
        }

        .mapview-infobar-value {
          color: var(--text-primary);
          font-size: 11px;
        }

        .mapview-infobar-divider {
          width: 1px;
          height: 16px;
          background: var(--border);
        }
      `}</style>
    </motion.div>
  );
}
