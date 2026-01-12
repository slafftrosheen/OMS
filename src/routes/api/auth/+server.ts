// src/routes/api/auth/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseClient } from '$lib/server/supabase'; // Using the supabase client factory
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
  const supabase = createSupabaseClient(event);
  
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
    // Find user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username, display_name, password_hash, primary_section, sections, roles, stations, is_active')
      .eq('username', username.toLowerCase())
      .single();

    if (userError || !user) {
      recordFailedAttempt(clientIp);
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!user.is_active) {
      return json({ error: 'Account is disabled' }, { status: 403 });
    }

    // Verify password (now async with bcrypt)
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      recordFailedAttempt(clientIp);
      return json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(clientIp);

    // Create session
    const token = generateToken();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Using sequential calls instead of a transaction for simplicity.
    // For production, this should be a single database function (RPC).

    // 1. Create session
    const { error: sessionError } = await supabase.from('user_sessions').insert({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      ip_address: clientIp,
    });
    if (sessionError) throw sessionError;

    // 2. Update last login
    const { error: updateError } = await supabase
      .from('users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', user.id);
    if (updateError) throw updateError;

    // 3. Log audit event
    const { error: auditError } = await supabase.from('audit_log').insert({
      user_id: user.id,
      username: user.username,
      action: 'LOGIN',
      entity_type: 'user',
      entity_id: user.id.toString(),
      ip_address: clientIp
    });
    if (auditError) throw auditError;

    // Set session cookie
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
  const supabase = createSupabaseClient(event);
  const token = cookies.get('session');

  if (token) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await supabase.from('user_sessions').delete().eq('token_hash', tokenHash);
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
