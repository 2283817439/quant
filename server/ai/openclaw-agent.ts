import { appendLog } from "./task-store";
import { OPENCLAW_ENDPOINT, OPENCLAW_MODEL } from "./config";

type OpenClawAgentLike = {
  run: (input: { input: string; sessionId: string }) => Promise<{ output: string }>;
};

async function loadOpenClawAgent(): Promise<OpenClawAgentLike | null> {
  const dynamicImport = new Function(
    "specifier",
    "return import(specifier);"
  ) as (specifier: string) => Promise<any>;

  try {
    const mod = await dynamicImport("@openclaw/core");
    const providers = await dynamicImport("@openclaw/provider").catch(() => null);
    const browser = await dynamicImport("@openclaw/browser").catch(() => null);

    const providerInstance = providers
      ? new providers.OllamaProvider({
          model: OPENCLAW_MODEL,
          baseUrl: OPENCLAW_ENDPOINT,
        })
      : null;

    const agent = new mod.Agent({
      name: "Quant Orchestrator",
      provider: providerInstance ?? undefined,
      browser: browser?.BrowserProvider ? new browser.BrowserProvider() : undefined,
    });
    return agent as OpenClawAgentLike;
  } catch {
    return null;
  }
}

export class OpenClawHarness {
  private agent: OpenClawAgentLike | null = null;
  private initialized = false;

  private async ensureAgent() {
    if (this.initialized) return;
    this.agent = await loadOpenClawAgent();
    this.initialized = true;
  }

  async runPlanningStep(taskId: string, prompt: string): Promise<string> {
    await this.ensureAgent();
    if (!this.agent) {
      appendLog(taskId, "[OpenClaw] package not available, using fallback reasoning");
      return `Fallback reasoning plan for task ${taskId}:\n${prompt}`;
    }
    const response = await this.agent.run({
      input: prompt,
      sessionId: `task_${taskId}`,
    });
    return response.output;
  }
}
