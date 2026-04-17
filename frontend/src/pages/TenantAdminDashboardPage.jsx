import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { buildTenantAdminNav } from '../lib/navigation.js';

export default function TenantAdminDashboardPage() {
  const { session, logout } = useStaffAuth();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (session.role !== 'tenant_admin') return;
    api.getAdminSettings().then((data) => setSettings(data.settings)).catch(() => {});
  }, [session.role]);

  return (
    <Layout
      session={session}
      onSignOut={logout}
      brandTarget="/admin/dashboard"
      signOutTarget="/admin"
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Council admin' },
        { label: 'Dashboard' },
      ]}
      navItems={buildTenantAdminNav(session)}
    >
      <section className="form-section">
        <div className="form-section-title">Tenant staff workspace</div>
        <h1 className="page-title">Admin dashboard</h1>
        <p className="page-subtitle">
          Review applications, manage tenant administration, and keep staff work separate from the public applicant portal.
        </p>
      </section>

      {session.role === 'tenant_admin' && settings && (
        <section className="dashboard-action-list">
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Organisation settings</h2>
              <p>{settings.organisation.council_display_name || settings.organisation.council_name}</p>
            </div>
            <div className="dashboard-action-controls">
              <Link className="btn btn-secondary" to="/admin/settings">Open setup</Link>
            </div>
          </article>
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Branding and homepage</h2>
              <p>{settings.branding.welcome_text || 'Add welcome text and public homepage details for applicants.'}</p>
            </div>
            <div className="dashboard-action-controls">
              <Link className="btn btn-secondary" to="/admin/settings">Edit</Link>
            </div>
          </article>
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Identity and SSO</h2>
              <p>{settings.sso.auth_runtime_status === 'configuration_only' ? 'Configuration can be saved now. Live SSO sign-in is not active yet.' : settings.sso.auth_runtime_status}</p>
            </div>
            <div className="dashboard-action-controls">
              <Link className="btn btn-secondary" to="/admin/settings">Configure</Link>
            </div>
          </article>
        </section>
      )}

      <section className="dashboard-action-list">
        {['officer', 'manager'].includes(session.role) && (
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Application queue</h2>
              <p>Pick up submitted applications, review current cases, and complete decisions.</p>
            </div>
            <div className="dashboard-action-controls">
              <Link className="btn btn-primary" to="/admin/applications">Open</Link>
            </div>
          </article>
        )}

        <article className="dashboard-action-row">
          <div className="dashboard-action-copy">
            <h2>Tenant users</h2>
            <p>Manage tenant staff access and role assignment within this council only.</p>
          </div>
          <div className="dashboard-action-controls">
            <Link className="btn btn-secondary" to="/admin/users">Manage</Link>
          </div>
        </article>

        <article className="dashboard-action-row">
          <div className="dashboard-action-copy">
            <h2>Settings and audit</h2>
            <p>Keep tenant contact details current and review recent tenant-scoped activity.</p>
          </div>
          <div className="dashboard-action-controls dashboard-action-controls-double">
            <Link className="btn btn-secondary" to="/admin/settings">Settings</Link>
            <Link className="btn btn-secondary" to="/admin/audit">Audit</Link>
          </div>
        </article>
      </section>

      <section className="form-section">
        <div className="form-section-title">Current access</div>
        <p className="platform-body-copy">
          Signed in as <strong>{session.full_name || session.email}</strong>.
        </p>
        <p className="platform-body-copy">
          Tenant role: <strong>{session.role}</strong>
        </p>
      </section>
    </Layout>
  );
}
