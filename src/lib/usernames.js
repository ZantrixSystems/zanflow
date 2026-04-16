export const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,30}[a-zA-Z0-9])?$/;

export function validateUsername(username) {
  if (!username) return 'username is required';
  if (!USERNAME_RE.test(username)) {
    return 'username must be 3-32 characters using letters, numbers, dots, underscores, or hyphens';
  }
  return null;
}
