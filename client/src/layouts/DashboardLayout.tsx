/**
 * DashboardLayout — Multi-panel layout assembling all dashboard components
 */
import { useState, useMemo, useCallback } from 'react';
import TopBar from '@/components/panels/TopBar';
import type { ApiStatus } from '@/components/panels/TopBar';
import Sidebar from '@/components/sidebar/Sidebar';
import MapView from '@/components/map/MapView';
import type { MapOverlays } from '@/components/map/MapView';
import BottomPanel from '@/components/panels/BottomPanel';
import RightPanel from '@/components/panels/RightPanel';
import type { FlyToOptions } from 'maplibre-gl';
import { api } from '@/services/api';
import type { AnalysisResponse } from '@/services/api';
import { useToast } from '@/components/ui/ToastProvider';
import { generatePdfReport } from '@/lib/pdfReport';
import { linearRegression } from '@/lib/regression';

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bottomPanelOpen, setBottomPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // Map state
  const [mapFlyTo, setMapFlyTo] = useState<FlyToOptions | null>(null);
  const [studyAreaGeoJSON, setStudyAreaGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [yearRange, setYearRange] = useState<[number, number]>([1990, 2024]);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [siteName, setSiteName] = useState<string | undefined>(undefined);
  const [overlays, setOverlays] = useState<MapOverlays | null>(null);

  // Layers state
  const [activeLayers, setActiveLayers] = useState<string[]>(['satellite', 'study-area']);
  const [layerOpacities, setLayerOpacities] = useState<Record<string, number>>({
    ndvi: 0.8,
    'ndvi-start': 0.8,
    'vegetation-loss': 0.8,
  });

  // Tile URLs
  const [ndviTileUrl, setNdviTileUrl] = useState<string | null>(null);
  const [changeTileUrl, setChangeTileUrl] = useState<string | null>(null);

  const { toast } = useToast();

  const handleExport = () => {
    if (!analysisData) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      studyArea: studyAreaGeoJSON,
      results: analysisData,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `geomine-analysis-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Analysis exported as JSON');
  };

  // Outline of the study area plus the control ring returned by the analysis
  const outline = useMemo<GeoJSON.FeatureCollection | null>(() => {
    const site = studyAreaGeoJSON?.features[0]?.geometry;
    if (!site) return null;
    const features: GeoJSON.Feature[] = [{ type: 'Feature', geometry: site, properties: { role: 'site' } }];
    if (analysisData?.controlGeometry) {
      features.push({ type: 'Feature', geometry: analysisData.controlGeometry, properties: { role: 'control' } });
    }
    return { type: 'FeatureCollection', features };
  }, [studyAreaGeoJSON, analysisData?.controlGeometry]);

  const handleStatusChange = useCallback((s: ApiStatus) => setApiStatus(s), []);

  const handleLoadCaseStudy = async (id: string) => {
    setIsAnalyzing(true);
    setNdviTileUrl(null);
    setChangeTileUrl(null);
    try {
      const site = await api.loadDemo(id);
      setStudyAreaGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: site.geometry, properties: {} }] });
      setAnalysisData(site.analysis);
      setSiteName(`${site.name}, ${site.country}`);
      const yr = site.analysis.yearRange;
      if (yr) setYearRange([yr.start, yr.end]);
      setOverlays({
        bounds: site.overlays.bounds,
        ndviStart: site.overlays.ndvi_start.file,
        ndviEnd: site.overlays.ndvi_end.file,
        change: site.overlays.change.file,
      });
      const [w, n] = site.overlays.bounds[0];
      const [e, so] = site.overlays.bounds[2];
      setMapFlyTo({ center: [(w + e) / 2, (n + so) / 2], zoom: Math.min(14, Math.log2(360 / (e - w)) + 0.6) });
      setActiveLayers(prev => Array.from(new Set([...prev, 'study-area', 'vegetation-loss'])));
      toast.success(`${site.name}: precomputed ${yr?.start}–${yr?.end} results (${site.analysis.seasonLabel})`);
    } catch (err: any) {
      toast.error(err.message || 'Could not load case study');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyze = async (startYear: number, endYear: number, season: string = 'nov_feb') => {
    if (!studyAreaGeoJSON) return;

    setIsAnalyzing(true);
    setNdviTileUrl(null);
    setChangeTileUrl(null);
    setOverlays(null);
    setSiteName(undefined);

    try {
      const data = await api.runAnalysis({
        geometry: studyAreaGeoJSON,
        start_year: startYear,
        end_year: endYear,
        season,
      });
      setAnalysisData(data);
      setYearRange([startYear, endYear]);
      const seasonLabel = data.seasonLabel || season;
      toast.success(`Analysis complete — ${data.timeSeries?.length || 0} years (${seasonLabel})`);

      // Fetch tile URLs in background
      api.getNdviTiles(studyAreaGeoJSON, endYear, season)
        .then(res => setNdviTileUrl(res.tile_url))
        .catch(e => toast.warning(`NDVI tiles: ${e.message}`));

      api.getChangeTiles(studyAreaGeoJSON, startYear, endYear, season)
        .then(res => setChangeTileUrl(res.tile_url))
        .catch(e => toast.warning(`Change tiles: ${e.message}`));

    } catch (err: any) {
      toast.error(err.message || 'Analysis failed — check your study area');
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleLayer = (layerId: string) => {
    setActiveLayers(prev => 
      prev.includes(layerId) ? prev.filter(l => l !== layerId) : [...prev, layerId]
    );
  };

  const handleOpacityChange = (layerId: string, opacity: number) => {
    setLayerOpacities(prev => ({ ...prev, [layerId]: opacity }));
  };

  // Regression for PDF report
  const regression = useMemo(() => {
    if (!analysisData?.timeSeries || analysisData.timeSeries.length < 2) return null;
    return linearRegression(analysisData.timeSeries.map(d => ({ x: d.year, y: d.ndvi })));
  }, [analysisData?.timeSeries]);

  const handleGeneratePdf = async () => {
    if (!analysisData) {
      toast.warning('Run an analysis first before generating a PDF');
      return;
    }
    setIsGeneratingPdf(true);
    toast.success('Generating PDF report…');
    try {
      await generatePdfReport({
        analysisData,
        regression,
        siteName,
        yearRange,
      });
      toast.success('PDF report downloaded successfully');
    } catch (err: any) {
      toast.error(`PDF generation failed: ${err.message}`);
      console.error(err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="dashboard">
      <TopBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        onStatusChange={handleStatusChange}
      />

      <div className="dashboard-body">
        <Sidebar 
          isOpen={sidebarOpen}
          studyAreaGeoJSON={studyAreaGeoJSON}
          onLocationSelect={(options) => setMapFlyTo(options)}
          onLoadCaseStudy={handleLoadCaseStudy}
          apiOnline={apiStatus === 'online'}
          onAnalyze={handleAnalyze}
          isAnalyzing={isAnalyzing}
          onExport={handleExport}
          activeLayers={activeLayers}
          layerOpacities={layerOpacities}
          onToggleLayer={handleToggleLayer}
          onOpacityChange={handleOpacityChange}
          hasTiles={!!ndviTileUrl || !!overlays}
          onGeneratePdf={handleGeneratePdf}
          isGeneratingPdf={isGeneratingPdf}
        />

        <div className="dashboard-center">
          <MapView 
            flyToOptions={mapFlyTo}
            onPolygonComplete={(geojson) => { setStudyAreaGeoJSON(geojson); setOverlays(null); setAnalysisData(null); }}
            activeLayers={activeLayers}
            layerOpacities={layerOpacities}
            ndviTileUrl={ndviTileUrl}
            changeTileUrl={changeTileUrl}
            overlays={overlays}
            studyArea={outline}
          />
          <BottomPanel
            isOpen={bottomPanelOpen}
            onToggle={() => setBottomPanelOpen(prev => !prev)}
            data={analysisData?.timeSeries}
            landCover={analysisData?.landCover}
            changeYear={analysisData?.changePoint?.change_year}
            isLoading={isAnalyzing}
          />
        </div>

        <RightPanel
          isOpen={rightPanelOpen}
          onToggle={() => setRightPanelOpen(prev => !prev)}
          data={analysisData}
          isLoading={isAnalyzing}
        />
      </div>

      <style>{`
        .dashboard {
          width: 100vw;
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-primary);
        }

        .dashboard-body {
          flex: 1;
          display: flex;
          overflow: hidden;
          position: relative;
        }

        .dashboard-center {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
        }
      `}</style>
    </div>
  );
}
