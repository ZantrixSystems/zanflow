import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth-context.jsx';
import Layout from '../components/Layout.jsx';
import { buildApplicantNav } from '../lib/navigation.js';

const VERIFICATION_STATE_LABELS = {
  unverified: 'Not yet submitted',
  pending_verification: 'Awaiting council review',
  verified: 'Verified',
  verification_refused: 'Verification refused',
  more_information_required: 'More information required',
};

function emptyForm() {
  return {
    premises_name: '',
    address_line_1: '',
    address_line_2: '',
    town_or_city: '',
    postcode: '',
    premises_description: '',
  };
}

export default function PremisesFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const isNew = !id;

  const [form, setForm] = useState(emptyForm());
  const [premises, setPremises] = useState(null);
  const [verificationEvents, setVerificationEvents] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [submittingVerification, setSubmittingVerification] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (isNew) return;

    api.getPremises(id)
      .then((data) => {
        setPremises(data);
        setVerificationEvents(data.verification_events ?? []);
        setForm({
          premises_name: data.premises_name ?? '',
          address_line_1: data.address_line_1 ?? '',
          address_line_2: data.address_line_2 ?? '',
          town_or_city: data.town_or_city ?? '',
          postcode: data.postcode ?? '',
          premises_description: data.premises_description ?? '',
        });
      })
      .catch((err) => setError(err.message || 'Could not load premises.'))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  function setField(field) {
    return (event) => {
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');

    const payload = {
      premises_name: form.premises_name,
      address_line_1: form.address_line_1,
      address_line_2: form.address_line_2,
      town_or_city: form.town_or_city,
      postcode: form.postcode,
      premises_description: form.premises_description,
    };

    try {
      const saved = isNew
        ? await api.createPremises(payload)
        : await api.updatePremises(id, payload);

      if (isNew) {
        const returnTo = searchParams.get('returnTo');
        const returnPremises = searchParams.get('premises');
        if (returnTo === 'apply') {
          navigate(`/apply?premises=${returnPremises || saved.id}`);
          return;
        }
        navigate(`/premises/${saved.id}`);
        return;
      }

      setPremises(saved);
      setNotice(
        saved.verification_state === 'unverified' &&
        premises?.verification_state === 'pending_verification'
          ? 'Premises saved. Your verification submission was reset because the address changed — please resubmit for verification.'
          : 'Premises saved.',
      );
    } catch (err) {
      setError(err.message || 'Could not save premises.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitVerification() {
    setSubmittingVerification(true);
    setError('');
    setNotice('');
    try {
      const updated = await api.submitPremisesVerification(id);
      setPremises(updated);
      setNotice('Submitted for council verification.');
    } catch (err) {
      setError(err.message || 'Could not submit for verification.');
    } finally {
      setSubmittingVerification(false);
    }
  }

  const verificationState = premises?.verification_state ?? 'unverified';
  const canSubmitVerification = ['unverified', 'more_information_required'].includes(verificationState);
  const isPendingOrVerified = ['pending_verification', 'verified'].includes(verificationState);

  return (
    <Layout
      breadcrumbs={[
        { to: '/', label: 'Applicant portal' },
        { to: '/premises', label: 'Premises' },
        { label: isNew ? 'New premises' : 'Edit premises' },
      ]}
      navItems={buildApplicantNav(session)}
    >
      <Link to="/premises" className="back-link">
        Back to premises
      </Link>

      <section className="form-section">
        <div className="form-section-title">Premises record</div>
        <h1 className="page-title">{isNew ? 'Add premises' : 'Edit premises'}</h1>
        <p className="page-subtitle">
          {isNew
            ? 'Add the details for your premises. Once added, you can submit it to the council for verification.'
            : 'Keep the core premises details accurate. If you change the address, your verification submission will be reset.'}
        </p>
      </section>

      {!isNew && premises && (
        <section className="form-section">
          <div className="form-section-title">Verification status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span className={`status-tag status-verification-${verificationState.replace(/_/g, '-')}`}>
              {VERIFICATION_STATE_LABELS[verificationState] ?? verificationState}
            </span>
            {canSubmitVerification && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSubmitVerification}
                disabled={submittingVerification}
              >
                {submittingVerification ? 'Submitting...' : 'Submit for verification'}
              </button>
            )}
            {verificationState === 'verified' && (
              <Link className="btn btn-primary btn-sm" to={`/apply?premises=${id}`}>
                Start application
              </Link>
            )}
          </div>

          {verificationState === 'more_information_required' && verificationEvents.length > 0 && (
            <div className="soft-panel" style={{ marginTop: 16 }}>
              <div className="form-section-title">Council message</div>
              <p className="platform-body-copy">{verificationEvents[0].notes || 'The council has requested more information. Update your premises details below and resubmit.'}</p>
            </div>
          )}

          {verificationState === 'verification_refused' && (
            <div className="soft-panel" style={{ marginTop: 16 }}>
              <div className="form-section-title">Verification refused</div>
              <p className="platform-body-copy">
                {verificationEvents[0]?.notes || 'The council was unable to verify your claim to this premises.'}
              </p>
            </div>
          )}

          {verificationState === 'pending_verification' && (
            <p className="platform-body-copy" style={{ marginTop: 12 }}>
              Your verification request has been submitted and is being reviewed by the council.
            </p>
          )}
        </section>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {loading ? (
        <div className="spinner">Loading...</div>
      ) : (
        <form onSubmit={handleSubmit}>
          <section className="form-section">
            {isPendingOrVerified && (
              <div className="alert alert-info" style={{ marginBottom: 16 }}>
                This premises is {verificationState === 'verified' ? 'verified' : 'awaiting council review'}.
                You can still update the address but doing so will reset your verification submission.
              </div>
            )}

            <div className="form-group">
              <label htmlFor="premises_name">Premises name or trading name</label>
              <input id="premises_name" value={form.premises_name} onChange={setField('premises_name')} />
            </div>

            <div className="platform-two-column">
              <div className="form-group">
                <label htmlFor="address_line_1">Address line 1</label>
                <input id="address_line_1" value={form.address_line_1} onChange={setField('address_line_1')} />
              </div>
              <div className="form-group">
                <label htmlFor="address_line_2">Address line 2 <span className="form-hint">(optional)</span></label>
                <input id="address_line_2" value={form.address_line_2} onChange={setField('address_line_2')} />
              </div>
              <div className="form-group">
                <label htmlFor="town_or_city">Town or city</label>
                <input id="town_or_city" value={form.town_or_city} onChange={setField('town_or_city')} />
              </div>
              <div className="form-group">
                <label htmlFor="postcode">Postcode</label>
                <input id="postcode" value={form.postcode} onChange={setField('postcode')} />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="premises_description">Description <span className="form-hint">(optional)</span></label>
              <textarea
                id="premises_description"
                rows={4}
                value={form.premises_description}
                onChange={setField('premises_description')}
              />
              <span className="form-hint">
                A brief description of the premises type, venue use, or activities.
              </span>
            </div>
          </section>

          <div className="platform-hero-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isNew ? 'Create premises' : 'Save premises'}
            </button>
            <Link className="btn btn-secondary" to="/premises">Cancel</Link>
          </div>
        </form>
      )}

      {!isNew && verificationEvents.length > 0 && (
        <section className="form-section" style={{ marginTop: 32 }}>
          <div className="form-section-title">Verification history</div>
          <div className="application-list">
            {verificationEvents.map((evt, idx) => (
              <div key={idx} className="application-row">
                <div className="application-row-main">
                  <div className="application-row-title">
                    {evt.event_type.replace(/_/g, ' ')}
                  </div>
                  <div className="application-row-meta">
                    {new Date(evt.created_at).toLocaleString('en-GB')}
                  </div>
                  {evt.notes && (
                    <div className="application-row-meta">{evt.notes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </Layout>
  );
}
