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
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaDisableForm, setMfaDisableForm] = useState({ password: '', code: '' });
  const [showDisable, setShowDisable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mfaSaving, setMfaSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const overlayRef = useRef(null);

  async function loadProfile() {
    const data = await api.getStaffProfile();
    setProfile(data.profile);
    setForm((f) => ({ ...f, full_name: data.profile.full_name }));
    return data.profile;
  }

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

  async function handleStartMfa() {
    setMfaSaving(true);
    setError('');
    setNotice('');
    try {
      const data = await api.staffMfaEnrol();
      setMfaSetup(data);
      setMfaCode('');
      setShowDisable(false);
    } catch (err) {
      setError(err.message || 'Could not start MFA setup.');
    } finally {
      setMfaSaving(false);
    }
  }

  async function handleConfirmMfa(e) {
    e.preventDefault();
    setMfaSaving(true);
    setError('');
    setNotice('');
    try {
      await api.staffMfaConfirm({ code: mfaCode });
      await loadProfile();
      setMfaSetup(null);
      setMfaCode('');
      setNotice('Multi-factor authentication is now enabled.');
    } catch (err) {
      setError(err.message || 'Could not confirm MFA.');
    } finally {
      setMfaSaving(false);
    }
  }

  async function handleDisableMfa(e) {
    e.preventDefault();
    setMfaSaving(true);
    setError('');
    setNotice('');
    try {
      await api.staffMfaDisable(mfaDisableForm);
      await loadProfile();
      setShowDisable(false);
      setMfaDisableForm({ password: '', code: '' });
      setNotice('Multi-factor authentication has been disabled.');
    } catch (err) {
      setError(err.message || 'Could not disable MFA.');
    } finally {
      setMfaSaving(false);
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
                {profile?.has_password && (
                  <div className="profile-detail-row">
                    <span className="profile-detail-label">MFA</span>
                    <span className="profile-detail-value">{profile?.mfa_enabled ? 'Enabled' : 'Not enabled'}</span>
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
              <div className="profile-mfa-section">
                <div className="profile-section-label">Multi-factor authentication</div>
                {!profile?.mfa_enabled && !mfaSetup && (
                  <div className="profile-mfa-panel">
                    <p className="profile-mfa-copy">
                      Add an authenticator app code to protect your staff account.
                    </p>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleStartMfa} disabled={mfaSaving}>
                      {mfaSaving ? 'Starting...' : 'Set up MFA'}
                    </button>
                  </div>
                )}

                {!profile?.mfa_enabled && mfaSetup && (
                  <div className="profile-mfa-panel">
                    <p className="profile-mfa-copy">
                      Add this key to your authenticator app, then enter the first 6-digit code to switch MFA on.
                    </p>
                    <div className="profile-mfa-secret">{mfaSetup.secret}</div>
                    <label className="profile-mfa-label" htmlFor="mfa-uri">Setup URI</label>
                    <textarea
                      id="mfa-uri"
                      className="profile-mfa-uri"
                      value={mfaSetup.uri}
                      readOnly
                      rows={3}
                    />
                    <form onSubmit={handleConfirmMfa}>
                      <div className="form-group">
                        <label htmlFor="mfa-confirm-code">Authenticator code</label>
                        <input
                          id="mfa-confirm-code"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={mfaCode}
                          onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="123456"
                          autoComplete="one-time-code"
                          required
                        />
                      </div>
                      <div className="profile-edit-actions">
                        <button type="submit" className="btn btn-primary btn-sm" disabled={mfaSaving || mfaCode.length !== 6}>
                          {mfaSaving ? 'Confirming...' : 'Confirm MFA'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setMfaSetup(null);
                            setMfaCode('');
                            setError('');
                          }}
                          disabled={mfaSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {profile?.mfa_enabled && !showDisable && (
                  <div className="profile-mfa-panel">
                    <p className="profile-mfa-copy">
                      Your account currently requires an authenticator code at sign in.
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setShowDisable(true);
                        setMfaSetup(null);
                        setError('');
                        setNotice('');
                      }}
                    >
                      Disable MFA
                    </button>
                  </div>
                )}

                {profile?.mfa_enabled && showDisable && (
                  <div className="profile-mfa-panel">
                    <p className="profile-mfa-copy">
                      To disable MFA, confirm your current password and a fresh authenticator code.
                    </p>
                    <form onSubmit={handleDisableMfa}>
                      <div className="form-group">
                        <label htmlFor="mfa-disable-password">Current password</label>
                        <input
                          id="mfa-disable-password"
                          type="password"
                          value={mfaDisableForm.password}
                          onChange={(e) => setMfaDisableForm((f) => ({ ...f, password: e.target.value }))}
                          autoComplete="current-password"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="mfa-disable-code">Authenticator code</label>
                        <input
                          id="mfa-disable-code"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={mfaDisableForm.code}
                          onChange={(e) => setMfaDisableForm((f) => ({ ...f, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                          placeholder="123456"
                          autoComplete="one-time-code"
                          required
                        />
                      </div>
                      <div className="profile-edit-actions">
                        <button
                          type="submit"
                          className="btn btn-primary btn-sm"
                          disabled={mfaSaving || !mfaDisableForm.password || mfaDisableForm.code.length !== 6}
                        >
                          {mfaSaving ? 'Disabling...' : 'Confirm disable'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setShowDisable(false);
                            setMfaDisableForm({ password: '', code: '' });
                            setError('');
                          }}
                          disabled={mfaSaving}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
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
