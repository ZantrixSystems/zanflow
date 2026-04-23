import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../api.js';
import Layout from '../components/Layout.jsx';
import { useAuth } from '../auth-context.jsx';
import { buildApplicantNav } from '../lib/navigation.js';

const STATUS_META = {
  draft:                  { label: 'Draft',              cls: 'appl-status-draft' },
  submitted:              { label: 'Submitted',          cls: 'appl-status-submitted' },
  under_review:           { label: 'Under review',       cls: 'appl-status-review' },
  returned_to_applicant:  { label: 'Returned to you',   cls: 'appl-status-returned' },
  awaiting_information:   { label: 'Info requested',     cls: 'appl-status-info' },
  waiting_on_officer:     { label: 'Response sent',      cls: 'appl-status-submitted' },
  verified:               { label: 'Verified',           cls: 'appl-status-approved' },
  under_consultation:     { label: 'Consultation',       cls: 'appl-status-review' },
  licensed:               { label: 'Licensed',           cls: 'appl-status-approved' },
  refused:                { label: 'Refused',            cls: 'appl-status-refused' },
};

const NOTICE = {
  draft:                 { type: 'info',    text: 'This application is saved as a draft. Complete and submit it when ready.' },
  submitted:             { type: 'pending', text: 'Your application has been submitted and is waiting to be picked up by the council.' },
  under_review:          { type: 'pending', text: 'The council is reviewing your application.' },
  returned_to_applicant: { type: 'warning', text: 'The council has returned this application to you with comments. Please review and resubmit.' },
  awaiting_information:  { type: 'warning', text: 'The council has requested more information from you.' },
  waiting_on_officer:    { type: 'pending', text: 'Your response has been sent. Waiting for the officer to review.' },
  under_consultation:    { type: 'pending', text: 'Your application is in the consultation stage.' },
  licensed:              { type: 'success', text: 'Your licence has been granted.' },
  refused:               { type: 'error',   text: 'This application was refused. You can modify and resubmit.' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? '—', cls: '' };
  return <span className={`appl-status-badge ${m.cls}`}>{m.label}</span>;
}

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CaseCard({ caseRecord }) {
  const notice = NOTICE[caseRecord.status];
  const sections = Array.isArray(caseRecord.sections) && caseRecord.sections.length > 0
    ? caseRecord.sections.map((s) => s.name).join(' · ')
    : null;

  const needsAction = ['draft', 'returned_to_applicant', 'awaiting_information'].includes(caseRecord.status);

  return (
    <Link to={`/cases/${caseRecord.id}`} className={`appl-case-card${needsAction ? ' appl-case-card--action' : ''}`}>
      <div className="appl-case-card-top">
        <div className="appl-case-card-sections">
          {sections ?? <span className="appl-case-card-no-sections">No sections selected yet</span>}
        </div>
        <StatusBadge status={caseRecord.status} />
      </div>

      {notice && (
        <div className={`appl-case-notice appl-case-notice--${notice.type}`}>
          {notice.text}
          {needsAction && <span className="appl-case-notice-cta">→ Open case</span>}
        </div>
      )}

      <div className="appl-case-meta">
        {formatDate(caseRecord.created_at) && (
          <span>Started {formatDate(caseRecord.created_at)}</span>
        )}
        {caseRecord.submitted_at && (
          <span>Submitted {formatDate(caseRecord.submitted_at)}</span>
        )}
        {caseRecord.last_modified_at && (
          <span>Updated {formatDate(caseRecord.last_modified_at)}</span>
        )}
      </div>
    </Link>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { session } = useAuth();

  const [premises, setPremises] = useState([]);
  const [cases, setCases]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [startingId, setStartingId] = useState(null);

  useEffect(() => {
    Promise.all([api.listPremises(), api.listApplicantCases()])
      .then(([pd, cd]) => {
        setPremises(pd.premises ?? []);
        setCases(cd.cases ?? []);
      })
      .catch(() => setError('Could not load your account.'))
      .finally(() => setLoading(false));
  }, []);

  const caseByPremises = cases.reduce((acc, c) => { acc[c.premises_id] = c; return acc; }, {});

  async function startCase(premisesId) {
    setStartingId(premisesId);
    try {
      const data = await api.createApplicantCase({ premises_id: premisesId });
      navigate(`/cases/${data.case.id}`);
    } catch (err) {
      if (err.status === 409) {
        const existing = cases.find((c) => c.premises_id === premisesId);
        if (existing) { navigate(`/cases/${existing.id}`); return; }
      }
      setError(err.message || 'Could not create case.');
      setStartingId(null);
    }
  }

  const firstName = session?.full_name?.split(' ')[0] ?? null;

  return (
    <Layout
      breadcrumbs={[
        { to: '/', label: 'Applicant portal' },
        { label: 'My applications' },
      ]}
      navItems={buildApplicantNav(session)}
    >
      <div className="appl-page-header">
        <div>
          <h1 className="appl-page-title">
            {firstName ? `Welcome back, ${firstName}` : 'My applications'}
          </h1>
          <p className="appl-page-subtitle">Track and manage your licence applications.</p>
        </div>
        <Link className="btn btn-primary" to="/premises/new">Add premises</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : premises.length === 0 ? (
        <div className="appl-empty">
          <div className="appl-empty-icon">📋</div>
          <div className="appl-empty-title">No premises yet</div>
          <p className="appl-empty-hint">
            Add a premises first. Once it is verified by the council, you can start a licence application.
          </p>
          <Link className="btn btn-primary" to="/premises/new">Add your first premises</Link>
        </div>
      ) : (
        <div className="appl-premises-list">
          {premises.map((row) => {
            const caseRecord = caseByPremises[row.id];
            const hasCase    = !!caseRecord;
            const isVerified = row.verification_state === 'verified';
            const isClosed   = ['licensed', 'refused'].includes(caseRecord?.status);

            return (
              <div key={row.id} className="appl-premises-block">
                {/* Premises header */}
                <div className="appl-premises-head">
                  <div className="appl-premises-head-left">
                    <Link to={`/premises/${row.id}`} className="appl-premises-name">
                      {row.premises_name}
                    </Link>
                    <div className="appl-premises-address">
                      {[row.address_line_1, row.town_or_city, row.postcode].filter(Boolean).join(', ')}
                    </div>
                  </div>
                  <div className="appl-premises-head-actions">
                    {!hasCase && isVerified && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={startingId === row.id}
                        onClick={() => startCase(row.id)}
                      >
                        {startingId === row.id ? 'Starting…' : 'Start application'}
                      </button>
                    )}
                    {hasCase && (
                      <Link to={`/cases/${caseRecord.id}`} className="btn btn-secondary btn-sm">
                        {isClosed ? 'View case' : 'Open case'}
                      </Link>
                    )}
                    <Link to={`/premises/${row.id}`} className="btn btn-secondary btn-sm">
                      Premises details
                    </Link>
                  </div>
                </div>

                {/* Application case */}
                <div className="appl-cases-area">
                  {!hasCase && (
                    <div className="appl-no-case">
                      {isVerified
                        ? 'No application started yet. Use the button above to begin.'
                        : `Premises not yet verified (${row.verification_state?.replace(/_/g, ' ') ?? 'not submitted'}). Verification is required before applying.`}
                    </div>
                  )}
                  {hasCase && <CaseCard caseRecord={caseRecord} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
