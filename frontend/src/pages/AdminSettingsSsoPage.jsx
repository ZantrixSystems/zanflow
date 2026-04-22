import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { api } from '../api.js';

function emptySso() {
  return {
    saml_enabled: false,
    saml_metadata_xml: '',
    saml_entity_id: '',
    saml_login_url: '',
    saml_certificate: '',
    oidc_enabled: false,
    oidc_client_id: '',
    oidc_client_secret: '',
    clear_oidc_client_secret: false,
    oidc_client_secret_id: '',
    oidc_directory_id: '',
    oidc_issuer: '',
    oidc_authorization_endpoint: '',
    oidc_token_endpoint: '',
    oidc_userinfo_endpoint: '',
    oidc_scopes: 'openid profile email',
  };
}

export default function AdminSettingsSsoPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emptySso());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.getAdminSettings()
      .then((data) => {
        setSettings(data.settings);
        setForm({
          ...emptySso(),
          ...data.settings.sso,
          oidc_client_secret: '',
          clear_oidc_client_secret: false,
        });
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
        branding: current.settings.branding,
        sso: form,
      });
      setSettings(data.settings);
      setForm((f) => ({
        ...f,
        ...data.settings.sso,
        oidc_client_secret: '',
        clear_oidc_client_secret: false,
      }));
      setNotice('SSO settings saved.');
    } catch (err) {
      setError(err.message || 'Could not save SSO settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout session={session} onSignOut={logout} onSessionRefresh={refresh} breadcrumbs={[{ label: 'Single sign-on' }]}>
      <div className="alert alert-warning">
        Live SSO sign-in is not enabled yet in this build. These settings are stored for setup and later activation.
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="settings-card">
            <div className="settings-card-title">SAML configuration</div>
            <label className="checkbox-row" htmlFor="saml_enabled">
              <input
                id="saml_enabled"
                type="checkbox"
                checked={form.saml_enabled}
                onChange={(e) => setField('saml_enabled', e.target.checked)}
              />
              <span>Enable SAML for this tenant</span>
            </label>
            <div className="form-group" style={{ marginTop: 16 }}>
              <label htmlFor="saml_metadata_xml">Metadata XML</label>
              <textarea id="saml_metadata_xml" value={form.saml_metadata_xml} onChange={(e) => setField('saml_metadata_xml', e.target.value)} rows={4} />
            </div>
            <div className="platform-two-column">
              <div className="form-group">
                <label htmlFor="saml_entity_id">Entity ID</label>
                <input id="saml_entity_id" value={form.saml_entity_id} onChange={(e) => setField('saml_entity_id', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="saml_login_url">Login URL</label>
                <input id="saml_login_url" value={form.saml_login_url} onChange={(e) => setField('saml_login_url', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="saml_certificate">Certificate</label>
              <textarea id="saml_certificate" value={form.saml_certificate} onChange={(e) => setField('saml_certificate', e.target.value)} rows={4} />
            </div>
          </div>

          <div className="settings-card">
            <div className="settings-card-title">OIDC / OAuth configuration</div>
            <label className="checkbox-row" htmlFor="oidc_enabled">
              <input
                id="oidc_enabled"
                type="checkbox"
                checked={form.oidc_enabled}
                onChange={(e) => setField('oidc_enabled', e.target.checked)}
              />
              <span>Enable OIDC / OAuth for this tenant</span>
            </label>
            <div className="platform-two-column" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label htmlFor="oidc_client_id">Client ID</label>
                <input id="oidc_client_id" value={form.oidc_client_id} onChange={(e) => setField('oidc_client_id', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="oidc_directory_id">Directory / Tenant ID</label>
                <input id="oidc_directory_id" value={form.oidc_directory_id} onChange={(e) => setField('oidc_directory_id', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="oidc_issuer">Issuer</label>
                <input id="oidc_issuer" value={form.oidc_issuer} onChange={(e) => setField('oidc_issuer', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="oidc_scopes">Scopes</label>
                <input id="oidc_scopes" value={form.oidc_scopes} onChange={(e) => setField('oidc_scopes', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="oidc_authorization_endpoint">Authorization endpoint</label>
                <input id="oidc_authorization_endpoint" value={form.oidc_authorization_endpoint} onChange={(e) => setField('oidc_authorization_endpoint', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="oidc_token_endpoint">Token endpoint</label>
                <input id="oidc_token_endpoint" value={form.oidc_token_endpoint} onChange={(e) => setField('oidc_token_endpoint', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="oidc_userinfo_endpoint">Userinfo endpoint</label>
                <input id="oidc_userinfo_endpoint" value={form.oidc_userinfo_endpoint} onChange={(e) => setField('oidc_userinfo_endpoint', e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="oidc_client_secret">Client secret</label>
              <input
                id="oidc_client_secret"
                type="password"
                value={form.oidc_client_secret}
                onChange={(e) => setField('oidc_client_secret', e.target.value)}
                autoComplete="new-password"
              />
              <span className="form-hint">
                Current status: {settings?.sso?.has_oidc_client_secret ? `saved (${settings.sso.oidc_client_secret_hint || 'masked'})` : 'not saved'}
              </span>
            </div>
            <label className="checkbox-row" htmlFor="clear_oidc_client_secret">
              <input
                id="clear_oidc_client_secret"
                type="checkbox"
                checked={form.clear_oidc_client_secret}
                onChange={(e) => setField('clear_oidc_client_secret', e.target.checked)}
              />
              <span>Clear the stored client secret on next save</span>
            </label>
          </div>

          {settings?.tenant?.subdomain && (
            <div className="settings-card settings-card-muted">
              <div className="settings-card-title">Callback URIs to register</div>
              <p className="settings-card-body">
                Redirect URI: <strong>{`https://${settings.tenant.subdomain}.zanflo.com/api/auth/sso/callback`}</strong>
              </p>
              <p className="settings-card-body">
                Logout URI: <strong>{`https://${settings.tenant.subdomain}.zanflo.com/`}</strong>
              </p>
              <p className="settings-card-body">
                Auth runtime status: <strong>{settings?.sso?.auth_runtime_status || 'configuration_only'}</strong>
              </p>
            </div>
          )}

          <div className="settings-save-row">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save SSO settings'}
            </button>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
