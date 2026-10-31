/**
 * Application-wide type definitions
 */

/** Geographic coordinate pair */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Bounding box for study areas */
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Year range for temporal analysis */
export interface YearRange {
  start: number;
  end: number;
}

/** Environmental index identifier */
export type IndexType = 'ndvi' | 'ndwi' | 'mndwi' | 'ndbi' | 'bsi';

/** Analysis layer configuration */
export interface AnalysisLayer {
  id: string;
  label: string;
  description: string;
  icon: string;
  enabled: boolean;
  color: string;
}

/** Metric card data */
export interface MetricData {
  id: string;
  label: string;
  value: string | number | null;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  color?: string;
  loading?: boolean;
}

/** API health response */
export interface HealthResponse {
  status: string;
  service: string;
  version: string;
}

/** Panel visibility state */
export interface PanelState {
  sidebar: boolean;
  bottomPanel: boolean;
  rightPanel: boolean;
}
