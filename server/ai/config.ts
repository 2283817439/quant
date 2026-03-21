import { ENV } from "../_core/env";

const rawEnv = process.env;

export const OPENCLAW_MODEL =
  rawEnv.OPENCLAW_MODEL ?? ENV.OPENCLAW_MODEL ?? "deepseek-coder";

export const OPENCLAW_ENDPOINT =
  rawEnv.OPENCLAW_ENDPOINT ?? ENV.OPENCLAW_ENDPOINT ?? "http://127.0.0.1:11434";

export const QMT_API_BASE_URL =
  rawEnv.QMT_API_BASE_URL ?? ENV.QMT_API_BASE_URL ?? "http://127.0.0.1:8080/qmt";

export const AI_BROWSER_WHITELIST = (
  rawEnv.AI_BROWSER_WHITELIST ?? ENV.AI_BROWSER_WHITELIST ?? "news,finance,cnstock"
)
  .split(",")
  .map((value) => value.trim())
  .filter((value): value is string => value.length > 0);

export const AI_DEFAULT_TIMEOUT_MS = Number(
  rawEnv.AI_DEFAULT_TIMEOUT_MS ?? ENV.AI_DEFAULT_TIMEOUT_MS ?? 45_000
);
