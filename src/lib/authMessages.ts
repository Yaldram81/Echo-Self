/** Map raw Supabase auth errors to sentences a non-developer can act on. */
export function authErrorMessage(err: { message?: string } | null | undefined): string {
  const raw = (err?.message ?? '').toLowerCase();
  if (raw.includes('invalid login credentials')) {
    return 'That email and password combination does not match an account. Check for typos or create a new account.';
  }
  if (raw.includes('already registered') || raw.includes('already exists')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (raw.includes('password should be at least')) {
    return 'Passwords need at least 6 characters. Pick a slightly longer one.';
  }
  if (raw.includes('email not confirmed')) {
    return 'This account needs email confirmation before it can sign in. Check your inbox for the confirmation link.';
  }
  if (raw.includes('rate limit') || raw.includes('too many requests')) {
    return 'Too many attempts in a short time. Wait a minute and try again.';
  }
  if (raw.includes('valid email') || raw.includes('invalid email') || raw.includes('unable to validate email')) {
    return 'That does not look like a valid email address. Check the format.';
  }
  if (raw.includes('failed to fetch') || raw.includes('network')) {
    return 'Could not reach the account service. Check your connection and try again.';
  }
  return err?.message || 'Something went wrong with the account. Please try again.';
}
