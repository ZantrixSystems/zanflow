export function buildTenantAdminNav(session) {
  const items = [
    { to: '/admin/dashboard', label: 'Dashboard' },
  ];

  if (session && ['officer', 'manager'].includes(session.role)) {
    items.push(
      { type: 'section', label: 'Licensing' },
      { to: '/admin/cases', label: 'All applications' },
    );
  }

  if (session?.role === 'tenant_admin') {
    items.push(
      { type: 'section', label: 'Administration' },
      { to: '/admin/settings/general', label: 'Settings' },
      { href: '/', label: 'Public site' },
    );
  }

  return items;
}

export function buildApplicantNav(session) {
  const items = [
    { to: '/', label: 'Home' },
    { to: '/premises', label: 'Premises' },
  ];

  if (session) {
    items.push(
      { to: '/dashboard', label: 'My applications' },
    );
  } else {
    items.push(
      { to: '/register?next=%2Fpremises', label: 'Create account' },
      { to: '/login?next=%2Fpremises', label: 'Sign in' },
    );
  }

  return items;
}
