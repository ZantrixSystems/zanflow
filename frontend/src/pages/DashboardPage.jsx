import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';

function statusLabel(status) {
  return status.replace(/_/g, ' ');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const [appTypes,      setAppTypes]      = useState([]);
  const [applications,  setApplications]  = useState([]);
  const [loadingTypes,  setLoadingTypes]  = useState(true);
  const [loadingApps,   setLoadingApps]   = useState(true);
  const [error,         setError]         = useState('');
  const [starting,      setStarting]      = useState(null); // type id being started

  useEffect(() => {
    api.getApplicationTypes()
      .then((d) => setAppTypes(d.application_types))
      .catch(() => setError('Could not load application types.'))
      .finally(() => setLoadingTypes(false));

    api.listApplications()
      .then((d) => setApplications(d.applications))
      .catch(() => setError('Could not load your applications.'))
      .finally(() => setLoadingApps(false));
  }, []);

  async function startApplication(typeId) {
    setStarting(typeId);
    try {
      const app = await api.createApplication({ application_type_id: typeId });
      navigate(`/applications/${app.id}`);
    } catch (err) {
      setError(err.message || 'Could not start application.');
      setStarting(null);
    }
  }

  const loading = loadingTypes || loadingApps;

  return (
    <Layout>
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : (
        <>
          {/* Start a new application */}
          <div style={{ marginBottom: 40 }}>
            <h2 className="section-heading">Start a new application</h2>
            {appTypes.length === 0 ? (
              <p className="empty-state">No application types are available.</p>
            ) : (
              <div className="app-type-grid">
                {appTypes.map((t) => (
                  <button
                    key={t.id}
                    className="app-type-card"
                    onClick={() => startApplication(t.id)}
                    disabled={starting === t.id}
                  >
                    <div className="app-type-card-title">
                      {starting === t.id ? 'Starting…' : t.name}
                    </div>
                    {t.description && (
                      <div className="app-type-card-desc">{t.description}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Existing applications */}
          <div>
            <h2 className="section-heading">Your applications</h2>
            {applications.length === 0 ? (
              <p className="empty-state">
                You have not started any applications yet.
              </p>
            ) : (
              <div className="application-list">
                {applications.map((app) => (
                  <Link
                    key={app.id}
                    to={`/applications/${app.id}`}
                    className="application-row"
                  >
                    <div className="application-row-main">
                      <div className="application-row-title">
                        {app.premises_name || 'Unnamed premises'} — {app.application_type_name}
                      </div>
                      <div className="application-row-meta">
                        Started {formatDate(app.created_at)}
                        {app.submitted_at && ` · Submitted ${formatDate(app.submitted_at)}`}
                        {app.status === 'draft' && app.expires_at && (
                          <span className="draft-expiry-warning">
                            {' '}· Will be deleted on {formatDate(app.expires_at)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`status-tag status-${app.status}`}>
                      {statusLabel(app.status)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
