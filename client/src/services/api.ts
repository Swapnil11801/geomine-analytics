// In development Vite proxies /api to the FastAPI server (see vite.config.ts).
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export interface AnalysisRequest {
  geometry: GeoJSON.FeatureCollection | GeoJSON.Geometry;
  start_year: number;
  end_year: number;
  season?: string;
}

export interface TimeSeriesData {
  year: number;
  ndvi: number;
  controlNdvi?: number | null;
  coverage?: number;
  imageCount?: number;
  source?: string;
  resolution?: number;
}

export interface LandCoverData {
  class: string;
  value: number;
}

export interface MannKendallResult {
  tau: number;
  p_value: number;
  s: number;
  significance: 'significant' | 'marginal' | 'not_significant' | 'insufficient_data';
  trend: 'increasing' | 'decreasing' | 'no_trend';
  sens_slope: number;
  r1?: number;
  variance_factor?: number;
}

export interface ChangePointResult {
  change_year: number | null;
  k: number;
  p_value: number;
  mean_before: number | null;
  mean_after: number | null;
}

export interface AnalysisResponse {
  timeSeries: TimeSeriesData[];
  summary: {
    vegetationLoss: number;
    vegetationLossPct?: number | null;
    controlVegetationLossPct?: number | null;
    averageNdvi: number;
    no2Level: number | null;
    waterIndex: number | null;
  };
  landCover: LandCoverData[];
  landCoverYear?: number | null;
  season?: string;
  seasonLabel?: string;
  mannKendall?: MannKendallResult | null;
  controlTrend?: MannKendallResult | null;
  differenceTrend?: MannKendallResult | null;
  changePoint?: ChangePointResult | null;
  yearRange?: { start: number; end: number };
  controlGeometry?: GeoJSON.Geometry;
  /** Case studies only: the area − control slope judged against placebo sites without a mine. */
  placebo?: {
    n_placebos: number;
    n_at_least_as_extreme: number;
    empirical_p: number;
    placebo_mk_significant: number;
    site_slope_per_decade: number;
    placebo_slopes_per_decade: number[];
  } | null;
}

export interface TileResponse {
  success: boolean;
  tile_url: string;
  year?: number;
  type?: string;
  image_count?: number;
  source?: string;
}

/** A precomputed case study shipped with the static demo (research/run_case_studies.py). */
export interface DemoOverlay { file: string; year?: number; years?: number[]; source: string }
export interface DemoSite {
  id: string;
  name: string;
  country: string;
  season: string;
  geometry: GeoJSON.Geometry;
  analysis: AnalysisResponse;
  overlays: {
    bounds: [[number, number], [number, number], [number, number], [number, number]];
    ndvi_start: DemoOverlay;
    ndvi_end: DemoOverlay;
    change: DemoOverlay;
  };
}

const demoUrl = (file: string) => `${import.meta.env.BASE_URL}demo/${file}`;

export const api = {
  async runAnalysis(req: AnalysisRequest): Promise<AnalysisResponse> {
    const response = await fetch(`${API_BASE_URL}/analysis/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geometry: req.geometry.type === 'FeatureCollection' 
          ? (req.geometry as GeoJSON.FeatureCollection).features[0].geometry 
          : req.geometry,
        start_year: req.start_year,
        end_year: req.end_year,
        season: req.season || 'nov_feb',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to run analysis');
    }

    return response.json();
  },

  async loadDemoIndex(): Promise<{ id: string; name: string; country: string; season: string }[]> {
    const res = await fetch(demoUrl('index.json'));
    return res.ok ? res.json() : [];
  },

  async loadDemo(id: string): Promise<DemoSite> {
    const res = await fetch(demoUrl(`${id}.json`));
    if (!res.ok) throw new Error(`Case study "${id}" not found`);
    const site: DemoSite = await res.json();
    for (const k of ['ndvi_start', 'ndvi_end', 'change'] as const) site.overlays[k].file = demoUrl(site.overlays[k].file);
    return site;
  },

  async getNdviTiles(geometry: GeoJSON.FeatureCollection | GeoJSON.Geometry, year: number, season = 'nov_feb'): Promise<TileResponse> {
    const response = await fetch(`${API_BASE_URL}/ee/tiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geometry: geometry.type === 'FeatureCollection' 
          ? (geometry as GeoJSON.FeatureCollection).features[0].geometry 
          : geometry,
        year,
        season,
        layer_type: 'ndvi',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to generate tiles');
    }

    return response.json();
  },

  async getChangeTiles(
    geometry: GeoJSON.FeatureCollection | GeoJSON.Geometry,
    startYear: number,
    endYear: number,
    season = 'nov_feb'
  ): Promise<TileResponse> {
    const response = await fetch(`${API_BASE_URL}/ee/tiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        geometry: geometry.type === 'FeatureCollection' 
          ? (geometry as GeoJSON.FeatureCollection).features[0].geometry 
          : geometry,
        year: endYear,
        layer_type: 'change',
        season,
        start_year: startYear,
        end_year: endYear,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to generate change tiles');
    }

    return response.json();
  },
};
