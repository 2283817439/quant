/**
 * 浏览器服务 - 基于 CDP (Chrome DevTools Protocol)
 * 移植自 openclaw 浏览器工具核心
 * 通过 WebSocket 控制本地 Chrome/Edge 实例
 * 支持自动 spawn Chrome 进程
 */
import WebSocket from "ws";
import http from "node:http";
import https from "node:https";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CdpTarget {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
}

export interface BrowserStatus {
  connected: boolean;
  cdpUrl: string;
  targets: CdpTarget[];
  managed: boolean; // 是否由本服务管理的 Chrome 进程
  error?: string;
}

// 默认 CDP 端口（Chrome 启动时加 --remote-debugging-port=9222）
let CDP_URL = process.env.BROWSER_CDP_URL || "http://127.0.0.1:9222";

export function setCdpUrl(url: string) {
  CDP_URL = url;
}

// ─── 自动启动 Chrome ───────────────────────────────────────────────────────────

let chromeProc: ChildProcessWithoutNullStreams | null = null;

/** 在 Windows/Mac/Linux 上查找 Chrome 可执行文件路径 */
function findChromeExecutable(): string | null {
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(os.homedir(), "AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"),
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ];
    return candidates.find((p) => fs.existsSync(p)) ?? null;
  }
  if (process.platform === "darwin") {
    const candidates = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ];
    return candidates.find((p) => fs.existsSync(p)) ?? null;
  }
  // Linux
  const candidates = ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium"];
  for (const bin of candidates) {
    try {
      const { execSync } = require("child_process");
      execSync(`which ${bin}`, { stdio: "ignore" });
      return bin;
    } catch { /* not found */ }
  }
  return null;
}

/** 启动 Chrome，返回 CDP URL */
export async function launchChrome(opts: {
  port?: number;
  headless?: boolean;
  userDataDir?: string;
} = {}): Promise<{ cdpUrl: string }> {
  const port = opts.port ?? 9222;
  const cdpUrl = `http://127.0.0.1:${port}`;

  // 已经在运行就直接返回
  if (chromeProc && chromeProc.exitCode === null) {
    return { cdpUrl };
  }

  const exe = findChromeExecutable();
  if (!exe) throw new Error("未找到 Chrome/Edge，请手动安装或指定路径");

  const userDataDir = opts.userDataDir ?? path.join(os.tmpdir(), `chrome-cdp-${port}`);

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-features=Translate,MediaRouter",
    "--disable-session-crashed-bubble",
    "--hide-crash-restore-bubble",
    "--password-store=basic",
  ];

  if (opts.headless) {
    args.push("--headless=new", "--disable-gpu");
  }
  if (process.platform === "linux") {
    args.push("--disable-dev-shm-usage");
  }

  args.push("about:blank");

  chromeProc = spawn(exe, args, { stdio: "pipe" });
  chromeProc.on("exit", () => { chromeProc = null; });

  // 等待 CDP 就绪（最多 10 秒）
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      await fetchJson<unknown>(new URL("/json/version", cdpUrl).toString(), 1000);
      setCdpUrl(cdpUrl);
      return { cdpUrl };
    } catch { /* 还没好 */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Chrome 启动超时，CDP 未就绪");
}

/** 停止由本服务启动的 Chrome 进程 */
export function stopChrome(): void {
  if (chromeProc) {
    try { chromeProc.kill(); } catch { /* ignore */ }
    chromeProc = null;
  }
}

/** 当前是否有本服务管理的 Chrome 进程在运行 */
export function isChromeRunning(): boolean {
  return chromeProc !== null && chromeProc.exitCode === null;
}

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data) as T); }
        catch { reject(new Error("Invalid JSON")); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

/** 获取 CDP targets 列表 */
export async function getCdpTargets(): Promise<CdpTarget[]> {
  return fetchJson<CdpTarget[]>(new URL("/json/list", CDP_URL).toString(), 3000);
}

/** 获取浏览器状态 */
export async function getBrowserStatus(): Promise<BrowserStatus> {
  try {
    const targets = await getCdpTargets();
    return { connected: true, cdpUrl: CDP_URL, targets, managed: isChromeRunning() };
  } catch (e: any) {
    return { connected: false, cdpUrl: CDP_URL, targets: [], error: e.message, managed: isChromeRunning() };
  }
}

type CdpSendFn = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

function createCdpSender(ws: WebSocket): { send: CdpSendFn; close: () => void } {
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  const send: CdpSendFn = (method, params) => {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString()) as { id: number; result?: unknown; error?: { message: string } };
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
    } catch { /* ignore */ }
  });

  ws.on("close", () => {
    for (const p of pending.values()) p.reject(new Error("CDP socket closed"));
    pending.clear();
  });

  return { send, close: () => { try { ws.close(); } catch { /* ignore */ } } };
}

async function withCdpSocket<T>(wsUrl: string, fn: (send: CdpSendFn) => Promise<T>): Promise<T> {
  const ws = new WebSocket(wsUrl, { handshakeTimeout: 5000 });
  await new Promise<void>((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const { send, close } = createCdpSender(ws);
  try {
    return await fn(send);
  } finally {
    close();
  }
}

/** 在指定 target 中导航到 URL */
export async function navigateTo(wsUrl: string, url: string): Promise<void> {
  await withCdpSocket(wsUrl, async (send) => {
    await send("Page.enable");
    await send("Page.navigate", { url });
    // 等待加载完成
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
  });
}

/** 截图 */
export async function screenshot(wsUrl: string): Promise<string> {
  return await withCdpSocket(wsUrl, async (send) => {
    await send("Page.enable");
    const result = await send("Page.captureScreenshot", { format: "jpeg", quality: 80 }) as { data: string };
    return result.data; // base64
  });
}

/** 获取页面文本内容（供 AI 读取） */
export async function getPageText(wsUrl: string): Promise<string> {
  return await withCdpSocket(wsUrl, async (send) => {
    const result = await send("Runtime.evaluate", {
      expression: "document.body?.innerText || document.documentElement?.innerText || ''",
      returnByValue: true,
    }) as { result: { value: string } };
    return (result?.result?.value || "").slice(0, 10000);
  });
}

/** 打开新标签页并导航 */
export async function openTab(url: string): Promise<CdpTarget> {
  const targets = await getCdpTargets();
  const blank = targets.find(t => t.url === "about:blank" || t.url === "chrome://newtab/");
  if (blank) {
    await navigateTo(blank.webSocketDebuggerUrl, url);
    return { ...blank, url };
  }
  return fetchJson<CdpTarget>(
    new URL(`/json/new?${encodeURIComponent(url)}`, CDP_URL).toString(),
    5000,
  );
}
