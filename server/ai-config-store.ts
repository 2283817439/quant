import fs from "fs";
import path from "path";

export type AiWorkflowSchedulerSettings = {
  interval_seconds: number;
  max_parallel_runs: number;
  max_tasks_per_run: number;
  default_timeout_seconds: number;
  default_budget_units: number;
  max_retry: number;
};

export type AiWorkflowSkillSettings = {
  roots: string[];
  python_entrypoint: string;
  node_entrypoint: string;
  default_runtime: string;
  hot_reload: boolean;
};

export type AiWorkflowAdapterSettings = {
  quant_local: {
    enabled: boolean;
    python_entrypoint: string;
    max_concurrency: number;
    services: {
      market_data: string;
      trading: string;
      portfolio: string;
    };
    endpoints: {
      market_api: string;
      trading_api: string;
      monitor_api: string;
    };
  };
};

export type AiWorkflowEventsSettings = {
  log_path: string;
  watchdog_on_failure: boolean;
};

export type AiWorkflowSettings = {
  scheduler: AiWorkflowSchedulerSettings;
  skills: AiWorkflowSkillSettings;
  adapters: AiWorkflowAdapterSettings;
  events: AiWorkflowEventsSettings;
};

const PROJECT_ROOT = process.cwd();
const AI_CONFIG_PATH = path.resolve(PROJECT_ROOT, "config", "ai_config.json");

function readAiConfig(): Record<string, any> {
  if (!fs.existsSync(AI_CONFIG_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(AI_CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error("[ai-config] Failed to parse ai_config.json", error);
    return {};
  }
}

function writeAiConfig(config: Record<string, any>): void {
  const dir = path.dirname(AI_CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(AI_CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function ensureDefaults(settings: Partial<AiWorkflowSettings> | undefined): AiWorkflowSettings {
  return {
    scheduler: {
      interval_seconds: settings?.scheduler?.interval_seconds ?? 15,
      max_parallel_runs: settings?.scheduler?.max_parallel_runs ?? 4,
      max_tasks_per_run: settings?.scheduler?.max_tasks_per_run ?? 50,
      default_timeout_seconds: settings?.scheduler?.default_timeout_seconds ?? 180,
      default_budget_units: settings?.scheduler?.default_budget_units ?? 10,
      max_retry: settings?.scheduler?.max_retry ?? 3,
    },
    skills: {
      roots: settings?.skills?.roots ?? ["ai-skills/builtin", "ai-skills/custom"],
      python_entrypoint: settings?.skills?.python_entrypoint ?? "python",
      node_entrypoint: settings?.skills?.node_entrypoint ?? "node",
      default_runtime: settings?.skills?.default_runtime ?? "python",
      hot_reload: settings?.skills?.hot_reload ?? true,
    },
    adapters: {
      quant_local: {
        enabled: settings?.adapters?.quant_local?.enabled ?? true,
        python_entrypoint: settings?.adapters?.quant_local?.python_entrypoint ?? "python",
        max_concurrency: settings?.adapters?.quant_local?.max_concurrency ?? 4,
        services: {
          market_data:
            settings?.adapters?.quant_local?.services?.market_data ?? "services/market_data_api.py",
          trading:
            settings?.adapters?.quant_local?.services?.trading ?? "services/qmt_api_service.py",
          portfolio:
            settings?.adapters?.quant_local?.services?.portfolio ?? "core/portfolio.py",
        },
        endpoints: {
          market_api:
            settings?.adapters?.quant_local?.endpoints?.market_api ?? "http://127.0.0.1:8080/market",
          trading_api:
            settings?.adapters?.quant_local?.endpoints?.trading_api ?? "http://127.0.0.1:8080/qmt",
          monitor_api:
            settings?.adapters?.quant_local?.endpoints?.monitor_api ?? "http://127.0.0.1:8080/qmt",
        },
      },
    },
    events: {
      log_path: settings?.events?.log_path ?? "logs/live.log",
      watchdog_on_failure: settings?.events?.watchdog_on_failure ?? true,
    },
  };
}

export function loadAiWorkflowSettings(): AiWorkflowSettings {
  const config = readAiConfig();
  const settings = config.ai_workflow as Partial<AiWorkflowSettings> | undefined;
  return ensureDefaults(settings);
}

export function saveAiWorkflowSettings(settings: AiWorkflowSettings): void {
  const config = readAiConfig();
  config.ai_workflow = settings;
  writeAiConfig(config);
}
