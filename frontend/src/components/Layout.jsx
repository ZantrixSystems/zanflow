import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth-context.jsx';

export default function Layout({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="layout">
      <header className="layout-header">
        <Link to="/dashboard" className="layout-header-brand">
          Zanflow
        </Link>
        {session && (
          <nav className="layout-header-nav">
            <span style={{ fontSize: '.875rem', color: 'var(--color-text)' }}>
              {session.full_name}
            </span>
            <button onClick={handleLogout}>Sign out</button>
          </nav>
        )}
      </header>
      <main className="layout-main">
        {children}
      </main>
    </div>
  );
}
