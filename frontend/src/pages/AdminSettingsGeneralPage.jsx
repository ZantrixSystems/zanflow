import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { api } from '../api.js';

function emptyOrg() {
  return {
    council_name: '',
    council_display_name: '',
    support_contact_name: '',
    support_email: '',
    support_phone: '',
    internal_admin_name: '',
    internal_admin_email: '',
  };
}

export default function AdminSettingsGeneralPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emptyOrg());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.getAdminSettings()
      .then((data) => {
        setSettings(data.settings);
        setForm({ ...emptyOrg(), ...data.settings.organisation });
      })
      .catch((err) => setError(err.message || 'Could not load settings'))
      .finally(() => setLoading(false));
  }, []);

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const current = await api.getAdminSettings();
      const data = await api.updateAdminSettings({
        organisation: form,
        branding: current.settings.branding,
        sso: current.settings.sso,
      });
      setSettings(data.settings);
      setNotice('Settings saved.');
    } catch (err) {
      setError(err.message || 'Could not save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout session={session} onSignOut={logout} onSessionRefresh={refresh} breadcrumbs={[{ label: 'General' }]}>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="settings-card">
            <div className="settings-card-title">Council name</div>
            <div className="platform-two-column">
              <div className="form-group">
                <label htmlFor="council_name">Official council name</label>
                <input id="council_name" value={form.council_name} onChange={(e) => setField('council_name', e.target.value)} />
                <span className="form-hint">Used in legal and formal contexts.</span>
              </div>
              <div className="form-group">
                <label htmlFor="council_display_name">Display name</label>
                <input id="council_display_name" value={form.council_display_name} onChange={(e) => setField('council_display_name', e.target.value)} />
                <span className="form-hint">Shown in the staff interface and emails.</span>
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">Public support contact</div>
            <div className="platform-two-column">
              <div className="form-group">
                <label htmlFor="support_contact_name">Contact name</label>
                <input id="support_contact_name" value={form.support_contact_name} onChange={(e) => setField('support_contact_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="support_email">Support email</label>
                <input id="support_email" type="email" value={form.support_email} onChange={(e) => setField('support_email', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="support_phone">Support phone</label>
                <input id="support_phone" value={form.support_phone} onChange={(e) => setField('support_phone', e.target.value)} />
              </div>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">Internal admin</div>
            <p className="settings-card-body">The primary contact for platform queries. Not shown publicly.</p>
            <div className="platform-two-column">
              <div className="form-group">
                <label htmlFor="internal_admin_name">Name</label>
                <input id="internal_admin_name" value={form.internal_admin_name} onChange={(e) => setField('internal_admin_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="internal_admin_email">Email</label>
                <input id="internal_admin_email" type="email" value={form.internal_admin_email} onChange={(e) => setField('internal_admin_email', e.target.value)} />
              </div>
            </div>
          </div>

          {settings?.bootstrap && (
            <div className="settings-card settings-card-muted">
              <div className="settings-card-title">Bootstrap admin account</div>
              <p className="settings-card-body">
                Keep this account safe — it is your emergency access path even if SSO is configured later.
              </p>
              <p className="settings-card-body">
                <strong>{settings.bootstrap.admin_name || 'Not recorded'}</strong>
                {settings.bootstrap.admin_email ? ` — ${settings.bootstrap.admin_email}` : ''}
              </p>
            </div>
          )}

          <div className="settings-save-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
