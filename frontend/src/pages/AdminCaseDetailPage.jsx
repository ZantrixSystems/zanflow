import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

const STATUS_META = {
  draft:                  { label: 'Draft',                 cls: 'badge-draft' },
  submitted:              { label: 'Submitted',             cls: 'badge-submitted' },
  under_review:           { label: 'Under review',          cls: 'badge-under-review' },
  returned_to_applicant:  { label: 'Returned to applicant', cls: 'badge-returned' },
  awaiting_information:   { label: 'Awaiting info',         cls: 'badge-awaiting' },
  waiting_on_officer:     { label: 'Waiting on officer',    cls: 'badge-awaiting' },
  verified:               { label: 'Verified',              cls: 'badge-approved' },
  under_consultation:     { label: 'Consultation',          cls: 'badge-under-review' },
  licensed:               { label: 'Licensed',              cls: 'badge-approved' },
  refused:                { label: 'Refused',               cls: 'badge-refused' },
};

// Main workflow path shown in the progress visualiser
const WORKFLOW_STEPS = [
  'submitted',
  'under_review',
  'verified',
  'under_consultation',
  'licensed',
];

// Valid next statuses from each status (for the status-change control)
const NEXT_STATUSES = {
  submitted:             ['under_review', 'returned_to_applicant'],
  under_review:          ['returned_to_applicant', 'awaiting_information', 'verified'],
  returned_to_applicant: ['under_review'],
  awaiting_information:  ['under_review'],
  waiting_on_officer:    ['under_review', 'verified'],
  verified:              ['under_consultation', 'licensed', 'refused'],
  under_consultation:    ['licensed', 'refused'],
  licensed:              [],
  refused:               [],
  draft:                 [],
};

// Labels shown in the dropdown
const NEXT_STATUS_LABELS = {
  under_review:           'Move to Under review',
  returned_to_applicant:  'Return to applicant',
  awaiting_information:   'Request information from applicant',
  waiting_on_officer:     'Mark as waiting on officer',
  verified:               'Mark as verified',
  under_consultation:     'Move to Consultation',
  licensed:               'Grant licence',
  refused:                'Refuse application',
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
  officer_note:           { label: 'Internal note',              type: 'note-internal' },
  note_internal:          { label: 'Internal note',              type: 'note-internal' },
  note_public:            { label: 'Public comment',             type: 'note-public' },
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
      <div className="case-timeline-card">
        <div className="case-timeline-card-header">
          <span className="case-timeline-label">{meta.label}</span>
          <div className="case-timeline-header-right">
            {event.event_type === 'note_internal' && <span className="case-timeline-badge-internal">Internal</span>}
            {event.event_type === 'note_public'   && <span className="case-timeline-badge-public">Public</span>}
            <span className="case-timeline-date">{formatDate(event.created_at)}</span>
          </div>
        </div>

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

        {(event.event_type === 'officer_note' || event.event_type === 'note_internal') && payload.body && (
          <div className="case-timeline-notes case-timeline-internal">{payload.body}</div>
        )}

        {event.event_type === 'note_public' && payload.body && (
          <div className="case-timeline-notes case-timeline-public">{payload.body}</div>
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

  // Permission helper — tenant_admin always passes.
  // If no custom role is assigned, fall back to built-in role defaults.
  const BUILTIN_PERMISSIONS = {
    manager: ['cases.view', 'cases.assign', 'cases.decide', 'settings.view', 'audit.view'],
    officer: ['cases.view', 'cases.assign', 'cases.decide'],
  };
  function canDo(permission) {
    if (session?.role === 'tenant_admin') return true;
    if (session?.permissions) return session.permissions.includes(permission);
    return (BUILTIN_PERMISSIONS[session?.role] ?? []).includes(permission);
  }

  const [plc, setPlc]           = useState(null);
  const [sections, setSections] = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [noteText, setNoteText]           = useState('');
  const [noteVisibility, setNoteVisibility] = useState('internal');
  const [activePanel, setActivePanel] = useState(null); // null | 'status' | 'note'

  // Timeline sort + pagination
  const [timelineNewest, setTimelineNewest] = useState(true);
  const [timelineVisible, setTimelineVisible] = useState(TIMELINE_PAGE_SIZE);

  // Status-change control
  const [nextStatus, setNextStatus]       = useState('');
  const [statusComment, setStatusComment] = useState('');
  const [shareLinks, setShareLinks] = useState([]);
  const [shareSections, setShareSections] = useState([]);
  const [shareForm, setShareForm] = useState({
    authority_name: '',
    contact_name: '',
    purpose: '',
    expiry_days: 30,
    allowed_sections: ['case_summary', 'premises', 'licence_sections'],
  });
  const [newShareUrl, setNewShareUrl] = useState('');
  const [copiedShare, setCopiedShare] = useState(false);

  const showStatusPanel = activePanel === 'status';
  const showNote        = activePanel === 'note';
  const showShare       = activePanel === 'share';

  async function loadCase() {
    const data = await api.getPremiseCase(id);
    setPlc(data.case);
    setSections(data.sections ?? []);
    setEvents(data.events ?? []);
  }

  async function loadShares() {
    const data = await api.listExternalCaseShares(id);
    setShareLinks(data.shares ?? []);
    setShareSections(data.available_sections ?? []);
  }

  useEffect(() => {
    let active = true;
    Promise.all([loadCase(), loadShares()])
      .catch((err) => { if (active) setError(err.message || 'Could not load application.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  // Reset pagination when sort changes
  useEffect(() => { setTimelineVisible(TIMELINE_PAGE_SIZE); }, [timelineNewest]);

  function openPanel(panel) {
    setActivePanel((cur) => cur === panel ? null : panel);
    setNextStatus('');
    setStatusComment('');
    setNoteText('');
    setNoteVisibility('internal');
    setNewShareUrl('');
    setCopiedShare(false);
    setError('');
    setNotice('');
  }

  function openStatusPanel() { openPanel('status'); }
  function cancelStatusPanel() { setActivePanel(null); setNextStatus(''); setStatusComment(''); }

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
      await api.addPremiseCaseNote(id, { body: noteText, visibility: noteVisibility });
      setNoteText('');
      setNoteVisibility('internal');
      setActivePanel(null);
      await loadCase();
    } catch (err) {
      setError(err.message || 'Could not save note.');
    } finally {
      setSaving(false);
    }
  }

  function toggleShareSection(sectionKey) {
    setShareForm((current) => {
      const selected = new Set(current.allowed_sections);
      if (selected.has(sectionKey)) {
        selected.delete(sectionKey);
      } else {
        selected.add(sectionKey);
      }
      return { ...current, allowed_sections: Array.from(selected) };
    });
  }

  async function createShareLink() {
    if (!shareForm.authority_name.trim()) {
      setError('Authority name is required.');
      return;
    }
    if (shareForm.allowed_sections.length === 0) {
      setError('Select at least one section to share.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    setNewShareUrl('');
    setCopiedShare(false);

    try {
      const data = await api.createExternalCaseShare(id, {
        ...shareForm,
        expiry_days: Number(shareForm.expiry_days),
      });
      setNewShareUrl(data.share?.share_url || '');
      setNotice('External share link created. Any previous active link for this application has been revoked.');
      await loadShares();
    } catch (err) {
      setError(err.message || 'Could not create share link.');
    } finally {
      setSaving(false);
    }
  }

  async function revokeShareLink(shareId) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.revokeExternalCaseShare(id, shareId);
      setNotice('External share link revoked.');
      await loadShares();
    } catch (err) {
      setError(err.message || 'Could not revoke share link.');
    } finally {
      setSaving(false);
    }
  }

  async function extendShareLink(shareId) {
    const raw = window.prompt('Extend for how many days from now? Maximum 30 days.', '30');
    if (!raw) return;
    const days = Number(raw);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setError('Expiry must be between 1 and 30 days.');
      return;
    }

    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.extendExternalCaseShare(id, shareId, { expiry_days: days });
      setNotice('External share link expiry updated.');
      await loadShares();
    } catch (err) {
      setError(err.message || 'Could not extend share link.');
    } finally {
      setSaving(false);
    }
  }

  async function copyNewShareUrl() {
    if (!newShareUrl) return;
    await navigator.clipboard.writeText(newShareUrl);
    setCopiedShare(true);
  }

  const isAssignedToMe = plc?.assigned_user_id === session.user_id;
  const isClosed       = ['licensed', 'refused'].includes(plc?.status);
  const isActive       = !isClosed && plc?.status !== 'draft';
  const canManageExternalShares = ['officer', 'manager'].includes(session.role) && canDo('cases.view');

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

          {/* Action bar */}
          {isActive && (
            <div className="case-action-bar">
              <div className="case-action-bar-buttons">
                {!isAssignedToMe && canDo('cases.assign') && (
                  <button type="button" className="btn btn-secondary" onClick={handleAssign} disabled={saving}>
                    Assign to me
                  </button>
                )}
                {availableNextStatuses.length > 0 && canDo('cases.decide') && (
                  <button
                    type="button"
                    className={`btn btn-primary${showStatusPanel ? ' active' : ''}`}
                    onClick={showStatusPanel ? cancelStatusPanel : openStatusPanel}
                    disabled={saving}
                  >
                    Update status
                  </button>
                )}
                <button
                  type="button"
                  className={`btn btn-secondary${showNote ? ' active' : ''}`}
                  onClick={() => openPanel('note')}
                  disabled={saving}
                >
                  Add comment
                </button>
                {canManageExternalShares && (
                  <button
                    type="button"
                    className={`btn btn-secondary${showShare ? ' active' : ''}`}
                    onClick={() => openPanel('share')}
                    disabled={saving}
                  >
                    External share
                  </button>
                )}
                {['manager', 'tenant_admin'].includes(session.role) && canDo('cases.decide') && (
                  <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                    Delete
                  </button>
                )}
              </div>

              {/* Inline status panel */}
              {showStatusPanel && (
                <div className="case-inline-panel">
                  <div className="case-inline-panel-stack">
                    <div className="case-inline-panel-field">
                      <label className="case-action-label" htmlFor="next-status-select">Change status to</label>
                      <select
                        id="next-status-select"
                        className="case-action-select"
                        value={nextStatus}
                        onChange={(e) => setNextStatus(e.target.value)}
                        autoFocus
                      >
                        <option value="">Select…</option>
                        {availableNextStatuses.map((s) => (
                          <option key={s} value={s}>{NEXT_STATUS_LABELS[s] ?? STATUS_META[s]?.label ?? s}</option>
                        ))}
                      </select>
                    </div>
                    <div className="case-inline-panel-field">
                      <label className="case-action-label" htmlFor="status-comment">Comment (required)</label>
                      <textarea
                        id="status-comment"
                        className="case-action-textarea"
                        rows={3}
                        value={statusComment}
                        onChange={(e) => setStatusComment(e.target.value)}
                        placeholder={nextStatus === 'refused' ? 'Reason for refusal…' : nextStatus === 'returned_to_applicant' ? 'Explain what needs to be corrected…' : 'Add a comment…'}
                      />
                    </div>
                  </div>
                  <div className="case-inline-panel-actions">
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
              )}

              {/* Inline comment panel */}
              {showNote && (
                <div className="case-inline-panel">
                  <div className="case-inline-panel-stack">
                    <div className="case-inline-panel-field">
                      <label className="case-action-label">Comment</label>
                      <textarea
                        className="case-action-textarea"
                        rows={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Enter your comment…"
                        autoFocus
                      />
                    </div>
                    <div className="case-inline-panel-field">
                      <label className="case-action-label">Visibility</label>
                      <div className="case-note-visibility-toggle">
                        <button
                          type="button"
                          className={`case-note-visibility-btn${noteVisibility === 'internal' ? ' active' : ''}`}
                          onClick={() => setNoteVisibility('internal')}
                        >
                          Internal only
                        </button>
                        <button
                          type="button"
                          className={`case-note-visibility-btn${noteVisibility === 'public' ? ' active' : ''}`}
                          onClick={() => setNoteVisibility('public')}
                        >
                          Public
                        </button>
                      </div>
                      <p className="case-action-label-hint">
                        {noteVisibility === 'internal'
                          ? 'Only officers and managers can see this.'
                          : 'The applicant will also be able to see this.'}
                      </p>
                    </div>
                  </div>
                  <div className="case-inline-panel-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setActivePanel(null)} disabled={saving}>Cancel</button>
                    <button type="button" className="btn btn-primary" onClick={submitNote} disabled={saving || !noteText.trim()}>
                      {saving ? 'Saving…' : 'Save comment'}
                    </button>
                  </div>
                </div>
              )}

              {showShare && canManageExternalShares && (
                <div className="case-inline-panel">
                  <div className="case-inline-panel-stack">
                    <div className="case-inline-panel-field">
                      <label className="case-action-label" htmlFor="share-authority">Authority name</label>
                      <input
                        id="share-authority"
                        className="form-input"
                        value={shareForm.authority_name}
                        onChange={(e) => setShareForm((cur) => ({ ...cur, authority_name: e.target.value }))}
                        placeholder="Police Licensing"
                        autoFocus
                      />
                    </div>
                    <div className="case-inline-panel-field">
                      <label className="case-action-label" htmlFor="share-contact">Contact name</label>
                      <input
                        id="share-contact"
                        className="form-input"
                        value={shareForm.contact_name}
                        onChange={(e) => setShareForm((cur) => ({ ...cur, contact_name: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="case-inline-panel-field">
                      <label className="case-action-label" htmlFor="share-purpose">Purpose</label>
                      <input
                        id="share-purpose"
                        className="form-input"
                        value={shareForm.purpose}
                        onChange={(e) => setShareForm((cur) => ({ ...cur, purpose: e.target.value }))}
                        placeholder="Consultation review"
                      />
                    </div>
                    <div className="case-inline-panel-field">
                      <label className="case-action-label" htmlFor="share-expiry">Expires after days</label>
                      <input
                        id="share-expiry"
                        className="form-input"
                        type="number"
                        min="1"
                        max="30"
                        value={shareForm.expiry_days}
                        onChange={(e) => setShareForm((cur) => ({ ...cur, expiry_days: e.target.value }))}
                      />
                      <p className="case-action-label-hint">Maximum 30 days. Creating a new link revokes the current active link.</p>
                    </div>
                    <div className="case-inline-panel-field">
                      <label className="case-action-label">Sections to share</label>
                      <div className="external-share-section-list">
                        {shareSections.map((section) => (
                          <label key={section.key} className="external-share-section-option">
                            <input
                              type="checkbox"
                              checked={shareForm.allowed_sections.includes(section.key)}
                              onChange={() => toggleShareSection(section.key)}
                            />
                            <span>{section.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {newShareUrl && (
                      <div className="external-share-created">
                        <div className="external-share-url">{newShareUrl}</div>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={copyNewShareUrl}>
                          {copiedShare ? 'Copied' : 'Copy link'}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="case-inline-panel-actions">
                    <button type="button" className="btn btn-secondary" onClick={() => setActivePanel(null)} disabled={saving}>Close</button>
                    <button type="button" className="btn btn-primary" onClick={createShareLink} disabled={saving}>
                      {saving ? 'Creating...' : 'Create link'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isClosed && ['manager', 'tenant_admin'].includes(session.role) && (
            <div className="case-action-bar">
              <div className="case-action-bar-buttons">
                <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={saving}>
                  Delete application
                </button>
              </div>
            </div>
          )}

          {/* Two-column layout */}
          <div className="case-layout">
            {/* Left: main content */}
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
            </div>

            {/* Right: case info sidebar */}
            <aside className="case-sidebar">
              <div className="case-info-card">
                <div className="case-info-card-title">Case details</div>
                <dl className="case-info-list">
                  <div className="case-info-row">
                    <dt>Status</dt>
                    <dd><StatusBadge status={plc.status} /></dd>
                  </div>
                  <div className="case-info-row">
                    <dt>Assigned to</dt>
                    <dd>
                      {isAssignedToMe
                        ? <span className="case-assigned-me">You</span>
                        : plc.assigned_user_name
                          ? plc.assigned_user_name
                          : <span className="case-unassigned">Unassigned</span>}
                    </dd>
                  </div>
                  <div className="case-info-row">
                    <dt>Submitted</dt>
                    <dd>{formatDate(plc.submitted_at)}</dd>
                  </div>
                  {plc.last_modified_at && (
                    <div className="case-info-row">
                      <dt>Modified</dt>
                      <dd>{formatDate(plc.last_modified_at)}</dd>
                    </div>
                  )}
                  <div className="case-info-row">
                    <dt>Last updated</dt>
                    <dd>{formatDate(plc.updated_at)}</dd>
                  </div>
                </dl>
              </div>

              <div className="case-info-card" style={{ marginTop: '1rem' }}>
                <div className="case-info-card-title">Applicant</div>
                <dl className="case-info-list">
                  <div className="case-info-row">
                    <dt>Name</dt>
                    <dd>{plc.applicant_name || '—'}</dd>
                  </div>
                  <div className="case-info-row">
                    <dt>Email</dt>
                    <dd style={{ wordBreak: 'break-all' }}>{plc.applicant_email || '—'}</dd>
                  </div>
                </dl>
              </div>

              <div className="case-info-card" style={{ marginTop: '1rem' }}>
                <div className="case-info-card-title">External sharing</div>
                {shareLinks.length === 0 ? (
                  <p className="case-action-label-hint">No external links have been created.</p>
                ) : (
                  <div className="external-share-history">
                    {shareLinks.map((share) => (
                      <div key={share.id} className="external-share-history-item">
                        <div className="external-share-history-head">
                          <strong>{share.authority_name}</strong>
                          <span className={`external-share-state${share.is_active ? ' active' : ''}`}>
                            {share.is_active ? 'Active' : share.revoked_at ? 'Revoked' : 'Expired'}
                          </span>
                        </div>
                        <div className="external-share-history-meta">
                          Expires {formatDate(share.expires_at)}
                        </div>
                        <div className="external-share-history-meta">
                          Viewed {share.view_count || 0} time{share.view_count === 1 ? '' : 's'}
                          {share.last_viewed_at ? `, last ${formatDate(share.last_viewed_at)}` : ''}
                        </div>
                        <div className="external-share-history-sections">
                          {(share.allowed_section_summary || []).map((section) => section.label).join(', ')}
                        </div>
                        {share.is_active && canManageExternalShares && (
                          <div className="external-share-history-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => extendShareLink(share.id)} disabled={saving}>
                              Extend
                            </button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => revokeShareLink(share.id)} disabled={saving}>
                              Revoke
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </AdminLayout>
  );
}
