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
      { type: 'section', label: 'Organisation' },
      { to: '/admin/settings/general',     label: 'General' },
      { to: '/admin/settings/public-site', label: 'Public site' },
      { to: '/admin/settings/sso',         label: 'Single sign-on' },

      { type: 'section', label: 'Team' },
      { to: '/admin/users',                label: 'Users' },
      { to: '/admin/settings/roles',       label: 'Roles & permissions' },

      { type: 'section', label: 'Licensing' },
      { to: '/admin/licence-sections',     label: 'Licence sections' },

      { type: 'section', label: 'Platform' },
      { to: '/admin/audit',                label: 'Audit log' },
      { href: '/',                         label: 'Public site ↗' },
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
