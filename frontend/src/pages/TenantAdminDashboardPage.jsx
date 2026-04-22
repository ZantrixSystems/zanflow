import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' copied' : ''}`}
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

const STATUS_META = {
  submitted:            { label: 'Submitted',            cls: 'badge-submitted' },
  under_review:         { label: 'Under review',         cls: 'badge-under-review' },
  awaiting_information: { label: 'Awaiting info',        cls: 'badge-awaiting' },
  approved:             { label: 'Approved',             cls: 'badge-approved' },
  refused:              { label: 'Refused',              cls: 'badge-refused' },
  draft:                { label: 'Draft',                cls: 'badge-draft' },
};

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? { label: status?.replace(/_/g, ' ') ?? '—', cls: 'badge-draft' };
  return <span className={`status-badge ${meta.cls}`}>{meta.label}</span>;
}

function formatShortDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function OfficerDashboard({ session }) {
  const [stats, setStats] = useState(null);
  const [cases, setCases] = useState([]);
  const [casesLoading, setCasesLoading] = useState(true);

  useEffect(() => {
    api.getAdminCaseStats().then(setStats).catch(() => {});
    api.listAdminCases({ assigned: 'mine', sort: 'updated' })
      .then((data) => setCases((data.cases ?? []).slice(0, 8)))
      .catch(() => {})
      .finally(() => setCasesLoading(false));
  }, []);

  const a = stats?.stats?.applications;
  const pv = stats?.stats?.premises_verifications;

  return (
    <>
      <section className="officer-dashboard">
        <div className="officer-stat-grid">
          <Link to="/admin/cases?assigned=mine" className="officer-stat-card officer-stat-mine">
            <div className="officer-stat-number">{a?.assigned_to_me ?? '—'}</div>
            <div className="officer-stat-label">Assigned to you</div>
          </Link>
          <Link to="/admin/cases?assigned=unassigned" className="officer-stat-card officer-stat-unassigned">
            <div className="officer-stat-number">{a?.unassigned ?? '—'}</div>
            <div className="officer-stat-label">Unassigned</div>
          </Link>
          <Link to="/admin/cases?status=submitted" className="officer-stat-card officer-stat-submitted">
            <div className="officer-stat-number">{a?.submitted ?? '—'}</div>
            <div className="officer-stat-label">Awaiting review</div>
          </Link>
          <Link to="/admin/cases?case_type=premises_verification&status=pending_verification" className="officer-stat-card officer-stat-waiting">
            <div className="officer-stat-number">{pv?.pending ?? '—'}</div>
            <div className="officer-stat-label">Premises pending</div>
          </Link>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-title">
          <span>Assigned to you</span>
          <Link to="/admin/cases?assigned=mine" className="form-section-title-link">View all</Link>
        </div>

        {casesLoading ? (
          <div className="spinner">Loading...</div>
        ) : cases.length === 0 ? (
          <div className="queue-empty">
            <div className="queue-empty-title">No cases assigned to you</div>
            <p className="queue-empty-hint">
              <Link to="/admin/cases?assigned=unassigned">Pick up an unassigned case</Link>
            </p>
          </div>
        ) : (
          <div className="queue-table-wrap">
            <table className="queue-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Type</th>
                  <th>Premises</th>
                  <th>Status</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((row) => {
                  const path = row.case_type === 'premises_verification'
                    ? `/admin/premises-verifications/${row.case_id}`
                    : `/admin/applications/${row.case_id}`;
                  const ref = row.case_type === 'premises_verification'
                    ? (row.pv_ref || 'PV—')
                    : (() => {
                        if (!row.ref_number) return '—';
                        const prefix = (row.tenant_slug || 'APP').slice(0, 4).toUpperCase();
                        return `${prefix}-${String(row.ref_number).padStart(6, '0')}`;
                      })();
                  return (
                    <tr
                      key={`${row.case_type}-${row.case_id}`}
                      className="queue-table-row"
                      onClick={() => { window.location.href = path; }}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') window.location.href = path; }}
                      role="link"
                      aria-label={`${row.type_name}: ${ref}`}
                    >
                      <td className="queue-col-ref">
                        <Link to={path} className="queue-ref-link" onClick={(e) => e.stopPropagation()}>
                          {ref}
                        </Link>
                      </td>
                      <td className="queue-col-type">{row.type_name ?? '—'}</td>
                      <td className="queue-col-premises">
                        <div className="queue-premises-name">{row.premises_name || '—'}</div>
                        {row.premises_postcode && (
                          <div className="queue-premises-postcode">{row.premises_postcode}</div>
                        )}
                      </td>
                      <td className="queue-col-status"><StatusBadge status={row.case_status} /></td>
                      <td className="queue-col-date">{formatShortDate(row.case_updated_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function TenantAdminDashboardPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [searchParams] = useSearchParams();
  const isWelcome = searchParams.get('welcome') === '1';

  const [settings, setSettings] = useState(null);
  const [onboarding, setOnboarding] = useState(null);
  const [loadError, setLoadError] = useState('');

  const isTenantAdmin = session.role === 'tenant_admin';

  useEffect(() => {
    const settingsPromise = isTenantAdmin
      ? api.getAdminSettings().then((d) => setSettings(d.settings)).catch(() => {})
      : Promise.resolve();

    const onboardingPromise = isTenantAdmin
      ? api.getAdminOnboarding().then(setOnboarding).catch(() => {})
      : Promise.resolve();

    Promise.all([settingsPromise, onboardingPromise]).catch(() => {
      setLoadError('Could not load dashboard data.');
    });
  }, [isTenantAdmin]);

  const councilName = settings?.organisation?.council_display_name
    || settings?.organisation?.council_name
    || session.tenant_slug;

  const subdomain = settings?.tenant?.subdomain;

  function ScoreRing({ score, level }) {
    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const colorMap = {
      excellent: '#D4AF37',
      good: '#386A20',
      fair: '#92400e',
      needs_attention: '#BA1A1A',
    };
    const color = colorMap[level] ?? '#D4AF37';
    return (
      <div className="score-ring-wrapper">
        <svg className="score-ring-svg" viewBox="0 0 88 88" aria-hidden="true">
          <circle cx="44" cy="44" r={radius} className="score-ring-track" />
          <circle
            cx="44" cy="44" r={radius}
            className="score-ring-fill"
            stroke={color}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="score-ring-label">
          <span className="score-ring-number">{score}</span>
          <span className="score-ring-unit">/ 100</span>
        </div>
      </div>
    );
  }

  const checklist = onboarding?.checklist ? Object.values(onboarding.checklist) : null;
  const checklistTotal = checklist?.length ?? 0;
  const checklistDone = checklist?.filter((c) => c.complete).length ?? 0;
  const allDone = checklistTotal > 0 && checklistDone === checklistTotal;

  return (
    <AdminLayout
      session={session}
      onSignOut={logout}
      onSessionRefresh={refresh}
      breadcrumbs={[{ label: councilName ? `${councilName} admin` : 'Admin' }]}
    >
      {loadError && <div className="alert alert-error">{loadError}</div>}

      {/* Welcome banner — shown on first login after signup */}
      {isWelcome && (
        <section className="welcome-banner">
          <div className="welcome-banner-content">
            <div className="welcome-banner-text">
              <h1 className="welcome-banner-title">
                Welcome to {councilName || 'your council'}&apos;s admin panel
              </h1>
              <p className="welcome-banner-subtitle">
                Your workspace is ready. Complete the steps below to go live.
              </p>
            </div>
          </div>
        </section>
      )}

      {!isWelcome && (
        <section className="form-section">
          <h1 className="page-title">{councilName ? `${councilName}` : 'Admin dashboard'}</h1>
          <p className="page-subtitle">
            {['officer', 'manager'].includes(session.role)
              ? 'Review submitted applications and manage your case queue.'
              : 'Manage your council workspace, team, and settings.'}
          </p>
        </section>
      )}

      {/* Trial countdown */}
      {onboarding?.trial && onboarding.trial.days_remaining <= 30 && (
        <div className={`trial-banner${onboarding.trial.is_expired ? ' trial-expired' : ''}`}>
          <span className="trial-banner-icon" aria-hidden="true" />
          <span className="trial-banner-text">
            {onboarding.trial.is_expired
              ? 'Your trial has expired. Contact support to activate your council workspace.'
              : `Trial — ${onboarding.trial.days_remaining} day${onboarding.trial.days_remaining === 1 ? '' : 's'} remaining`}
          </span>
        </div>
      )}

      {/* Setup checklist — tenant_admin only, until all done */}
      {isTenantAdmin && checklist && !allDone && (
        <section className="onboarding-card">
          <div className="onboarding-card-header">
            <div>
              <div className="onboarding-card-title">Get your council workspace ready</div>
              <div className="onboarding-card-progress">{checklistDone} of {checklistTotal} steps complete</div>
            </div>
            <div className="onboarding-progress-bar-track">
              <div
                className="onboarding-progress-bar-fill"
                style={{ width: `${(checklistDone / checklistTotal) * 100}%` }}
              />
            </div>
          </div>
          <ul className="onboarding-checklist">
            {checklist.map((item) => (
              <li key={item.label} className={`onboarding-checklist-item${item.complete ? ' is-done' : ''}`}>
                <span className="onboarding-check-icon" aria-hidden="true">
                  {item.complete ? '✓' : ''}
                </span>
                <div className="onboarding-checklist-body">
                  <Link to={item.href} className="onboarding-checklist-label">
                    {item.label}
                    {item.badge && <span className="onboarding-badge">{item.badge}</span>}
                  </Link>
                </div>
                {!item.complete && (
                  <Link to={item.href} className="btn btn-secondary onboarding-checklist-action">
                    Start
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Workspace security — tenant_admin only */}
      {isTenantAdmin && onboarding?.security_score && (
        <section className="security-score-card">
          <div className="security-score-left">
            <ScoreRing score={onboarding.security_score.score} level={onboarding.security_score.level} />
          </div>
          <div className="security-score-right">
            <div className="security-score-title">Workspace security</div>
            <div className={`security-score-level level-${onboarding.security_score.level}`}>
              {onboarding.security_score.level === 'excellent' && 'Fully optimised'}
              {onboarding.security_score.level === 'good' && 'Good — a few improvements available'}
              {onboarding.security_score.level === 'fair' && 'Some gaps to address'}
              {onboarding.security_score.level === 'needs_attention' && 'Attention needed'}
            </div>
            {onboarding.security_score.recommendations.length > 0 ? (
              <>
                <p className="security-score-hint">Complete these steps to strengthen your workspace:</p>
                <ul className="security-recs">
                  {onboarding.security_score.recommendations.map((rec) => (
                    <li key={rec.id} className={`security-rec priority-${rec.priority}`}>
                      <Link to={rec.href} className="security-rec-link">
                        {rec.label}
                        <span className="security-rec-points">+{rec.points} pts</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="security-score-hint">Your workspace is fully optimised. No further actions required.</p>
            )}
          </div>
        </section>
      )}

      {/* Quick actions for officers/managers */}
      {['officer', 'manager'].includes(session.role) && (
        <OfficerDashboard session={session} />
      )}

      {/* Tenant admin quick links */}
      {isTenantAdmin && settings && (
        <section className="dashboard-action-list">
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Workspace settings</h2>
              <p>Manage your team, roles, permissions, licence sections, and organisation details.</p>
            </div>
            <div className="dashboard-action-controls">
              <Link className="btn btn-primary" to="/admin/settings/general">Open settings</Link>
            </div>
          </article>
        </section>
      )}

      {/* Council URLs — tenant admin only */}
      {isTenantAdmin && subdomain && (
        <section className="form-section">
          <div className="form-section-title">Your council URLs</div>
          <p className="page-subtitle" style={{ marginBottom: 20 }}>
            Share these with your team. Each link is specific to your council workspace.
          </p>
          <div className="url-table">
            {[
              { label: 'Public homepage', desc: 'Where applicants start their licensing journey', path: '' },
              { label: 'Staff sign-in', desc: 'For officers, managers, and admins', path: '/admin' },
              { label: 'Application queue', desc: 'Officers and managers process applications here', path: '/admin/applications' },
              { label: 'Applicant area', desc: 'Where applicants register and submit applications', path: '/apply' },
            ].map(({ label, desc, path }) => {
              const url = `${subdomain}.zanflo.com${path}`;
              return (
                <div key={path} className="url-table-row">
                  <div className="url-table-meta">
                    <div className="url-table-label">{label}</div>
                    <div className="url-table-desc">{desc}</div>
                  </div>
                  <div className="url-table-actions">
                    <a
                      className="url-table-link"
                      href={`https://${url}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {url}
                    </a>
                    <CopyButton text={`https://${url}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </AdminLayout>
  );
}
