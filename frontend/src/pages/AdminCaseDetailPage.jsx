import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

const STATUS_META = {
  draft:                { label: 'Draft',              cls: 'badge-draft' },
  submitted:            { label: 'Submitted',          cls: 'badge-submitted' },
  under_review:         { label: 'Under review',       cls: 'badge-under-review' },
  awaiting_information: { label: 'Awaiting info',      cls: 'badge-awaiting' },
  waiting_on_officer:   { label: 'Waiting on officer', cls: 'badge-awaiting' },
  verified:             { label: 'Verified',           cls: 'badge-approved' },
  under_consultation:   { label: 'Consultation',       cls: 'badge-under-review' },
  licensed:             { label: 'Licensed',           cls: 'badge-approved' },
  refused:              { label: 'Refused',            cls: 'badge-refused' },
};

// Full ordered workflow path
const WORKFLOW_STEPS = [
  'submitted',
  'under_review',
  'awaiting_information',
  'verified',
  'under_consultation',
  'licensed',
];

// Valid next statuses from each status (for the status-change control)
const NEXT_STATUSES = {
  submitted:            ['under_review'],
  under_review:         ['awaiting_information', 'verified'],
  awaiting_information: ['under_review'],
  waiting_on_officer:   ['under_review', 'verified'],
  verified:             ['under_consultation', 'licensed', 'refused'],
  under_consultation:   ['licensed', 'refused'],
  licensed:             [],
  refused:              [],
  draft:                [],
};

// Labels shown in the dropdown
const NEXT_STATUS_LABELS = {
  under_review:         'Move to Under review',
  awaiting_information: 'Request information from applicant',
  waiting_on_officer:   'Mark as waiting on officer',
  verified:             'Mark as verified',
  under_consultation:   'Move to Consultation',
  licensed:             'Grant licence',
  refused:              'Refuse application',
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? '—', cls: 'badge-draft' };
  return <span className={`status-badge ${meta.cls}`}>{meta.label}</span>;
}

function formatDate(value) {
  if (!value) return '—';
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

// ---------------------------------------------------------------------------
// Workflow path visualiser
// ---------------------------------------------------------------------------
function WorkflowPath({ currentStatus }) {
  const isClosed = currentStatus === 'refused';
  const displaySteps = isClosed
    ? [...WORKFLOW_STEPS.slice(0, -1), 'refused']
    : WORKFLOW_STEPS;

  // Find where current status sits in the linear path
  const currentIdx = displaySteps.indexOf(currentStatus);
  // waiting_on_officer is a loop state — treat as under_review position
  const effectiveIdx = currentStatus === 'waiting_on_officer'
    ? displaySteps.indexOf('under_review')
    : currentIdx;

  return (
    <div className="workflow-path">
      {displaySteps.map((step, i) => {
        const isCurrent = step === currentStatus
          || (currentStatus === 'waiting_on_officer' && step === 'under_review');
        const isPast    = effectiveIdx > i;
        const meta      = STATUS_META[step] ?? { label: step };
        return (
          <div
            key={step}
            className={`workflow-step${isCurrent ? ' workflow-step-current' : ''}${isPast ? ' workflow-step-past' : ''}`}
          >
            <div className="workflow-step-dot" />
            <div className="workflow-step-label">{meta.label}</div>
            {i < displaySteps.length - 1 && <div className="workflow-step-connector" />}
          </div>
        );
      })}
      {currentStatus === 'waiting_on_officer' && (
        <div className="workflow-loop-note">Currently waiting on officer response</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Event type labels and styles for timeline
// ---------------------------------------------------------------------------
const EVENT_META = {
  case_created:           { label: 'Application created',        type: 'system' },
  case_submitted:         { label: 'Application submitted',      type: 'submit' },
  case_modified:          { label: 'Application modified',       type: 'modified' },
  status_changed:         { label: 'Status changed',             type: 'status' },
  officer_assigned:       { label: 'Officer assigned',           type: 'assign' },
  information_requested:  { label: 'Information requested',      type: 'request' },
  information_provided:   { label: 'Information provided',       type: 'response' },
  section_added:          { label: 'Section added',              type: 'system' },
  officer_note:           { label: 'Officer note',               type: 'note' },
  applicant_message:      { label: 'Applicant message',          type: 'message' },
  decision_made:          { label: 'Decision recorded',          type: 'decision' },
};

const TIMELINE_PAGE_SIZE = 5;

function TimelineEvent({ event }) {
  const meta = EVENT_META[event.event_type] ?? { label: event.event_type, type: 'system' };
  const payload = event.payload || {};

  return (
    <li className={`case-timeline-item type-${meta.type}`}>
      <div className="case-timeline-dot" aria-hidden="true" />
      <div className="case-timeline-body">
        <div className="case-timeline-label">{meta.label}</div>

        {event.actor_name && (
          <div className="case-timeline-by">by {event.actor_name}</div>
        )}

        {event.event_type === 'status_changed' && payload.from && payload.to && (
          <div className="case-timeline-detail">
            <StatusBadge status={payload.from} /> → <StatusBadge status={payload.to} />
          </div>
        )}

        {payload.comment && (
          <div className="case-timeline-notes">{payload.comment}</div>
        )}

        {(event.event_type === 'information_requested' || event.event_type === 'information_provided') && payload.notes && (
          <div className="case-timeline-notes">{payload.notes}</div>
        )}

        {event.event_type === 'officer_note' && payload.body && (
          <div className="case-timeline-notes case-timeline-internal">{payload.body}</div>
        )}

        {event.event_type === 'decision_made' && payload.decision && (
          <div className="case-timeline-notes">
            <strong>{payload.decision === 'licensed' ? 'Licence granted' : 'Refused'}</strong>
            {payload.notes && `: ${payload.notes}`}
          </div>
        )}

        {event.event_type === 'officer_assigned' && payload.user_name && (
          <div className="case-timeline-detail">Assigned to {payload.user_name}</div>
        )}

        <div className="case-timeline-date">{formatDate(event.created_at)}</div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AdminCaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, logout, refresh } = useStaffAuth();

  // Permission helper — tenant_admin always passes; others check custom permissions
  function canDo(permission) {
    if (session?.role === 'tenant_admin') return true;
    if (!session?.permissions) return false;
    return session.permissions.includes(permission);
  }

  const [plc, setPlc]           = useState(null);
  const [sections, setSections] = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [noteText, setNoteText] = useState('');
  const [showNote, setShowNote] = useState(false);

  // Timeline sort + pagination
  const [timelineNewest, setTimelineNewest] = useState(true);
  const [timelineVisible, setTimelineVisible] = useState(TIMELINE_PAGE_SIZE);

  // Status-change control
  const [nextStatus, setNextStatus]     = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [showStatusPanel, setShowStatusPanel] = useState(false);

  async function loadCase() {
    const data = await api.getPremiseCase(id);
    setPlc(data.case);
    setSections(data.sections ?? []);
    setEvents(data.events ?? []);
  }

  useEffect(() => {
    let active = true;
    loadCase()
      .catch((err) => { if (active) setError(err.message || 'Could not load application.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  // Reset pagination when sort changes
  useEffect(() => { setTimelineVisible(TIMELINE_PAGE_SIZE); }, [timelineNewest]);

  function openStatusPanel() {
    setNextStatus('');
    setStatusComment('');
    setShowStatusPanel(true);
    setError('');
    setNotice('');
  }

  function cancelStatusPanel() {
    setShowStatusPanel(false);
    setNextStatus('');
    setStatusComment('');
  }

  async function submitStatusChange() {
    if (!nextStatus) { setError('Select a next status.'); return; }
    if (!statusComment.trim()) { setError('A comment is required when changing status.'); return; }

    setSaving(true);
    setError('');
    setNotice('');

    try {
      if (nextStatus === 'awaiting_information') {
        await api.requestPremiseCaseInformation(id, { notes: statusComment });
        setNotice('Information requested from applicant.');
      } else if (nextStatus === 'under_review') {
        await api.movePremiseCaseStatus(id, { to_status: 'under_review', comment: statusComment });
        setNotice('Application moved to under review.');
      } else if (nextStatus === 'verified') {
        await api.verifyPremiseCase(id, { notes: statusComment });
        setNotice('Application marked as verified.');
      } else if (nextStatus === 'under_consultation') {
        await api.movePremiseCaseStatus(id, { to_status: 'under_consultation', comment: statusComment });
        setNotice('Application moved to consultation.');
      } else if (nextStatus === 'licensed' || nextStatus === 'refused') {
        await api.decidePremiseCase(id, { decision: nextStatus, notes: statusComment });
        setNotice(nextStatus === 'licensed' ? 'Licence granted.' : 'Application refused.');
      } else {
        await api.movePremiseCaseStatus(id, { to_status: nextStatus, comment: statusComment });
        setNotice(`Status updated to ${STATUS_META[nextStatus]?.label ?? nextStatus}.`);
      }

      cancelStatusPanel();
      await loadCase();
    } catch (err) {
      setError(err.message || 'Could not update status.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    setSaving(true);
    setError('');
    try {
      await api.assignPremiseCase(id, { assigned_user_id: session.user_id });
      setNotice('Application assigned to you.');
      await loadCase();
    } catch (err) {
      setError(err.message || 'Could not assign.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this application? This cannot be undone.')) return;
    setSaving(true);
    try {
      await api.deletePremiseCase(id);
      navigate('/admin/cases');
    } catch (err) {
      setError(err.message || 'Could not delete.');
      setSaving(false);
    }
  }

  async function submitNote() {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await api.addPremiseCaseNote(id, { body: noteText });
      setNoteText('');
      setShowNote(false);
      await loadCase();
    } catch (err) {
      setError(err.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  }

  const isAssignedToMe = plc?.assigned_user_id === session.user_id;
  const isClosed       = ['licensed', 'refused'].includes(plc?.status);
  const isActive       = !isClosed && plc?.status !== 'draft';

  const availableNextStatuses = NEXT_STATUSES[plc?.status] ?? [];

  // Timeline ordering + pagination
  const sortedEvents = timelineNewest ? [...events].reverse() : events;
  const visibleEvents = sortedEvents.slice(0, timelineVisible);
  const hasMoreEvents = sortedEvents.length > timelineVisible;

  // Comment required for refusal (extra validation)
  const refusalSelected = nextStatus === 'refused';

  return (
    <AdminLayout
      session={session}
      onSignOut={logout}
      onSessionRefresh={refresh}
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Dashboard' },
        { to: '/admin/cases', label: 'All applications' },
        { label: plc?.premises_name || 'Application' },
      ]}
    >
      <Link to="/admin/cases" className="back-link">← Back to applications</Link>

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : !plc ? (
        <div className="alert alert-error">Application not found.</div>
      ) : (
        <>
          {/* Application header */}
          <section className="case-header">
            <div className="case-header-main">
              <div className="case-header-ref">{plc.ref}</div>
              <h1 className="page-title">{plc.premises_name}</h1>
              <div className="case-header-meta">
                <StatusBadge status={plc.status} />
                {plc.postcode && <span className="case-header-postcode">{plc.postcode}</span>}
                {plc.last_modified_at && (
                  <span className="case-modified-badge">Modified {formatDate(plc.last_modified_at)}</span>
                )}
              </div>
              <div className="case-header-assignment">
                {isAssignedToMe
                  ? <span className="case-assigned-me">Assigned to you</span>
                  : plc.assigned_user_name
                    ? <span>Assigned to <strong>{plc.assigned_user_name}</strong></span>
                    : <span className="case-unassigned">Unassigned</span>}
              </div>
            </div>
          </section>

          {/* Workflow path */}
          <WorkflowPath currentStatus={plc.status} />

          {error  && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-success">{notice}</div>}

          <div className="case-layout">
            {/* Left: application information */}
            <div className="case-content">

              {/* Premises details */}
              <section className="form-section">
                <div className="form-section-title">Premises</div>
                <dl className="case-data-grid">
                  <DataRow label="Name"        value={plc.premises_name} />
                  <DataRow label="Address"     value={[plc.address_line_1, plc.address_line_2, plc.town_or_city].filter(Boolean).join(', ')} />
                  <DataRow label="Postcode"    value={plc.postcode} />
                  <DataRow label="Description" value={plc.premises_description} />
                </dl>
              </section>

              {/* Applicant */}
              <section className="form-section">
                <div className="form-section-title">Applicant</div>
                <dl className="case-data-grid">
                  <DataRow label="Name"  value={plc.applicant_name} />
                  <DataRow label="Email" value={plc.applicant_email} />
                </dl>
              </section>

              {/* Selected sections */}
              {sections.length > 0 && (
                <section className="form-section">
                  <div className="form-section-title">Licence sections</div>
                  {sections.map((sec) => (
                    <div key={sec.id} className="case-section-block">
                      <div className="case-section-name">{sec.section_name}</div>
                      {sec.section_description && (
                        <p className="case-section-desc">{sec.section_description}</p>
                      )}
                      {Array.isArray(sec.section_fields) && sec.section_fields.length > 0 && (
                        <dl className="case-data-grid case-section-answers">
                          {sec.section_fields.map((field) => {
                            const val = sec.answers?.[field.key];
                            if (val === undefined || val === null || val === '') return null;
                            const display = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
                            return <DataRow key={field.key} label={field.label} value={display} />;
                          })}
                        </dl>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Timeline */}
              {events.length > 0 && (
                <section className="form-section">
                  <div className="form-section-title-row">
                    <div className="form-section-title">Timeline</div>
                    <button
                      type="button"
                      className="timeline-sort-toggle"
                      onClick={() => setTimelineNewest((v) => !v)}
                    >
                      {timelineNewest ? 'Newest first ↓' : 'Oldest first ↑'}
                    </button>
                  </div>
                  <ol className="case-timeline">
                    {visibleEvents.map((ev) => (
                      <TimelineEvent key={ev.id} event={ev} />
                    ))}
                  </ol>
                  {hasMoreEvents && (
                    <button
                      type="button"
                      className="btn btn-secondary timeline-show-more"
                      onClick={() => setTimelineVisible((v) => v + TIMELINE_PAGE_SIZE)}
                    >
                      Show more ({sortedEvents.length - timelineVisible} remaining)
                    </button>
                  )}
                </section>
              )}

              {/* Add officer note */}
              {isActive && (
                <section className="form-section">
                  <div className="form-section-title">Internal note</div>
                  {showNote ? (
                    <div className="case-action-panel">
                      <p className="case-action-panel-hint">Not visible to the applicant.</p>
                      <textarea
                        className="case-action-textarea"
                        rows={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Enter your note..."
                        autoFocus
                      />
                      <div className="case-action-panel-btns">
                        <button type="button" className="btn btn-secondary" onClick={() => setShowNote(false)} disabled={saving}>Cancel</button>
                        <button type="button" className="btn btn-primary" onClick={submitNote} disabled={saving || !noteText.trim()}>
                          {saving ? 'Saving…' : 'Save note'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => setShowNote(true)}>
                      Add internal note
                    </button>
                  )}
                </section>
              )}
            </div>

            {/* Right: actions sidebar */}
            <aside className="case-sidebar">
              <div className="case-actions-card">
                <div className="case-actions-title">Actions</div>

                {isClosed ? (
                  <>
                    <p className="case-closed-note">
                      This application is <strong>{STATUS_META[plc.status]?.label ?? plc.status}</strong>. No further actions available.
                    </p>
                    {['manager', 'tenant_admin'].includes(session.role) && (
                      <>
                        <div className="case-actions-divider" />
                        <button type="button" className="btn btn-danger case-action-btn" onClick={handleDelete} disabled={saving}>
                          Delete application
                        </button>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {!isAssignedToMe && canDo('cases.assign') && (
                      <button type="button" className="btn btn-secondary case-action-btn" onClick={handleAssign} disabled={saving}>
                        Assign to me
                      </button>
                    )}

                    {/* Status change control */}
                    {availableNextStatuses.length > 0 && canDo('cases.decide') && (
                      showStatusPanel ? (
                        <div className="case-action-panel">
                          <div className="case-action-panel-title">Change status</div>

                          <label className="case-action-label" htmlFor="next-status-select">Next status</label>
                          <select
                            id="next-status-select"
                            className="case-action-select"
                            value={nextStatus}
                            onChange={(e) => setNextStatus(e.target.value)}
                          >
                            <option value="">Select…</option>
                            {availableNextStatuses.map((s) => (
                              <option key={s} value={s}>{NEXT_STATUS_LABELS[s] ?? STATUS_META[s]?.label ?? s}</option>
                            ))}
                          </select>

                          <label className="case-action-label" htmlFor="status-comment">
                            Comment {refusalSelected ? '(required)' : '(required)'}
                          </label>
                          <textarea
                            id="status-comment"
                            className="case-action-textarea"
                            rows={3}
                            value={statusComment}
                            onChange={(e) => setStatusComment(e.target.value)}
                            placeholder={refusalSelected ? 'Reason for refusal…' : 'Add a comment…'}
                            autoFocus
                          />

                          <div className="case-action-panel-btns">
                            <button type="button" className="btn btn-secondary" onClick={cancelStatusPanel} disabled={saving}>Cancel</button>
                            <button
                              type="button"
                              className={`btn ${nextStatus === 'refused' ? 'btn-danger' : 'btn-primary'}`}
                              onClick={submitStatusChange}
                              disabled={saving || !nextStatus || !statusComment.trim()}
                            >
                              {saving ? 'Saving…' : nextStatus === 'licensed' ? 'Grant licence' : nextStatus === 'refused' ? 'Confirm refusal' : 'Confirm'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button type="button" className="btn btn-primary case-action-btn" onClick={openStatusPanel} disabled={saving}>
                          Update status
                        </button>
                      )
                    )}

                    <div className="case-actions-divider" />
                    {['manager', 'tenant_admin'].includes(session.role) && canDo('cases.decide') && (
                      <button type="button" className="btn btn-danger case-action-btn" onClick={handleDelete} disabled={saving}>
                        Delete application
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Application metadata */}
              <div className="case-actions-card" style={{ marginTop: '1rem' }}>
                <div className="case-actions-title">Application info</div>
                <dl className="case-data-grid">
                  <DataRow label="Submitted"     value={formatDate(plc.submitted_at)} />
                  <DataRow label="Last modified" value={plc.last_modified_at ? formatDate(plc.last_modified_at) : null} />
                  <DataRow label="Updated"       value={formatDate(plc.updated_at)} />
                </dl>
              </div>
            </aside>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
