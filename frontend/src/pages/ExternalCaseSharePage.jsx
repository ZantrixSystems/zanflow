import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

function formatDate(value) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

function SectionAnswers({ section }) {
  const fields = Array.isArray(section.section_fields) ? section.section_fields : [];
  return (
    <div className="case-section-block">
      <div className="case-section-name">{section.section_name}</div>
      {section.section_description && (
        <p className="case-section-desc">{section.section_description}</p>
      )}
      <dl className="case-data-grid case-section-answers">
        {fields.map((field) => {
          const val = section.answers?.[field.key];
          if (val === undefined || val === null || val === '') return null;
          const display = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
          return <DataRow key={field.key} label={field.label} value={display} />;
        })}
      </dl>
    </div>
  );
}

export default function ExternalCaseSharePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.getExternalCaseShare(token)
      .then((result) => { if (active) setData(result); })
      .catch((err) => { if (active) setError(err.message || 'This share link is not available.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  if (loading) {
    return <div className="spinner">Loading...</div>;
  }

  if (error || !data) {
    return (
      <main className="external-share-page">
        <section className="external-share-header">
          <div className="case-header-ref">External authority access</div>
          <h1 className="page-title">Share link unavailable</h1>
          <p className="form-section-hint">{error || 'This link has expired, been revoked, or is invalid.'}</p>
        </section>
      </main>
    );
  }

  const sharedCase = data.case || {};
  const share = data.share || {};

  return (
    <main className="external-share-page">
      <section className="external-share-header">
        <div className="case-header-ref">{share.tenant_name || 'Council licensing'}</div>
        <h1 className="page-title">External authority view</h1>
        <p className="form-section-hint">
          This read-only link gives access only to the sections listed below. It expires on {formatDate(share.expires_at)}.
        </p>
      </section>

      <section className="form-section">
        <div className="form-section-title">Access details</div>
        <dl className="case-data-grid">
          <DataRow label="Authority" value={share.authority_name} />
          <DataRow label="Purpose" value={share.purpose} />
          <DataRow label="Created by" value={share.created_by_name} />
          <DataRow label="Created" value={formatDate(share.created_at)} />
          <DataRow label="Expires" value={formatDate(share.expires_at)} />
          <DataRow label="Shared sections" value={(share.allowed_section_summary || []).map((section) => section.label).join(', ')} />
        </dl>
      </section>

      {sharedCase.case_summary && (
        <section className="form-section">
          <div className="form-section-title">Case summary</div>
          <dl className="case-data-grid">
            <DataRow label="Reference" value={sharedCase.case_summary.ref_number ? String(sharedCase.case_summary.ref_number) : null} />
            <DataRow label="Status" value={sharedCase.case_summary.status?.replace(/_/g, ' ')} />
            <DataRow label="Submitted" value={formatDate(sharedCase.case_summary.submitted_at)} />
            <DataRow label="Updated" value={formatDate(sharedCase.case_summary.updated_at)} />
          </dl>
        </section>
      )}

      {sharedCase.premises && (
        <section className="form-section">
          <div className="form-section-title">Premises</div>
          <dl className="case-data-grid">
            <DataRow label="Name" value={sharedCase.premises.premises_name} />
            <DataRow label="Address" value={[sharedCase.premises.address_line_1, sharedCase.premises.address_line_2, sharedCase.premises.town_or_city].filter(Boolean).join(', ')} />
            <DataRow label="Postcode" value={sharedCase.premises.postcode} />
            <DataRow label="Description" value={sharedCase.premises.premises_description} />
          </dl>
        </section>
      )}

      {sharedCase.applicant && (
        <section className="form-section">
          <div className="form-section-title">Applicant</div>
          <dl className="case-data-grid">
            <DataRow label="Name" value={sharedCase.applicant.name} />
            <DataRow label="Email" value={sharedCase.applicant.email} />
          </dl>
        </section>
      )}

      {data.sections?.length > 0 && (
        <section className="form-section">
          <div className="form-section-title">Licence sections</div>
          {data.sections.map((section) => (
            <SectionAnswers key={section.id} section={section} />
          ))}
        </section>
      )}
    </main>
  );
}

