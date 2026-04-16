import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth-context.jsx';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ApplicationPage from './pages/ApplicationPage.jsx';
import PlatformLandingPage from './pages/PlatformLandingPage.jsx';
import PlatformAdminHomePage from './pages/PlatformAdminHomePage.jsx';
import PlatformAdminSignInPage from './pages/PlatformAdminSignInPage.jsx';
import PlatformBootstrapPage from './pages/PlatformBootstrapPage.jsx';
import RequireAuth from './components/RequireAuth.jsx';

function getHostMode() {
  const hostname = window.location.hostname.toLowerCase();

  if (hostname === 'zanflo.com' || hostname === 'www.zanflo.com') {
    return 'apex';
  }

  if (hostname === 'platform.zanflo.com') {
    return 'platform';
  }

  return 'tenant';
}

export default function App() {
  const { session, loading } = useAuth();
  const hostMode = getHostMode();

  if (loading) {
    return <div className="spinner">Loading...</div>;
  }

  if (hostMode === 'apex') {
    return (
      <Routes>
        <Route path="/" element={<PlatformLandingPage />} />
        <Route path="/admin/sign-in" element={<PlatformAdminSignInPage />} />
        <Route path="/admin/onboarding" element={<PlatformBootstrapPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (hostMode === 'platform') {
    return (
      <Routes>
        <Route path="/" element={<PlatformAdminHomePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />

      <Route
        path="/applications/:id"
        element={
          <RequireAuth>
            <ApplicationPage />
          </RequireAuth>
        }
      />

      <Route
        path="*"
        element={session ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />}
      />
    </Routes>
  );
}
