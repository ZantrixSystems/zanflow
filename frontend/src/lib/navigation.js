export function buildTenantAdminNav(session) {
  const items = [
    { to: '/admin/dashboard', label: 'Dashboard' },
  ];

  if (session && ['officer', 'manager', 'tenant_admin'].includes(session.role)) {
    items.push(
      { to: '/admin/applications', label: 'Applications' },
      { to: '/admin/premises-verifications', label: 'Premises verifications' },
    );
  }

  if (session?.role === 'tenant_admin') {
    items.push(
      { to: '/admin/application-types', label: 'Application types' },
      { to: '/admin/application-setup', label: 'Application setup' },
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/settings', label: 'Settings' },
      { to: '/admin/audit', label: 'Audit' },
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
