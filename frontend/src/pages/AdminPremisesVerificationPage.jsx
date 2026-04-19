import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout.jsx';
import { api } from '../api.js';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { buildTenantAdminNav } from '../lib/navigation.js';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-GB');
}

const VERIFICATION_STATE_LABELS = {
  unverified: 'Not submitted',
  pending_verification: 'Awaiting review',
  verified: 'Verified',
  verification_refused: 'Refused',
  more_information_required: 'Info required',
};

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------
export function AdminPremisesVerificationListPage() {
  const { session, logout } = useStaffAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stateFilter, setStateFilter] = useState('pending_verification');

  useEffect(() => {
    setLoading(true);
    api.listAdminPremisesVerifications({ state: stateFilter })
      .then((data) => setItems(data.premises_verifications ?? []))
      .catch((err) => setError(err.message || 'Could not load verification requests.'))
      .finally(() => setLoading(false));
  }, [stateFilter]);

  return (
    <Layout
      session={session}
      onSignOut={logout}
      brandTarget="/admin/dashboard"
      signOutTarget="/admin"
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Council admin' },
        { label: 'Premises verifications' },
      ]}
      navItems={buildTenantAdminNav(session)}
    >
      <section className="form-section">
        <div className="form-section-title">Premises verifications</div>
        <h1 className="page-title">Premises verification queue</h1>
        <p className="page-subtitle">
          Review applicants' claims to their premises before they can submit licence applications.
        </p>
      </section>

      <section className="form-section">
        <div className="form-group" style={{ maxWidth: 280 }}>
          <label htmlFor="state_filter">Filter by state</label>
          <select
            id="state_filter"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <option value="pending_verification">Awaiting review</option>
            <option value="more_information_required">More info required</option>
            <option value="verified">Verified</option>
            <option value="verification_refused">Refused</option>
            <option value="all">All</option>
          </select>
        </div>
      </section>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : items.length === 0 ? (
        <section className="form-section">
          <p className="empty-state">No premises verifications match this filter.</p>
        </section>
      ) : (
        <section className="form-section">
          <div className="application-list">
            {items.map((row) => (
              <Link
                key={row.id}
                to={`/admin/premises-verifications/${row.id}`}
                className="application-row"
              >
                <div className="application-row-main">
                  <div className="application-row-title">{row.premises_name}</div>
                  <div className="application-row-meta">
                    {[row.address_line_1, row.town_or_city, row.postcode].filter(Boolean).join(' · ')}
                  </div>
                  <div className="application-row-meta">
                    Applicant: {row.applicant_name || row.applicant_email}
                    {row.last_submitted_at && ` · Submitted ${formatDate(row.last_submitted_at)}`}
                  </div>
                </div>
                <span className={`status-tag status-verification-${(row.verification_state ?? '').replace(/_/g, '-')}`}>
                  {VERIFICATION_STATE_LABELS[row.verification_state] ?? row.verification_state}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}

// ---------------------------------------------------------------------------
// Detail / decision page
// ---------------------------------------------------------------------------
export function AdminPremisesVerificationDetailPage() {
  const { id } = useParams();
  const { session, logout } = useStaffAuth();
  const navigate = useNavigate();
  const [premises, setPremises] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState('');

  async function loadDetail() {
    const data = await api.getAdminPremisesVerification(id);
    setPremises(data.premises);
    setEvents(data.verification_events ?? []);
  }

  useEffect(() => {
    let active = true;
    loadDetail()
      .catch((err) => {
        if (!active) return;
        setError(err.message || 'Could not load premises.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  async function recordDecision(decision) {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await api.decideAdminPremisesVerification(id, { decision, notes });
      setNotes('');
      setNotice(`Decision recorded: ${decision.replace(/_/g, ' ')}.`);
      await loadDetail();
    } catch (err) {
      setError(err.message || 'Could not record decision.');
    } finally {
      setSaving(false);
    }
  }

  const isPending = premises?.verification_state === 'pending_verification';

  return (
    <Layout
      session={session}
      onSignOut={logout}
      brandTarget="/admin/dashboard"
      signOutTarget="/admin"
      breadcrumbs={[
        { to: '/admin/dashboard', label: 'Council admin' },
        { to: '/admin/premises-verifications', label: 'Premises verifications' },
        { label: 'Premises detail' },
      ]}
      navItems={buildTenantAdminNav(session)}
    >
      <Link to="/admin/premises-verifications" className="back-link">
        Back to verification queue
      </Link>

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : !premises ? (
        <div className="alert alert-error">Premises not found.</div>
      ) : (
        <>
          <section className="form-section">
            <div className="form-section-title">Premises verification</div>
            <h1 className="page-title">{premises.premises_name}</h1>
            <p className="page-subtitle">
              Status:{' '}
              <strong>
                {VERIFICATION_STATE_LABELS[premises.verification_state] ?? premises.verification_state}
              </strong>
            </p>
          </section>

          <section className="form-section">
            <div className="form-section-title">Premises details</div>
            <p className="platform-body-copy">
              <strong>Address:</strong>{' '}
              {[premises.address_line_1, premises.address_line_2, premises.town_or_city, premises.postcode]
                .filter(Boolean)
                .join(', ')}
            </p>
            {premises.premises_description && (
              <p className="platform-body-copy">
                <strong>Description:</strong> {premises.premises_description}
              </p>
            )}
          </section>

          <section className="form-section">
            <div className="form-section-title">Applicant</div>
            <p className="platform-body-copy">
              <strong>Name:</strong> {premises.applicant_name || 'Not provided'}
            </p>
            <p className="platform-body-copy">
              <strong>Email:</strong> {premises.applicant_email || 'Not provided'}
            </p>
            {premises.applicant_phone && (
              <p className="platform-body-copy">
                <strong>Phone:</strong> {premises.applicant_phone}
              </p>
            )}
          </section>

          {error && <div className="alert alert-error">{error}</div>}
          {notice && <div className="alert alert-success">{notice}</div>}

          {isPending && (
            <section className="form-section">
              <div className="form-section-title">Record decision</div>
              <div className="form-group">
                <label htmlFor="decision-notes">Notes</label>
                <textarea
                  id="decision-notes"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes to explain the decision or request specific information"
                />
              </div>
              <div className="platform-hero-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => recordDecision('verified')}
                  disabled={saving}
                >
                  {saving ? 'Working...' : 'Verify premises'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => recordDecision('more_information_required')}
                  disabled={saving}
                >
                  Request more information
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => recordDecision('verification_refused')}
                  disabled={saving}
                >
                  Refuse verification
                </button>
              </div>
            </section>
          )}

          {!isPending && (
            <section className="form-section">
              <div className="form-section-title">Current state</div>
              <p className="platform-body-copy">
                This premises is not in a pending state. No action is available.
              </p>
            </section>
          )}

          <section className="form-section">
            <div className="form-section-title">Verification history</div>
            {events.length === 0 ? (
              <p className="empty-state">No verification events recorded yet.</p>
            ) : (
              <div className="application-list">
                {events.map((evt) => (
                  <div key={evt.id} className="application-row">
                    <div className="application-row-main">
                      <div className="application-row-title">
                        {evt.event_type.replace(/_/g, ' ')}
                      </div>
                      <div className="application-row-meta">
                        {evt.actor_name || evt.actor_email || `${evt.actor_type}`} · {formatDate(evt.created_at)}
                      </div>
                      {evt.notes && (
                        <div className="application-row-meta">{evt.notes}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Layout>
  );
}
