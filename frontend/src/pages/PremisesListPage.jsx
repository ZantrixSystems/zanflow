import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth-context.jsx';
import Layout from '../components/Layout.jsx';
import { buildApplicantNav } from '../lib/navigation.js';

const VERIFICATION_STATE = {
  unverified:                { label: 'Not submitted',     cls: 'vstate-unverified',    hint: 'Submit this premises for council verification before you can apply.' },
  pending_verification:      { label: 'Awaiting review',   cls: 'vstate-pending',       hint: 'The council is reviewing your premises. We\'ll notify you when done.' },
  verified:                  { label: 'Verified',          cls: 'vstate-verified',      hint: 'This premises is verified. You can start a licence application.' },
  verification_refused:      { label: 'Refused',           cls: 'vstate-refused',       hint: 'The council could not verify this premises. See the details page for more information.' },
  more_information_required: { label: 'Info required',     cls: 'vstate-info-required', hint: 'The council has asked for more information. Click to view and respond.' },
};

function VerificationBadge({ state }) {
  const meta = VERIFICATION_STATE[state] ?? { label: state, cls: 'vstate-unverified' };
  return <span className={`prem-badge ${meta.cls}`}>{meta.label}</span>;
}

export default function PremisesListPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [premises, setPremises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    api.listPremises()
      .then((data) => setPremises(data.premises ?? []))
      .catch((err) => setError(err.message || 'Could not load your premises.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(event, premisesId) {
    event.preventDefault();
    if (!window.confirm('Delete this premises record? This cannot be undone.')) return;
    setDeletingId(premisesId);
    setError('');
    try {
      await api.deletePremises(premisesId);
      setPremises((current) => current.filter((row) => row.id !== premisesId));
    } catch (err) {
      setError(err.message || 'Could not delete premises.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Layout
      breadcrumbs={[
        { to: '/', label: 'Applicant portal' },
        { label: 'Premises' },
      ]}
      navItems={buildApplicantNav(session)}
    >
      <div className="prem-list-header">
        <div>
          <h1 className="prem-list-title">Your premises</h1>
          <p className="prem-list-subtitle">
            Each premises must be verified before you can apply for a licence.
          </p>
        </div>
        <Link className="btn btn-primary" to="/premises/new">Add premises</Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : premises.length === 0 ? (
        <div className="prem-empty">
          <div className="prem-empty-icon">🏢</div>
          <div className="prem-empty-title">No premises yet</div>
          <p className="prem-empty-hint">Add a premises to get started. Once the council verifies it, you can apply for a licence.</p>
          <Link className="btn btn-primary" to="/premises/new">Add your first premises</Link>
        </div>
      ) : (
        <div className="prem-grid">
          {premises.map((row) => {
            const vstate = row.verification_state ?? 'unverified';
            const meta = VERIFICATION_STATE[vstate] ?? VERIFICATION_STATE.unverified;
            const isVerified = vstate === 'verified';

            return (
              <Link key={row.id} to={`/premises/${row.id}`} className="prem-card">
                <div className="prem-card-top">
                  <div className="prem-card-name">{row.premises_name}</div>
                  <VerificationBadge state={vstate} />
                </div>

                <div className="prem-card-address">
                  {[row.address_line_1, row.town_or_city, row.postcode].filter(Boolean).join(', ')}
                </div>

                <div className="prem-card-hint">{meta.hint}</div>

                <div className="prem-card-footer">
                  <span className="prem-card-apps">
                    {row.application_count ?? 0} application{row.application_count !== 1 ? 's' : ''}
                  </span>
                  <div className="prem-card-actions" onClick={(e) => e.preventDefault()}>
                    {isVerified && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={(e) => { e.preventDefault(); navigate(`/apply?premises=${row.id}`); }}
                      >
                        Start application
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={(e) => handleDelete(e, row.id)}
                      disabled={deletingId === row.id}
                    >
                      {deletingId === row.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
