/**
 * useMapDraw — Custom polygon drawing hook for MapLibre GL
 * 
 * Implements click-to-draw polygon functionality using MapLibre's
 * native GeoJSON source/layer APIs. No external drawing libraries needed.
 */
import { useCallback, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';

const DRAW_SOURCE = 'draw-polygon-source';
const DRAW_FILL_LAYER = 'draw-polygon-fill';
const DRAW_LINE_LAYER = 'draw-polygon-line';
const DRAW_VERTEX_LAYER = 'draw-polygon-vertices';

export type DrawMode = 'idle' | 'drawing';

export function useMapDraw(
  mapRef: React.MutableRefObject<maplibregl.Map | null>,
  onPolygonComplete?: (geojson: GeoJSON.FeatureCollection | null) => void,
) {
  const [drawMode, setDrawMode] = useState<DrawMode>('idle');
  const verticesRef = useRef<[number, number][]>([]);
  const clickHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);
  const dblClickHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);
  const mouseMoveHandlerRef = useRef<((e: maplibregl.MapMouseEvent) => void) | null>(null);

  const ensureSourceAndLayers = useCallback((map: maplibregl.Map) => {
    if (!map.getSource(DRAW_SOURCE)) {
      map.addSource(DRAW_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: DRAW_FILL_LAYER,
        type: 'fill',
        source: DRAW_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'fill-color': 'hsla(160, 84%, 39%, 0.15)',
          'fill-outline-color': 'hsla(160, 84%, 39%, 0.6)',
        },
      });

      map.addLayer({
        id: DRAW_LINE_LAYER,
        type: 'line',
        source: DRAW_SOURCE,
        filter: ['==', '$type', 'Polygon'],
        paint: {
          'line-color': 'hsl(160, 84%, 45%)',
          'line-width': 2,
        },
      });

      // Also add a line layer for the in-progress LineString
      if (!map.getLayer('draw-line-progress')) {
        map.addLayer({
          id: 'draw-line-progress',
          type: 'line',
          source: DRAW_SOURCE,
          filter: ['==', '$type', 'LineString'],
          paint: {
            'line-color': 'hsl(160, 84%, 55%)',
            'line-width': 2,
            'line-dasharray': [3, 3],
          },
        });
      }

      map.addLayer({
        id: DRAW_VERTEX_LAYER,
        type: 'circle',
        source: DRAW_SOURCE,
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 5,
          'circle-color': 'hsl(160, 84%, 50%)',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      });
    }
  }, []);

  const updateSource = useCallback((map: maplibregl.Map, vertices: [number, number][], cursorPos?: [number, number]) => {
    const source = map.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource;
    if (!source) return;

    const features: GeoJSON.Feature[] = [];

    // Vertex points
    vertices.forEach((v) => {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: v },
        properties: {},
      });
    });

    if (vertices.length >= 3) {
      // Complete polygon
      const ring = [...vertices, vertices[0]];
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: {},
      });
    } else if (vertices.length >= 1) {
      // In-progress line
      const lineCoords = cursorPos ? [...vertices, cursorPos] : [...vertices];
      if (lineCoords.length >= 2) {
        features.push({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: lineCoords },
          properties: {},
        });
      }
    }

    source.setData({ type: 'FeatureCollection', features });
  }, []);

  const startDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous
    verticesRef.current = [];
    ensureSourceAndLayers(map);
    updateSource(map, []);
    setDrawMode('drawing');

    map.getCanvas().style.cursor = 'crosshair';
    map.doubleClickZoom.disable();

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      verticesRef.current.push(coord);
      updateSource(map, verticesRef.current);
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      
      if (verticesRef.current.length >= 3) {
        // Finalize polygon
        const ring = [...verticesRef.current, verticesRef.current[0]];
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: {},
          }],
        };

        // Update display with final polygon (no cursor line)
        updateSource(map, verticesRef.current);

        if (onPolygonComplete) {
          onPolygonComplete(fc);
        }
      }

      // Cleanup handlers
      cleanup();
    };

    const onMouseMove = (e: maplibregl.MapMouseEvent) => {
      if (verticesRef.current.length >= 1) {
        updateSource(map, verticesRef.current, [e.lngLat.lng, e.lngLat.lat]);
      }
    };

    const cleanup = () => {
      map.off('click', onClick);
      map.off('dblclick', onDblClick);
      map.off('mousemove', onMouseMove);
      map.getCanvas().style.cursor = '';
      map.doubleClickZoom.enable();
      setDrawMode('idle');
      clickHandlerRef.current = null;
      dblClickHandlerRef.current = null;
      mouseMoveHandlerRef.current = null;
    };

    clickHandlerRef.current = onClick;
    dblClickHandlerRef.current = onDblClick;
    mouseMoveHandlerRef.current = onMouseMove;

    map.on('click', onClick);
    map.on('dblclick', onDblClick);
    map.on('mousemove', onMouseMove);
  }, [mapRef, ensureSourceAndLayers, updateSource, onPolygonComplete]);

  const clearDrawing = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    verticesRef.current = [];
    
    // Remove handlers if still active
    if (clickHandlerRef.current) map.off('click', clickHandlerRef.current);
    if (dblClickHandlerRef.current) map.off('dblclick', dblClickHandlerRef.current);
    if (mouseMoveHandlerRef.current) map.off('mousemove', mouseMoveHandlerRef.current);
    
    map.getCanvas().style.cursor = '';
    map.doubleClickZoom.enable();

    const source = map.getSource(DRAW_SOURCE) as maplibregl.GeoJSONSource;
    if (source) {
      source.setData({ type: 'FeatureCollection', features: [] });
    }
    
    setDrawMode('idle');
    
    if (onPolygonComplete) {
      onPolygonComplete(null);
    }
  }, [mapRef, onPolygonComplete]);

  return { drawMode, startDrawing, clearDrawing };
}
