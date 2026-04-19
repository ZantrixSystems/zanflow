import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';

export default function PlatformLoginPage() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      await api.platformLogin({ identifier, password });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Platform sign in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="auth-page platform-auth-page">
        <div className="auth-card">
          <h1>Platform admin sign in</h1>
          <p className="auth-subtitle">
            This area is only for Zanflo platform administrators.
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
        </div>
      </div>
    </Layout>
  );
}
