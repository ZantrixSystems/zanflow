import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

function emptyForm() {
  return {
    organisation: {
      council_name: '',
      council_display_name: '',
      support_contact_name: '',
      support_email: '',
      support_phone: '',
      internal_admin_name: '',
      internal_admin_email: '',
    },
    branding: {
      logo_url: '',
      welcome_text: '',
      public_homepage_text: '',
      contact_us_text: '',
    },
    sso: {
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
    },
  };
}

export default function AdminSettingsPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showSso, setShowSso] = useState(false);

  useEffect(() => {
    api.getAdminSettings()
      .then((data) => {
        setSettings(data.settings);
        setForm({
          organisation: { ...emptyForm().organisation, ...data.settings.organisation },
          branding: { ...emptyForm().branding, ...data.settings.branding },
          sso: {
            ...emptyForm().sso,
            ...data.settings.sso,
            oidc_client_secret: '',
            clear_oidc_client_secret: false,
          },
        });
      })
      .catch((err) => setError(err.message || 'Could not load tenant settings.'))
      .finally(() => setLoading(false));
  }, []);

  function setSectionField(section, field, value) {
    setForm((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
      },
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const data = await api.updateAdminSettings(form);
      setSettings(data.settings);
      setForm((current) => ({
        organisation: { ...current.organisation, ...data.settings.organisation },
        branding: { ...current.branding, ...data.settings.branding },
        sso: {
          ...current.sso,
          ...data.settings.sso,
          oidc_client_secret: '',
          clear_oidc_client_secret: false,
        },
      }));
      setNotice('Settings saved.');
    } catch (err) {
      setError(err.message || 'Could not update tenant settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminLayout
      session={session}
      onSignOut={logout}
      onSessionRefresh={refresh}
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Dashboard' },
        { label: 'Settings' },
      ]}
    >
      <section className="form-section">
        <div className="form-section-title">Settings</div>
        <h1 className="page-title">
          {settings?.organisation?.council_display_name || settings?.organisation?.council_name || 'Council settings'}
        </h1>
        <p className="page-subtitle">
          Manage your organisation details, public homepage content, and advanced identity settings.
        </p>
        <div className="platform-hero-actions" style={{ marginTop: -16 }}>
          <Link className="btn btn-secondary" to="/admin/dashboard">Back to dashboard</Link>
          {settings?.tenant?.subdomain && (
            <a className="btn btn-secondary" href={`https://${settings.tenant.subdomain}.zanflo.com`} target="_blank" rel="noreferrer">
              View public site
            </a>
          )}
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <section className="form-section">
            <div className="form-section-title">Organisation settings</div>
            <div className="platform-two-column">
              <div className="form-group">
                <label htmlFor="council_name">Council name</label>
                <input id="council_name" value={form.organisation.council_name} onChange={(event) => setSectionField('organisation', 'council_name', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="council_display_name">Council display name</label>
                <input id="council_display_name" value={form.organisation.council_display_name} onChange={(event) => setSectionField('organisation', 'council_display_name', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="support_contact_name">Support contact name</label>
                <input id="support_contact_name" value={form.organisation.support_contact_name} onChange={(event) => setSectionField('organisation', 'support_contact_name', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="support_email">Support email</label>
                <input id="support_email" type="email" value={form.organisation.support_email} onChange={(event) => setSectionField('organisation', 'support_email', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="support_phone">Support phone</label>
                <input id="support_phone" value={form.organisation.support_phone} onChange={(event) => setSectionField('organisation', 'support_phone', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="internal_admin_name">Internal admin contact</label>
                <input id="internal_admin_name" value={form.organisation.internal_admin_name} onChange={(event) => setSectionField('organisation', 'internal_admin_name', event.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="internal_admin_email">Internal admin email</label>
                <input id="internal_admin_email" type="email" value={form.organisation.internal_admin_email} onChange={(event) => setSectionField('organisation', 'internal_admin_email', event.target.value)} />
              </div>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-title">Branding and public homepage</div>
            <div className="form-group">
              <label htmlFor="logo_url">Logo URL</label>
              <input id="logo_url" type="url" value={form.branding.logo_url} onChange={(event) => setSectionField('branding', 'logo_url', event.target.value)} placeholder="https://example.gov.uk/logo.png" />
              <span className="form-hint">Use a hosted image URL for now. File upload is not implemented in this pass.</span>
            </div>
            <div className="form-group">
              <label htmlFor="welcome_text">Welcome text</label>
              <textarea id="welcome_text" value={form.branding.welcome_text} onChange={(event) => setSectionField('branding', 'welcome_text', event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="public_homepage_text">Public homepage text</label>
              <textarea id="public_homepage_text" value={form.branding.public_homepage_text} onChange={(event) => setSectionField('branding', 'public_homepage_text', event.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="contact_us_text">Contact us details</label>
              <textarea id="contact_us_text" value={form.branding.contact_us_text} onChange={(event) => setSectionField('branding', 'contact_us_text', event.target.value)} />
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-title">Identity and SSO</div>
            <div className="sso-toggle-row">
              <div>
                <div className="sso-toggle-label">Single Sign-On (SSO)</div>
                <div className="sso-toggle-desc">Connect your council's identity provider via SAML or OIDC. This is an advanced setting — most councils skip this on first setup.</div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSso((v) => !v)}
              >
                {showSso ? 'Hide SSO settings' : 'Configure SSO'}
              </button>
            </div>

            {showSso && (
              <>
                <div className="alert alert-warning" style={{ marginTop: 20 }}>
                  Live SSO sign-in is not enabled yet in this build. These settings are stored for setup and later integration.
                </div>

                <label className="checkbox-row" htmlFor="saml_enabled">
                  <input id="saml_enabled" type="checkbox" checked={form.sso.saml_enabled} onChange={(event) => setSectionField('sso', 'saml_enabled', event.target.checked)} />
                  <span>Enable SAML configuration for this tenant</span>
                </label>

                <div className="form-group">
                  <label htmlFor="saml_metadata_xml">SAML metadata XML</label>
                  <textarea id="saml_metadata_xml" value={form.sso.saml_metadata_xml} onChange={(event) => setSectionField('sso', 'saml_metadata_xml', event.target.value)} />
                </div>
                <div className="platform-two-column">
                  <div className="form-group">
                    <label htmlFor="saml_entity_id">SAML entity ID</label>
                    <input id="saml_entity_id" value={form.sso.saml_entity_id} onChange={(event) => setSectionField('sso', 'saml_entity_id', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="saml_login_url">SAML login URL</label>
                    <input id="saml_login_url" value={form.sso.saml_login_url} onChange={(event) => setSectionField('sso', 'saml_login_url', event.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="saml_certificate">SAML certificate</label>
                  <textarea id="saml_certificate" value={form.sso.saml_certificate} onChange={(event) => setSectionField('sso', 'saml_certificate', event.target.value)} />
                </div>

                <label className="checkbox-row" htmlFor="oidc_enabled">
                  <input id="oidc_enabled" type="checkbox" checked={form.sso.oidc_enabled} onChange={(event) => setSectionField('sso', 'oidc_enabled', event.target.checked)} />
                  <span>Enable OAuth / OpenID Connect configuration for this tenant</span>
                </label>

                <div className="platform-two-column">
                  <div className="form-group">
                    <label htmlFor="oidc_client_id">Client ID</label>
                    <input id="oidc_client_id" value={form.sso.oidc_client_id} onChange={(event) => setSectionField('sso', 'oidc_client_id', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="oidc_client_secret_id">Client secret ID</label>
                    <input id="oidc_client_secret_id" value={form.sso.oidc_client_secret_id} onChange={(event) => setSectionField('sso', 'oidc_client_secret_id', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="oidc_directory_id">Tenant or directory ID</label>
                    <input id="oidc_directory_id" value={form.sso.oidc_directory_id} onChange={(event) => setSectionField('sso', 'oidc_directory_id', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="oidc_issuer">Issuer</label>
                    <input id="oidc_issuer" value={form.sso.oidc_issuer} onChange={(event) => setSectionField('sso', 'oidc_issuer', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="oidc_authorization_endpoint">Authorization endpoint</label>
                    <input id="oidc_authorization_endpoint" value={form.sso.oidc_authorization_endpoint} onChange={(event) => setSectionField('sso', 'oidc_authorization_endpoint', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="oidc_token_endpoint">Token endpoint</label>
                    <input id="oidc_token_endpoint" value={form.sso.oidc_token_endpoint} onChange={(event) => setSectionField('sso', 'oidc_token_endpoint', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="oidc_userinfo_endpoint">Userinfo endpoint</label>
                    <input id="oidc_userinfo_endpoint" value={form.sso.oidc_userinfo_endpoint} onChange={(event) => setSectionField('sso', 'oidc_userinfo_endpoint', event.target.value)} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="oidc_scopes">Scopes</label>
                    <input id="oidc_scopes" value={form.sso.oidc_scopes} onChange={(event) => setSectionField('sso', 'oidc_scopes', event.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="oidc_client_secret">Client secret</label>
                  <input id="oidc_client_secret" type="password" value={form.sso.oidc_client_secret} onChange={(event) => setSectionField('sso', 'oidc_client_secret', event.target.value)} autoComplete="new-password" />
                  <span className="form-hint">
                    Saved secrets are masked after save. Current status: {settings?.sso?.has_oidc_client_secret ? `saved (${settings.sso.oidc_client_secret_hint || 'masked'})` : 'not saved'}.
                  </span>
                </div>

                <label className="checkbox-row" htmlFor="clear_oidc_client_secret">
                  <input id="clear_oidc_client_secret" type="checkbox" checked={form.sso.clear_oidc_client_secret} onChange={(event) => setSectionField('sso', 'clear_oidc_client_secret', event.target.checked)} />
                  <span>Clear the stored client secret on next save</span>
                </label>

                <div className="form-section soft-panel">
                  <div className="form-section-title">Runtime status</div>
                  <p className="platform-body-copy">
                    Redirect URI to register later: <strong>{`https://${settings?.tenant?.subdomain}.zanflo.com/api/auth/sso/callback`}</strong>
                  </p>
                  <p className="platform-body-copy">
                    Logout URI to register later: <strong>{`https://${settings?.tenant?.subdomain}.zanflo.com/`}</strong>
                  </p>
                  <p className="platform-body-copy">
                    Live auth status: <strong>{settings?.sso?.auth_runtime_status || 'configuration_only'}</strong>
                  </p>
                </div>
              </>
            )}
          </section>

          <section className="form-section">
            <div className="form-section-title">Local admin and break glass account guidance</div>
            <p className="platform-body-copy">
              Keep the bootstrap local admin account safe even if you plan to use SSO later. It is your emergency access path for setup and recovery.
            </p>
            <p className="platform-body-copy">
              Bootstrap admin: <strong>{settings?.bootstrap?.admin_name || 'Not recorded'}</strong> {settings?.bootstrap?.admin_email ? `| ${settings.bootstrap.admin_email}` : ''}
            </p>
          </section>

          <section className="form-section">
            <div className="form-section-title">Public service foundation</div>
            <p className="platform-body-copy">
              Applicant self-registration and the premises licence application journey are enabled for this tenant through the council-specific public site.
            </p>
            <p className="platform-body-copy">
              Public URL: <strong>{`${settings?.tenant?.subdomain}.zanflo.com`}</strong>
            </p>
          </section>

          <div className="platform-hero-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving setup...' : 'Save tenant setup'}
            </button>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
