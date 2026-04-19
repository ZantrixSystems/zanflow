import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const ROLE_LABELS = {
  tenant_admin: 'Tenant admin',
  manager: 'Manager',
  officer: 'Officer',
};

export default function AdminProfileModal({ onClose, onSessionRefresh }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', current_password: '', new_password: '', new_password_confirmation: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const overlayRef = useRef(null);

  useEffect(() => {
    api.getStaffProfile()
      .then((data) => {
        setProfile(data.profile);
        setForm((f) => ({ ...f, full_name: data.profile.full_name }));
      })
      .catch((err) => setError(err.message || 'Could not load profile.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { full_name: form.full_name };
      if (form.new_password) {
        payload.current_password = form.current_password;
        payload.new_password = form.new_password;
        payload.new_password_confirmation = form.new_password_confirmation;
      }
      const data = await api.updateStaffProfile(payload);
      await onSessionRefresh();
      setProfile((p) => ({ ...p, full_name: data.full_name }));
      setForm((f) => ({ ...f, current_password: '', new_password: '', new_password_confirmation: '' }));
      setIsEditing(false);
      setNotice('Profile updated.');
    } catch (err) {
      setError(err.message || 'Could not update profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      className="profile-modal-overlay"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="profile-modal" role="dialog" aria-label="Your profile">
        <div className="profile-modal-header">
          <span className="profile-modal-title">Your profile</span>
          <button type="button" className="profile-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {loading ? (
          <div className="spinner" style={{ margin: '24px' }}>Loading...</div>
        ) : (
          <>
            {error && <div className="alert alert-error" style={{ margin: '0 16px 12px' }}>{error}</div>}
            {notice && <div className="alert alert-success" style={{ margin: '0 16px 12px' }}>{notice}</div>}

            {!isEditing ? (
              <div className="profile-detail-list">
                <div className="profile-detail-row">
                  <span className="profile-detail-label">Name</span>
                  <span className="profile-detail-value">{profile?.full_name}</span>
                </div>
                <div className="profile-detail-row">
                  <span className="profile-detail-label">Email</span>
                  <span className="profile-detail-value">{profile?.email}</span>
                </div>
                {profile?.username && profile.username !== profile.email && (
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Username</span>
                    <span className="profile-detail-value">{profile.username}</span>
                  </div>
                )}
                <div className="profile-detail-row">
                  <span className="profile-detail-label">Role</span>
                  <span className="profile-detail-value">{ROLE_LABELS[profile?.role] ?? profile?.role}</span>
                </div>
                <div className="profile-detail-row">
                  <span className="profile-detail-label">Council</span>
                  <span className="profile-detail-value">{profile?.tenant_name ?? '—'}</span>
                </div>
                {profile?.tenant_subdomain && (
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">Site</span>
                    <span className="profile-detail-value">{profile.tenant_subdomain}.zanflo.com</span>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSave} className="profile-edit-form">
                <div className="form-group">
                  <label htmlFor="profile-name">Full name</label>
                  <input
                    id="profile-name"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="profile-section-label">Change password <span className="form-hint">(leave blank to keep current)</span></div>
                <div className="form-group">
                  <label htmlFor="profile-current-pw">Current password</label>
                  <input
                    id="profile-current-pw"
                    type="password"
                    value={form.current_password}
                    onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))}
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-new-pw">New password</label>
                  <input
                    id="profile-new-pw"
                    type="password"
                    value={form.new_password}
                    onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="profile-new-pw-confirm">Confirm new password</label>
                  <input
                    id="profile-new-pw-confirm"
                    type="password"
                    value={form.new_password_confirmation}
                    onChange={(e) => setForm((f) => ({ ...f, new_password_confirmation: e.target.value }))}
                    autoComplete="new-password"
                  />
                </div>
                <div className="profile-edit-actions">
                  <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                    {saving ? 'Saving...' : 'Save changes'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setIsEditing(false); setError(''); }}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {!isEditing && profile?.has_password && (
              <div className="profile-modal-footer">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setIsEditing(true); setNotice(''); setError(''); }}>
                  Edit profile
                </button>
              </div>
            )}
            {!isEditing && !profile?.has_password && (
              <div className="profile-modal-footer">
                <span className="form-hint">Managed by SSO — contact your administrator to update account details.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
