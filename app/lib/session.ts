import { cookies } from 'next/headers';
import crypto from 'node:crypto';

const COOKIE_NAME = 'dheli_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 365;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set to a 32+ character string');
  }
  return s;
}

export function hashToken(raw: string): string {
  return crypto.createHmac('sha256', secret()).update(raw).digest('hex');
}

/**
 * Reads the session cookie (creating a new one if absent) and returns the HMAC
 * hash used as `session_token` in ratings/flags. Mutates response cookies.
 */
export function getOrCreateSessionHash(): string {
  const store = cookies();
  let raw = store.get(COOKIE_NAME)?.value;
  if (!raw) {
    raw = crypto.randomBytes(32).toString('hex');
    store.set(COOKIE_NAME, raw, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: MAX_AGE_SEC,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return hashToken(raw);
}
