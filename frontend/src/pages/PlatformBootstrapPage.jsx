import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

const ROLE_CONFIG = [
  { role: 'tenant_admin', label: 'Tenant admins' },
  { role: 'manager', label: 'Managers' },
  { role: 'officer', label: 'Licensing officers' },
];

function buildRoleText(roleAssignments, role) {
  return roleAssignments
    .filter((entry) => entry.role === role && entry.status !== 'disabled')
    .map((entry) => entry.email)
    .join('\n');
}

function parseEmails(text) {
  return Array.from(
    new Set(
      text
        .split(/[\n,;]/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export default function PlatformBootstrapPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [context, setContext] = useState(null);
  const [roleInputs, setRoleInputs] = useState({
    tenant_admin: '',
    manager: '',
    officer: '',
  });

  useEffect(() => {
    api.getBootstrapContext()
      .then((data) => {
        setContext(data);
        setRoleInputs({
          tenant_admin: buildRoleText(data.role_assignments, 'tenant_admin'),
          manager: buildRoleText(data.role_assignments, 'manager'),
          officer: buildRoleText(data.role_assignments, 'officer'),
        });
      })
      .catch(() => navigate('/admin/sign-in'))
      .finally(() => setLoading(false));
  }, [navigate]);

  const pendingBanner = useMemo(() => {
    if (!context?.tenant || context.tenant.status !== 'pending_verification') return null;
    const days = context.tenant.activation_days_remaining;
    return `You have ${days} day${days === 1 ? '' : 's'} left to complete setup before this pending tenant is cleaned up automatically.`;
  }, [context]);

  function updateRoleInput(role, value) {
    setRoleInputs((current) => ({ ...current, [role]: value }));
  }

  async function reload() {
    const data = await api.getBootstrapContext();
    setContext(data);
    setRoleInputs({
      tenant_admin: buildRoleText(data.role_assignments, 'tenant_admin'),
      manager: buildRoleText(data.role_assignments, 'manager'),
      officer: buildRoleText(data.role_assignments, 'officer'),
    });
  }

  async function handleSaveAssignments(event) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api.saveBootstrapRoleAssignments({
        roles: ROLE_CONFIG.map(({ role }) => ({
          role,
          emails: parseEmails(roleInputs[role]),
        })),
      });
      await reload();
      setSuccess('Role assignments saved.');
    } catch (err) {
      setError(err.message || 'Could not save role assignments.');
    } finally {
      setSaving(false);
    }
  }

  async function handleActivateTenant() {
    setError('');
    setSuccess('');
    setActivating(true);
    try {
      await api.activateBootstrapTenant();
      await reload();
      setSuccess('Tenant moved into trial. You can now continue on your council hostname.');
    } catch (err) {
      setError(err.message || 'Could not activate tenant.');
    } finally {
      setActivating(false);
    }
  }

  async function handleSignOut() {
    await api.staffSignOut();
    navigate('/admin/sign-in');
  }

  if (loading) {
    return (
      <Layout>
        <div className="spinner">Loading…</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="platform-admin-shell">
        <div className="platform-admin-topbar">
          <div>
            <div className="section-heading">Tenant Bootstrap</div>
            <h1 className="page-title">Council admin setup</h1>
            <p className="page-subtitle">
              This area is for the initial tenant admin only. Public applicants do not use this page.
            </p>
          </div>
          <div className="platform-admin-topbar-actions">
            <Link className="btn btn-secondary" to="/">Platform home</Link>
            <button type="button" className="btn btn-secondary" onClick={handleSignOut}>Sign out</button>
          </div>
        </div>

        {pendingBanner && <div className="alert alert-warning">{pendingBanner}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <section className="form-section">
          <div className="form-section-title">Tenant Summary</div>
          <div className="platform-summary-grid">
            <div className="platform-summary-card">
              <span className="platform-summary-label">Organisation</span>
              <strong>{context?.tenant?.name}</strong>
            </div>
            <div className="platform-summary-card">
              <span className="platform-summary-label">Hostname</span>
              <strong>{context?.tenant?.subdomain}.zanflo.com</strong>
            </div>
            <div className="platform-summary-card">
              <span className="platform-summary-label">Status</span>
              <strong>{context?.tenant?.status?.replace(/_/g, ' ')}</strong>
            </div>
            <div className="platform-summary-card">
              <span className="platform-summary-label">Break-glass admin</span>
              <strong>{context?.session?.email}</strong>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-title">Live Members</div>
          {context?.staff_members?.length ? (
            <div className="platform-member-list">
              {context.staff_members.map((member) => (
                <div key={member.id} className="platform-member-row">
                  <div>
                    <strong>{member.full_name}</strong>
                    <div className="platform-member-meta">{member.email}{member.username ? ` · ${member.username}` : ''}</div>
                  </div>
                  <span className="status-tag status-submitted">{member.role.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state">No live members are attached yet.</p>
          )}
        </section>

        <section className="form-section">
          <div className="form-section-title">Role Assignments</div>
          <form onSubmit={handleSaveAssignments} noValidate>
            <p className="platform-body-copy" style={{ marginBottom: 20 }}>
              Add work email addresses for the people who should receive access later.
              One email per line is easiest. These assignments are stored now so SSO can be mapped cleanly later.
            </p>

            {ROLE_CONFIG.map(({ role, label }) => (
              <div className="form-group" key={role}>
                <label htmlFor={role}>{label}</label>
                <textarea
                  id={role}
                  value={roleInputs[role]}
                  onChange={(event) => updateRoleInput(role, event.target.value)}
                />
              </div>
            ))}

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save role assignments'}
            </button>
          </form>
        </section>

        <section className="form-section">
          <div className="form-section-title">Single Sign-On</div>
          <div className="platform-guidance-grid">
            <article className="platform-guidance-card">
              <h2>Break-glass first</h2>
              <p>The account you created stays as the fallback admin account even after SSO is introduced.</p>
            </article>
            <article className="platform-guidance-card">
              <h2>SSO next</h2>
              <p>SAML, OAuth, and claim-based role mapping are not switched on yet, but this settings area is where they belong.</p>
            </article>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-title">Activation</div>
          <p className="platform-body-copy" style={{ marginBottom: 20 }}>
            When you are happy with the break-glass account and initial role assignments, start the tenant trial.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleActivateTenant}
            disabled={activating || context?.tenant?.status !== 'pending_verification'}
          >
            {activating ? 'Starting trial…' : 'Complete setup and start trial'}
          </button>
        </section>
      </div>
    </Layout>
  );
}
