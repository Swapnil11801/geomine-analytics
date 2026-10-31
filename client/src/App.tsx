/**
 * App — Root application component
 */
import DashboardLayout from '@/layouts/DashboardLayout';
import { ToastProvider } from '@/components/ui/ToastProvider';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <DashboardLayout />
      </ToastProvider>
    </ErrorBoundary>
  );
}
