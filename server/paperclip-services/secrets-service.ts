/**
 * Paperclip Secrets 管理服务
 * 加密存储公司级别的密钥/凭证
 */

import { getDb } from "../db";
import { companySecrets, activityLog } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { ACTOR_TYPES } from "../../shared";
import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.SECRETS_ENCRYPTION_KEY || process.env.SESSION_SECRET || "default-dev-key-change-in-prod!!";
  return crypto.createHash("sha256").update(key).digest();
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

async function logActivity(options: {
  companyId: number;
  actorType: "agent" | "user" | "system";
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try { await db.insert(activityLog).values(options); } catch {}
}

export interface UpsertSecretOptions {
  companyId: number;
  key: string;
  value: string;
  description?: string;
  createdByUserId?: number;
}

export async function upsertSecret(options: UpsertSecretOptions) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const encryptedValue = encrypt(options.value);

  await db.insert(companySecrets).values({
    companyId: options.companyId,
    key: options.key,
    encryptedValue,
    description: options.description ?? null,
  }).onDuplicateKeyUpdate({
    set: { encryptedValue, description: options.description ?? null, updatedAt: new Date() },
  });

  await logActivity({
    companyId: options.companyId,
    actorType: options.createdByUserId ? ACTOR_TYPES.USER : ACTOR_TYPES.SYSTEM,
    actorId: options.createdByUserId?.toString() ?? "system",
    action: "secret.upserted",
    entityType: "secret",
    entityId: options.key,
    details: { key: options.key },
  });
}

export async function getSecret(companyId: number, key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select()
    .from(companySecrets)
    .where(and(eq(companySecrets.companyId, companyId), eq(companySecrets.key, key)))
    .limit(1);

  if (!rows[0]) return null;
  return decrypt(rows[0].encryptedValue);
}

export async function listSecrets(companyId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db.select({
    id: companySecrets.id,
    companyId: companySecrets.companyId,
    key: companySecrets.key,
    description: companySecrets.description,
    createdAt: companySecrets.createdAt,
    updatedAt: companySecrets.updatedAt,
  })
    .from(companySecrets)
    .where(eq(companySecrets.companyId, companyId))
    .orderBy(desc(companySecrets.createdAt));

  // 不返回加密值，只返回元数据
  return rows;
}

export async function deleteSecret(companyId: number, key: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(companySecrets)
    .where(and(eq(companySecrets.companyId, companyId), eq(companySecrets.key, key)));
}

export const secretsService = {
  upsertSecret,
  getSecret,
  listSecrets,
  deleteSecret,
};
