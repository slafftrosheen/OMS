// src/routes/api/auth/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { query, transaction } from '$lib/server/db/connection';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

// Rate limiting: track failed attempts per IP
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  
  if (!record) return { allowed: true };
  
  // Reset if lockout period has passed
  if (now - record.lastAttempt > LOCKOUT_TIME) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  
  if (record.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((LOCKOUT_TIME - (now - record.lastAttempt)) / 1000);
    return { allowed: false, retryAfter };
  }
  
  return { allowed: true };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  
  if (!record) {
    loginAttempts.set(ip, { count: 1, lastAttempt: now });
  } else {
    record.count++;
    record.lastAttempt = now;
  }
}

function clearFailedAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// Password verification with bcrypt support
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  // Legacy: accept any password if hash starts with $2b$10$placeholder (for demo users)
  if (hash.startsWith('$2b$10$placeholder')) return true;
  
  // Bcrypt hash verification
  if (hash.startsWith('$2b$') || hash.startsWith('$2a$')) {
    return bcrypt.compare(password, hash);
  }
  
  // Fallback: SHA256 hash comparison (legacy)
  const inputHash = crypto.createHash('sha256').update(password).digest('hex');
  return inputHash === hash;
}

async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * POST /api/auth - Login
 */
export const POST: RequestHandler = async (event) => {
  console.log('POST /api/auth called');
  const { request, cookies, getClientAddress } = event;
  const clientIp = getClientAddress();
  
  // Check rate limit
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return json(
      { error: `Too many failed attempts. Try again in ${rateCheck.retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(rateCheck.retryAfter) } }
    );
  }

  const { username, password } = await request.json();

  if (!username || !password) {
    return json({ error: 'Username and password required' }, { status: 400 });
  }

  try {
    const result = await query(
      'SELECT id, username, display_name, password_hash, primary_section, sections, roles, stations, is_active FROM users WHERE username = $1',
      [username.toLowerCase()]
    );

    if (result.rows.length === 0) {
      recordFailedAttempt(clientIp);
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }
    const user = result.rows[0];

    if (!user.is_active) {
      return json({ error: 'Account is disabled' }, { status: 403 });
    }

    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      recordFailedAttempt(clientIp);
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    clearFailedAttempts(clientIp);

    const token = generateToken();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await transaction(async (client) => {
      await client.query(
        'INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address) VALUES ($1, $2, $3, $4)',
        [user.id, tokenHash, expiresAt.toISOString(), clientIp]
      );
      await client.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [user.id]
      );
      await client.query(
        'INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, ip_address) VALUES ($1, $2, $3, $4, $5, $6)',
        [user.id, user.username, 'LOGIN', 'user', user.id.toString(), clientIp]
      );
    });

    cookies.set('session', token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 // 7 days
    });

    return json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        primarySection: user.primary_section,
        sections: user.sections,
        roles: user.roles,
        stations: user.stations || []
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return json({ error: 'Authentication failed' }, { status: 500 });
  }
};

/**
 * DELETE /api/auth - Logout
 */
export const DELETE: RequestHandler = async (event) => {
  const { cookies } = event;
  const token = cookies.get('session');

  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash]);
    cookies.delete('session', { path: '/' });
  }

  return json({ success: true });
};

/**
 * GET /api/auth - Get current session
 */
export const GET: RequestHandler = async ({ cookies }) => {
  const token = cookies.get('session');

  if (!token) {
    return json({ user: null });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await query(
      `SELECT u.id, u.username, u.display_name, u.primary_section, 
              u.sections, u.roles, u.stations
       FROM users u
       JOIN user_sessions s ON s.user_id = u.id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.is_active = true`,
      [tokenHash]
    );

    if (result.rowCount === 0) {
      cookies.delete('session', { path: '/' });
      return json({ user: null });
    }

    const user = result.rows[0];

    // Update session activity
    await query(
      `UPDATE user_sessions SET last_activity_at = NOW() WHERE token_hash = $1`,
      [tokenHash]
    );

    return json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        primarySection: user.primary_section,
        sections: user.sections,
        roles: user.roles,
        stations: user.stations || []
      }
    });
  } catch (err) {
    console.error('Session check error:', err);
    return json({ user: null });
  }
};
