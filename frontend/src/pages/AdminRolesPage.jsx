import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { api } from '../api.js';

const PERMISSION_META = {
  'cases.view':    { label: 'View cases', group: 'Cases', desc: 'See the case queue and case details' },
  'cases.assign':  { label: 'Assign cases', group: 'Cases', desc: 'Assign cases to officers' },
  'cases.decide':  { label: 'Make decisions', group: 'Cases', desc: 'Approve, refuse, or request information' },
  'users.manage':  { label: 'Manage users', group: 'Team', desc: 'Add, edit, and remove staff members' },
  'settings.view': { label: 'View settings', group: 'Settings', desc: 'See the settings area' },
  'settings.edit': { label: 'Edit settings', group: 'Settings', desc: 'Change organisation and branding settings' },
  'audit.view':    { label: 'View audit log', group: 'Platform', desc: 'Access the audit trail' },
};

const PERMISSION_GROUPS = ['Cases', 'Team', 'Settings', 'Platform'];

function emptyDraft() {
  return { name: '', description: '', permissions: [] };
}

function RoleModal({ role, allPermissions, onSave, onClose }) {
  const [form, setForm] = useState(() => role
    ? { name: role.name, description: role.description, permissions: [...role.permissions] }
    : emptyDraft()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function togglePermission(key) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Role name is required'); return; }
    setSaving(true);
    setError('');
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save role');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel settings-role-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{role ? 'Edit role' : 'Create role'}</h2>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="role-name">Role name</label>
              <input
                id="role-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Senior Officer"
                maxLength={80}
              />
            </div>

            <div className="form-group">
              <label htmlFor="role-desc">Description <span className="form-hint-inline">(optional)</span></label>
              <input
                id="role-desc"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What this role is for"
              />
            </div>

            <div className="role-permissions-editor">
              <div className="role-permissions-label">Permissions</div>
              {PERMISSION_GROUPS.map((group) => {
                const keys = allPermissions.filter((k) => PERMISSION_META[k]?.group === group);
                if (keys.length === 0) return null;
                return (
                  <div key={group} className="role-permission-group">
                    <div className="role-permission-group-name">{group}</div>
                    {keys.map((key) => {
                      const meta = PERMISSION_META[key] ?? { label: key, desc: '' };
                      const checked = form.permissions.includes(key);
                      return (
                        <label key={key} className={`role-permission-row${checked ? ' checked' : ''}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePermission(key)}
                          />
                          <div className="role-permission-text">
                            <span className="role-permission-name">{meta.label}</span>
                            <span className="role-permission-desc">{meta.desc}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : (role ? 'Save changes' : 'Create role')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminRolesPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [roles, setRoles] = useState([]);
  const [allPermissions, setAllPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // null | { mode: 'create' } | { mode: 'edit', role }

  useEffect(() => {
    api.listAdminRoles()
      .then((data) => {
        setRoles(data.roles);
        setAllPermissions(data.all_permissions);
      })
      .catch((err) => setError(err.message || 'Could not load roles'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(form) {
    const data = await api.createAdminRole(form);
    setRoles((prev) => [...prev, data.role].sort((a, b) => a.name.localeCompare(b.name)));
  }

  async function handleUpdate(id, form) {
    const data = await api.updateAdminRole(id, form);
    setRoles((prev) => prev.map((r) => r.id === id ? data.role : r));
  }

  async function handleDelete(role) {
    if (!window.confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    await api.deleteAdminRole(role.id);
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
  }

  function permissionSummary(permissions) {
    if (permissions.length === 0) return 'No permissions';
    if (permissions.length === allPermissions.length) return 'All permissions';
    const labels = permissions.map((k) => PERMISSION_META[k]?.label ?? k);
    if (labels.length <= 3) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  }

  return (
    <AdminLayout session={session} onSignOut={logout} onSessionRefresh={refresh} breadcrumbs={[{ label: 'Roles & permissions' }]}>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="settings-section-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setModal({ mode: 'create' })}
        >
          Create role
        </button>
      </div>

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : roles.length === 0 ? (
        <div className="settings-empty-state">
          <div className="settings-empty-icon">🔒</div>
          <div className="settings-empty-title">No custom roles yet</div>
          <p className="settings-empty-body">
            The built-in roles (Tenant admin, Manager, Officer) cover most cases.
            Create a custom role when you need finer control over what staff can see and do.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModal({ mode: 'create' })}
          >
            Create your first role
          </button>
        </div>
      ) : (
        <div className="roles-list">
          <div className="roles-list-header">
            <span>Role</span>
            <span>Permissions</span>
            <span />
          </div>
          {roles.map((role) => (
            <div key={role.id} className="role-card">
              <div className="role-card-info">
                <div className="role-card-name">{role.name}</div>
                {role.description && (
                  <div className="role-card-description">{role.description}</div>
                )}
              </div>
              <div className="role-card-permissions">
                <div className="role-card-perm-summary">{permissionSummary(role.permissions)}</div>
                <div className="role-card-perm-pills">
                  {role.permissions.slice(0, 4).map((k) => (
                    <span key={k} className="perm-pill">{PERMISSION_META[k]?.label ?? k}</span>
                  ))}
                  {role.permissions.length > 4 && (
                    <span className="perm-pill perm-pill-more">+{role.permissions.length - 4}</span>
                  )}
                </div>
              </div>
              <div className="role-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setModal({ mode: 'edit', role })}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(role)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="settings-info-panel">
        <div className="settings-info-panel-title">Built-in roles</div>
        <p className="settings-info-panel-body">
          These roles are fixed and cannot be edited. Custom roles are in addition to them.
        </p>
        <div className="builtin-roles-list">
          {[
            { name: 'Tenant admin', desc: 'Full access to all settings, users, and cases' },
            { name: 'Manager', desc: 'Can view all cases, reassign, and manage licence sections' },
            { name: 'Officer', desc: 'Can view and action cases assigned to them' },
          ].map((r) => (
            <div key={r.name} className="builtin-role-row">
              <span className="builtin-role-name">{r.name}</span>
              <span className="builtin-role-desc">{r.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {modal && (
        <RoleModal
          role={modal.mode === 'edit' ? modal.role : null}
          allPermissions={allPermissions}
          onSave={modal.mode === 'create'
            ? handleCreate
            : (form) => handleUpdate(modal.role.id, form)
          }
          onClose={() => setModal(null)}
        />
      )}
    </AdminLayout>
  );
}
