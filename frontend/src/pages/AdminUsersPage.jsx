import { useEffect, useState } from 'react';
import TenantSettingsLayout from '../components/TenantSettingsLayout.jsx';
import { api } from '../api.js';

const EMPTY_FORM = {
  email: '',
  full_name: '',
  role: 'officer',
  password: '',
};

function EditUserModal({ user, customRoles, onClose, onSaved }) {
  const [form, setForm] = useState({
    full_name: user.full_name || '',
    role: user.role,
    password: '',
    custom_role_id: user.custom_role_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function setField(field, value) {
    setForm((c) => ({ ...c, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {};
    if (form.full_name.trim()) payload.full_name = form.full_name.trim();
    if (form.role) payload.role = form.role;
    if (form.password) payload.password = form.password;
    payload.custom_role_id = form.custom_role_id || null;

    try {
      await api.updateAdminUser(user.id, payload);
      onSaved();
    } catch (err) {
      setError(err.message || 'Could not update user.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit user</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label htmlFor="edit-name">Full name</label>
              <input id="edit-name" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} placeholder={user.full_name} />
            </div>
            <div className="form-group">
              <label htmlFor="edit-role">Built-in role</label>
              <select id="edit-role" value={form.role} onChange={(e) => setField('role', e.target.value)}>
                <option value="tenant_admin">Tenant admin</option>
                <option value="manager">Manager</option>
                <option value="officer">Officer</option>
              </select>
              <span className="form-hint">Tenant admins always have full access regardless of custom role.</span>
            </div>
            {customRoles.length > 0 && (
              <div className="form-group">
                <label htmlFor="edit-custom-role">Custom role <span className="form-hint-inline">(optional)</span></label>
                <select id="edit-custom-role" value={form.custom_role_id} onChange={(e) => setField('custom_role_id', e.target.value)}>
                  <option value="">None — use built-in role defaults</option>
                  {customRoles.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <span className="form-hint">Assigning a custom role overrides the permission set for this user.</span>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="edit-password">New password <span className="form-hint-inline">(optional)</span></label>
              <input id="edit-password" type="password" value={form.password} onChange={(e) => setField('password', e.target.value)} autoComplete="new-password" placeholder="Leave blank to keep current password" />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [customRoles, setCustomRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  async function loadUsers() {
    const data = await api.listAdminUsers();
    setUsers(data.users ?? []);
    setCustomRoles(data.custom_roles ?? []);
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
      setShowCreateForm(false);
      setNotice('User created.');
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Could not create user.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEditSaved() {
    setEditingUser(null);
    setNotice('User updated.');
    setError('');
    await loadUsers();
  }

  function roleLabel(user) {
    const builtIn = user.role.replace('_', ' ');
    if (user.custom_role_name) return `${builtIn} · ${user.custom_role_name}`;
    return builtIn;
  }

  return (
    <TenantSettingsLayout
      title="Users"
      description="Manage staff access for this council."
    >
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="settings-section-actions">
        <button type="button" className="btn btn-primary" onClick={() => { setShowCreateForm((v) => !v); setError(''); setNotice(''); }}>
          {showCreateForm ? 'Cancel' : 'Add user'}
        </button>
      </div>

      {showCreateForm && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          <div className="settings-card-title">Add user</div>
          <form onSubmit={handleCreate} noValidate>
            <div className="form-group">
              <label htmlFor="user-email">Email</label>
              <input id="user-email" type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="user-name">Full name</label>
              <input id="user-name" value={form.full_name} onChange={(e) => updateField('full_name', e.target.value)} required />
            </div>
            <div className="form-group">
              <label htmlFor="user-role">Role</label>
              <select id="user-role" value={form.role} onChange={(e) => updateField('role', e.target.value)}>
                <option value="tenant_admin">Tenant admin</option>
                <option value="manager">Manager</option>
                <option value="officer">Officer</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="user-password">Password</label>
              <input id="user-password" type="password" value={form.password} onChange={(e) => updateField('password', e.target.value)} autoComplete="new-password" />
              <span className="form-hint">At least 12 characters required for new accounts.</span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Create user'}
            </button>
          </form>
        </div>
      )}

      <div className="roles-list">
        <div className="roles-list-header">
          <span>Name</span>
          <span>Role</span>
          <span />
        </div>
        {loading ? (
          <div style={{ padding: '20px' }}><div className="spinner">Loading...</div></div>
        ) : users.length === 0 ? (
          <div style={{ padding: '20px' }}><p className="settings-empty-body" style={{ textAlign: 'left' }}>No users found.</p></div>
        ) : users.map((user) => (
          <div key={user.id} className="role-card">
            <div className="role-card-info">
              <div className="role-card-name">{user.full_name || user.email}</div>
              <div className="role-card-description">{user.email}</div>
            </div>
            <div className="role-card-info">
              <div className="role-card-name" style={{ fontWeight: 500, fontSize: '0.875rem' }}>{roleLabel(user)}</div>
            </div>
            <div className="role-card-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setError(''); setNotice(''); setEditingUser(user); }}>
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {customRoles.length === 0 && (
        <div className="settings-info-panel" style={{ marginTop: 20 }}>
          <div className="settings-info-panel-title">Custom roles</div>
          <p className="settings-info-panel-body">
            No custom roles yet. <a href="/admin/settings/roles" className="settings-link">Create one in Roles & permissions</a> to assign granular access to staff.
          </p>
        </div>
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          customRoles={customRoles}
          onClose={() => setEditingUser(null)}
          onSaved={handleEditSaved}
        />
      )}
    </TenantSettingsLayout>
  );
}
