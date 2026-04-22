import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { api } from '../api.js';

function emptyBranding() {
  return {
    logo_url: '',
    welcome_text: '',
    public_homepage_text: '',
    contact_us_text: '',
  };
}

export default function AdminSettingsPublicSitePage() {
  const { session, logout, refresh } = useStaffAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emptyBranding());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.getAdminSettings()
      .then((data) => {
        setSettings(data.settings);
        setForm({ ...emptyBranding(), ...data.settings.branding });
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
        organisation: current.settings.organisation,
        branding: form,
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
    <AdminLayout session={session} onSignOut={logout} onSessionRefresh={refresh} breadcrumbs={[{ label: 'Public site' }]}>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {settings?.tenant?.subdomain && (
            <div className="settings-card settings-card-muted">
              <div className="settings-card-title">Your public URL</div>
              <p className="settings-card-body">
                <a
                  href={`https://${settings.tenant.subdomain}.zanflo.com`}
                  target="_blank"
                  rel="noreferrer"
                  className="settings-link"
                >
                  {settings.tenant.subdomain}.zanflo.com
                </a>
              </p>
            </div>
          )}

          <div className="settings-card">
            <div className="settings-card-title">Branding</div>
            <div className="form-group">
              <label htmlFor="logo_url">Logo URL</label>
              <input
                id="logo_url"
                type="url"
                value={form.logo_url}
                onChange={(e) => setField('logo_url', e.target.value)}
                placeholder="https://example.gov.uk/logo.png"
              />
              <span className="form-hint">Use a hosted image URL. File upload is not available yet.</span>
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">Homepage content</div>
            <div className="form-group">
              <label htmlFor="welcome_text">Welcome message</label>
              <textarea
                id="welcome_text"
                value={form.welcome_text}
                onChange={(e) => setField('welcome_text', e.target.value)}
                rows={3}
              />
            </div>
            <div className="form-group">
              <label htmlFor="public_homepage_text">About this service</label>
              <textarea
                id="public_homepage_text"
                value={form.public_homepage_text}
                onChange={(e) => setField('public_homepage_text', e.target.value)}
                rows={4}
              />
            </div>
            <div className="form-group">
              <label htmlFor="contact_us_text">Contact us details</label>
              <textarea
                id="contact_us_text"
                value={form.contact_us_text}
                onChange={(e) => setField('contact_us_text', e.target.value)}
                rows={3}
              />
            </div>
          </div>

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
