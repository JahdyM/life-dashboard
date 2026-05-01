import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { isAllowedEmail } from "@/lib/auth";

// API tokens are stored in the existing `Setting` key/value table to avoid a
// new migration. One row per token, keyed by its SHA-256 hash:
//
//   key:   api_token::<sha256(plaintext)>
//   value: JSON of TokenRecord
//
// Verification is O(1) because the lookup key IS the hash. Listing/revoking
// scan all `api_token::*` rows and filter in memory — fine at our scale.

const KEY_PREFIX = "api_token::";

export type TokenScope = "read" | "write";

export type TokenRecord = {
  id: string;
  userEmail: string;
  name: string;
  prefix: string; // first 12 chars of plaintext, shown in lists ("ld_a3xK9p...")
  scope: TokenScope;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
};

export type CreatedToken = {
  plaintext: string;
  record: TokenRecord;
};

function newId() {
  return randomBytes(8).toString("hex");
}

function sha256Hex(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function generatePlaintext(): string {
  // 32 bytes → 43-char base64url, prefixed with "ld_" → ~46 chars total.
  const raw = randomBytes(32).toString("base64url");
  return `ld_${raw}`;
}

function storageKey(hash: string) {
  return `${KEY_PREFIX}${hash}`;
}

function safeParse(value: string | null | undefined): TokenRecord | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as TokenRecord;
    if (!parsed?.id || !parsed?.userEmail) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function createApiToken(
  userEmail: string,
  name: string,
  scope: TokenScope = "write"
): Promise<CreatedToken> {
  const trimmedName = name.trim().slice(0, 60) || "Untitled token";
  const plaintext = generatePlaintext();
  const hash = sha256Hex(plaintext);
  const record: TokenRecord = {
    id: newId(),
    userEmail: userEmail.toLowerCase(),
    name: trimmedName,
    prefix: plaintext.slice(0, 12),
    scope,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    expiresAt: null,
  };
  await prisma.setting.create({
    data: { key: storageKey(hash), value: JSON.stringify(record) },
  });
  return { plaintext, record };
}

export async function listApiTokens(userEmail: string): Promise<TokenRecord[]> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
  });
  const email = userEmail.toLowerCase();
  return rows
    .map((row) => safeParse(row.value))
    .filter((rec): rec is TokenRecord => Boolean(rec) && rec!.userEmail === email)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function revokeApiToken(userEmail: string, tokenId: string): Promise<boolean> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: KEY_PREFIX } },
  });
  const email = userEmail.toLowerCase();
  for (const row of rows) {
    const rec = safeParse(row.value);
    if (rec && rec.userEmail === email && rec.id === tokenId) {
      await prisma.setting.delete({ where: { key: row.key } });
      return true;
    }
  }
  return false;
}

export type VerifiedToken = {
  userEmail: string;
  scope: TokenScope;
  tokenId: string;
};

export async function verifyApiToken(plaintext: string): Promise<VerifiedToken | null> {
  if (!plaintext || typeof plaintext !== "string") return null;
  if (!plaintext.startsWith("ld_")) return null;
  const hash = sha256Hex(plaintext);
  const row = await prisma.setting.findUnique({ where: { key: storageKey(hash) } });
  const record = safeParse(row?.value);
  if (!record) return null;
  if (!isAllowedEmail(record.userEmail)) return null;
  if (record.expiresAt && record.expiresAt < new Date().toISOString()) return null;

  // Best-effort lastUsedAt update — don't block auth on this
  const nowIso = new Date().toISOString();
  prisma.setting
    .update({
      where: { key: storageKey(hash) },
      data: { value: JSON.stringify({ ...record, lastUsedAt: nowIso }) },
    })
    .catch(() => {
      /* ignore */
    });

  return {
    userEmail: record.userEmail,
    scope: record.scope,
    tokenId: record.id,
  };
}
