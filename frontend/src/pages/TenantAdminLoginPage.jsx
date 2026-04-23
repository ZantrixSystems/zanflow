import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

export default function TenantAdminLoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('password');
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
    return '/admin/dashboard';
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
      if (step === 'password') {
        const data = await api.staffLogin({ identifier, password });
        if (data.mfa_required) {
          setStep('mfa');
          setCode('');
          return;
        }

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
        return;
      }

      await api.staffMfaVerify({ code });
      const me = await api.staffMe();
      setSession(me.session);
      navigate(getPostLoginTarget(me.session.role), { replace: true });
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
                {step === 'password'
                  ? 'This area is only for council staff and tenant admins on this tenant domain.'
                  : 'Enter the 6-digit code from your authenticator app to finish signing in.'}
              </p>

              {error && <div className="alert alert-error">{error}</div>}

              <form onSubmit={handleSubmit} noValidate>
                {step === 'password' ? (
                  <>
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
                  </>
                ) : (
                  <div className="form-group">
                    <label htmlFor="mfa-code">Authenticator code</label>
                    <input
                      id="mfa-code"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={code}
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      autoComplete="one-time-code"
                      placeholder="123456"
                      required
                    />
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-full"
                  disabled={submitting || (step === 'password' ? (!identifier || !password) : code.length !== 6)}
                >
                  {submitting ? (step === 'password' ? 'Signing in...' : 'Checking code...') : (step === 'password' ? 'Sign in' : 'Verify code')}
                </button>

                {step === 'mfa' && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-full"
                    style={{ marginTop: 12 }}
                    onClick={() => {
                      setStep('password');
                      setCode('');
                      setError('');
                    }}
                    disabled={submitting}
                  >
                    Back
                  </button>
                )}
              </form>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
