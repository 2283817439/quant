import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";
import mysql from "mysql2/promise";

type SecurityRecord = {
  type: "security";
  symbol: string;
  exchange: "SSE" | "SZSE" | "BSE" | "HKEX" | "US" | "OTHER";
  market: string;
  assetType: "stock" | "index" | "etf" | "fund" | "bond" | "convertible" | "other";
  name: string | null;
  currency: string;
  listStatus: "listed" | "delisted" | "suspended" | "other";
  metadata: Record<string, unknown> | null;
};

type BarRecord = {
  type: "bar";
  symbol: string;
  tradeDate: string;
  adjustmentType: "none" | "front_ratio" | "back_ratio";
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  turnoverRate: number | null;
  amplitude: number | null;
  changePercent: number | null;
  dataSource: string;
};

type ExportRecord = SecurityRecord | BarRecord;

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "3306";
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !name || !user) {
    throw new Error("Missing DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD");
  }

  const auth = password
    ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
    : encodeURIComponent(user);
  return `mysql://${auth}@${host}:${port}/${name}`;
}

function parseArgs(argv: string[]) {
  const result: Record<string, string[]> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    result[key.slice(2)] = [...(result[key.slice(2)] ?? []), value];
  }
  return result;
}

function requireSingleArg(args: Record<string, string[]>, name: string): string {
  const value = args[name]?.[0];
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

async function upsertSecurity(
  conn: mysql.Connection,
  record: SecurityRecord,
  cache: Map<string, number>
): Promise<number> {
  const existing = cache.get(record.symbol);
  if (existing) return existing;

  const [result] = await conn.execute<mysql.ResultSetHeader>(
    `
      INSERT INTO securities
        (symbol, exchange, market, assetType, name, currency, listStatus, metadata)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        id = LAST_INSERT_ID(id),
        exchange = VALUES(exchange),
        market = VALUES(market),
        assetType = VALUES(assetType),
        name = VALUES(name),
        currency = VALUES(currency),
        listStatus = VALUES(listStatus),
        metadata = VALUES(metadata)
    `,
    [
      record.symbol,
      record.exchange,
      record.market,
      record.assetType,
      record.name,
      record.currency,
      record.listStatus,
      record.metadata ? JSON.stringify(record.metadata) : null,
    ]
  );

  const id = result.insertId;
  cache.set(record.symbol, id);
  return id;
}

async function flushBars(
  conn: mysql.Connection,
  batch: Array<BarRecord & { securityId: number }>
): Promise<void> {
  if (batch.length === 0) return;

  const placeholders = batch
    .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .join(", ");
  const params = batch.flatMap((row) => [
    row.securityId,
    row.tradeDate,
    row.adjustmentType,
    row.open,
    row.high,
    row.low,
    row.close,
    row.volume,
    row.amount,
    row.turnoverRate,
    row.amplitude,
    row.changePercent,
    row.dataSource,
  ]);

  await conn.query(
    `
      INSERT INTO stock_daily_bars
        (securityId, tradeDate, adjustmentType, open, high, low, close, volume, amount, turnoverRate, amplitude, changePercent, dataSource)
      VALUES ${placeholders}
      ON DUPLICATE KEY UPDATE
        open = VALUES(open),
        high = VALUES(high),
        low = VALUES(low),
        close = VALUES(close),
        volume = VALUES(volume),
        amount = VALUES(amount),
        turnoverRate = VALUES(turnoverRate),
        amplitude = VALUES(amplitude),
        changePercent = VALUES(changePercent),
        dataSource = VALUES(dataSource)
    `,
    params
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const start = requireSingleArg(args, "start");
  const end = requireSingleArg(args, "end");
  const symbols = args.symbols?.[0];
  const indexes = args.index ?? [];
  const adjustment = args.adjustment?.[0] ?? "front_ratio";
  const pythonExe = process.env.HISTORY_IMPORT_PYTHON ?? "E:/conda/envs/lianghua/python.exe";
  const exporterPath = path.resolve(process.cwd(), "../tools/export_xt_history.py");
  const dbUrl = resolveDatabaseUrl();

  const pyArgs = [exporterPath, "--start", start, "--end", end, "--adjustment", adjustment];
  if (symbols) pyArgs.push("--symbols", symbols);
  for (const index of indexes) pyArgs.push("--index", index);

  const conn = await mysql.createConnection(dbUrl);
  const securityCache = new Map<string, number>();
  const barsBatch: Array<BarRecord & { securityId: number }> = [];
  let barCount = 0;
  let securityCount = 0;

  const py = spawn(pythonExe, pyArgs, {
    cwd: path.resolve(process.cwd(), ".."),
    stdio: ["ignore", "pipe", "pipe"],
  });

  py.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  const rl = readline.createInterface({ input: py.stdout });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const record = JSON.parse(trimmed) as ExportRecord;
    if (record.type === "security") {
      await upsertSecurity(conn, record, securityCache);
      securityCount += 1;
      continue;
    }

    const securityId = securityCache.get(record.symbol);
    if (!securityId) {
      throw new Error(`Security ${record.symbol} missing before bar import`);
    }
    barsBatch.push({ ...record, securityId });
    if (barsBatch.length >= 500) {
      await flushBars(conn, barsBatch);
      barCount += barsBatch.length;
      barsBatch.length = 0;
    }
  }

  await new Promise<void>((resolve, reject) => {
    py.on("error", reject);
    py.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`history export failed with exit code ${code}`));
    });
  });

  await flushBars(conn, barsBatch);
  barCount += barsBatch.length;
  await conn.end();

  console.log(
    JSON.stringify(
      {
        ok: true,
        securities: securityCount,
        bars: barCount,
        start,
        end,
        adjustment,
        indexes,
        symbols: symbols ?? null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
