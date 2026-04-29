import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth-context.jsx';

import LoginPage from './pages/LoginPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import ApplicantProfilePage from './pages/ApplicantProfilePage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ApplicationPage from './pages/ApplicationPage.jsx';
import PremisesListPage from './pages/PremisesListPage.jsx';
import PremisesFormPage from './pages/PremisesFormPage.jsx';
import PlatformLandingPage from './pages/PlatformLandingPage.jsx';
import ApexCouncilSignupPage from './pages/ApexCouncilSignupPage.jsx';
import ApexCouncilSignInPage from './pages/ApexCouncilSignInPage.jsx';
import PlatformDashboardPage from './pages/PlatformDashboardPage.jsx';
import PlatformLoginPage from './pages/PlatformLoginPage.jsx';
import PlatformTenantsPage from './pages/PlatformTenantsPage.jsx';
import PlatformTenantCreatePage from './pages/PlatformTenantCreatePage.jsx';
import PlatformTenantDetailPage from './pages/PlatformTenantDetailPage.jsx';
import PlatformTenantAdminIssuePage from './pages/PlatformTenantAdminIssuePage.jsx';
import TenantAdminLoginPage from './pages/TenantAdminLoginPage.jsx';
import TenantAdminDashboardPage from './pages/TenantAdminDashboardPage.jsx';
import AdminCasesPage from './pages/AdminCasesPage.jsx';
import AdminCaseDetailPage from './pages/AdminCaseDetailPage.jsx';
import AdminLicenceSectionsPage from './pages/AdminLicenceSectionsPage.jsx';
import AdminApplicationDetailPage from './pages/AdminApplicationDetailPage.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import AdminSettingsPage from './pages/AdminSettingsPage.jsx';
import AdminSettingsGeneralPage from './pages/AdminSettingsGeneralPage.jsx';
import AdminSettingsPublicSitePage from './pages/AdminSettingsPublicSitePage.jsx';
import AdminSettingsSsoPage from './pages/AdminSettingsSsoPage.jsx';
import AdminRolesPage from './pages/AdminRolesPage.jsx';
import AdminAuditPage from './pages/AdminAuditPage.jsx';
import AdminApplicationSetupPage from './pages/AdminApplicationSetupPage.jsx';
import AdminApplicationTypesPage from './pages/AdminApplicationTypesPage.jsx';
import { AdminPremisesVerificationDetailPage } from './pages/AdminPremisesVerificationPage.jsx';
import TenantApplyPage from './pages/TenantApplyPage.jsx';
import TenantBootstrapExchangePage from './pages/TenantBootstrapExchangePage.jsx';
import TenantPublicHomePage from './pages/TenantPublicHomePage.jsx';
import ApplicantCaseDetailPage from './pages/ApplicantCaseDetailPage.jsx';
import TenantUnavailablePage from './pages/TenantUnavailablePage.jsx';
import ExternalCaseSharePage from './pages/ExternalCaseSharePage.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import RequireStaffAuth from './components/RequireStaffAuth.jsx';
import RequirePlatformAuth from './components/RequirePlatformAuth.jsx';
import { api } from './api.js';

function getHostMode() {
  const configuredMode = (import.meta.env.VITE_HOST_MODE || '').toLowerCase();
  if (configuredMode === 'apex' || configuredMode === 'platform' || configuredMode === 'tenant') {
    return configuredMode;
  }

  const hostname = window.location.hostname.toLowerCase();

  if (hostname === 'zanflo.com' || hostname === 'www.zanflo.com') {
    return 'apex';
  }

  if (hostname === 'platform.zanflo.com') {
    return 'platform';
  }

  return 'tenant';
}

function PlatformIndexRedirect() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.platformMe()
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => navigate('/login', { replace: true }))
      .finally(() => setChecking(false));
  }, [navigate]);

  if (checking) {
    return <div className="spinner">Loading...</div>;
  }

  return null;
}

export default function App() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const hostMode = getHostMode();
  const [tenantAvailability, setTenantAvailability] = useState({
    checked: false,
    available: true,
  });

  useEffect(() => {
    if (hostMode !== 'tenant') {
      setTenantAvailability({ checked: true, available: true });
      return;
    }

    if (location.pathname === '/admin/bootstrap') {
      setTenantAvailability({ checked: true, available: true });
      return;
    }

    let active = true;
    setTenantAvailability((current) => ({ ...current, checked: false }));

    api.getTenantPublicConfig()
      .then(() => {
        if (!active) return;
        setTenantAvailability({ checked: true, available: true });
      })
      .catch(() => {
        if (!active) return;
        setTenantAvailability({ checked: true, available: false });
      });

    return () => {
      active = false;
    };
  }, [hostMode, location.pathname]);

  useEffect(() => {
    const fallback = document.getElementById('tenant-shell-fallback');
    if (!fallback) return;

    if (hostMode !== 'tenant') {
      fallback.classList.remove('is-visible');
      return;
    }

    if (!loading && (location.pathname === '/admin/bootstrap' || tenantAvailability.available)) {
      fallback.classList.remove('is-visible');
    }
  }, [hostMode, loading, location.pathname, tenantAvailability.available]);

  if (loading) {
    return <div className="spinner">Loading...</div>;
  }

  if (hostMode === 'apex') {
    return (
      <Routes>
        <Route path="/" element={<PlatformLandingPage />} />
        <Route path="/signup" element={<ApexCouncilSignupPage />} />
        <Route path="/council-sign-in" element={<ApexCouncilSignInPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (hostMode === 'platform') {
    return (
      <Routes>
        <Route path="/" element={<PlatformIndexRedirect />} />
        <Route path="/login" element={<PlatformLoginPage />} />
        <Route
          path="/dashboard"
          element={(
            <RequirePlatformAuth>
              <PlatformDashboardPage />
            </RequirePlatformAuth>
          )}
        />
        <Route
          path="/tenants"
          element={(
            <RequirePlatformAuth>
              <PlatformTenantsPage />
            </RequirePlatformAuth>
          )}
        />
        <Route
          path="/tenants/new"
          element={(
            <RequirePlatformAuth>
              <PlatformTenantCreatePage />
            </RequirePlatformAuth>
          )}
        />
        <Route
          path="/tenants/:id"
          element={(
            <RequirePlatformAuth>
              <PlatformTenantDetailPage />
            </RequirePlatformAuth>
          )}
        />
        <Route
          path="/tenants/:id/admin"
          element={(
            <RequirePlatformAuth>
              <PlatformTenantAdminIssuePage />
            </RequirePlatformAuth>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (hostMode === 'tenant' && location.pathname !== '/admin/bootstrap') {
    if (!tenantAvailability.checked) {
      return <div className="spinner">Loading...</div>;
    }

    if (!tenantAvailability.available) {
      return <TenantUnavailablePage />;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<TenantPublicHomePage />} />
      <Route path="/apply" element={<TenantApplyPage />} />
      <Route path="/admin" element={<TenantAdminLoginPage />} />
      <Route path="/admin/bootstrap" element={<TenantBootstrapExchangePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/external/case-share/:token" element={<ExternalCaseSharePage />} />
      <Route
        path="/profile"
        element={(
          <RequireAuth>
            <ApplicantProfilePage />
          </RequireAuth>
        )}
      />

      <Route
        path="/dashboard"
        element={(
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        )}
      />

      <Route
        path="/premises"
        element={(
          <RequireAuth>
            <PremisesListPage />
          </RequireAuth>
        )}
      />

      <Route
        path="/premises/new"
        element={(
          <RequireAuth>
            <PremisesFormPage />
          </RequireAuth>
        )}
      />

      <Route
        path="/premises/:id"
        element={(
          <RequireAuth>
            <PremisesFormPage />
          </RequireAuth>
        )}
      />

      <Route
        path="/applications/:id"
        element={(
          <RequireAuth>
            <ApplicationPage />
          </RequireAuth>
        )}
      />

      <Route
        path="/cases/:id"
        element={(
          <RequireAuth>
            <ApplicantCaseDetailPage />
          </RequireAuth>
        )}
      />

      <Route
        path="/admin/dashboard"
        element={(
          <RequireStaffAuth>
            <TenantAdminDashboardPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/cases"
        element={(
          <RequireStaffAuth allowedRoles={['officer', 'manager', 'tenant_admin']}>
            <AdminCasesPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/premise-cases/:id"
        element={(
          <RequireStaffAuth allowedRoles={['officer', 'manager', 'tenant_admin']}>
            <AdminCaseDetailPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/licence-sections"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin', 'manager']}>
            <AdminLicenceSectionsPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/applications"
        element={<Navigate to="/admin/cases" replace />}
      />

      <Route
        path="/admin/applications/:id"
        element={(
          <RequireStaffAuth allowedRoles={['officer', 'manager']}>
            <AdminApplicationDetailPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/premises-verifications"
        element={<Navigate to="/admin/cases?case_type=premises_verification" replace />}
      />

      <Route
        path="/admin/premises-verifications/:id"
        element={(
          <RequireStaffAuth allowedRoles={['officer', 'manager', 'tenant_admin']}>
            <AdminPremisesVerificationDetailPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/application-types"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminApplicationTypesPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/application-setup"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminApplicationSetupPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/users"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminUsersPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/settings"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminSettingsPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/settings/general"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminSettingsGeneralPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/settings/public-site"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminSettingsPublicSitePage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/settings/sso"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminSettingsSsoPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/settings/roles"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminRolesPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="/admin/audit"
        element={(
          <RequireStaffAuth allowedRoles={['tenant_admin']}>
            <AdminAuditPage />
          </RequireStaffAuth>
        )}
      />

      <Route
        path="*"
        element={session ? <Navigate to="/dashboard" replace /> : <Navigate to="/" replace />}
      />
    </Routes>
  );
}
