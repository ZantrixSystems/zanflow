import { useEffect, useState } from 'react';
import AdminLayout from '../components/AdminLayout.jsx';
import { useStaffAuth } from '../components/RequireStaffAuth.jsx';
import { api } from '../api.js';

const FIELD_TYPES = [
  { value: 'text',     label: 'Short text' },
  { value: 'textarea', label: 'Long text' },
  { value: 'boolean',  label: 'Yes / No' },
];

function emptyField() {
  return { key: '', label: '', type: 'text', required: false };
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function FieldRow({ field, index, onChange, onRemove }) {
  return (
    <div className="section-field-row">
      <input type="text" className="form-input" placeholder="Field key (e.g. opening_until)" value={field.key} onChange={(e) => onChange(index, { ...field, key: slugify(e.target.value) })} />
      <input type="text" className="form-input" placeholder="Label shown to applicant" value={field.label} onChange={(e) => onChange(index, { ...field, label: e.target.value })} />
      <select className="form-select" value={field.type} onChange={(e) => onChange(index, { ...field, type: e.target.value })}>
        {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <label className="section-field-required">
        <input type="checkbox" checked={field.required} onChange={(e) => onChange(index, { ...field, required: e.target.checked })} />
        Required
      </label>
      <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(index)}>Remove</button>
    </div>
  );
}

function SectionForm({ initial, onSave, onCancel }) {
  const [name, setName]               = useState(initial?.name ?? '');
  const [slug, setSlug]               = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [fields, setFields]           = useState(Array.isArray(initial?.fields) ? initial.fields : []);
  const [slugManual, setSlugManual]   = useState(!!initial?.slug);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  function handleNameChange(val) {
    setName(val);
    if (!slugManual) setSlug(slugify(val));
  }

  function updateField(i, updated) { setFields((prev) => prev.map((f, idx) => idx === i ? updated : f)); }
  function removeField(i)          { setFields((prev) => prev.filter((_, idx) => idx !== i)); }
  function addField()              { setFields((prev) => [...prev, emptyField()]); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required'); return; }
    if (!slug.trim()) { setError('Slug is required'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), slug: slug.trim(), description: description.trim(), fields });
    } catch (err) {
      setError(err.message || 'Could not save section.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="section-form">
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label className="form-label">Name</label>
        <input type="text" className="form-input" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g. Entertainment" required autoFocus />
      </div>
      <div className="form-group">
        <label className="form-label">Slug (internal key)</label>
        <input type="text" className="form-input" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }} placeholder="e.g. entertainment" pattern="[a-z0-9_]+" required />
        <span className="form-hint">Lowercase letters, numbers and underscores. Cannot be changed after creation.</span>
      </div>
      <div className="form-group">
        <label className="form-label">Description (optional)</label>
        <textarea className="form-textarea" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description shown to applicants" />
      </div>
      <div className="form-group">
        <label className="form-label">Fields</label>
        <span className="form-hint">Questions applicants will answer for this section.</span>
        {fields.length > 0 && (
          <div className="section-fields-list">
            <div className="section-field-row section-field-header">
              <span>Key</span><span>Label</span><span>Type</span><span /><span />
            </div>
            {fields.map((f, i) => <FieldRow key={i} field={f} index={i} onChange={updateField} onRemove={removeField} />)}
          </div>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={addField} style={{ marginTop: 8 }}>+ Add field</button>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : initial ? 'Save changes' : 'Create section'}</button>
      </div>
    </form>
  );
}

export default function AdminLicenceSectionsPage() {
  const { session, logout, refresh } = useStaffAuth();
  const [sections, setSections]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [notice, setNotice]       = useState('');
  const [creating, setCreating]   = useState(false);
  const [editingId, setEditingId] = useState(null);

  async function loadSections() {
    const data = await api.listLicenceSections();
    setSections(data.sections ?? []);
  }

  useEffect(() => {
    loadSections()
      .catch(() => setError('Could not load sections.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(body) {
    await api.createLicenceSection(body);
    setCreating(false);
    setNotice('Section created.');
    await loadSections();
  }

  async function handleUpdate(id, body) {
    await api.updateLicenceSection(id, body);
    setEditingId(null);
    setNotice('Section updated.');
    await loadSections();
  }

  async function handleToggle(section) {
    try {
      await api.updateLicenceSection(section.id, { is_enabled: !section.is_enabled });
      setNotice(section.is_enabled ? 'Section disabled.' : 'Section enabled.');
      await loadSections();
    } catch (err) {
      setError(err.message || 'Could not toggle section.');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this section? This cannot be undone if it has been used on a case.')) return;
    try {
      await api.deleteLicenceSection(id);
      setNotice('Section deleted.');
      await loadSections();
    } catch (err) {
      setError(err.message || 'Could not delete section.');
    }
  }

  return (
    <AdminLayout session={session} onSignOut={logout} onSessionRefresh={refresh} breadcrumbs={[{ label: 'Licence sections' }]}>
      {error  && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <div className="settings-section-actions">
        {!creating && (
          <button type="button" className="btn btn-primary" onClick={() => { setCreating(true); setEditingId(null); setNotice(''); setError(''); }}>
            + New section
          </button>
        )}
      </div>

      {creating && (
        <div className="settings-card" style={{ marginBottom: 20 }}>
          <div className="settings-card-title">New section</div>
          <SectionForm onSave={handleCreate} onCancel={() => setCreating(false)} />
        </div>
      )}

      {loading ? (
        <div className="spinner">Loading…</div>
      ) : sections.length === 0 && !creating ? (
        <div className="settings-empty-state">
          <div className="settings-empty-title">No sections defined yet</div>
          <p className="settings-empty-body">Create your first licence section above.</p>
        </div>
      ) : (
        <div className="sections-list">
          {sections.map((sec) => (
            <div key={sec.id} className={`settings-card${sec.is_enabled ? '' : ' settings-card-muted'}`}>
              {editingId === sec.id ? (
                <>
                  <div className="settings-card-title">Edit: {sec.name}</div>
                  <SectionForm initial={sec} onSave={(body) => handleUpdate(sec.id, body)} onCancel={() => setEditingId(null)} />
                </>
              ) : (
                <div className="section-card-header">
                  <div>
                    <div className="section-card-name">
                      {sec.name}
                      {!sec.is_enabled && <span className="section-disabled-badge">Disabled</span>}
                    </div>
                    <div className="section-card-slug">{sec.slug}</div>
                    {sec.description && <p className="section-card-desc">{sec.description}</p>}
                    {Array.isArray(sec.fields) && sec.fields.length > 0 && (
                      <div className="section-card-fields">
                        <div className="section-card-fields-label">{sec.fields.length} field{sec.fields.length === 1 ? '' : 's'}</div>
                        <ul className="section-card-field-list">
                          {sec.fields.map((f) => (
                            <li key={f.key} className="section-card-field-item">
                              <span className="field-label">{f.label}</span>
                              <span className="field-type">{f.type}</span>
                              {f.required && <span className="field-required">required</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div className="section-card-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingId(sec.id); setCreating(false); setNotice(''); setError(''); }}>Edit</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleToggle(sec)}>{sec.is_enabled ? 'Disable' : 'Enable'}</button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(sec.id)}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}
