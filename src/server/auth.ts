import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';

// Ensure data folder exists for persistent secret and refresh tokens
const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

// Persistent JWT Secret: Loaded from env or generated once and persisted to disk
function getOrGenerateJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }

  const secretPath = path.join(DATA_DIR, 'jwt-secret.key');
  try {
    if (fs.existsSync(secretPath)) {
      const saved = fs.readFileSync(secretPath, 'utf-8').trim();
      if (saved.length >= 32) {
        return saved;
      }
    }
  } catch {
    // fallback to generate
  }

  const newSecret = crypto.randomBytes(48).toString('hex');
  try {
    fs.writeFileSync(secretPath, newSecret, { mode: 0o600 });
  } catch {
    // ignore
  }
  return newSecret;
}

const JWT_SECRET = getOrGenerateJwtSecret();

// Valid Access Token lifetime: 15 minutes (900 seconds)
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
// Valid Refresh Token lifetime: 7 days
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

// Persistent Store for active Refresh Tokens (to allow secure logout & rotation)
const REFRESH_TOKENS_FILE = path.join(DATA_DIR, 'active_refresh_tokens.json');
let activeRefreshTokens: Set<string> = new Set();

try {
  if (fs.existsSync(REFRESH_TOKENS_FILE)) {
    const raw = fs.readFileSync(REFRESH_TOKENS_FILE, 'utf-8');
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      activeRefreshTokens = new Set(list);
    }
  }
} catch {
  activeRefreshTokens = new Set();
}

function persistRefreshTokens() {
  try {
    fs.writeFileSync(REFRESH_TOKENS_FILE, JSON.stringify(Array.from(activeRefreshTokens)), 'utf-8');
  } catch {
    // ignore
  }
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export interface JwtPayload {
  sub: string;
  username: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  jti?: string;
  [key: string]: any;
}

export interface TokenInputPayload {
  sub: string;
  username: string;
  type: 'access' | 'refresh';
  [key: string]: any;
}

export function createJwtToken(payload: TokenInputPayload, expiresInSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = {
    ...payload,
    sub: payload.sub,
    username: payload.username,
    type: payload.type,
    iat: now,
    exp: now + expiresInSeconds,
    jti: crypto.randomBytes(16).toString('hex'),
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyJwtToken(token: string): {
  valid: boolean;
  expired: boolean;
  payload?: JwtPayload;
  error?: string;
} {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { valid: false, expired: false, error: 'Formát tokenu je neplatný' };
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const expectedBuffer = Buffer.from(expectedSignature);
    const actualBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== actualBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    ) {
      return { valid: false, expired: false, error: 'Podpis tokenu je neplatný' };
    }

    const payload: JwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return { valid: false, expired: true, payload, error: 'Platnost JWT tokenu vypršela' };
    }

    return { valid: true, expired: false, payload };
  } catch (err: any) {
    return { valid: false, expired: false, error: err?.message || 'Chyba ověření tokenu' };
  }
}

/**
 * Creates a pair of Access Token (15 min) and Refresh Token (7 days)
 */
export function generateTokenPair(username: string): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} {
  const accessToken = createJwtToken(
    { sub: username, username, type: 'access' },
    ACCESS_TOKEN_TTL_SECONDS
  );

  const refreshToken = createJwtToken(
    { sub: username, username, type: 'refresh' },
    REFRESH_TOKEN_TTL_SECONDS
  );

  activeRefreshTokens.add(refreshToken);
  persistRefreshTokens();

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
}

/**
 * Validates and rotates a Refresh Token, returning a brand new token pair
 */
export function refreshAccessToken(oldRefreshToken: string): {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
} {
  if (!oldRefreshToken) {
    return { success: false, error: 'Chybí refresh token' };
  }

  // Check if token was revoked or not in store
  if (!activeRefreshTokens.has(oldRefreshToken)) {
    return { success: false, error: 'Refresh token je neplatný nebo byl odvolán' };
  }

  const result = verifyJwtToken(oldRefreshToken);
  if (!result.valid || !result.payload || result.payload.type !== 'refresh') {
    activeRefreshTokens.delete(oldRefreshToken);
    persistRefreshTokens();
    return {
      success: false,
      error: result.expired ? 'Platnost refresh tokenu vypršela' : (result.error || 'Neplatný token'),
    };
  }

  // Token rotation: Revoke old refresh token and issue a fresh pair
  activeRefreshTokens.delete(oldRefreshToken);

  const newPair = generateTokenPair(result.payload.username);
  return {
    success: true,
    ...newPair,
  };
}

/**
 * Revokes an active Refresh Token upon logout
 */
export function revokeRefreshToken(refreshToken: string): void {
  if (refreshToken) {
    activeRefreshTokens.delete(refreshToken);
    persistRefreshTokens();
  }
}

/**
 * Express Middleware: Protects endpoints behind JWT Bearer token.
 * Rejects unauthorized traffic immediately with HTTP 401.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Přístup zamítnut: API vyžaduje platný autorizační JWT token (Authorization: Bearer <token>).',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Přístup zamítnut: Token je prázdný.',
      code: 'UNAUTHORIZED',
    });
    return;
  }

  const verifyResult = verifyJwtToken(token);

  if (verifyResult.expired) {
    res.status(401).json({
      success: false,
      error: 'Platnost JWT přístupového tokenu vypršela. Použijte refresh token pro obnovení.',
      code: 'TOKEN_EXPIRED',
    });
    return;
  }

  if (!verifyResult.valid || !verifyResult.payload || verifyResult.payload.type !== 'access') {
    res.status(401).json({
      success: false,
      error: 'Neplatný nebo nepodporovaný autorizační token.',
      code: 'INVALID_TOKEN',
    });
    return;
  }

  // Attach verified user payload to request
  (req as any).user = verifyResult.payload;
  next();
}
