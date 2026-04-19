import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { buildTenantAdminNav } from '../lib/navigation.js';
import NotificationBell from './NotificationBell.jsx';
import AdminProfileModal from './AdminProfileModal.jsx';
import { api } from '../api.js';

export default function AdminLayout({ children, session, onSignOut, onSessionRefresh, breadcrumbs = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [savedFilters, setSavedFilters] = useState([]);
  const [savingFilter, setSavingFilter] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newFilterName, setNewFilterName] = useState('');

  const isOnCasesPage = location.pathname === '/admin/cases';
  const hasQueueParams = isOnCasesPage && location.search.length > 0;

  const navItems = buildTenantAdminNav(session);
  const isStaff = session && ['officer', 'manager', 'tenant_admin'].includes(session.role);

  const loadSavedFilters = useCallback(() => {
    if (!isStaff) return;
    api.listAdminSavedFilters()
      .then((d) => setSavedFilters(d.filters ?? []))
      .catch(() => {});
  }, [isStaff]);

  useEffect(() => {
    loadSavedFilters();
  }, [loadSavedFilters]);

  async function handleLogout() {
    await onSignOut();
    navigate('/admin');
  }

  async function handleSaveFilter(e) {
    e.preventDefault();
    if (!newFilterName.trim()) return;
    setSavingFilter(true);
    try {
      const filterJson = {};
      const params = new URLSearchParams(location.search);
      for (const [k, v] of params.entries()) filterJson[k] = v;
      await api.createAdminSavedFilter({ name: newFilterName.trim(), filter_json: filterJson });
      setNewFilterName('');
      setShowSaveInput(false);
      loadSavedFilters();
    } catch {
      // silent
    } finally {
      setSavingFilter(false);
    }
  }

  async function handleDeleteFilter(id, e) {
    e.preventDefault();
    e.stopPropagation();
    await api.deleteAdminSavedFilter(id).catch(() => {});
    setSavedFilters((prev) => prev.filter((f) => f.id !== id));
  }

  function buildSavedFilterHref(filterJson) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filterJson)) {
      if (v) params.set(k, String(v));
    }
    const qs = params.toString();
    return `/admin/cases${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <Link to="/admin/dashboard" className="admin-brand-link">ZanFlo</Link>
        </div>

        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => {
            if (item.type === 'section') {
              return (
                <div key={`section-${item.label}`} className="admin-nav-section-label">{item.label}</div>
              );
            }
            if (item.href) {
              return (
                <a key={item.label} href={item.href} className="admin-nav-item">
                  {item.label}
                </a>
              );
            }
            const currentHref = location.pathname + location.search;
            const isActive = item.to.includes('?')
              ? currentHref === item.to
              : location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`admin-nav-item${isActive ? ' active' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}

          {/* Saved filters — rendered inline after the work queue items */}
          {isStaff && (
            <>
              {savedFilters.map((f) => {
                const href = buildSavedFilterHref(f.filter_json);
                const currentHref = location.pathname + location.search;
                const isActive = currentHref === href;
                return (
                  <span key={f.id} className={`admin-nav-item admin-nav-saved-filter${isActive ? ' active' : ''}`}>
                    <Link to={href} className="admin-nav-saved-filter-name">
                      {f.name}
                    </Link>
                    <button
                      type="button"
                      className="admin-nav-saved-filter-remove"
                      onClick={(e) => handleDeleteFilter(f.id, e)}
                      aria-label={`Remove saved filter "${f.name}"`}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                );
              })}

              {/* Save current view — only shown when on cases page with active filters */}
              {isOnCasesPage && (
                showSaveInput ? (
                  <form onSubmit={handleSaveFilter} className="admin-nav-save-filter-form">
                    <input
                      value={newFilterName}
                      onChange={(e) => setNewFilterName(e.target.value)}
                      placeholder="Name…"
                      className="admin-nav-save-filter-input"
                      maxLength={80}
                      autoFocus
                    />
                    <button type="submit" className="admin-nav-save-filter-btn" disabled={savingFilter}>
                      {savingFilter ? '…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="admin-nav-save-filter-cancel"
                      onClick={() => { setShowSaveInput(false); setNewFilterName(''); }}
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className={`admin-nav-item admin-nav-save-trigger${hasQueueParams ? '' : ' admin-nav-save-trigger-dim'}`}
                    onClick={() => setShowSaveInput(true)}
                  >
                    + Save view
                  </button>
                )
              )}
            </>
          )}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-bell">
            <NotificationBell />
          </div>
          <button
            type="button"
            className="admin-sidebar-user-btn"
            onClick={() => setProfileOpen(true)}
            title="View profile"
          >
            <span className="admin-sidebar-user-avatar">{session?.full_name?.charAt(0) ?? '?'}</span>
            <span className="admin-sidebar-user-name">{session?.full_name}</span>
          </button>
          <button type="button" onClick={handleLogout} className="admin-sidebar-signout">
            Sign out
          </button>
        </div>
      </aside>

      <div className="admin-body">
        {breadcrumbs.length > 0 && (
          <nav className="admin-breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={`${crumb.label}-${index}`} className="layout-breadcrumb-item">
                  {!isLast && crumb.to ? (
                    <Link to={crumb.to}>{crumb.label}</Link>
                  ) : (
                    <span>{crumb.label}</span>
                  )}
                  {!isLast && <span className="layout-breadcrumb-separator">/</span>}
                </span>
              );
            })}
          </nav>
        )}
        <main className="admin-main">
          {children}
        </main>
      </div>

      {profileOpen && (
        <AdminProfileModal
          onClose={() => setProfileOpen(false)}
          onSessionRefresh={onSessionRefresh ?? (() => Promise.resolve())}
        />
      )}
    </div>
  );
}
