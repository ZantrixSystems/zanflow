/**
 * Application general form page.
 *
 * Applicant name and email are locked from the account — they are legal identity
 * fields and cannot differ from the registered account holder.
 * Phone is pre-filled but editable (not required at registration).
 *
 * Contact details default to the applicant's own details on a new application
 * but are fully editable — for cases where a solicitor or agent is acting
 * on behalf of the applicant.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth-context.jsx';
import Layout from '../components/Layout.jsx';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  });
}

// Fields the applicant can edit — name and email are excluded (locked from account)
const EDITABLE_FIELDS = [
  'applicant_phone',
  'premises_name', 'premises_address', 'premises_postcode', 'premises_description',
  'contact_name', 'contact_email', 'contact_phone',
];

export default function ApplicationPage() {
  const { id }      = useParams();
  const navigate    = useNavigate();
  const { session } = useAuth();

  const [application, setApplication] = useState(null);
  const [formData,    setFormData]     = useState({});
  const [loading,     setLoading]      = useState(true);
  const [saving,      setSaving]       = useState(false);
  const [submitting,  setSubmitting]   = useState(false);
  const [saveStatus,  setSaveStatus]   = useState('');
  const [error,       setError]        = useState('');

  useEffect(() => {
    api.getApplication(id)
      .then((app) => {
        setApplication(app);

        const fields = {};
        EDITABLE_FIELDS.forEach((f) => { fields[f] = app[f] ?? ''; });

        // Default contact fields to applicant's own details if not yet set
        // — common case is the applicant is also the contact
        if (!app.contact_name)  fields.contact_name  = session?.full_name ?? '';
        if (!app.contact_email) fields.contact_email = session?.email     ?? '';

        setFormData(fields);
      })
      .catch((err) => {
        if (err.status === 404) navigate('/dashboard');
        else setError('Could not load application.');
      })
      .finally(() => setLoading(false));
  }, [id, navigate, session]);

  const isDraft = application?.status === 'draft';

  function set(field) {
    return (e) => setFormData((f) => ({ ...f, [field]: e.target.value }));
  }

  const saveDraft = useCallback(async () => {
    if (!isDraft) return;
    setSaving(true);
    setSaveStatus('');
    setError('');

    const payload = {};
    EDITABLE_FIELDS.forEach((f) => {
      payload[f] = formData[f]?.trim() || null;
    });

    try {
      const updated = await api.updateApplication(id, payload);
      setApplication(updated);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (err) {
      setError(err.message || 'Save failed.');
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  }, [id, formData, isDraft]);

  async function handleSubmit() {
    if (!isDraft) return;
    setSaving(true);
    setError('');

    const payload = {};
    EDITABLE_FIELDS.forEach((f) => {
      payload[f] = formData[f]?.trim() || null;
    });

    try {
      await api.updateApplication(id, payload);
      setSubmitting(true);
      const submitted = await api.submitApplication(id);
      setApplication(submitted);
      setSaveStatus('');
    } catch (err) {
      setError(err.message || 'Submission failed.');
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="spinner">Loading…</div>
      </Layout>
    );
  }

  if (!application) return null;

  const isReadOnly = application.status !== 'draft';

  return (
    <Layout>
      <Link to="/dashboard" className="back-link">
        ← Back to dashboard
      </Link>

      <div className="form-page-header">
        <span className="form-page-type-label">
          {application.application_type_name || 'Application'}
        </span>
        <h1 className="form-page-title">
          {application.premises_name
            ? `Application — ${application.premises_name}`
            : 'New application'}
        </h1>
        <p className="form-page-status">
          {isReadOnly
            ? `Submitted ${formatDate(application.submitted_at)}`
            : `Draft · last saved ${formatDate(application.updated_at)}`}
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!isReadOnly && application.expires_at && (
        <div className="alert alert-warning" style={{ marginBottom: 24 }}>
          This draft will be automatically deleted on {formatDate(application.expires_at)} if not submitted.
        </div>
      )}

      {isReadOnly && (
        <div className="alert alert-success" style={{ marginBottom: 24 }}>
          This application has been submitted and cannot be edited.
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()}>

        {/* ── Section 1: Applicant details ── */}
        <section className="form-section">
          <h2 className="form-section-title">Applicant details</h2>
          <p className="form-hint" style={{ marginBottom: 16 }}>
            The person or organisation legally making this application.
          </p>

          <div className="form-group">
            <label htmlFor="applicant_name">Full name or organisation name</label>
            <input
              id="applicant_name"
              type="text"
              value={session?.full_name ?? ''}
              disabled
              aria-describedby="applicant_name_hint"
            />
            <span className="form-hint" id="applicant_name_hint">
              This is your registered name and cannot be changed here.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="applicant_email">Email address</label>
            <input
              id="applicant_email"
              type="email"
              value={session?.email ?? ''}
              disabled
              aria-describedby="applicant_email_hint"
            />
            <span className="form-hint" id="applicant_email_hint">
              This is your registered email and cannot be changed here.
            </span>
          </div>

          <div className="form-group">
            <label htmlFor="applicant_phone">
              Phone number <Optional />
            </label>
            <input
              id="applicant_phone"
              type="tel"
              value={formData.applicant_phone ?? ''}
              onChange={set('applicant_phone')}
              disabled={isReadOnly}
              autoComplete="tel"
            />
          </div>
        </section>

        {/* ── Section 2: Premises details ── */}
        <section className="form-section">
          <h2 className="form-section-title">Premises details</h2>
          <p className="form-hint" style={{ marginBottom: 16 }}>
            The premises to be licensed.
          </p>

          <div className="form-group">
            <label htmlFor="premises_name">
              Premises name <Required />
            </label>
            <input
              id="premises_name"
              type="text"
              value={formData.premises_name ?? ''}
              onChange={set('premises_name')}
              disabled={isReadOnly}
            />
          </div>

          <div className="form-group">
            <label htmlFor="premises_address">
              Address <Required />
            </label>
            <textarea
              id="premises_address"
              value={formData.premises_address ?? ''}
              onChange={set('premises_address')}
              disabled={isReadOnly}
              rows={3}
            />
          </div>

          <div className="form-group">
            <label htmlFor="premises_postcode">
              Postcode <Required />
            </label>
            <input
              id="premises_postcode"
              type="text"
              value={formData.premises_postcode ?? ''}
              onChange={set('premises_postcode')}
              disabled={isReadOnly}
              style={{ maxWidth: 160 }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="premises_description">
              Description <Optional />
            </label>
            <textarea
              id="premises_description"
              value={formData.premises_description ?? ''}
              onChange={set('premises_description')}
              disabled={isReadOnly}
              rows={3}
            />
            <span className="form-hint">
              Brief description — e.g. type of venue, capacity, planned activities.
            </span>
          </div>
        </section>

        {/* ── Section 3: Contact details ── */}
        <section className="form-section">
          <h2 className="form-section-title">Contact details</h2>
          <p className="form-hint" style={{ marginBottom: 16 }}>
            Who should the council contact about this application?
            If you are acting through a solicitor or agent, enter their details here.
            Otherwise leave as your own.
          </p>

          <div className="form-group">
            <label htmlFor="contact_name">
              Contact name <Optional />
            </label>
            <input
              id="contact_name"
              type="text"
              value={formData.contact_name ?? ''}
              onChange={set('contact_name')}
              disabled={isReadOnly}
            />
          </div>

          <div className="form-group">
            <label htmlFor="contact_email">
              Contact email <Optional />
            </label>
            <input
              id="contact_email"
              type="email"
              value={formData.contact_email ?? ''}
              onChange={set('contact_email')}
              disabled={isReadOnly}
            />
          </div>

          <div className="form-group">
            <label htmlFor="contact_phone">
              Contact phone <Optional />
            </label>
            <input
              id="contact_phone"
              type="tel"
              value={formData.contact_phone ?? ''}
              onChange={set('contact_phone')}
              disabled={isReadOnly}
            />
          </div>
        </section>

        {/* ── Actions ── */}
        {!isReadOnly && (
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={saveDraft}
              disabled={saving || submitting}
            >
              {saving && !submitting ? 'Saving…' : 'Save draft'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleSubmit}
              disabled={saving || submitting}
            >
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>

            {saveStatus === 'saved' && (
              <span className="save-indicator saved">Saved</span>
            )}
          </div>
        )}
      </form>
    </Layout>
  );
}

function Required() {
  return (
    <span
      aria-label="required"
      title="Required to submit"
      style={{ color: 'var(--color-danger)', marginLeft: 2 }}
    >
      *
    </span>
  );
}

function Optional() {
  return (
    <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 4 }}>
      (optional)
    </span>
  );
}
