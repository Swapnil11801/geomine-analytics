/**
 * BottomPanel — Collapsible chart area with all analysis visualizations
 * Module 5: NDVI time series, vegetation bar chart, land cover pie, scatter
 * Module 7: Linear regression trendlines with R² annotations
 * Module 10: Enhanced loading skeletons
 */
import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  BarChart3,
  ScatterChart,
  LineChart,
  PieChart as PieChartIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { linearRegression, getTrendDescription } from '@/lib/regression';
import type { TimeSeriesData, LandCoverData } from '@/services/api';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
  ReferenceLine,
} from 'recharts';

interface BottomPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  data?: TimeSeriesData[];
  landCover?: LandCoverData[];
  changeYear?: number | null;
  isLoading?: boolean;
}

const LAND_COVER_COLORS = [
  'hsl(120, 60%, 40%)',
  'hsl(80, 50%, 45%)',
  'hsl(40, 60%, 50%)',
  'hsl(200, 70%, 50%)',
  'hsl(30, 40%, 45%)',
  'hsl(0, 60%, 50%)',
  'hsl(270, 50%, 55%)',
];

const tabs = [
  { id: 'timeseries', label: 'NDVI Time Series', icon: <LineChart size={14} /> },
  { id: 'bar', label: 'Vegetation Change', icon: <BarChart3 size={14} /> },
  { id: 'landcover', label: 'Land Cover', icon: <PieChartIcon size={14} /> },
  { id: 'difference', label: 'Area − Control', icon: <ScatterChart size={14} /> },
];

const CustomTooltipStyle = {
  backgroundColor: 'var(--bg-elevated)',
  borderColor: 'var(--border)',
  borderRadius: '8px',
  boxShadow: 'var(--shadow-lg)',
};

const labelStyle = { color: 'var(--text-primary)', marginBottom: 4, fontWeight: 600 };
const itemStyle = { color: 'var(--accent-primary)', fontSize: 12 };

export default function BottomPanel({ isOpen, onToggle, data, landCover, isLoading, changeYear }: BottomPanelProps) {
  const [activeTab, setActiveTab] = useState('timeseries');

  // Derived data for bar chart (year-over-year NDVI change)
  const barData = data
    ? data.map((d, i) => ({
        year: d.year,
        ndvi: d.ndvi,
        change: i > 0 && data[i - 1] ? +(d.ndvi - data[i - 1].ndvi).toFixed(4) : 0,
      }))
    : [];

  // Linear regression
  const regression = useMemo(() => {
    if (!data || data.length < 2) return null;
    const points = data.map(d => ({ x: d.year, y: d.ndvi }));
    return linearRegression(points);
  }, [data]);

  const differenceData = useMemo(() => (data ?? [])
    .filter(d => d.controlNdvi != null)
    .map(d => ({ year: d.year, difference: +(d.ndvi - (d.controlNdvi as number)).toFixed(4) })), [data]);

  // Merged data for time series with trendline
  const timeSeriesWithTrend = useMemo(() => {
    if (!data) return [];
    if (!regression) return data.map(d => ({ ...d, trend: undefined as number | undefined }));
    return data.map(d => {
      const pred = regression.predictions.find(p => p.x === d.year);
      return { ...d, trend: pred?.y };
    });
  }, [data, regression]);

  const renderRegressionBadge = () => {
    if (!regression) return null;
    return (
      <div className="bp-regression-badge">
        <span className="bp-reg-r2 font-mono">R² = {regression.r2.toFixed(3)}</span>
        <span className="bp-reg-slope font-mono">
          slope = {regression.slope > 0 ? '+' : ''}{regression.slope.toFixed(4)}/yr
        </span>
        <span className="bp-reg-desc">{getTrendDescription(regression)}</span>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="bp-loading-skeleton">
          <div className="bp-skel-chart-area">
            {/* Fake Y axis */}
            <div className="bp-skel-y-axis">
              {[0.4, 0.3, 0.2, 0.1, 0].map(v => (
                <span key={v} className="bp-skel-y-label skeleton" />
              ))}
            </div>
            {/* Fake chart area with animated bars */}
            <div className="bp-skel-bars">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="bp-skel-bar-col">
                  <div
                    className="bp-skel-bar skeleton"
                    style={{
                      height: `${30 + Math.sin(i * 0.8) * 25 + 20}%`,
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                  <span className="bp-skel-x-label skeleton" />
                </div>
              ))}
            </div>
          </div>
          <div className="bp-loading-text">
            <div className="bp-loading-pulse" />
            <div>
              <p>Running Earth Engine computations…</p>
              <p className="bp-loading-sub">This may take 20–60 seconds depending on area size.</p>
            </div>
          </div>
        </div>
      );
    }

    if (!data || data.length === 0) {
      return (
        <div className="bp-placeholder">
          <div className="bp-skeleton-chart">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bp-skeleton-bar skeleton" style={{ height: `${25 + Math.random() * 55}%`, animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          <p className="bp-empty-text">
            Pick a case study under <strong>Study Area</strong>, or draw an area and click <strong>Run Analysis</strong> (needs the local server).
          </p>
        </div>
      );
    }

    switch (activeTab) {
      case 'timeseries':
        return (
          <div className="bp-chart-with-badge">
            {renderRegressionBadge()}
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesWithTrend} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="ndviGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(160,84%,39%)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(160,84%,39%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="year" stroke="transparent" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} dy={8} />
                <YAxis stroke="transparent" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} dx={-8} />
                <Tooltip contentStyle={CustomTooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
                <Area type="monotone" dataKey="ndvi" name="Study area NDVI" stroke="hsl(160,84%,39%)" strokeWidth={2.5} fill="url(#ndviGrad)" dot={{ fill: 'hsl(160,84%,39%)', r: 3 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="controlNdvi" name="Control ring NDVI" stroke="hsl(210,70%,60%)" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                {regression && (
                  <Line
                    type="monotone"
                    dataKey="trend"
                    name="Trend"
                    stroke="hsl(40,90%,60%)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    dot={false}
                    activeDot={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" stroke="transparent" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} dy={8} />
              <YAxis stroke="transparent" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} dx={-8} />
              <Tooltip contentStyle={CustomTooltipStyle} labelStyle={labelStyle} itemStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-secondary)', paddingTop: 8 }} />
              <Bar dataKey="ndvi" name="NDVI" fill="hsl(160,84%,39%)" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Bar dataKey="change" name="YoY Change" fill="hsl(200,80%,50%)" radius={[3, 3, 0, 0]} opacity={0.85} />
              {regression && (
                <ReferenceLine y={regression.intercept + regression.slope * ((data?.[0]?.year ?? 2018) + (data?.length ?? 7) / 2)} stroke="hsl(40,90%,60%)" strokeDasharray="4 3" label={{ value: `avg trend`, fill: 'hsl(40,90%,60%)', fontSize: 10 }} />
              )}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'landcover':
        if (!landCover || landCover.length === 0) {
          return <div className="bp-message"><p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No land cover data available for this region.</p></div>;
        }
        return (
          <div className="bp-landcover-layout">
            <ResponsiveContainer width="50%" height="100%">
              <PieChart>
                <Pie
                  data={landCover}
                  dataKey="value"
                  nameKey="class"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                  label={({ value }) => `${value.toFixed(0)}%`}
                  labelLine={false}
                >
                  {landCover.map((_, i) => (
                    <Cell key={i} fill={LAND_COVER_COLORS[i % LAND_COVER_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CustomTooltipStyle} formatter={(v: any) => [`${v}%`, 'Coverage']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="bp-landcover-legend">
              {landCover.map((item, i) => (
                <div key={i} className="bp-legend-item">
                  <div className="bp-legend-dot" style={{ background: LAND_COVER_COLORS[i % LAND_COVER_COLORS.length] }} />
                  <span className="bp-legend-label">{item.class}</span>
                  <span className="bp-legend-value font-mono">{item.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'difference':
        return (
          <div className="bp-chart-with-badge">
            <div className="bp-regression-badge">
              <span className="bp-reg-desc">
                Study area minus control ring. Regional effects (weather, farming) cancel out; what remains is change at the site.
                {changeYear ? ` Dashed line: Pettitt change point (${changeYear}).` : ''}
              </span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={differenceData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="year" stroke="transparent" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} dy={8} />
                <YAxis stroke="transparent" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} tickLine={false} dx={-8} />
                <Tooltip contentStyle={CustomTooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
                <ReferenceLine y={0} stroke="var(--text-tertiary)" />
                {changeYear && <ReferenceLine x={changeYear} stroke="hsl(30,90%,55%)" strokeDasharray="5 4" />}
                <Line type="monotone" dataKey="difference" name="NDVI area − control" stroke="hsl(280,60%,60%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bottom-panel-wrapper">
      <button className="bottom-panel-handle" onClick={onToggle}>
        <div className="bottom-panel-handle-line" />
        <div className="bottom-panel-handle-label">
          {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          <span>Charts</span>
          {data && data.length > 0 && !isLoading && (
            <span className="bp-data-badge">{data.length} years</span>
          )}
        </div>
        <div className="bottom-panel-handle-line" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="bottom-panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'var(--bottom-panel-height)', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="bottom-panel-tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={cn('bottom-panel-tab', activeTab === tab.id && 'active')}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="bottom-panel-content">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab + (data ? 'data' : 'empty')}
                  className="bp-chart-area"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .bottom-panel-wrapper {
          background: var(--bg-secondary);
          border-top: 1px solid var(--border);
        }

        .bottom-panel-handle {
          display: flex;
          align-items: center;
          gap: var(--space-3);
          width: 100%;
          padding: 6px var(--space-4);
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-tertiary);
          transition: color var(--transition-fast);
        }
        .bottom-panel-handle:hover { color: var(--text-secondary); }

        .bottom-panel-handle-line {
          flex: 1; height: 1px; background: var(--border);
        }

        .bottom-panel-handle-label {
          display: flex; align-items: center; gap: var(--space-2);
          font-size: 11px; font-weight: 500; text-transform: uppercase;
          letter-spacing: 0.05em; white-space: nowrap;
        }

        .bp-data-badge {
          background: hsla(160,84%,39%,0.15);
          color: var(--accent-primary);
          padding: 1px 6px;
          border-radius: var(--radius-full);
          font-size: 10px;
        }

        .bottom-panel {
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .bottom-panel-tabs {
          display: flex; gap: 2px;
          padding: 0 var(--space-4);
          border-bottom: 1px solid var(--border);
          background: var(--bg-secondary);
          flex-shrink: 0;
          overflow-x: auto;
        }

        .bottom-panel-tab {
          display: flex; align-items: center; gap: var(--space-1);
          padding: 8px var(--space-3);
          background: transparent; border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-tertiary);
          font-size: 12px; font-weight: 500;
          font-family: var(--font-sans);
          cursor: pointer;
          transition: all var(--transition-fast);
          white-space: nowrap;
        }
        .bottom-panel-tab:hover { color: var(--text-secondary); }
        .bottom-panel-tab.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }

        .bottom-panel-content {
          flex: 1; padding: var(--space-3) var(--space-4);
          overflow: hidden; display: flex; flex-direction: column;
        }

        .bp-chart-area {
          flex: 1; width: 100%; height: 100%;
        }

        .bp-chart-with-badge {
          position: relative; width: 100%; height: 100%;
        }

        /* Regression badge */
        .bp-regression-badge {
          position: absolute; top: 4px; right: 28px; z-index: 5;
          display: flex; gap: 10px; align-items: center;
          background: var(--bg-glass);
          backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 5px 12px;
          font-size: 11px;
        }
        .bp-reg-r2 {
          color: hsl(40, 90%, 60%);
          font-weight: 600;
        }
        .bp-reg-slope {
          color: var(--text-secondary);
        }
        .bp-reg-desc {
          color: var(--text-tertiary);
          font-size: 10px;
        }

        .bp-landcover-layout {
          display: flex; height: 100%; align-items: center;
        }

        .bp-landcover-legend {
          flex: 1; display: flex; flex-direction: column;
          gap: 6px; padding-left: var(--space-4);
          overflow-y: auto; max-height: 200px;
        }

        .bp-legend-item {
          display: flex; align-items: center; gap: var(--space-2);
          font-size: 12px;
        }

        .bp-legend-dot {
          width: 8px; height: 8px;
          border-radius: 50%; flex-shrink: 0;
        }

        .bp-legend-label {
          flex: 1; color: var(--text-secondary);
        }

        .bp-legend-value {
          color: var(--text-primary); font-size: 11px;
        }

        .bp-message {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          height: 100%;
          color: var(--text-secondary); font-size: 13px;
          text-align: center;
        }

        .bp-placeholder {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          height: 100%; gap: var(--space-3);
        }

        .bp-skeleton-chart {
          display: flex; align-items: flex-end;
          gap: 6px; height: 80px; padding: 0 var(--space-4);
        }

        .bp-skeleton-bar {
          width: 18px; border-radius: 3px 3px 0 0; opacity: 0.5;
        }

        .bp-empty-text {
          font-size: 12px; color: var(--text-tertiary); text-align: center;
        }
        .bp-empty-text strong { color: var(--accent-primary); }

        /* Enhanced loading skeleton */
        .bp-loading-skeleton {
          display: flex; flex-direction: column; height: 100%; gap: var(--space-3);
        }
        .bp-skel-chart-area {
          flex: 1; display: flex; gap: 8px;
        }
        .bp-skel-y-axis {
          display: flex; flex-direction: column; justify-content: space-between;
          padding: 4px 0;
        }
        .bp-skel-y-label {
          width: 24px; height: 8px; border-radius: 3px;
        }
        .bp-skel-bars {
          flex: 1; display: flex; align-items: flex-end; gap: 6px;
          padding-bottom: 20px;
        }
        .bp-skel-bar-col {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          gap: 4px; height: 100%; justify-content: flex-end;
        }
        .bp-skel-bar {
          width: 100%; max-width: 28px; border-radius: 4px 4px 0 0;
          opacity: 0.4;
        }
        .bp-skel-x-label {
          width: 20px; height: 6px; border-radius: 2px; flex-shrink: 0;
        }

        .bp-loading-text {
          display: flex; align-items: center; gap: 10px;
          justify-content: center;
          font-size: 12px; color: var(--text-secondary);
        }
        .bp-loading-sub {
          font-size: 11px; color: var(--text-tertiary); margin-top: 2px;
        }
        .bp-loading-pulse {
          width: 10px; height: 10px; border-radius: 50%;
          background: var(--accent-primary);
          animation: bp-pulse 1.4s ease-in-out infinite;
        }

        @keyframes bp-pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
