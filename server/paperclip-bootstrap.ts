import { sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Database = MySql2Database<Record<string, unknown>>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_FILES = [
  path.resolve(__dirname, "../drizzle/migrations/0009_paperclip_agent_orchestration.sql"),
  path.resolve(__dirname, "../drizzle/migrations/0010_paperclip_extensions.sql"),
  path.resolve(__dirname, "../drizzle/migrations/0012_add_advanced_features.sql"),
];

let schemaReady = false;
let bootstrapPromise: Promise<void> | null = null;

async function tableExists(db: Database, tableName: string) {
  const raw = (await db.execute(
    sql.raw(`SHOW TABLES LIKE '${tableName.replace(/'/g, "''")}'`)
  )) as unknown as [Array<Record<string, unknown>>, unknown];
  return Array.isArray(raw[0]) && raw[0].length > 0;
}

function splitStatements(sqlText: string): string[] {
  const sanitized = sqlText
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("--")) {
        return "";
      }
      return line;
    })
    .join("\n");

  return sanitized
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter(Boolean);
}

async function runMigration(db: Database, file: string) {
  const script = await readFile(file, "utf-8");
  const statements = splitStatements(script);
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}

export async function ensurePaperclipSchema(db: Database) {
  if (schemaReady) {
    return;
  }

  if (bootstrapPromise) {
    await bootstrapPromise;
    return;
  }

  bootstrapPromise = (async () => {
    const coreTables = ["pc_companies", "pc_agents", "pc_heartbeat_runs"];
    let needsCoreMigration = false;
    for (const table of coreTables) {
      const exists = await tableExists(db, table);
      if (!exists) {
        needsCoreMigration = true;
        break;
      }
    }
    if (needsCoreMigration) {
      await runMigration(db, MIGRATION_FILES[0]);
    }

    // 检查扩展表是否存在
    const hasExtensions = await tableExists(db, "pc_heartbeat_run_events");
    if (!hasExtensions) {
      await runMigration(db, MIGRATION_FILES[1]);
    }

    const hasSkills = await tableExists(db, "pc_skills");
    if (!hasSkills) {
      await runMigration(db, MIGRATION_FILES[2]);
    }

    schemaReady = true;
  })().finally(() => {
    bootstrapPromise = null;
  });

  await bootstrapPromise;
}
