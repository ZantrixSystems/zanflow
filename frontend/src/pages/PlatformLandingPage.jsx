import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

const initialForm = {
  organisation_name: '',
  admin_name: '',
  work_email: '',
  requested_subdomain: '',
  username: '',
  password: '',
  confirm: '',
};

export default function PlatformLandingPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: field === 'requested_subdomain' ? value.toLowerCase() : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);

    try {
      const response = await api.platformCreateAdminAccount({
        organisation_name: form.organisation_name,
        admin_name: form.admin_name,
        work_email: form.work_email,
        requested_subdomain: form.requested_subdomain,
        username: form.username,
        password: form.password,
      });
      setSuccess(response.message || 'Admin account created.');
      navigate('/admin/onboarding');
    } catch (err) {
      setError(err.message || 'Could not create admin account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="platform-hero">
        <div className="platform-hero-copy">
          <div className="section-heading">Council Licensing Platform</div>
          <h1 className="page-title platform-hero-title">
            Create the first council admin account and bootstrap your tenant.
          </h1>
          <p className="page-subtitle platform-hero-subtitle">
            This is for the council&apos;s initial break-glass admin only.
            Public applicants and day-to-day officers do not sign up here.
          </p>
          <div className="platform-hero-actions">
            <a className="btn btn-primary" href="#request-access">Create admin account</a>
            <Link className="btn btn-secondary" to="/admin/sign-in">Admin sign in</Link>
          </div>
        </div>

        <div className="platform-hero-panel form-section">
          <div className="form-section-title">URL Strategy</div>
          <div className="platform-url-list">
            <div className="platform-url-item">
              <strong>zanflo.com</strong>
              <span>Platform landing page and tenant bootstrap entry point.</span>
            </div>
            <div className="platform-url-item">
              <strong>platform.zanflo.com</strong>
              <span>Internal platform administration area.</span>
            </div>
            <div className="platform-url-item">
              <strong>&lt;tenant&gt;.zanflo.com</strong>
              <span>Tenant-specific portal for applicants and council staff after activation.</span>
            </div>
          </div>
        </div>
      </div>

      <section className="form-section">
        <div className="form-section-title">What It Is</div>
        <div className="platform-two-column">
          <p className="platform-body-copy">
            ZanFlo is a shared licensing platform for councils and similar public-sector organisations.
            Each council operates within its own tenant boundary, with separate data, users, and public-facing hostname.
          </p>
          <p className="platform-body-copy">
            The first account created here becomes the local fallback admin account.
            SSO can be layered on later without removing that recovery path.
          </p>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-title">Key Benefits</div>
        <div className="platform-feature-grid">
          <article className="platform-feature-card">
            <h2>Tenant isolation from day one</h2>
            <p>Each council runs independently on the same platform without data leakage across tenants.</p>
          </article>
          <article className="platform-feature-card">
            <h2>Break-glass admin first</h2>
            <p>The first account remains available even after single sign-on is enabled later.</p>
          </article>
          <article className="platform-feature-card">
            <h2>Controlled activation</h2>
            <p>The tenant starts in a pending state, then moves into trial once the first setup is complete.</p>
          </article>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-title">How It Works</div>
        <div className="platform-steps">
          <div className="platform-step">
            <span className="platform-step-number">01</span>
            <div>
              <h2>Create the first admin account</h2>
              <p>Enter the council name, work email, username, password, and the subdomain you want to reserve.</p>
            </div>
          </div>
          <div className="platform-step">
            <span className="platform-step-number">02</span>
            <div>
              <h2>Complete tenant setup</h2>
              <p>Use the onboarding area to review tenant details and assign the first staff roles by email.</p>
            </div>
          </div>
          <div className="platform-step">
            <span className="platform-step-number">03</span>
            <div>
              <h2>Move into trial</h2>
              <p>Start the tenant trial when setup is complete and continue on the council hostname.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="form-section" id="request-access">
        <div className="form-section-title">Create Admin Account</div>
        <div className="platform-request-grid">
          <div>
            <h2 className="platform-section-heading">Create the break-glass tenant admin</h2>
            <p className="platform-body-copy">
              This creates the first local admin account for your council tenant.
              The requested name becomes your council subdomain as <strong>{form.requested_subdomain || 'your-name'}.zanflo.com</strong>.
            </p>
            <p className="platform-body-copy">
              Later, this same settings area can hold SAML, OAuth, or other SSO configuration without removing this fallback account.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <div className="form-group">
              <label htmlFor="organisation_name">Organisation name</label>
              <input
                id="organisation_name"
                value={form.organisation_name}
                onChange={(event) => update('organisation_name', event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="admin_name">Admin name</label>
              <input
                id="admin_name"
                value={form.admin_name}
                onChange={(event) => update('admin_name', event.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="work_email">Work email</label>
              <input
                id="work_email"
                type="email"
                value={form.work_email}
                onChange={(event) => update('work_email', event.target.value)}
                autoComplete="email"
                required
              />
              <div className="form-hint">Use a council or organisational email address, not a personal mailbox.</div>
            </div>

            <div className="form-group">
              <label htmlFor="requested_subdomain">Requested subdomain</label>
              <div className="subdomain-input-row">
                <input
                  id="requested_subdomain"
                  value={form.requested_subdomain}
                  onChange={(event) => update('requested_subdomain', event.target.value.replace(/\s+/g, ''))}
                  required
                />
                <span className="subdomain-suffix">.zanflo.com</span>
              </div>
              <div className="form-hint">Use only the left-hand name. Example: `northbridge` becomes `northbridge.zanflo.com`.</div>
            </div>

            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                value={form.username}
                onChange={(event) => update('username', event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                autoComplete="new-password"
                required
              />
              <div className="form-hint">Minimum 8 characters.</div>
            </div>

            <div className="form-group">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                value={form.confirm}
                onChange={(event) => update('confirm', event.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                submitting ||
                !form.organisation_name ||
                !form.admin_name ||
                !form.work_email ||
                !form.requested_subdomain ||
                !form.username ||
                !form.password ||
                !form.confirm
              }
            >
              {submitting ? 'Creating account…' : 'Create admin account'}
            </button>
          </form>
        </div>
      </section>

      <section className="form-section" id="existing-users">
        <div className="form-section-title">Existing Users</div>
        <div className="platform-guidance-grid">
          <article className="platform-guidance-card">
            <h2>Existing council admins</h2>
            <p>Use the admin sign-in page on the platform apex to return to onboarding and bootstrap settings.</p>
          </article>
          <article className="platform-guidance-card">
            <h2>Platform administrators</h2>
            <p>Use `platform.zanflo.com` for internal platform administration once your access has been issued.</p>
          </article>
        </div>
      </section>
    </Layout>
  );
}
