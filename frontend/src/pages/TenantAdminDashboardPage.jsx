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

function OfficerDashboard({ session }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.getAdminQueueStats().then(setStats).catch(() => {});
  }, []);

  const s = stats?.stats;

  return (
    <section className="officer-dashboard">
      <div className="officer-stat-grid">
        <Link to="/admin/applications?assigned=mine" className="officer-stat-card officer-stat-mine">
          <div className="officer-stat-number">{s?.assigned_to_me ?? '—'}</div>
          <div className="officer-stat-label">Assigned to you</div>
        </Link>
        <Link to="/admin/applications?assigned=unassigned" className="officer-stat-card officer-stat-unassigned">
          <div className="officer-stat-number">{s?.unassigned ?? '—'}</div>
          <div className="officer-stat-label">Unassigned</div>
        </Link>
        <Link to="/admin/applications?status=submitted" className="officer-stat-card officer-stat-submitted">
          <div className="officer-stat-number">{s?.submitted ?? '—'}</div>
          <div className="officer-stat-label">Awaiting review</div>
        </Link>
        <Link to="/admin/applications?status=awaiting_information" className="officer-stat-card officer-stat-waiting">
          <div className="officer-stat-number">{s?.awaiting_information ?? '—'}</div>
          <div className="officer-stat-label">Awaiting info</div>
        </Link>
      </div>
      <div className="officer-queue-link">
        <Link to="/admin/applications" className="btn btn-primary">Open full queue</Link>
      </div>
    </section>
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

      {/* Security score — tenant_admin only */}
      {isTenantAdmin && onboarding?.security_score && (
        <section className="security-score-card">
          <div className="security-score-left">
            <ScoreRing score={onboarding.security_score.score} level={onboarding.security_score.level} />
          </div>
          <div className="security-score-right">
            <div className="security-score-title">Security score</div>
            <div className={`security-score-level level-${onboarding.security_score.level}`}>
              {onboarding.security_score.level === 'excellent' && 'Excellent'}
              {onboarding.security_score.level === 'good' && 'Good'}
              {onboarding.security_score.level === 'fair' && 'Fair'}
              {onboarding.security_score.level === 'needs_attention' && 'Needs attention'}
            </div>
            {onboarding.security_score.recommendations.length > 0 && (
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
            )}
          </div>
        </section>
      )}

      {/* Quick actions for officers/managers */}
      {['officer', 'manager'].includes(session.role) && (
        <OfficerDashboard session={session} />
      )}

      {/* Tenant admin actions */}
      {isTenantAdmin && settings && (
        <section className="dashboard-action-list">
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Your team</h2>
              <p>
                {onboarding?.stats?.staff_count
                  ? `${onboarding.stats.staff_count} officer${onboarding.stats.staff_count === 1 ? '' : 's'} and managers`
                  : 'No officers or managers added yet.'}
              </p>
            </div>
            <div className="dashboard-action-controls">
              <Link className="btn btn-secondary" to="/admin/users">Manage team</Link>
            </div>
          </article>
          <article className="dashboard-action-row">
            <div className="dashboard-action-copy">
              <h2>Council settings</h2>
              <p>Organisation details, public homepage, and SSO configuration.</p>
            </div>
            <div className="dashboard-action-controls dashboard-action-controls-double">
              <Link className="btn btn-secondary" to="/admin/settings">Settings</Link>
              <Link className="btn btn-secondary" to="/admin/audit">Audit log</Link>
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
