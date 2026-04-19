import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-GB');
}

export default function AdminAuditPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAdminAudit()
      .then((data) => setEntries(data.audit_logs ?? []))
      .catch((err) => setError(err.message || 'Could not load audit log.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminLayout
      session={session}
      onSignOut={logout}
      onSessionRefresh={refresh}
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Council admin' },
        { label: 'Audit' },
      ]}
    >
      <section className="form-section">
        <div className="form-section-title">Tenant administration</div>
        <h1 className="page-title">Audit</h1>
        <p className="page-subtitle">Recent tenant-scoped mutations recorded for operational traceability.</p>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="form-section">
        <div className="form-section-title">Recent activity</div>
        {loading ? (
          <div className="spinner">Loading...</div>
        ) : entries.length === 0 ? (
          <p className="empty-state">No audit entries found.</p>
        ) : (
          <div className="application-list">
            {entries.map((entry, index) => (
              <div key={`${entry.target_id}-${entry.timestamp}-${index}`} className="application-row">
                <div className="application-row-main">
                  <div className="application-row-title">{entry.action}</div>
                  <div className="application-row-meta">
                    Actor: {entry.actor} | Target: {entry.target_type} {entry.target_id}
                  </div>
                  <div className="application-row-meta">{formatDate(entry.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}
