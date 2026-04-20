import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';
import { usePlatformAuth } from '../components/RequirePlatformAuth.jsx';

// Derive a slug-safe string from an authority name.
// e.g. "London Borough of Hackney" → "london-borough-of-hackney"
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

const INITIAL_FORM = {
  name: '',
  slug: '',
  subdomain: '',
  status: 'pending_setup',
  contact_name: '',
  contact_email: '',
  max_staff_users: 3,
  max_applications: 50,
};

// Lookup states
const LS = {
  IDLE: 'idle',
  LOADING: 'loading',
  SELECT: 'select',      // multiple authorities returned
  CONFIRMED: 'confirmed', // authority chosen and fields populated
  SERVICE_ERROR: 'service_error', // GOV API unavailable — manual fallback
};

export default function PlatformTenantCreatePage() {
  const { session, logout } = usePlatformAuth();
  const navigate = useNavigate();

  const [postcode, setPostcode] = useState('');
  const [lookupState, setLookupState] = useState(LS.IDLE);
  const [lookupError, setLookupError] = useState('');
  const [authorities, setAuthorities] = useState([]);
  const [selectedAuthority, setSelectedAuthority] = useState(null);

  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Whether the detail form is visible (either confirmed from lookup or manual fallback)
  const showForm = lookupState === LS.CONFIRMED || lookupState === LS.SERVICE_ERROR;

  function setField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyAuthority(auth) {
    const slug = toSlug(auth.name);
    setForm((current) => ({
      ...current,
      name: auth.name,
      slug,
      subdomain: slug,
    }));
    setSelectedAuthority(auth);
    setLookupState(LS.CONFIRMED);
  }

  async function handleLookup(event) {
    event.preventDefault();
    setLookupError('');
    setLookupState(LS.LOADING);
    setAuthorities([]);
    setSelectedAuthority(null);

    try {
      const data = await api.councilLookup(postcode);
      if (data.authorities.length === 1) {
        applyAuthority(data.authorities[0]);
      } else {
        setAuthorities(data.authorities);
        setLookupState(LS.SELECT);
      }
    } catch (err) {
      if (err.data?.kind === 'service') {
        // GOV API is down — offer manual entry
        setLookupState(LS.SERVICE_ERROR);
        setLookupError(err.data?.error ?? 'Council lookup is temporarily unavailable.');
        setForm(INITIAL_FORM);
      } else {
        // Validation error (bad postcode, not found) — stay on lookup, show error
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
    setSelectedAuthority(null);
    setForm(INITIAL_FORM);
    setSaveError('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setSaveError('');

    try {
      const tenant = await api.createPlatformTenant({
        ...form,
        max_staff_users: Number(form.max_staff_users),
        max_applications: Number(form.max_applications),
      });
      navigate(`/tenants/${tenant.id}`);
    } catch (err) {
      setSaveError(err.message || 'Could not create tenant.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout session={session} onSignOut={logout} brandTarget="/dashboard">
      <section className="form-section">
        <div className="form-section-title">Platform operations</div>
        <h1 className="page-title">Create tenant</h1>
        <p className="page-subtitle">
          Look up the council by postcode using the GOV.UK register, then confirm or adjust the details.
        </p>
      </section>

      {/* ── Step 1: Postcode lookup ── */}
      {lookupState !== LS.CONFIRMED && lookupState !== LS.SERVICE_ERROR && (
        <section className="form-section">
          <form onSubmit={handleLookup} noValidate>
            <div className="form-group">
              <label htmlFor="council-postcode">Council postcode</label>
              <span className="form-hint">Enter any postcode in the council area to find the authority.</span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  id="council-postcode"
                  type="text"
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  placeholder="e.g. SW1A 1AA"
                  style={{ flex: '1 1 200px', maxWidth: 260 }}
                  autoComplete="postal-code"
                  disabled={lookupState === LS.LOADING}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={lookupState === LS.LOADING || !postcode.trim()}
                >
                  {lookupState === LS.LOADING ? 'Looking up…' : 'Find council'}
                </button>
              </div>
            </div>

            {lookupError && lookupState === LS.IDLE && (
              <div className="alert alert-error">{lookupError}</div>
            )}
          </form>
        </section>
      )}

      {/* ── Step 1b: Multiple authorities returned ── */}
      {lookupState === LS.SELECT && (
        <section className="form-section">
          <p style={{ marginBottom: 12 }}>
            That postcode spans more than one council. Choose the one you want to create:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {authorities.map((auth) => (
              <button
                key={auth.slug}
                type="button"
                className="btn btn-secondary"
                style={{ textAlign: 'left' }}
                onClick={() => applyAuthority(auth)}
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
            Start over
          </button>
        </section>
      )}

      {/* ── Service error: manual fallback notice ── */}
      {lookupState === LS.SERVICE_ERROR && (
        <section className="form-section">
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            <strong>Automatic lookup unavailable.</strong> {lookupError}
          </div>
        </section>
      )}

      {/* ── Confirmed authority banner ── */}
      {lookupState === LS.CONFIRMED && selectedAuthority && (
        <section className="form-section">
          <div className="alert alert-success" style={{ marginBottom: 0 }}>
            <strong>Council found:</strong> {selectedAuthority.name}
            {selectedAuthority.tier && ` (${selectedAuthority.tier})`}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginLeft: 16, padding: '2px 10px', fontSize: '0.85rem' }}
              onClick={handleReset}
            >
              Change
            </button>
          </div>
        </section>
      )}

      {/* ── Step 2: Tenant detail form ── */}
      {showForm && (
        <section className="form-section">
          {saveError && <div className="alert alert-error">{saveError}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="tenant-create-name">Council name</label>
              <input
                id="tenant-create-name"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="tenant-create-slug">Slug</label>
              <span className="form-hint">Unique identifier. Lowercase letters, numbers and hyphens only.</span>
              <input
                id="tenant-create-slug"
                value={form.slug}
                onChange={(e) => setField('slug', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="tenant-create-subdomain">Subdomain</label>
              <span className="form-hint">Will appear as <em>{form.subdomain || 'example'}.zanflo.com</em></span>
              <input
                id="tenant-create-subdomain"
                value={form.subdomain}
                onChange={(e) => setField('subdomain', e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="tenant-create-status">Status</label>
              <select
                id="tenant-create-status"
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
              >
                <option value="pending_setup">Pending setup</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="tenant-create-contact-name">Contact name</label>
              <input
                id="tenant-create-contact-name"
                value={form.contact_name}
                onChange={(e) => setField('contact_name', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tenant-create-contact-email">Contact email</label>
              <input
                id="tenant-create-contact-email"
                type="email"
                value={form.contact_email}
                onChange={(e) => setField('contact_email', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tenant-create-max-staff">Max staff users</label>
              <input
                id="tenant-create-max-staff"
                type="number"
                min="1"
                value={form.max_staff_users}
                onChange={(e) => setField('max_staff_users', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="tenant-create-max-applications">Max applications</label>
              <input
                id="tenant-create-max-applications"
                type="number"
                min="1"
                value={form.max_applications}
                onChange={(e) => setField('max_applications', e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Creating…' : 'Create tenant'}
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
