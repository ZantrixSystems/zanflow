import { useEffect, useState } from 'react';
import TenantSettingsLayout from '../components/TenantSettingsLayout.jsx';
import { api } from '../api.js';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-GB');
}

export default function AdminAuditPage() {
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
    <TenantSettingsLayout
      title="Audit log"
      description="Recent tenant-scoped mutations recorded for operational traceability."
    >
      {error && <div className="alert alert-error">{error}</div>}

      <div className="settings-card">
        <div className="settings-card-title">Recent activity</div>
        {loading ? (
          <div className="spinner">Loading...</div>
        ) : entries.length === 0 ? (
          <p className="settings-empty-body" style={{ textAlign: 'left' }}>No audit entries found.</p>
        ) : (
          <div className="application-list">
            {entries.map((entry, index) => (
              <div key={`${entry.target_id}-${entry.timestamp}-${index}`} className="application-row">
                <div className="application-row-main">
                  <div className="application-row-title">{entry.action}</div>
                  <div className="application-row-meta">
                    Actor: {entry.actor} &middot; Target: {entry.target_type} {entry.target_id}
                  </div>
                  <div className="application-row-meta">{formatDate(entry.timestamp)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TenantSettingsLayout>
  );
}
