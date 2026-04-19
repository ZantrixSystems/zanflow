import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

function emptySetup() {
  return {
    enabled_application_types: [],
    copy: {
      application_intro_text: '',
      applicant_guidance_text: '',
    },
    field_settings: [],
  };
}

export default function AdminApplicationSetupPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [setup, setSetup] = useState(emptySetup());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.getAdminApplicationSetup()
      .then((data) => setSetup(data.setup))
      .catch((err) => setError(err.message || 'Could not load application setup.'))
      .finally(() => setLoading(false));
  }, []);

  function setCopy(field, value) {
    setSetup((current) => ({
      ...current,
      copy: {
        ...current.copy,
        [field]: value,
      },
    }));
  }

  function setFieldSetting(fieldKey, key, value) {
    setSetup((current) => ({
      ...current,
      field_settings: current.field_settings.map((field) => (
        field.field_key === fieldKey
          ? { ...field, [key]: value }
          : field
      )),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    try {
      const data = await api.updateAdminApplicationSetup(setup);
      setSetup(data.setup);
      setNotice('Application setup saved.');
    } catch (err) {
      setError(err.message || 'Could not save application setup.');
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
        { to: '/admin/dashboard', label: 'Council admin' },
        { label: 'Application setup' },
      ]}
    >
      <section className="form-section">
        <div className="form-section-title">Application setup</div>
        <h1 className="page-title">Applicant journey foundation</h1>
        <p className="page-subtitle">
          This is the tenant-owned setup area for the hardcoded premises licence journey. It is a bounded foundation for later section-level configuration, not a full form builder.
        </p>
        <div className="platform-hero-actions" style={{ marginTop: 24 }}>
          <Link className="btn btn-secondary" to="/admin/dashboard">Back to admin dashboard</Link>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <section className="form-section">
            <div className="form-section-title">Enabled application types</div>
            {setup.enabled_application_types.length === 0 ? (
              <p className="empty-state">No application types are enabled for this tenant yet.</p>
            ) : (
              <div className="application-list">
                {setup.enabled_application_types.map((type) => (
                  <div key={type.id} className="application-row">
                    <div className="application-row-main">
                      <div className="application-row-title">{type.name}</div>
                      <div className="application-row-meta">{type.slug}</div>
                      {type.description && (
                        <div className="application-row-meta">{type.description}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="form-section">
            <div className="form-section-title">Applicant-facing copy</div>
            <div className="form-group">
              <label htmlFor="application_intro_text">Application intro text</label>
              <textarea
                id="application_intro_text"
                rows={4}
                value={setup.copy.application_intro_text}
                onChange={(event) => setCopy('application_intro_text', event.target.value)}
              />
              <span className="form-hint">
                Introductory guidance for the hardcoded premises licence start journey.
              </span>
            </div>
            <div className="form-group">
              <label htmlFor="applicant_guidance_text">Applicant guidance text</label>
              <textarea
                id="applicant_guidance_text"
                rows={4}
                value={setup.copy.applicant_guidance_text}
                onChange={(event) => setCopy('applicant_guidance_text', event.target.value)}
              />
              <span className="form-hint">
                This is safe bounded copy only. It does not create new sections or fields.
              </span>
            </div>
          </section>

          <section className="form-section">
            <div className="form-section-title">Field metadata groundwork</div>
            <p className="platform-body-copy" style={{ marginBottom: 16 }}>
              These settings only cover known hardcoded fields in the current premises licence flow. They are groundwork for later tenant configuration and sensitive-field tagging.
            </p>

            {setup.field_settings.map((field) => (
              <div key={field.field_key} className="soft-panel" style={{ marginBottom: 16 }}>
                <h2 className="section-heading" style={{ marginBottom: 12 }}>
                  {field.label_override || field.label}
                </h2>
                <p className="platform-body-copy" style={{ marginBottom: 16 }}>
                  Key: <strong>{field.field_key}</strong>
                </p>

                <div className="platform-two-column">
                  <div className="form-group">
                    <label htmlFor={`${field.field_key}_label`}>Label override</label>
                    <input
                      id={`${field.field_key}_label`}
                      value={field.label_override || ''}
                      onChange={(event) => setFieldSetting(field.field_key, 'label_override', event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`${field.field_key}_help`}>Help text</label>
                    <input
                      id={`${field.field_key}_help`}
                      value={field.help_text || ''}
                      onChange={(event) => setFieldSetting(field.field_key, 'help_text', event.target.value)}
                    />
                  </div>
                </div>

                <label className="checkbox-row" htmlFor={`${field.field_key}_enabled`}>
                  <input
                    id={`${field.field_key}_enabled`}
                    type="checkbox"
                    checked={field.enabled}
                    onChange={(event) => setFieldSetting(field.field_key, 'enabled', event.target.checked)}
                  />
                  <span>Enabled</span>
                </label>

                <label className="checkbox-row" htmlFor={`${field.field_key}_required`}>
                  <input
                    id={`${field.field_key}_required`}
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) => setFieldSetting(field.field_key, 'required', event.target.checked)}
                  />
                  <span>Required</span>
                </label>

                <label className="checkbox-row" htmlFor={`${field.field_key}_sensitive`}>
                  <input
                    id={`${field.field_key}_sensitive`}
                    type="checkbox"
                    checked={field.sensitive}
                    onChange={(event) => setFieldSetting(field.field_key, 'sensitive', event.target.checked)}
                  />
                  <span>Mark as sensitive metadata</span>
                </label>
              </div>
            ))}
          </section>

          <div className="platform-hero-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save application setup'}
            </button>
          </div>
        </form>
      )}
    </AdminLayout>
  );
}
