import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

export default function TenantAdminLoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.staffMe()
      .then((data) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setLoadingSession(false));
  }, []);

  function getPostLoginTarget(role) {
    return role === 'tenant_admin' ? '/admin/settings?setup=1' : '/admin/dashboard';
  }

  useEffect(() => {
    if (session) {
      navigate(getPostLoginTarget(session.role), { replace: true });
    }
  }, [navigate, session]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const data = await api.staffLogin({ identifier, password });
      setSession({
        user_id: data.user.id,
        email: data.user.email,
        full_name: data.user.full_name,
        tenant_id: data.tenant.id,
        tenant_slug: data.tenant.slug,
        role: data.role,
        is_platform_admin: data.user.is_platform_admin,
      });
      navigate(getPostLoginTarget(data.role), { replace: true });
    } catch (err) {
      setError(err.message || 'Staff sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="auth-page platform-auth-page">
        <div className="auth-card">
          {loadingSession ? (
            <div className="spinner">Loading...</div>
          ) : (
            <>
              <p className="auth-footer" style={{ marginTop: 0, marginBottom: 24, textAlign: 'left' }}>
                <Link to="/">Back to council homepage</Link>
              </p>
              <h1>Staff and admin sign in</h1>
              <p className="auth-subtitle">
                This area is only for council staff and tenant admins on this tenant domain.
              </p>

              {error && <div className="alert alert-error">{error}</div>}

              <form onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="identifier">Email address</label>
                  <input
                    id="identifier"
                    type="email"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={submitting || !identifier || !password}
                >
                  {submitting ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
