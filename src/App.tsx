import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { TranscriptionView } from './views/TranscriptionView';
import { DocumentsView } from './views/DocumentsView';
import { DocumentBuilderView } from './views/DocumentBuilderView';
import { LegalSearchView } from './views/LegalSearchView';
import { SubscriptionView } from './views/SubscriptionView';
import { ProfileView } from './views/ProfileView';
import { AdminDashboardView } from './views/AdminDashboardView';
import { SettingsView } from './views/SettingsView';
import { MainLayout } from './components/layout/MainLayout';
import { LandingPageView } from './views/LandingPageView';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import './index.css';

function App() {
  return (
    <BrowserRouter>
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
            <Route path="/admin" element={<AdminDashboardView />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
