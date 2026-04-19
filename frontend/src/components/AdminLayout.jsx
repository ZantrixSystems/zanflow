import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { buildTenantAdminNav } from '../lib/navigation.js';
import NotificationBell from './NotificationBell.jsx';
import AdminProfileModal from './AdminProfileModal.jsx';

export default function AdminLayout({ children, session, onSignOut, onSessionRefresh, breadcrumbs = [] }) {
  const navigate = useNavigate();
  const navItems = buildTenantAdminNav(session);
  const [profileOpen, setProfileOpen] = useState(false);

  async function handleLogout() {
    await onSignOut();
    navigate('/admin');
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <div className="admin-sidebar-brand">
          <Link to="/admin/dashboard" className="admin-brand-link">ZanFlo</Link>
        </div>
        <nav className="admin-nav" aria-label="Admin navigation">
          {navItems.map((item) => {
            if (item.href) {
              return (
                <a key={item.label} href={item.href} className="admin-nav-item">
                  {item.label}
                </a>
              );
            }
            return (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) => `admin-nav-item${isActive ? ' active' : ''}`}
              >
                {item.label}
              </NavLink>
            );
          })}
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
