import { useEffect, useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { buildTenantAdminNav } from '../lib/navigation.js';

const EMPTY_FORM = {
  email: '',
  full_name: '',
  role: 'officer',
  password: '',
};

export default function AdminUsersPage() {
  const { session, logout } = useStaffAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    const data = await api.listAdminUsers();
    setUsers(data.users ?? []);
  }

  useEffect(() => {
    loadUsers()
      .catch((err) => setError(err.message || 'Could not load users.'))
      .finally(() => setLoading(false));
  }, []);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      await api.createAdminUser(form);
      setForm(EMPTY_FORM);
      setNotice('Tenant user created.');
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Could not create tenant user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId, role) {
    setError('');
    setNotice('');

    try {
      await api.updateAdminUser(userId, { role });
      setNotice('User role updated.');
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Could not update tenant user.');
    }
  }

  return (
    <Layout
      session={session}
      onSignOut={logout}
      brandTarget="/admin/dashboard"
      signOutTarget="/admin"
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Council admin' },
        { label: 'Users' },
      ]}
      navItems={buildTenantAdminNav(session)}
    >
      <section className="form-section">
        <div className="form-section-title">Tenant administration</div>
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">Manage tenant staff access for this council only.</p>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <section className="form-section">
        <div className="form-section-title">Current users</div>
        {loading ? (
          <div className="spinner">Loading...</div>
        ) : users.length === 0 ? (
          <p className="empty-state">No tenant users found.</p>
        ) : (
          <div className="application-list">
            {users.map((user) => (
              <div key={user.id} className="application-row">
                <div className="application-row-main">
                  <div className="application-row-title">{user.full_name || user.email}</div>
                  <div className="application-row-meta">{user.email}</div>
                </div>
                <div style={{ minWidth: 180 }}>
                  <select value={user.role} onChange={(event) => handleRoleChange(user.id, event.target.value)}>
                    <option value="tenant_admin">Tenant admin</option>
                    <option value="manager">Manager</option>
                    <option value="officer">Officer</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="form-section">
        <div className="form-section-title">Add tenant user</div>
        <form onSubmit={handleCreate} noValidate>
          <div className="form-group">
            <label htmlFor="user-email">Email</label>
            <input id="user-email" type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="user-name">Full name</label>
            <input id="user-name" value={form.full_name} onChange={(event) => updateField('full_name', event.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="user-role">Role</label>
            <select id="user-role" value={form.role} onChange={(event) => updateField('role', event.target.value)}>
              <option value="tenant_admin">Tenant admin</option>
              <option value="manager">Manager</option>
              <option value="officer">Officer</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="user-password">Password for new user</label>
            <input id="user-password" type="password" value={form.password} onChange={(event) => updateField('password', event.target.value)} />
          </div>
          <p className="form-hint">Staff sign in with their email address.</p>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Create user'}
          </button>
        </form>
      </section>
    </Layout>
  );
}
