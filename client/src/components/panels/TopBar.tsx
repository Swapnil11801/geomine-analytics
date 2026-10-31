/**
 * TopBar — Application header with project title and status indicators
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Satellite,
  Activity,
  Wifi,
  WifiOff,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { HealthResponse } from '@/types';

export type ApiStatus = 'checking' | 'online' | 'offline';

interface TopBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onStatusChange?: (status: ApiStatus) => void;
}

const REPO = 'https://github.com/Swapnil11801/geomine-analytics';

export default function TopBar({ sidebarOpen, onToggleSidebar, onStatusChange }: TopBarProps) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [_healthData, setHealthData] = useState<HealthResponse | null>(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/health');
        if (res.ok && res.headers.get('content-type')?.includes('json')) {
          const data: HealthResponse = await res.json();
          setHealthData(data);
          setApiStatus('online');
        } else {
          setApiStatus('offline');
        }
      } catch {
        setApiStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 300000); // 5 minutes
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { onStatusChange?.(apiStatus); }, [apiStatus, onStatusChange]);

  return (
    <motion.header
      className="topbar"
      initial={{ y: -56, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="topbar-left">
        <button
          className="topbar-toggle focus-ring"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>

        <div className="topbar-logo">
          <div className="topbar-logo-icon">
            <Satellite size={20} />
          </div>
          <div className="topbar-logo-text">
            <h1 className="topbar-title">GeoMine Analytics</h1>
            <div className="topbar-breadcrumb">
              <span>Mining-induced vegetation change</span>
              <ChevronRight size={12} />
              <span>Landsat 1990–2024</span>
            </div>
          </div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-status">
          <div className={`topbar-status-dot ${apiStatus}`} />
          {apiStatus === 'checking' ? (
            <Activity size={14} className="topbar-status-icon spinning" />
          ) : apiStatus === 'online' ? (
            <Wifi size={14} className="topbar-status-icon" />
          ) : (
            <WifiOff size={14} className="topbar-status-icon" />
          )}
          <span className="topbar-status-label" title={apiStatus === 'offline'
            ? 'No Earth Engine server: showing precomputed case studies. Run the server locally to analyse your own areas.' : ''}>
            {apiStatus === 'checking' ? 'API …' : apiStatus === 'online' ? 'API online' : 'Demo mode'}
          </span>
        </div>

        <a className="topbar-link" href={`${REPO}/blob/main/RESEARCH.md`} target="_blank" rel="noreferrer">Research</a>
        <a className="topbar-link" href={REPO} target="_blank" rel="noreferrer">Code</a>
      </div>

      <style>{`
        .topbar {
          height: var(--topbar-height);
          background: var(--bg-secondary);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-4);
          gap: var(--space-4);
          z-index: 100;
          position: relative;
        }

        .topbar-link {
          font-size: 12px;
          color: var(--text-secondary);
          text-decoration: none;
          padding: 4px 8px;
          border: 1px solid var(--border);
          border-radius: 6px;
        }
        .topbar-link:hover { color: var(--text-primary); }

        .topbar-left {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .topbar-toggle {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          background: transparent;
          border: 1px solid transparent;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .topbar-toggle:hover {
          background: var(--bg-elevated);
          border-color: var(--border);
          color: var(--text-primary);
        }

        .topbar-logo {
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }

        .topbar-logo-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
          border-radius: var(--radius-md);
          color: white;
          box-shadow: 0 2px 8px hsla(160, 84%, 39%, 0.3);
        }

        .topbar-logo-text {
          display: flex;
          flex-direction: column;
        }

        .topbar-title {
          font-size: 15px;
          font-weight: 600;
          letter-spacing: -0.01em;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .topbar-breadcrumb {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-tertiary);
        }

        .topbar-right {
          display: flex;
          align-items: center;
          gap: var(--space-4);
        }

        .topbar-status {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          padding: 5px 10px;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          border-radius: var(--radius-full);
          font-size: 12px;
          color: var(--text-secondary);
        }

        .topbar-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          transition: background var(--transition-base);
        }

        .topbar-status-dot.checking {
          background: var(--accent-warning);
          animation: pulse-glow 1.5s ease-in-out infinite;
        }

        .topbar-status-dot.online {
          background: var(--accent-primary);
          box-shadow: 0 0 6px hsla(160, 84%, 39%, 0.5);
        }

        .topbar-status-dot.offline {
          background: var(--accent-danger);
        }

        .topbar-status-icon {
          color: var(--text-tertiary);
        }

        .topbar-status-label {
          text-transform: uppercase;
          font-weight: 500;
          font-size: 10px;
          letter-spacing: 0.05em;
        }

        .spinning {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .topbar-version {
          font-size: 11px;
          color: var(--text-tertiary);
          padding: 3px 8px;
          background: var(--bg-elevated);
          border-radius: var(--radius-sm);
          border: 1px solid var(--border);
        }
      `}</style>
    </motion.header>
  );
}
