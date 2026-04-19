/**
 * Creates notification rows for staff members.
 * Fan-out on write: one row per recipient for individual read tracking.
 */

export async function notifyTenantStaff(sql, { tenantId, excludeUserId, type, title, body, link }) {
  const staff = await sql`
    SELECT user_id
    FROM memberships
    WHERE tenant_id = ${tenantId}
      AND role IN ('officer', 'manager', 'tenant_admin')
  `;

  const recipients = excludeUserId
    ? staff.filter((m) => m.user_id !== excludeUserId)
    : staff;

  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map((m) => sql`
      INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
      VALUES (${tenantId}, ${m.user_id}, ${type}, ${title}, ${body ?? null}, ${link ?? null})
    `),
  );
}

export async function notifyUser(sql, { tenantId, userId, type, title, body, link }) {
  await sql`
    INSERT INTO notifications (tenant_id, user_id, type, title, body, link)
    VALUES (${tenantId}, ${userId}, ${type}, ${title}, ${body ?? null}, ${link ?? null})
  `;
}
