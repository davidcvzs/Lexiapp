import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AdminRoute } from './components/layout/AdminRoute';
import './index.css';

const LoginView = lazy(async () => ({ default: (await import('./views/LoginView')).LoginView }));
const DashboardView = lazy(async () => ({ default: (await import('./views/DashboardView')).DashboardView }));
const TranscriptionView = lazy(async () => ({ default: (await import('./views/TranscriptionView')).TranscriptionView }));
const DocumentsView = lazy(async () => ({ default: (await import('./views/DocumentsView')).DocumentsView }));
const DocumentBuilderView = lazy(async () => ({ default: (await import('./views/DocumentBuilderView')).DocumentBuilderView }));
const LegalSearchView = lazy(async () => ({ default: (await import('./views/LegalSearchView')).LegalSearchView }));
const SubscriptionView = lazy(async () => ({ default: (await import('./views/SubscriptionView')).SubscriptionView }));
const ProfileView = lazy(async () => ({ default: (await import('./views/ProfileView')).ProfileView }));
const AdminDashboardView = lazy(async () => ({ default: (await import('./views/AdminDashboardView')).AdminDashboardView }));
const SettingsView = lazy(async () => ({ default: (await import('./views/SettingsView')).SettingsView }));
const LandingPageView = lazy(async () => ({ default: (await import('./views/LandingPageView')).LandingPageView }));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<p role="status" style={{ padding: '2rem' }}>Cargando LexIA…</p>}>
      <Routes>
        <Route path="/" element={<LandingPageView />} />
        <Route path="/login" element={<LoginView />} />
        
        {/* Core Layout containing Sidebar & Header - Protected */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<DashboardView />} />
            <Route path="/transcription" element={<TranscriptionView />} />
            <Route path="/documents" element={<DocumentsView />} />
            <Route path="/casos" element={<DocumentsView />} />
            <Route path="/cases" element={<DocumentsView />} />
            <Route path="/mis-casos" element={<DocumentsView />} />
            <Route path="/document-builder" element={<DocumentBuilderView />} />
            <Route path="/search" element={<LegalSearchView />} />
            <Route path="/subscription" element={<SubscriptionView />} />
            <Route path="/profile" element={<ProfileView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminDashboardView />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
