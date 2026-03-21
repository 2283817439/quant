/**
 * 适配器环境测试服务
 * 纯本地检测，不调用任何 AI API
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

export interface AdapterCheck {
  code: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  detail?: string;
  hint?: string;
}

export interface AdapterTestResult {
  adapterType: string;
  status: 'pass' | 'warn' | 'fail';
  checks: AdapterCheck[];
  testedAt: string;
}

function summarizeStatus(checks: AdapterCheck[]): AdapterTestResult['status'] {
  if (checks.some(c => c.level === 'error')) return 'fail';
  if (checks.some(c => c.level === 'warn')) return 'warn';
  return 'pass';
}

function isNonEmpty(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/** 检查工作目录是否存在且可访问 */
function checkCwd(checks: AdapterCheck[], cwd: string, prefix: string): boolean {
  try {
    if (fs.existsSync(cwd) && fs.statSync(cwd).isDirectory()) {
      checks.push({ code: `${prefix}_cwd_valid`, level: 'info', message: `工作目录有效: ${cwd}` });
      return true;
    }
    checks.push({ code: `${prefix}_cwd_invalid`, level: 'error', message: '工作目录不存在', detail: cwd });
    return false;
  } catch {
    checks.push({ code: `${prefix}_cwd_invalid`, level: 'error', message: '无法访问工作目录', detail: cwd });
    return false;
  }
}

/** 检查命令是否在 PATH 中可执行 */
function checkCommand(checks: AdapterCheck[], cmd: string, prefix: string): boolean {
  const isWin = process.platform === 'win32';
  const result = spawnSync(isWin ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (result.status === 0 && result.stdout.trim()) {
    checks.push({ code: `${prefix}_cmd_found`, level: 'info', message: `命令可用: ${cmd}`, detail: result.stdout.trim().split('\n')[0] });
    return true;
  }
  checks.push({
    code: `${prefix}_cmd_missing`,
    level: 'error',
    message: `命令未找到: ${cmd}`,
    hint: `请安装 ${cmd} 并确保其在 PATH 中`
  });
  return false;
}

/** 检查环境变量是否已设置 */
function checkEnvVar(checks: AdapterCheck[], varName: string, prefix: string, required = true): boolean {
  const val = process.env[varName];
  if (isNonEmpty(val)) {
    checks.push({ code: `${prefix}_env_${varName.toLowerCase()}`, level: 'info', message: `环境变量已设置: ${varName}` });
    return true;
  }
  checks.push({
    code: `${prefix}_env_${varName.toLowerCase()}_missing`,
    level: required ? 'error' : 'warn',
    message: `环境变量未设置: ${varName}`,
    hint: `请在 .env 文件或系统环境中设置 ${varName}`
  });
  return false;
}

/** 检查文件是否存在 */
function checkFile(checks: AdapterCheck[], filePath: string, code: string, label: string, required = true): boolean {
  if (fs.existsSync(filePath)) {
    checks.push({ code: `${code}_found`, level: 'info', message: `${label}存在: ${filePath}` });
    return true;
  }
  checks.push({ code: `${code}_missing`, level: required ? 'error' : 'warn', message: `${label}不存在`, detail: filePath });
  return false;
}

// ============================================================================
// 各适配器测试函数
// ============================================================================

function testClaudeLocal(config: Record<string, unknown>): AdapterCheck[] {
  const checks: AdapterCheck[] = [];
  const cwd = isNonEmpty(config.cwd) ? config.cwd : process.cwd();
  checkCwd(checks, cwd, 'claude');
  checkCommand(checks, 'claude', 'claude');
  checkEnvVar(checks, 'ANTHROPIC_API_KEY', 'claude');
  if (isNonEmpty(config.instructionsFilePath)) {
    checkFile(checks, config.instructionsFilePath, 'claude_instructions', '指令文件', false);
  }
  return checks;
}

function testCodexLocal(config: Record<string, unknown>): AdapterCheck[] {
  const checks: AdapterCheck[] = [];
  const cwd = isNonEmpty(config.cwd) ? config.cwd : process.cwd();
  checkCwd(checks, cwd, 'codex');
  checkCommand(checks, 'codex', 'codex');
  checkEnvVar(checks, 'OPENAI_API_KEY', 'codex');
  if (isNonEmpty(config.instructionsFilePath)) {
    checkFile(checks, config.instructionsFilePath, 'codex_instructions', '指令文件', false);
  }
  return checks;
}

function testGeminiLocal(config: Record<string, unknown>): AdapterCheck[] {
  const checks: AdapterCheck[] = [];
  const cwd = isNonEmpty(config.cwd) ? config.cwd : process.cwd();
  checkCwd(checks, cwd, 'gemini');
  checkCommand(checks, 'gemini', 'gemini');
  checkEnvVar(checks, 'GEMINI_API_KEY', 'gemini');
  if (isNonEmpty(config.instructionsFilePath)) {
    checkFile(checks, config.instructionsFilePath, 'gemini_instructions', '指令文件', false);
  }
  return checks;
}

function testHttpAdapter(config: Record<string, unknown>): AdapterCheck[] {
  const checks: AdapterCheck[] = [];
  if (!isNonEmpty(config.baseUrl)) {
    checks.push({ code: 'http_base_url_missing', level: 'error', message: '未配置 baseUrl', hint: '请填写 HTTP 适配器的目标地址' });
  } else {
    try {
      new URL(config.baseUrl);
      checks.push({ code: 'http_base_url_valid', level: 'info', message: `baseUrl 格式有效: ${config.baseUrl}` });
    } catch {
      checks.push({ code: 'http_base_url_invalid', level: 'error', message: 'baseUrl 格式无效', detail: config.baseUrl });
    }
  }
  if (isNonEmpty(config.apiKey)) {
    checks.push({ code: 'http_api_key_set', level: 'info', message: 'API Key 已配置' });
  } else {
    checks.push({ code: 'http_api_key_missing', level: 'warn', message: 'API Key 未配置', hint: '若目标服务需要认证，请填写 apiKey' });
  }
  return checks;
}

function testDockerAdapter(config: Record<string, unknown>): AdapterCheck[] {
  const checks: AdapterCheck[] = [];
  checkCommand(checks, 'docker', 'docker');
  if (!isNonEmpty(config.image)) {
    checks.push({ code: 'docker_image_missing', level: 'error', message: '未配置 Docker 镜像名', hint: '请填写 image 字段' });
  } else {
    checks.push({ code: 'docker_image_set', level: 'info', message: `镜像: ${config.image}` });
  }
  return checks;
}

function testCursorAdapter(config: Record<string, unknown>): AdapterCheck[] {
  const checks: AdapterCheck[] = [];
  const cwd = isNonEmpty(config.cwd) ? config.cwd : process.cwd();
  checkCwd(checks, cwd, 'cursor');
  checkCommand(checks, 'cursor', 'cursor');
  if (isNonEmpty(config.instructionsFilePath)) {
    checkFile(checks, config.instructionsFilePath, 'cursor_instructions', '指令文件', false);
  }
  return checks;
}

// ============================================================================
// 主入口
// ============================================================================

export function testAdapterEnvironment(
  adapterType: string,
  config: Record<string, unknown>
): AdapterTestResult {
  let checks: AdapterCheck[];

  switch (adapterType) {
    case 'claude_local':  checks = testClaudeLocal(config);  break;
    case 'codex_local':   checks = testCodexLocal(config);   break;
    case 'gemini_local':  checks = testGeminiLocal(config);  break;
    case 'http':          checks = testHttpAdapter(config);   break;
    case 'docker':        checks = testDockerAdapter(config); break;
    case 'cursor':        checks = testCursorAdapter(config); break;
    default:
      checks = [{ code: 'unknown_adapter', level: 'warn', message: `未知适配器类型: ${adapterType}`, hint: '请检查适配器类型配置' }];
  }

  return {
    adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
