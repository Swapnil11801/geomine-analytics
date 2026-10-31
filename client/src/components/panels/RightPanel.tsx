/**
 * RightPanel — Statistical summary panel with metric cards and sparklines
 * Module 5: Real data integration, sparklines, land cover summary
 * Module 7: Regression trend card
 */
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronLeft,
  TreePine,
  TrendingDown,
  TrendingUp,
  Minus,
  Droplets,
  Wind,
  BarChart3,
  ArrowUpRight,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AnalysisResponse, MannKendallResult } from '@/services/api';
import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts';

interface RightPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  data?: AnalysisResponse | null;
  isLoading?: boolean;
}

function Sparkline({ data }: { data: { ndvi: number }[] }) {
  if (!data || data.length === 0) return null;
  return (
    <div style={{ width: 60, height: 30 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="ndvi"
            stroke="hsl(160,84%,39%)"
            strokeWidth={1.5}
            dot={false}
          />
          <Tooltip
            contentStyle={{ display: 'none' }}
            wrapperStyle={{ display: 'none' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  unit,
  trend,
  color,
  loading,
  sparkData,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number | null;
  unit?: string;
  trend?: 'up' | 'down' | 'stable';
  color: string;
  loading: boolean;
  sparkData?: { ndvi: number }[];
  description?: string;
}) {
  return (
    <div className="metric-card glass">
      <div className="metric-card-header">
        <div className="metric-card-icon" style={{ color }}>
          {icon}
        </div>
        <span className="metric-card-label">{label}</span>
        {sparkData && <Sparkline data={sparkData} />}
      </div>

      <div className="metric-card-body">
        {loading ? (
          <div className="metric-card-skeleton">
            <div className="skeleton" style={{ width: '60%', height: 24, borderRadius: 4 }} />
            <div className="skeleton" style={{ width: '35%', height: 13, borderRadius: 4, marginTop: 5 }} />
          </div>
        ) : (
          <div className="metric-value-block">
            <span className="metric-card-value font-mono" style={{ color }}>
              {value !== null && value !== undefined ? value : '—'}
            </span>
            {unit && <span className="metric-card-unit">{unit}</span>}
            {description && <p className="metric-card-desc">{description}</p>}
          </div>
        )}

        {!loading && trend && (
          <div className={cn('metric-card-trend', trend === 'up' && 'trend-up', trend === 'down' && 'trend-down', trend === 'stable' && 'trend-stable')}>
            {trend === 'up' ? <TrendingUp size={11} /> : trend === 'down' ? <TrendingDown size={11} /> : <Minus size={11} />}
          </div>
        )}
      </div>
    </div>
  );
}

function TrendRow({ label, t, strong }: { label: string; t: MannKendallResult; strong?: boolean }) {
  const sig = t.significance === 'significant' ? 'p < 0.05' : t.significance === 'marginal' ? 'p < 0.10' : 'n.s.';
  const color = t.significance === 'significant' ? (t.sens_slope < 0 ? 'var(--accent-danger)' : 'hsl(120,60%,45%)')
    : t.significance === 'marginal' ? 'hsl(40,80%,50%)' : 'var(--text-secondary)';
  return (
    <div className="rp-trend-row" style={{ fontWeight: strong ? 600 : 400 }}>
      <span className="rp-trend-label">{label}</span>
      <span className="font-mono" style={{ color }}>
        {t.sens_slope > 0 ? '+' : ''}{(t.sens_slope * 10).toFixed(3)}/dec
      </span>
      <span className="font-mono rp-trend-p" style={{ color }}>
        p={t.p_value < 0.001 ? '<0.001' : t.p_value.toFixed(3)} · {sig}
      </span>
    </div>
  );
}

export default function RightPanel({ isOpen, onToggle, data, isLoading }: RightPanelProps) {
  const loading = isLoading ?? (!data);

  const ndviTrend = data?.timeSeries && data.timeSeries.length >= 2
    ? (data.timeSeries[data.timeSeries.length - 1].ndvi > data.timeSeries[0].ndvi ? 'up' : 'down')
    : 'stable';


  return (
    <div className="right-panel-wrapper">
      <button className="right-panel-toggle" onClick={onToggle} title={isOpen ? 'Close stats' : 'Open stats'}>
        {isOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.aside
            className="right-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 'var(--right-panel-width)', opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="right-panel-inner">
              <div className="right-panel-header">
                <h2 className="right-panel-title">Statistical Summary</h2>
                <span className="right-panel-subtitle">
                  {data ? `${data.seasonLabel ?? ''} composites · harmonised Landsat` : 'Run analysis to populate'}
                </span>
              </div>

              <div className="right-panel-metrics">
                {isLoading && (
                  <div className="rp-loading">
                    <Loader2 className="spinning" size={18} style={{ color: 'var(--accent-primary)' }} />
                    <span>Computing…</span>
                  </div>
                )}

                <MetricCard
                  icon={<TreePine size={16} />}
                  label="Vegetation Loss"
                  value={data?.summary.vegetationLoss}
                  unit="ha"
                  trend={data && data.summary.vegetationLoss > 0 ? 'down' : 'stable'}
                  color="var(--accent-danger)"
                  loading={loading}
                  description={data
                    ? `NDVI > 0.3 in ${data.yearRange?.start} but not in ${data.yearRange?.end}`
                      + (data.summary.vegetationLossPct != null
                        ? ` · ${data.summary.vegetationLossPct}% of area vs ${data.summary.controlVegetationLossPct ?? '—'}% of control ring`
                        : '')
                    : undefined}
                />

                <MetricCard
                  icon={<BarChart3 size={16} />}
                  label="Average NDVI"
                  value={data?.summary.averageNdvi}
                  unit=""
                  trend={ndviTrend as 'up' | 'down' | 'stable'}
                  color="hsl(120, 60%, 45%)"
                  loading={loading}
                  sparkData={data?.timeSeries}
                  description={data?.summary.averageNdvi !== undefined
                    ? data.summary.averageNdvi < 0.2 ? 'Low vegetation density'
                    : data.summary.averageNdvi < 0.4 ? 'Moderate vegetation'
                    : 'Dense vegetation'
                    : undefined}
                />

                <MetricCard
                  icon={<Wind size={16} />}
                  label="NO₂ Level"
                  value={data?.summary.no2Level}
                  unit="µmol/m²"
                  color="hsl(280, 60%, 55%)"
                  loading={loading}
                  description="Tropospheric column, Sentinel-5P (2019+), area + 10 km. Pixels are ~5 km, so this describes the surroundings, not the site alone."
                />

                <MetricCard
                  icon={<Droplets size={16} />}
                  label="Water Index"
                  value={data?.summary.waterIndex}
                  unit=""
                  trend="stable"
                  color="hsl(200, 80%, 50%)"
                  loading={loading}
                  description={data?.summary.waterIndex != null
                    ? `Mean NDWI ${data.yearRange?.end} · ${data.summary.waterIndex > 0 ? 'open water dominates' : 'mostly land'}`
                    : undefined}
                />

                {/* Mann-Kendall trends: footprint, control ring and their difference */}
                {data?.mannKendall && (
                  <div className="metric-card glass" style={{ marginTop: 4 }}>
                    <div className="metric-card-header">
                      <div className="metric-card-icon" style={{ color: 'hsl(190, 70%, 50%)' }}>
                        <TrendingUp size={16} />
                      </div>
                      <span className="metric-card-label">NDVI trends (Mann-Kendall)</span>
                    </div>
                    <TrendRow label="Study area" t={data.mannKendall} />
                    {data.controlTrend && <TrendRow label="Control ring" t={data.controlTrend} />}
                    {data.differenceTrend && <TrendRow label="Area − control" t={data.differenceTrend} strong />}
                    {data.changePoint?.change_year && (
                      <p className="rp-trend-note">
                        Pettitt change point in (area − control): <b>{data.changePoint.change_year}</b>
                        {' '}(p = {data.changePoint.p_value < 0.001 ? '<0.001' : data.changePoint.p_value.toFixed(3)};
                        {' '}mean {data.changePoint.mean_before?.toFixed(3)} → {data.changePoint.mean_after?.toFixed(3)})
                      </p>
                    )}
                    {data.placebo && (
                      <p className="rp-trend-note">
                        <b>Placebo test:</b> {data.placebo.n_at_least_as_extreme} of {data.placebo.n_placebos} nearby
                        areas without a mine had an area − control slope at least this steep (empirical
                        p = {data.placebo.empirical_p.toFixed(3)}). {data.placebo.placebo_mk_significant} of them
                        were nonetheless "significant" by Mann-Kendall.
                      </p>
                    )}
                    <p className="rp-trend-note">
                      The control ring (0.5–3 km outside the area) captures regional changes such as climate and
                      farming. Caution: in our placebo tests most areas <i>without</i> a mine also had a significant
                      area − control trend, so compare the slope's size with the placebo range in the paper, not just
                      the p-value. p-values are corrected for autocorrelation (Hamed &amp; Rao, 1998).
                    </p>
                  </div>
                )}

                {/* Land Cover Summary */}
                {data?.landCover && data.landCover.length > 0 && (
                  <div className="metric-card glass" style={{ marginTop: 4 }}>
                    <div className="metric-card-header">
                      <div className="metric-card-icon" style={{ color: 'hsl(30, 60%, 50%)' }}>
                        <ArrowUpRight size={16} />
                      </div>
                      <span className="metric-card-label">Land Cover {data.landCoverYear ?? ''} (Dynamic World)</span>
                    </div>
                    <div className="rp-landcover-list">
                      {data.landCover.slice(0, 4).map((item, i) => (
                        <div key={i} className="rp-lc-row">
                          <div className="rp-lc-bar-track">
                            <div
                              className="rp-lc-bar-fill"
                              style={{
                                width: `${item.value}%`,
                                background: `hsl(${90 + i * 40}, 55%, 45%)`,
                              }}
                            />
                          </div>
                          <span className="rp-lc-label">{item.class}</span>
                          <span className="rp-lc-value font-mono">{item.value.toFixed(0)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="right-panel-footer">
                <p className="right-panel-footer-text">
                  {data
                    ? `Analysis complete · ${data.timeSeries?.length || 0} years of data`
                    : 'Select a study area and run analysis to populate these metrics.'}
                </p>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <style>{`
        .right-panel-wrapper { display: flex; position: relative; }

        .right-panel-toggle {
          position: absolute; left: -14px; top: 50%;
          transform: translateY(-50%); z-index: 10;
          width: 28px; height: 56px;
          display: flex; align-items: center; justify-content: center;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-right: none; border-radius: var(--radius-sm) 0 0 var(--radius-sm);
          color: var(--text-tertiary); cursor: pointer;
          transition: all var(--transition-fast);
        }
        .right-panel-toggle:hover { color: var(--text-primary); background: var(--bg-elevated); }

        .right-panel {
          background: var(--bg-secondary); border-left: 1px solid var(--border);
          overflow: hidden; flex-shrink: 0;
        }

        .right-panel-inner {
          width: var(--right-panel-width); height: 100%;
          display: flex; flex-direction: column; overflow-y: auto;
        }

        .right-panel-header {
          padding: var(--space-4); border-bottom: 1px solid var(--border);
        }
        .right-panel-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
        .right-panel-subtitle { font-size: 11px; color: var(--text-tertiary); }

        .right-panel-metrics {
          flex: 1; padding: var(--space-3);
          display: flex; flex-direction: column; gap: var(--space-2);
          overflow-y: auto;
        }

        .rp-trend-row {
          display: grid;
          grid-template-columns: 1fr auto;
          column-gap: 8px;
          font-size: 11px;
          margin-top: 6px;
          color: var(--text-primary);
        }
        .rp-trend-p { grid-column: 1 / -1; font-size: 10px; }
        .rp-trend-note {
          font-size: 10px;
          color: var(--text-secondary);
          margin-top: 6px;
          line-height: 1.4;
        }
        .rp-loading {
          display: flex; align-items: center; gap: var(--space-2);
          font-size: 12px; color: var(--text-tertiary);
          padding: var(--space-2);
        }

        /* Metric Cards */
        .metric-card {
          padding: var(--space-3); border-radius: var(--radius-md);
          transition: all var(--transition-fast);
        }
        .metric-card:hover { background: var(--bg-glass-hover); border-color: var(--border-hover); }

        .metric-card-header {
          display: flex; align-items: center; gap: var(--space-2);
          margin-bottom: var(--space-2);
        }
        .metric-card-icon { display: flex; align-items: center; opacity: 0.8; }
        .metric-card-label {
          flex: 1; font-size: 11px; font-weight: 500;
          color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em;
        }

        .metric-card-body {
          display: flex; align-items: flex-end; justify-content: space-between;
        }
        .metric-card-skeleton { display: flex; flex-direction: column; width: 100%; }

        .metric-value-block { display: flex; flex-direction: column; gap: 2px; }

        .metric-card-value {
          font-size: 22px; font-weight: 700; line-height: 1;
        }
        .metric-card-unit {
          font-size: 10px; font-weight: 400;
          color: var(--text-tertiary); margin-top: 2px;
        }
        .metric-card-desc {
          font-size: 10px; color: var(--text-tertiary); margin-top: 2px;
        }

        .metric-card-trend {
          display: flex; align-items: center; gap: 3px;
          font-size: 11px; font-weight: 500; padding: 2px 6px;
          border-radius: var(--radius-full);
        }
        .trend-up { color: var(--accent-danger); background: var(--accent-danger-muted); }
        .trend-down { color: var(--accent-primary); background: var(--accent-primary-muted); }
        .trend-stable { color: var(--text-secondary); background: var(--bg-elevated); }

        /* Land cover bars */
        .rp-landcover-list { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }

        .rp-lc-row { display: flex; align-items: center; gap: var(--space-2); }

        .rp-lc-bar-track {
          width: 60px; height: 4px;
          background: var(--bg-elevated); border-radius: 2px; overflow: hidden;
          flex-shrink: 0;
        }
        .rp-lc-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
        .rp-lc-label { flex: 1; font-size: 11px; color: var(--text-secondary); }
        .rp-lc-value { font-size: 11px; color: var(--text-primary); }

        .right-panel-footer {
          padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border);
        }
        .right-panel-footer-text { font-size: 11px; color: var(--text-tertiary); text-align: center; line-height: 1.5; }

        .spinning { animation: rp-spin 1s linear infinite; }
        @keyframes rp-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
