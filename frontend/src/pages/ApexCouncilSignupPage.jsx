import { useState } from 'react';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

// Lookup UI states
const LS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SELECT: 'select',         // multiple authorities returned — user must choose
  CONFIRMED: 'confirmed',   // council locked in — show account form
  SERVICE_ERROR: 'service', // GOV API down — manual name entry fallback
};

export default function ApexCouncilSignupPage() {
  // ── Step 1: council lookup ──────────────────────────────────────────────
  const [postcode, setPostcode] = useState('');
  const [lookupState, setLookupState] = useState(LS.IDLE);
  const [lookupError, setLookupError] = useState('');
  const [authorities, setAuthorities] = useState([]);
  const [council, setCouncil] = useState(null); // { name, slug }

  // ── Step 2: account details ─────────────────────────────────────────────
  const [form, setForm] = useState({
    admin_full_name: '',
    admin_email: '',
    password: '',
    password_confirmation: '',
    accept_terms: false,
  });
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const showAccountForm = lookupState === LS.CONFIRMED || lookupState === LS.SERVICE_ERROR;

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function confirmCouncil(auth) {
    setCouncil(auth);
    setLookupState(LS.CONFIRMED);
  }

  async function handleLookup(event) {
    event.preventDefault();
    setLookupError('');
    setLookupState(LS.LOADING);
    setAuthorities([]);
    setCouncil(null);

    try {
      const data = await api.publicCouncilLookup(postcode);
      if (data.authorities.length === 1) {
        confirmCouncil(data.authorities[0]);
      } else {
        setAuthorities(data.authorities);
        setLookupState(LS.SELECT);
      }
    } catch (err) {
      if (err.data?.kind === 'service') {
        setLookupError(err.data?.error ?? 'Council lookup is temporarily unavailable.');
        setLookupState(LS.SERVICE_ERROR);
        setCouncil(null);
      } else {
        setLookupError(err.data?.error ?? err.message ?? 'Lookup failed.');
        setLookupState(LS.IDLE);
      }
    }
  }

  function handleReset() {
    setPostcode('');
    setLookupState(LS.IDLE);
    setLookupError('');
    setAuthorities([]);
    setCouncil(null);
    setSaveError('');
    setForm({ admin_full_name: '', admin_email: '', password: '', password_confirmation: '', accept_terms: false });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');

    // Manual fallback: council name typed directly into admin_full_name field isn't right —
    // we capture it via a separate council_name field rendered in service_error mode.
    const organisationName = council?.name ?? form.council_name ?? '';

    try {
      const data = await api.platformSignup({
        organisation_name: organisationName,
        subdomain_slug: council?.slug,
        admin_full_name: form.admin_full_name,
        admin_email: form.admin_email,
        password: form.password,
        password_confirmation: form.password_confirmation,
        accept_terms: form.accept_terms,
      });
      // Redirect to bootstrap loading screen — existing provisioning flow unchanged
      window.location.href = data.bootstrap_redirect;
    } catch (err) {
      setSaveError(err.message || 'Could not create your council workspace. Please try again.');
      setSaving(false);
    }
  }

  const subdomainPreview = council?.slug
    ? `${council.slug}.zanflo.com`
    : form.council_name
      ? `${form.council_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63)}.zanflo.com`
      : 'your-council.zanflo.com';

  return (
    <Layout>
      <section className="form-section">
        <div className="form-section-title">Council self-service setup</div>
        <h1 className="page-title">Create your council workspace</h1>
        <p className="page-subtitle">
          Start by finding your council, then create your admin account. Your council&apos;s Zanflo site will be ready straight away.
        </p>
      </section>

      {/* ── Step 1: Postcode lookup ── */}
      {!showAccountForm && (
        <section className="form-section">
          <div className="form-section-title">Step 1 — Find your council</div>

          <form onSubmit={handleLookup} noValidate>
            <div className="form-group">
              <label htmlFor="council-postcode">Your council&apos;s postcode</label>
              <span className="form-hint">Enter any postcode in your council area.</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  id="council-postcode"
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="e.g. SW1A 1AA"
                  style={{ flex: '1 1 180px', maxWidth: 240 }}
                  autoComplete="postal-code"
                  disabled={lookupState === LS.LOADING}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={lookupState === LS.LOADING || !postcode.trim()}
                >
                  {lookupState === LS.LOADING ? 'Looking up…' : 'Find my council'}
                </button>
              </div>
            </div>

            {lookupError && lookupState === LS.IDLE && (
              <div className="alert alert-error">{lookupError}</div>
            )}
          </form>

          {/* Multiple authorities — user picks */}
          {lookupState === LS.SELECT && (
            <div style={{ marginTop: 20 }}>
              <p style={{ marginBottom: 12 }}>
                That postcode covers more than one council. Which is yours?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {authorities.map((auth) => (
                  <button
                    key={auth.slug}
                    type="button"
                    className="btn btn-secondary"
                    style={{ textAlign: 'left' }}
                    onClick={() => confirmCouncil(auth)}
                  >
                    <strong>{auth.name}</strong>
                    {auth.tier && (
                      <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--color-text-muted)' }}>
                        ({auth.tier})
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-ghost" style={{ marginTop: 12 }} onClick={handleReset}>
                Try a different postcode
              </button>
            </div>
          )}
        </section>
      )}

      {/* ── Service error fallback notice ── */}
      {lookupState === LS.SERVICE_ERROR && (
        <section className="form-section">
          <div className="alert alert-warning">
            <strong>Automatic lookup unavailable.</strong> {lookupError} You can still continue by entering your council name below.
          </div>
        </section>
      )}

      {/* ── Council confirmed banner ── */}
      {lookupState === LS.CONFIRMED && council && (
        <section className="form-section">
          <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>
              <strong>Council found:</strong> {council.name}
              {council.tier && ` (${council.tier})`}
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '2px 12px', fontSize: '0.85rem' }}
              onClick={handleReset}
            >
              Change
            </button>
          </div>
        </section>
      )}

      {/* ── Step 2: Account details ── */}
      {showAccountForm && (
        <section className="form-section">
          <div className="form-section-title">Step 2 — Create your admin account</div>

          {saveError && <div className="alert alert-error">{saveError}</div>}

          <form onSubmit={handleSubmit} noValidate>

            {/* Manual council name input — only shown when GOV API failed */}
            {lookupState === LS.SERVICE_ERROR && (
              <div className="form-group">
                <label htmlFor="council_name">Council name</label>
                <input
                  id="council_name"
                  value={form.council_name ?? ''}
                  onChange={(e) => setField('council_name', e.target.value)}
                  placeholder="Riverside Council"
                  required
                />
                {form.council_name && (
                  <span className="form-hint">
                    Your council site will be at <strong>{subdomainPreview}</strong>
                  </span>
                )}
              </div>
            )}

            {/* Subdomain preview when council was found via lookup */}
            {lookupState === LS.CONFIRMED && (
              <div className="form-group">
                <span className="form-hint" style={{ display: 'block', marginBottom: 16 }}>
                  Your council site will be at <strong>{subdomainPreview}</strong>
                </span>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="admin_full_name">Your full name</label>
              <input
                id="admin_full_name"
                value={form.admin_full_name}
                onChange={(e) => setField('admin_full_name', e.target.value)}
                placeholder="Alex Morgan"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="admin_email">Work email address</label>
              <input
                id="admin_email"
                type="email"
                value={form.admin_email}
                onChange={(e) => setField('admin_email', e.target.value)}
                placeholder="licensing.admin@riverside.gov.uk"
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                autoComplete="new-password"
                required
              />
              <span className="form-hint">
                At least 8 characters, including an uppercase letter and a number.
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="password_confirmation">Confirm password</label>
              <input
                id="password_confirmation"
                type="password"
                value={form.password_confirmation}
                onChange={(e) => setField('password_confirmation', e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <label className="checkbox-row" htmlFor="accept_terms">
              <input
                id="accept_terms"
                type="checkbox"
                checked={form.accept_terms}
                onChange={(e) => setField('accept_terms', e.target.checked)}
              />
              <span>I understand this creates a live council workspace and an admin account.</span>
            </label>

            <div className="platform-hero-actions" style={{ marginTop: 20 }}>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving || !form.accept_terms}
              >
                {saving ? 'Creating workspace…' : 'Create council workspace'}
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={saving}>
                Start over
              </button>
            </div>
          </form>
        </section>
      )}
    </Layout>
  );
}
