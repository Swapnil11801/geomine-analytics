/**
 * ToastProvider — Lightweight toast notification system
 * Provides a useToast() hook for showing success/error/warning messages.
 */
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  createdAt: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION = 5000;
const MAX_TOASTS = 3;

const icons: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
};

const colors: Record<ToastType, { bg: string; border: string; icon: string; bar: string }> = {
  success: {
    bg: 'hsla(160, 60%, 10%, 0.95)',
    border: 'hsla(160, 84%, 39%, 0.3)',
    icon: 'hsl(160, 84%, 39%)',
    bar: 'hsl(160, 84%, 39%)',
  },
  error: {
    bg: 'hsla(0, 50%, 10%, 0.95)',
    border: 'hsla(0, 70%, 50%, 0.3)',
    icon: 'hsl(0, 70%, 50%)',
    bar: 'hsl(0, 70%, 50%)',
  },
  warning: {
    bg: 'hsla(40, 50%, 10%, 0.95)',
    border: 'hsla(40, 80%, 50%, 0.3)',
    icon: 'hsl(40, 80%, 50%)',
    bar: 'hsl(40, 80%, 50%)',
  },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const c = colors[toast.type];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 10,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        minWidth: 280,
        maxWidth: 380,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ color: c.icon, flexShrink: 0, marginTop: 1 }}>{icons[toast.type]}</div>
      <p style={{ flex: 1, fontSize: 13, lineHeight: 1.45, color: 'var(--text-primary)', margin: 0 }}>
        {toast.message}
      </p>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      <motion.div
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: TOAST_DURATION / 1000, ease: 'linear' }}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 2,
          background: c.bar,
          transformOrigin: 'left',
          opacity: 0.6,
        }}
      />
    </motion.div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: Toast = { id, type, message, createdAt: Date.now() };

    setToasts(prev => {
      const next = [...prev, newToast];
      // Remove oldest if over limit
      if (next.length > MAX_TOASTS) {
        const removed = next.shift()!;
        const timer = timersRef.current.get(removed.id);
        if (timer) {
          clearTimeout(timer);
          timersRef.current.delete(removed.id);
        }
      }
      return next;
    });

    const timer = setTimeout(() => dismiss(id), TOAST_DURATION);
    timersRef.current.set(id, timer);
  }, [dismiss]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  const toast = {
    success: (msg: string) => addToast('success', msg),
    error: (msg: string) => addToast('error', msg),
    warning: (msg: string) => addToast('warning', msg),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}

      {/* Toast container */}
      <div
        style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column-reverse',
          gap: 8,
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map(t => (
            <div key={t.id} style={{ pointerEvents: 'auto' }}>
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
