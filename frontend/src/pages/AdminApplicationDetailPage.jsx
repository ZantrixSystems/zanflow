import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

const STATUS_META = {
  submitted:            { label: 'Submitted',            cls: 'badge-submitted' },
  under_review:         { label: 'Under review',         cls: 'badge-under-review' },
  awaiting_information: { label: 'Awaiting information', cls: 'badge-awaiting' },
  approved:             { label: 'Approved',             cls: 'badge-approved' },
  refused:              { label: 'Refused',              cls: 'badge-refused' },
  draft:                { label: 'Draft',                cls: 'badge-draft' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? 'Unknown', cls: 'badge-draft' };
  return <span className={`status-badge ${meta.cls}`}>{meta.label}</span>;
}

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function DataRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="case-data-row">
      <dt className="case-data-label">{label}</dt>
      <dd className="case-data-value">{value}</dd>
    </div>
  );
}

export default function AdminApplicationDetailPage() {
  const { id } = useParams();
  const { session, logout, refresh } = useStaffAuth();
  const [application, setApplication] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  // Action panel state: null | 'request_info' | 'approve' | 'refuse'
  const [activeAction, setActiveAction] = useState(null);
  const [actionNotes, setActionNotes] = useState('');

  async function loadDetail() {
    const data = await api.getAdminApplication(id);
    setApplication(data.application);
    setDecisions(data.decisions ?? []);
  }

  useEffect(() => {
    let active = true;
    loadDetail()
      .catch((err) => { if (active) setError(err.message || 'Could not load application.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  function openAction(action) {
    setActiveAction(action);
    setActionNotes('');
    setError('');
    setNotice('');
  }

  function cancelAction() {
    setActiveAction(null);
    setActionNotes('');
  }

  async function runAction(action) {
    if (action === 'refuse' && !actionNotes.trim()) {
      setError('A reason is required when refusing an application.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      if (action === 'assign') {
        await api.assignAdminApplication(id, { assigned_user_id: session.user_id });
        setNotice('Application assigned to you.');
      } else if (action === 'request_info') {
        await api.requestAdminApplicationInformation(id, { notes: actionNotes });
        setNotice('Information request sent to applicant.');
      } else if (action === 'approve') {
        await api.decideAdminApplication(id, { decision: 'approve', notes: actionNotes });
        setNotice('Application approved.');
      } else if (action === 'refuse') {
        await api.decideAdminApplication(id, { decision: 'refuse', notes: actionNotes });
        setNotice('Application refused.');
      }

      setActiveAction(null);
      setActionNotes('');
      await loadDetail();
    } catch (err) {
      setError(err.message || 'Action failed.');
    } finally {
      setSaving(false);
    }
  }

  const isAssignedToMe = application?.assigned_user_id === session.user_id;
  const isClosed = ['approved', 'refused'].includes(application?.status);

  // Build timeline from decisions + submitted_at
  function buildTimeline() {
    const events = [];
    if (application?.submitted_at) {
      events.push({ label: 'Submitted', date: application.submitted_at, type: 'submit' });
    }
    if (application?.assigned_at && application?.assigned_user_name) {
      events.push({ label: `Assigned to ${application.assigned_user_name}`, date: application.assigned_at, type: 'assign' });
    }
    const decisionEvents = [...decisions].reverse().map((d) => ({
      label: d.decision_type.replace(/_/g, ' '),
      date: d.created_at,
      type: d.decision_type,
      by: d.decided_by_name || d.decided_by_email,
      notes: d.notes,
    }));
    return [...events, ...decisionEvents];
  }

  return (
    <AdminLayout
      session={session}
      onSignOut={logout}
      onSessionRefresh={refresh}
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Dashboard' },
        { to: '/admin/applications', label: 'Applications' },
        { label: application?.premises_name || 'Case' },
      ]}
    >
      <Link to="/admin/applications" className="back-link">Back to applications</Link>

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : !application ? (
        <div className="alert alert-error">Application not found.</div>
      ) : (
        <>
          {/* Case header */}
          <section className="case-header">
            <div className="case-header-main">
              <h1 className="page-title">
                {application.premises_name || application.application_type_name || 'Application'}
              </h1>
              <div className="case-header-meta">
                <StatusBadge status={application.status} />
                <span className="case-header-type">{application.application_type_name}</span>
                {application.premises_postcode && (
                  <span className="case-header-postcode">{application.premises_postcode}</span>
                )}
              </div>
              <div className="case-header-assignment">
                {isAssignedToMe
                  ? <span className="case-assigned-me">Assigned to you</span>
                  : application.assigned_user_name
                    ? <span>Assigned to <strong>{application.assigned_user_name}</strong></span>
                    : <span className="case-unassigned">Unassigned</span>}
              </div>
            </div>
          </section>

          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-success">{notice}</div>}

          <div className="case-layout">
            {/* Left: case information */}
            <div className="case-content">
              <section className="form-section">
                <div className="form-section-title">Application details</div>
                <dl className="case-data-grid">
                  <DataRow label="Applicant" value={application.applicant_account_name || application.applicant_account_email || application.contact_name} />
                  <DataRow label="Contact email" value={application.contact_email || application.applicant_account_email} />
                  <DataRow label="Submitted" value={formatDate(application.submitted_at)} />
                  <DataRow label="Premises" value={application.premises_name} />
                  <DataRow label="Address" value={[application.premises_address, application.premises_postcode].filter(Boolean).join(', ')} />
                  <DataRow label="Description" value={application.premises_description} />
                </dl>
              </section>

              {application.premises_id && (
                <section className="form-section">
                  <div className="form-section-title">Linked premises record</div>
                  <dl className="case-data-grid">
                    <DataRow label="Name" value={application.linked_premises_name} />
                    <DataRow label="Address" value={[application.address_line_1, application.address_line_2, application.town_or_city].filter(Boolean).join(', ')} />
                    <DataRow label="Postcode" value={application.linked_premises_postcode} />
                    <DataRow label="Description" value={application.linked_premises_description} />
                  </dl>
                </section>
              )}

              {/* Case timeline */}
              {buildTimeline().length > 0 && (
                <section className="form-section">
                  <div className="form-section-title">Case timeline</div>
                  <ol className="case-timeline">
                    {buildTimeline().map((event, i) => (
                      <li key={i} className={`case-timeline-item type-${event.type}`}>
                        <div className="case-timeline-dot" aria-hidden="true" />
                        <div className="case-timeline-body">
                          <div className="case-timeline-label">{event.label}</div>
                          {event.by && <div className="case-timeline-by">by {event.by}</div>}
                          {event.notes && <div className="case-timeline-notes">{event.notes}</div>}
                          <div className="case-timeline-date">{formatDate(event.date)}</div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>

            {/* Right: actions sidebar */}
            {!isClosed && (
              <aside className="case-sidebar">
                <div className="case-actions-card">
                  <div className="case-actions-title">Case actions</div>

                  {!isAssignedToMe && (
                    <button
                      type="button"
                      className="btn btn-secondary case-action-btn"
                      onClick={() => runAction('assign')}
                      disabled={saving}
                    >
                      Assign to me
                    </button>
                  )}

                  {/* Request information */}
                  {activeAction === 'request_info' ? (
                    <div className="case-action-panel">
                      <div className="case-action-panel-title">Request information</div>
                      <p className="case-action-panel-hint">
                        What do you need from the applicant? They will be notified.
                      </p>
                      <textarea
                        className="case-action-textarea"
                        rows={3}
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="Describe what information or documents are needed..."
                        autoFocus
                      />
                      <div className="case-action-panel-btns">
                        <button type="button" className="btn btn-secondary" onClick={cancelAction} disabled={saving}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={() => runAction('request_info')} disabled={saving || !actionNotes.trim()}>
                          {saving ? 'Sending...' : 'Send request'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-secondary case-action-btn" onClick={() => openAction('request_info')} disabled={saving}>
                      Request information
                    </button>
                  )}

                  {/* Approve */}
                  {activeAction === 'approve' ? (
                    <div className="case-action-panel case-action-panel-approve">
                      <div className="case-action-panel-title">Approve application</div>
                      <p className="case-action-panel-hint">
                        Add an optional note to record with this decision.
                      </p>
                      <textarea
                        className="case-action-textarea"
                        rows={3}
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="Optional approval notes..."
                        autoFocus
                      />
                      <div className="case-action-panel-btns">
                        <button type="button" className="btn btn-secondary" onClick={cancelAction} disabled={saving}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={() => runAction('approve')} disabled={saving}>
                          {saving ? 'Approving...' : 'Confirm approval'}
                        </button>
                      </div>
                    </div>
                  ) : activeAction !== 'refuse' && (
                    <button type="button" className="btn btn-primary case-action-btn" onClick={() => openAction('approve')} disabled={saving}>
                      Approve
                    </button>
                  )}

                  {/* Refuse */}
                  {activeAction === 'refuse' ? (
                    <div className="case-action-panel case-action-panel-refuse">
                      <div className="case-action-panel-title">Refuse application</div>
                      <p className="case-action-panel-hint">
                        You must provide a reason. The applicant will be notified.
                      </p>
                      <textarea
                        className="case-action-textarea"
                        rows={3}
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        placeholder="Reason for refusal (required)..."
                        autoFocus
                      />
                      <div className="case-action-panel-btns">
                        <button type="button" className="btn btn-secondary" onClick={cancelAction} disabled={saving}>Cancel</button>
                        <button type="button" className="btn btn-danger" onClick={() => runAction('refuse')} disabled={saving || !actionNotes.trim()}>
                          {saving ? 'Refusing...' : 'Confirm refusal'}
                        </button>
                      </div>
                    </div>
                  ) : activeAction !== 'approve' && (
                    <button type="button" className="btn btn-danger case-action-btn" onClick={() => openAction('refuse')} disabled={saving}>
                      Refuse
                    </button>
                  )}
                </div>
              </aside>
            )}

            {isClosed && (
              <aside className="case-sidebar">
                <div className="case-actions-card case-actions-closed">
                  <div className="case-actions-title">Case closed</div>
                  <p className="case-closed-note">
                    This application has been <strong>{application.status}</strong>. No further actions are available.
                  </p>
                </div>
              </aside>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
}
