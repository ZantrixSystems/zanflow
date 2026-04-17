import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth-context.jsx';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';
import { buildApplicantNav } from '../lib/navigation.js';

export default function TenantPublicHomePage() {
  const { session } = useAuth();
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    api.getTenantPublicConfig()
      .then((data) => setTenant(data.tenant))
      .catch(() => setTenant(null));
  }, []);

  const councilName = tenant?.display_name || 'Council licensing portal';

  return (
    <Layout navItems={buildApplicantNav(session)}>
      <div className="platform-hero">
        <div className="platform-hero-copy">
          <div className="section-heading">Licensing portal</div>
          <h1 className="page-title platform-hero-title">
            {tenant?.welcome_text || `Welcome to ${councilName}.`}
          </h1>
          <p className="page-subtitle platform-hero-subtitle">
            {tenant?.public_homepage_text || 'Create an applicant account, start a premises licence application, save your draft, and return later.'}
          </p>
          <div className="platform-hero-actions">
            <Link className="btn btn-primary" to="/apply">Start an application</Link>
            <Link className="btn btn-secondary" to={session ? '/dashboard' : '/register?next=%2Fapply'}>
              {session ? 'View your applications' : 'Create applicant account'}
            </Link>
          </div>
        </div>

        <div className="platform-hero-panel form-section">
          <div className="form-section-title">Before you start</div>
          <p className="platform-body-copy">
            This site belongs to <strong>{councilName}</strong>. Applicants can create their own account, save a draft, and return later.
          </p>
          <p className="platform-body-copy">
            Council staff and tenant admins should sign in at <strong>/admin</strong> on this same council-specific site.
          </p>
          {(tenant?.support_email || tenant?.support_phone || tenant?.support_contact_name) && (
            <p className="platform-body-copy">
              Contact: {[tenant.support_contact_name, tenant.support_email, tenant.support_phone].filter(Boolean).join(' | ')}
            </p>
          )}
        </div>
      </div>

      <section className="form-section">
        <div className="form-section-title">What you can do here</div>
        <div className="dashboard-action-list">
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Create your applicant account</h2>
              <p>Keep your own sign-in separate from council staff accounts and stay within this council&apos;s service only.</p>
            </div>
            <Link className="btn btn-secondary" to={session ? '/dashboard' : '/register?next=%2Fapply'}>
              {session ? 'Open dashboard' : 'Create account'}
            </Link>
          </article>
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Start online</h2>
              <p>Begin a new premises licence application, save it as a draft, and submit when you are ready.</p>
            </div>
            <Link className="btn btn-primary" to="/apply">Start</Link>
          </article>
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Track progress</h2>
              <p>Return later to review your drafts, submitted applications, and any requests for more information.</p>
            </div>
            <Link className="btn btn-secondary" to={session ? '/dashboard' : '/login?next=%2Fdashboard'}>
              {session ? 'View applications' : 'Sign in'}
            </Link>
          </article>
        </div>
      </section>

      {tenant?.contact_us_text && (
        <section className="form-section">
          <div className="form-section-title">Need help?</div>
          <p className="platform-body-copy">{tenant.contact_us_text}</p>
        </section>
      )}
    </Layout>
  );
}
