import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

export type QuantSettingsFallback = {
  sourcePath: string | null;
  accountId: string;
  xtPluginPath: string;
  indexSymbol: string;
  strategyStopLossRatio: number | null;
};

const EMPTY_SETTINGS: QuantSettingsFallback = {
  sourcePath: null,
  accountId: "",
  xtPluginPath: "",
  indexSymbol: "",
  strategyStopLossRatio: null,
};

let cachedSettings: QuantSettingsFallback | null = null;
const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

function parseScalar(rawValue: string): string | number | boolean | null {
  const value = stripInlineComment(rawValue).trim();
  if (!value) {
    return null;
  }

  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1).replace(/\\\\/g, "\\");
    }
  }

  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  if (/^[+-]?\d[\d_]*(\.\d+)?$/.test(value)) {
    const parsed = Number.parseFloat(value.replace(/_/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  const lower = value.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;

  return value;
}

function stripInlineComment(rawValue: string): string {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let result = "";

  for (let i = 0; i < rawValue.length; i += 1) {
    const ch = rawValue[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\" && inDouble) {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      result += ch;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      result += ch;
      continue;
    }

    if (ch === "#" && !inSingle && !inDouble) {
      break;
    }

    result += ch;
  }

  return result;
}

function asString(value: string | number | boolean | null): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function asNumber(value: string | number | boolean | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function parseSettingsYaml(content: string): Omit<QuantSettingsFallback, "sourcePath"> {
  const parsed: Omit<QuantSettingsFallback, "sourcePath"> = {
    accountId: "",
    xtPluginPath: "",
    indexSymbol: "",
    strategyStopLossRatio: null,
  };

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  let currentSection = "";

  for (const line of lines) {
    const trimmedStart = line.trimStart();
    if (!trimmedStart || trimmedStart.startsWith("#")) {
      continue;
    }

    const indent = line.length - trimmedStart.length;
    const match = trimmedStart.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    const scalar = parseScalar(match[2] ?? "");

    if (indent === 0) {
      currentSection = scalar === null ? key : "";
      if (key === "index") {
        parsed.indexSymbol = asString(scalar);
      }
      continue;
    }

    if (currentSection === "account" && key === "account_id") {
      parsed.accountId = asString(scalar);
      continue;
    }

    if (currentSection === "xt" && key === "plugin_path") {
      parsed.xtPluginPath = asString(scalar);
      continue;
    }

    if (currentSection === "strategy" && key === "stop_loss_ratio") {
      parsed.strategyStopLossRatio = asNumber(scalar);
    }
  }

  return parsed;
}

function getCandidatePaths(): string[] {
  const paths = new Set<string>();
  const envPath = process.env.QUANT_SETTINGS_PATH?.trim();
  if (envPath) {
    paths.add(path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath));
  }

  paths.add(path.resolve(process.cwd(), "..", "config", "settings.yaml"));
  paths.add(path.resolve(process.cwd(), "config", "settings.yaml"));
  paths.add(path.resolve(MODULE_DIR, "..", "..", "..", "config", "settings.yaml"));

  return Array.from(paths);
}

function loadFromDisk(): QuantSettingsFallback {
  for (const filePath of getCandidatePaths()) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseSettingsYaml(raw);
      return {
        sourcePath: filePath,
        ...parsed,
      };
    } catch (error) {
      console.warn(`[settings-fallback] Failed to parse ${filePath}:`, error);
    }
  }
  return EMPTY_SETTINGS;
}

export function getSettingsFallback(): QuantSettingsFallback {
  if (!cachedSettings) {
    cachedSettings = loadFromDisk();
    if (cachedSettings.sourcePath) {
      console.log(`[settings-fallback] Loaded from ${cachedSettings.sourcePath}`);
    }
  }
  return cachedSettings;
}

// ============ 配置保存功能 ============

const CONFIG_FILE_PATH = path.resolve(MODULE_DIR, "..", "..", "..", "config", "app-settings.json");

export type ConfigSection = "database" | "web_api" | "qmt" | "oauth" | "risk";

export type ConfigData = {
  database?: {
    DB_HOST: string;
    DB_PORT: string;
    DB_NAME: string;
    DB_USER: string;
    DB_PASSWORD: string;
  };
  web_api?: {
    TRADING_WEB_API_URL: string;
    TRADING_WEB_API_USERNAME: string;
    TRADING_WEB_API_PASSWORD: string;
    TRADING_WEB_API_TIMEOUT_MS: string;
  };
  qmt?: {
    MINIQMT_PATH: string;
    MINIQMT_SESSION_ID: string;
    MINIQMT_ACCOUNT_ID: string;
  };
  oauth?: {
    VITE_OAUTH_PORTAL_URL: string;
    VITE_APP_ID: string;
  };
  risk?: {
    RISK_MAX_SINGLE_ORDER_AMOUNT: string;
    RISK_MAX_DAILY_ORDER_AMOUNT: string;
    RISK_MAX_DAILY_ORDER_COUNT: string;
    RISK_STOP_LOSS_RATIO: string;
  };
};

export async function updateSettingsFile(section: ConfigSection, config: Record<string, string>): Promise<void> {
  // 确保配置目录存在
  const configDir = path.dirname(CONFIG_FILE_PATH);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // 读取现有配置
  let existingConfig: Record<string, any> = {};
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
      existingConfig = JSON.parse(content);
    } catch (error) {
      console.warn("[settings-fallback] Failed to parse existing config, creating new one");
    }
  }

  // 更新配置
  existingConfig[section] = {
    ...(existingConfig[section] || {}),
    ...config,
    updated_at: new Date().toISOString(),
  };

  // 写入配置
  fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(existingConfig, null, 2), "utf8");
  console.log(`[settings-fallback] Configuration saved: ${section}`);

  // 如果是 QMT 配置，同时更新 settings.yaml
  if (section === "qmt") {
    await updateSettingsYaml(section, config);
  }
}

export function getStoredConfig(section?: ConfigSection): Record<string, any> {
  if (!fs.existsSync(CONFIG_FILE_PATH)) {
    return section ? {} : {};
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE_PATH, "utf8");
    const config = JSON.parse(content);
    return section ? (config[section] || {}) : config;
  } catch (error) {
    console.warn("[settings-fallback] Failed to read stored config:", error);
    return section ? {} : {};
  }
}

// ============ YAML 配置更新功能 ============

const SETTINGS_YAML_PATH = path.resolve(MODULE_DIR, "..", "..", "..", "config", "settings.yaml");

export async function updateSettingsYaml(section: ConfigSection, config: Record<string, string>): Promise<void> {
  // 只处理 qmt 配置
  if (section !== "qmt") {
    return;
  }

  if (!fs.existsSync(SETTINGS_YAML_PATH)) {
    console.warn("[settings-fallback] settings.yaml not found, skipping YAML update");
    return;
  }

  try {
    // 读取现有 YAML
    const fileContent = fs.readFileSync(SETTINGS_YAML_PATH, "utf8");
    const yamlContent: any = yaml.load(fileContent) || {};

    // 更新 account.account_id
    if (config.MINIQMT_ACCOUNT_ID) {
      if (!yamlContent.account) {
        yamlContent.account = {};
      }
      yamlContent.account.account_id = config.MINIQMT_ACCOUNT_ID;
    }

    // 更新 xt.plugin_path
    if (config.MINIQMT_PATH) {
      if (!yamlContent.xt) {
        yamlContent.xt = {};
      }
      // 将双反斜杠转换为单反斜杠
      const normalizedPath = config.MINIQMT_PATH.replace(/\\\\/g, "\\");
      yamlContent.xt.plugin_path = normalizedPath;
    }

    // 更新 xt.session_id (如果有)
    if (config.MINIQMT_SESSION_ID) {
      if (!yamlContent.xt) {
        yamlContent.xt = {};
      }
      yamlContent.xt.session_id = parseInt(config.MINIQMT_SESSION_ID, 10);
    }

    // 写回 YAML 文件
    const yamlDump = yaml.dump(yamlContent, {
      indent: 2,
      lineWidth: -1, // 不限制行宽
      noRefs: true,  // 不使用引用
      quotingType: '"',
      forceQuotes: false,
    });

    fs.writeFileSync(SETTINGS_YAML_PATH, yamlDump, "utf8");
    console.log(`[settings-fallback] settings.yaml updated with QMT config`);
  } catch (error) {
    console.error("[settings-fallback] Failed to update settings.yaml:", error);
    throw error;
  }
}
