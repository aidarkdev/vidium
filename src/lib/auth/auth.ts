/**
 * auth.ts — password hashing with scrypt and invite code verification.
 */

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../db.ts';
import { config } from '../../config.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  login: string;
}

// ── Statements ────────────────────────────────────────────────────────────────

const stmtInsert = db.prepare(`
  INSERT INTO users (login, password_hash) VALUES (?, ?)
`);

const stmtGetByLogin = db.prepare(`
  SELECT id, login, password_hash FROM users WHERE login = ?
`);

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(`${salt.toString('hex')}:${key.toString('hex')}`);
    });
  });
}

function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltHex, keyHex] = hash.split(':');
  const salt = Buffer.from(saltHex, 'hex') as unknown as Buffer;
  const expected = Buffer.from(keyHex, 'hex') as unknown as Buffer;

  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(timingSafeEqual(expected, key));
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function checkInviteCode(code: string): boolean {
  const a = Buffer.from(code) as unknown as Buffer;
  const b = Buffer.from(config.INVITE_CODE) as unknown as Buffer;
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function register(login: string, password: string): Promise<User> {
  const hash = await hashPassword(password);
  const result = stmtInsert.run(login, hash);
  return { id: result.lastInsertRowid as number, login };
}

export async function authenticate(login: string, password: string): Promise<User | undefined> {
  const row = stmtGetByLogin.get(login) as
    | { id: number; login: string; password_hash: string }
    | undefined;

  if (!row) return undefined;

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return undefined;

  return { id: row.id, login: row.login };
}
