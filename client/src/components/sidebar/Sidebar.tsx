/**
 * Sidebar — Left panel with study area controls, year range, analysis layers
 * Module 3: Study Area selection, Geocoding, and Case Studies
 */
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  MapPin,
  Calendar,
  Layers,
  Play,
  Download,
  FileText,
  TreePine,
  Building,
  Flame,
  ChevronDown,
  Sparkles,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlyToOptions } from 'maplibre-gl';
import { caseStudies } from '@/lib/caseStudies';

interface SidebarProps {
  isOpen: boolean;
  studyAreaGeoJSON?: GeoJSON.FeatureCollection | null;
  onLocationSelect?: (options: FlyToOptions) => void;
  onAnalyze?: (startYear: number, endYear: number, season: string) => void;
  isAnalyzing?: boolean;
  onExport?: () => void;
  activeLayers: string[];
  layerOpacities: Record<string, number>;
  onToggleLayer: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  hasTiles: boolean;
  onGeneratePdf?: () => void;
  isGeneratingPdf?: boolean;
  apiOnline: boolean;
  onLoadCaseStudy?: (id: string) => void;
}

interface LayerItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  enabled: boolean;
}

const defaultLayers: LayerItem[] = [
  { id: 'satellite', label: 'Satellite', icon: <Sparkles size={15} />, color: 'var(--accent-secondary)', enabled: true },
  { id: 'study-area', label: 'Study area & control ring', icon: <Building size={15} />, color: 'hsl(280, 60%, 55%)', enabled: true },
  { id: 'ndvi', label: 'NDVI (end year)', icon: <TreePine size={15} />, color: 'hsl(120, 60%, 45%)', enabled: false },
  { id: 'ndvi-start', label: 'NDVI (start year)', icon: <TreePine size={15} />, color: 'hsl(90, 50%, 45%)', enabled: false },
  { id: 'vegetation-loss', label: 'NDVI change', icon: <Flame size={15} />, color: 'var(--accent-danger)', enabled: false },
];

export default function Sidebar({ 
  isOpen, 
  studyAreaGeoJSON, 
  onLocationSelect, 
  onAnalyze, 
  isAnalyzing, 
  onExport,
  activeLayers,
  layerOpacities,
  onToggleLayer,
  onOpacityChange,
  hasTiles,
  onGeneratePdf,
  isGeneratingPdf,
  apiOnline,
  onLoadCaseStudy,
}: SidebarProps) {
  const [yearRange, setYearRange] = useState<[number, number]>([1990, 2024]);
  const [season, setSeason] = useState<string>('nov_feb');
  const [expandedSection, setExpandedSection] = useState<string | null>('area');

  // Search state
  const [searchValue, setSearchValue] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toggleSection = (section: string) => {
    setExpandedSection(prev => prev === section ? null : section);
  };

  // Handle Geocoding Search (Nominatim)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    if (val.length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5`);
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        console.error("Geocoding error", err);
      } finally {
        setIsSearching(false);
      }
    }, 500);
  };

  const handleSelectResult = (result: any) => {
    setSearchValue(result.display_name);
    setSearchResults([]);
    if (onLocationSelect) {
      onLocationSelect({
        center: [parseFloat(result.lon), parseFloat(result.lat)],
        zoom: 12,
      });
    }
  };

  const handleSelectCaseStudy = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const siteId = e.target.value;
    if (!siteId) return;
    
    const site = caseStudies.find(s => s.id === siteId);
    if (site?.precomputed && onLoadCaseStudy) {
      onLoadCaseStudy(site.id);
    } else if (site && onLocationSelect) {
      onLocationSelect({
        center: [site.coordinates.lng, site.coordinates.lat],
        zoom: site.zoom,
      });
    }
  };

  // Derive Study Area stats from GeoJSON
  let hasStudyArea = false;
  let pointCount = 0;
  if (studyAreaGeoJSON && studyAreaGeoJSON.features.length > 0) {
    hasStudyArea = true;
    const geom = studyAreaGeoJSON.features[0].geometry;
    if (geom.type === 'Polygon') {
      pointCount = geom.coordinates[0].length;
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          className="sidebar"
          initial={{ x: -280, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -280, opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Search Location */}
          <div className="sidebar-section">
            <div className="sidebar-search">
              {isSearching ? (
                <Loader2 size={15} className="sidebar-search-icon spinning" />
              ) : (
                <Search size={15} className="sidebar-search-icon" />
              )}
              <input
                type="text"
                className="sidebar-search-input focus-ring"
                placeholder="Search location (e.g., Bingham)"
                value={searchValue}
                onChange={handleSearchChange}
              />
              
              {/* Search Results Dropdown */}
              {searchResults.length > 0 && (
                <div className="sidebar-search-results">
                  {searchResults.map((res: any) => (
                    <div 
                      key={res.place_id} 
                      className="sidebar-search-result-item"
                      onClick={() => handleSelectResult(res)}
                    >
                      {res.display_name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Study Area */}
          <div className="sidebar-section">
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection('area')}
            >
              <div className="sidebar-section-header-left">
                <MapPin size={15} />
                <span>Study Area</span>
              </div>
              <ChevronDown
                size={14}
                className={cn('sidebar-chevron', expandedSection === 'area' && 'rotated')}
              />
            </button>
            <AnimatePresence>
              {expandedSection === 'area' && (
                <motion.div
                  className="sidebar-section-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="sidebar-info-card">
                    
                    <div className="sidebar-case-study">
                      <label className="sidebar-info-label">Pre-defined Mining Sites</label>
                      <select className="sidebar-select focus-ring" onChange={handleSelectCaseStudy} defaultValue="">
                        <option value="" disabled>Select a known site...</option>
                        <optgroup label="Case studies (precomputed 1990–2024)">
                          {caseStudies.filter(s => s.precomputed).map(site => (
                            <option key={site.id} value={site.id}>{site.name} ({site.country})</option>
                          ))}
                        </optgroup>
                        <optgroup label="Fly to (draw an area to analyse)">
                          {caseStudies.filter(s => !s.precomputed).map(site => (
                            <option key={site.id} value={site.id}>{site.name} ({site.country})</option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    <div className="sidebar-info-row" style={{ marginTop: '12px' }}>
                      <span className="sidebar-info-label">Custom ROI Status</span>
                      <span className="sidebar-info-value font-mono">
                        {hasStudyArea ? (
                          <span style={{color: 'var(--accent-primary)'}}>Selected ✓</span>
                        ) : (
                          <span style={{color: 'var(--text-tertiary)'}}>Not drawn</span>
                        )}
                      </span>
                    </div>
                    
                    {hasStudyArea && (
                      <div className="sidebar-info-row">
                        <span className="sidebar-info-label">Polygon Vertices</span>
                        <span className="sidebar-info-value font-mono">{pointCount - 1}</span>
                      </div>
                    )}
                    
                    <p className="sidebar-hint">
                      Pick a case study to see its precomputed results. To analyse your own area, run the
                      Earth Engine server locally and draw a polygon with the controls at the top left.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Year Range */}
          <div className="sidebar-section">
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection('year')}
            >
              <div className="sidebar-section-header-left">
                <Calendar size={15} />
                <span>Year Range</span>
              </div>
              <ChevronDown
                size={14}
                className={cn('sidebar-chevron', expandedSection === 'year' && 'rotated')}
              />
            </button>
            <AnimatePresence>
              {expandedSection === 'year' && (
                <motion.div
                  className="sidebar-section-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="sidebar-year-range">
                    <div className="sidebar-year-labels">
                      <span className="font-mono">{yearRange[0]}</span>
                      <span className="sidebar-year-separator">—</span>
                      <span className="font-mono">{yearRange[1]}</span>
                    </div>
                    <div className="sidebar-year-sliders">
                      <input
                        type="range"
                        min={1990}
                        max={2024}
                        value={yearRange[0]}
                        onChange={(e) => setYearRange([Math.min(Number(e.target.value), yearRange[1] - 1), yearRange[1]])}
                        className="sidebar-slider"
                      />
                      <input
                        type="range"
                        min={1990}
                        max={2024}
                        value={yearRange[1]}
                        onChange={(e) => setYearRange([yearRange[0], Math.max(Number(e.target.value), yearRange[0] + 1)])}
                        className="sidebar-slider"
                      />
                    </div>
                    <div className="sidebar-year-ticks">
                      {[1990, 1995, 2000, 2005, 2010, 2015, 2020, 2024].map(y => (
                        <span key={y} className="sidebar-year-tick font-mono">{y}</span>
                      ))}
                    </div>
                    <p style={{ fontSize: '9px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.3', opacity: 0.6 }}>
                      Time series: Landsat 5/7/8/9 (30 m), harmonised. Maps: Sentinel-2 (10 m) from 2017.
                    </p>

                    {/* Season Selector */}
                    <div className="sidebar-season" style={{ marginTop: '12px' }}>
                      <label className="sidebar-label" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                        Compositing Season
                      </label>
                      <select
                        className="sidebar-select"
                        value={season}
                        onChange={(e) => setSeason(e.target.value)}
                      >
                        <option value="nov_feb">Nov – Feb</option>
                        <option value="jun_sep">Jun – Sep</option>
                        <option value="full_year">Full year (Jan – Dec)</option>
                      </select>
                      <p style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: '1.4', opacity: 0.7 }}>
                        {season === 'nov_feb' && 'Dry, low-cloud season in South Asia. "2020" means Nov 2020 – Feb 2021.'}
                        {season === 'jun_sep' && 'Growing season in the northern mid-latitudes (Europe, North America).'}
                        {season === 'full_year' && '⚠ The seasonal mix of cloud-free images differs between years.'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Analysis Layers */}
          <div className="sidebar-section sidebar-section-grow">
            <button
              className="sidebar-section-header"
              onClick={() => toggleSection('layers')}
            >
              <div className="sidebar-section-header-left">
                <Layers size={15} />
                <span>Analysis Layers</span>
              </div>
              <ChevronDown
                size={14}
                className={cn('sidebar-chevron', expandedSection === 'layers' && 'rotated')}
              />
            </button>
            <AnimatePresence>
              {expandedSection === 'layers' && (
                <motion.div
                  className="sidebar-section-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="sidebar-layers">
                    {defaultLayers.map(layer => {
                      const isEnabled = activeLayers.includes(layer.id);
                      // Only allow enabling EE layers if tiles are generated (unless it's just 'satellite' or 'mine-boundary')
                      const isEELayer = ['ndvi', 'ndvi-start', 'vegetation-loss'].includes(layer.id);
                      const isDisabled = isEELayer && !hasTiles;
                      
                      return (
                        <div key={layer.id} className="sidebar-layer-wrapper">
                          <button
                            className={cn('sidebar-layer', isEnabled && 'active', isDisabled && 'disabled')}
                            onClick={() => {
                              if (!isDisabled) onToggleLayer(layer.id);
                            }}
                            title={isDisabled ? "Run analysis first to enable this layer" : ""}
                          >
                            <div
                              className="sidebar-layer-indicator"
                              style={{
                                background: isEnabled ? layer.color : 'transparent',
                                borderColor: isDisabled ? 'var(--border)' : layer.color,
                              }}
                            />
                            <span className="sidebar-layer-icon" style={{ color: isEnabled ? layer.color : 'var(--text-secondary)' }}>
                              {layer.icon}
                            </span>
                            <span className="sidebar-layer-label">{layer.label}</span>
                          </button>
                          
                          {isEnabled && layerOpacities[layer.id] !== undefined && (
                            <div className="sidebar-layer-opacity">
                              <span className="sidebar-opacity-label">Opacity</span>
                              <input
                                type="range"
                                min={0}
                                max={1}
                                step={0.01}
                                value={layerOpacities[layer.id]}
                                onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value))}
                                className="sidebar-slider"
                              />
                              <span className="sidebar-opacity-val font-mono">{Math.round(layerOpacities[layer.id] * 100)}%</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Buttons */}
          <div className="sidebar-actions">
            <button 
              className={cn("sidebar-btn sidebar-btn-primary focus-ring", (!hasStudyArea || isAnalyzing || !apiOnline) && "disabled")}
              disabled={!hasStudyArea || isAnalyzing || !apiOnline}
              title={apiOnline ? '' : 'Needs the Earth Engine server (see README). Case studies work without it.'}
              onClick={() => onAnalyze && onAnalyze(yearRange[0], yearRange[1], season)}
            >
              {isAnalyzing ? <Loader2 size={15} className="spinning" /> : <Play size={15} />}
              <span>
                {isAnalyzing ? "Analyzing..." : !apiOnline ? "Run Analysis (needs local server)" : hasStudyArea ? "Run Analysis" : "Select Area First"}
              </span>
            </button>
            <button
              className="sidebar-btn sidebar-btn-secondary focus-ring"
              onClick={() => onExport && onExport()}
            >
              <Download size={15} />
              <span>Export JSON</span>
            </button>
            <button
              className={cn("sidebar-btn sidebar-btn-secondary focus-ring", isGeneratingPdf && "disabled")}
              disabled={isGeneratingPdf}
              onClick={() => onGeneratePdf && onGeneratePdf()}
            >
              <FileText size={15} />
              <span>{isGeneratingPdf ? 'Generating...' : 'Generate PDF'}</span>
            </button>
          </div>

          <style>{`
            .sidebar {
              width: var(--sidebar-width);
              min-width: var(--sidebar-width);
              background: var(--bg-secondary);
              border-right: 1px solid var(--border);
              display: flex;
              flex-direction: column;
              overflow-y: auto;
              overflow-x: hidden;
              z-index: 50;
            }

            .sidebar-section {
              border-bottom: 1px solid var(--border);
            }

            .sidebar-section-grow {
              flex: 1;
              overflow-y: auto;
            }

            .sidebar-section-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              width: 100%;
              padding: var(--space-3) var(--space-4);
              background: transparent;
              border: none;
              color: var(--text-secondary);
              font-size: 11px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              cursor: pointer;
              transition: all var(--transition-fast);
            }

            .sidebar-section-header:hover {
              color: var(--text-primary);
              background: hsla(215, 25%, 20%, 0.3);
            }

            .sidebar-section-header-left {
              display: flex;
              align-items: center;
              gap: var(--space-2);
            }

            .sidebar-chevron {
              transition: transform var(--transition-fast);
            }

            .sidebar-chevron.rotated {
              transform: rotate(180deg);
            }

            .sidebar-section-content {
              overflow: hidden;
            }

            /* Search */
            .sidebar-search {
              position: relative;
              padding: var(--space-3) var(--space-4);
            }

            .sidebar-search-icon {
              position: absolute;
              left: calc(var(--space-4) + 10px);
              top: 25px;
              transform: translateY(-50%);
              color: var(--text-tertiary);
              pointer-events: none;
            }

            .spinning {
              animation: spin 1s linear infinite;
            }
            @keyframes spin {
              from { transform: translateY(-50%) rotate(0deg); }
              to { transform: translateY(-50%) rotate(360deg); }
            }

            .sidebar-search-input {
              width: 100%;
              padding: 9px 12px 9px 36px;
              background: var(--bg-elevated);
              border: 1px solid var(--border);
              border-radius: var(--radius-md);
              color: var(--text-primary);
              font-size: 13px;
              font-family: var(--font-sans);
              transition: all var(--transition-fast);
            }

            .sidebar-search-input::placeholder {
              color: var(--text-tertiary);
            }

            .sidebar-search-input:focus {
              outline: none;
              border-color: var(--border-focus);
              background: var(--bg-surface);
              box-shadow: 0 0 0 3px var(--accent-primary-muted);
            }

            .sidebar-search-results {
              position: absolute;
              top: calc(100% - 10px);
              left: var(--space-4);
              right: var(--space-4);
              background: var(--bg-elevated);
              border: 1px solid var(--border);
              border-radius: 0 0 var(--radius-md) var(--radius-md);
              box-shadow: var(--shadow-lg);
              z-index: 100;
              max-height: 200px;
              overflow-y: auto;
            }

            .sidebar-search-result-item {
              padding: 10px 12px;
              font-size: 12px;
              color: var(--text-secondary);
              cursor: pointer;
              border-bottom: 1px solid var(--border);
            }
            .sidebar-search-result-item:last-child {
              border-bottom: none;
            }
            .sidebar-search-result-item:hover {
              background: var(--bg-surface);
              color: var(--text-primary);
            }

            /* Info Card */
            .sidebar-info-card {
              padding: 0 var(--space-4) var(--space-3);
            }

            .sidebar-case-study {
              display: flex;
              flex-direction: column;
              gap: 6px;
            }

            .sidebar-select {
              width: 100%;
              padding: 8px 10px;
              background: var(--bg-elevated);
              border: 1px solid var(--border);
              border-radius: var(--radius-sm);
              color: var(--text-primary);
              font-size: 13px;
              font-family: var(--font-sans);
              outline: none;
            }

            .sidebar-info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 6px 0;
            }

            .sidebar-info-row + .sidebar-info-row {
              border-top: 1px solid hsla(215, 25%, 25%, 0.3);
            }

            .sidebar-info-label {
              font-size: 12px;
              color: var(--text-secondary);
            }

            .sidebar-info-value {
              font-size: 12px;
              color: var(--text-primary);
            }

            .sidebar-hint {
              font-size: 11px;
              color: var(--text-tertiary);
              line-height: 1.5;
              margin-top: var(--space-2);
              padding: var(--space-2) var(--space-3);
              background: var(--bg-elevated);
              border-radius: var(--radius-sm);
              border: 1px dashed var(--border);
            }

            /* Year Range */
            .sidebar-year-range {
              padding: 0 var(--space-4) var(--space-3);
            }

            .sidebar-year-labels {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: var(--space-3);
              margin-bottom: var(--space-3);
              font-size: 20px;
              font-weight: 600;
              color: var(--accent-primary);
            }

            .sidebar-year-separator {
              color: var(--text-tertiary);
              font-size: 14px;
            }

            .sidebar-year-sliders {
              display: flex;
              flex-direction: column;
              gap: var(--space-2);
            }

            .sidebar-slider {
              -webkit-appearance: none;
              appearance: none;
              width: 100%;
              height: 4px;
              background: var(--bg-elevated);
              border-radius: var(--radius-full);
              outline: none;
              cursor: pointer;
            }

            .sidebar-slider::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 16px;
              height: 16px;
              background: var(--accent-primary);
              border-radius: 50%;
              cursor: pointer;
              box-shadow: 0 0 6px hsla(160, 84%, 39%, 0.4);
              transition: transform var(--transition-fast);
            }

            .sidebar-slider::-webkit-slider-thumb:hover {
              transform: scale(1.2);
            }

            .sidebar-year-ticks {
              display: flex;
              justify-content: space-between;
              margin-top: var(--space-2);
            }

            .sidebar-year-tick {
              font-size: 9px;
              color: var(--text-tertiary);
            }

            /* Layers */
            .sidebar-layers {
              padding: 0 var(--space-3) var(--space-3);
              display: flex;
              flex-direction: column;
              gap: 2px;
            }

            .sidebar-layer {
              display: flex;
              align-items: center;
              gap: var(--space-2);
              padding: 8px var(--space-3);
              background: transparent;
              border: 1px solid transparent;
              border-radius: var(--radius-sm);
              color: var(--text-secondary);
              font-size: 13px;
              cursor: pointer;
              transition: all var(--transition-fast);
              text-align: left;
              width: 100%;
            }

            .sidebar-layer:hover {
              background: var(--bg-elevated);
              color: var(--text-primary);
            }

            .sidebar-layer.active {
              background: var(--bg-elevated);
              border-color: var(--border);
              color: var(--text-primary);
            }

            .sidebar-layer-indicator {
              width: 8px;
              height: 8px;
              border-radius: 50%;
              border: 2px solid;
              flex-shrink: 0;
              transition: all var(--transition-fast);
            }

            .sidebar-layer-icon {
              display: flex;
              align-items: center;
              transition: color var(--transition-fast);
            }

            .sidebar-layer-label {
              flex: 1;
            }

            /* Actions */
            .sidebar-actions {
              padding: var(--space-3) var(--space-4);
              display: flex;
              flex-direction: column;
              gap: var(--space-2);
              border-top: 1px solid var(--border);
            }

            .sidebar-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: var(--space-2);
              padding: 10px var(--space-4);
              border: none;
              border-radius: var(--radius-md);
              font-size: 13px;
              font-weight: 600;
              font-family: var(--font-sans);
              cursor: pointer;
              transition: all var(--transition-fast);
            }
            
            .sidebar-btn.disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            .sidebar-btn-primary {
              background: linear-gradient(135deg, var(--accent-primary), hsl(170, 70%, 35%));
              color: white;
              box-shadow: 0 2px 8px hsla(160, 84%, 39%, 0.3);
            }

            .sidebar-btn-primary:not(.disabled):hover {
              box-shadow: 0 4px 16px hsla(160, 84%, 39%, 0.4);
              transform: translateY(-1px);
            }

            .sidebar-btn-primary:not(.disabled):active {
              transform: translateY(0);
            }

            .sidebar-btn-secondary {
              background: var(--bg-elevated);
              color: var(--text-secondary);
              border: 1px solid var(--border);
            }

            .sidebar-btn-secondary:hover {
              background: var(--bg-surface);
              color: var(--text-primary);
              border-color: var(--border-hover);
            }
          `}</style>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
