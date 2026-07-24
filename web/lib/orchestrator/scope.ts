/**
 * Scope 校验工具 —— 在执行前确保 Playbook 不越界
 */
import type { AttackPlaybook, Scope } from '../types';

export interface ScopeCheckResult {
  ok: boolean;
  violations: string[];
}

// 强度硬上限 —— 与 attacker worker 的默认 env 上限保持一致,防止 LLM 生成的
// requestsPerSecond / concurrentConnections 无限拉高。worker 侧仍会二次兜底。
export const MAX_RPS = 5000;
export const MAX_CONNECTIONS = 2000;

export function checkPlaybookScope(playbook: AttackPlaybook, scope: Scope): ScopeCheckResult {
  const violations: string[] = [];

  if (!scope.allowedStrategies.includes(playbook.strategy)) {
    violations.push(
      `strategy "${playbook.strategy}" 不在允许列表 [${scope.allowedStrategies.join(', ')}]`
    );
  }

  if (playbook.parameters.durationSec > scope.maxDurationSec) {
    violations.push(
      `durationSec=${playbook.parameters.durationSec} 超过上限 ${scope.maxDurationSec}`
    );
  }

  const rps = playbook.parameters.requestsPerSecond;
  if (rps != null && rps > MAX_RPS) {
    violations.push(`requestsPerSecond=${rps} 超过上限 ${MAX_RPS}`);
  }

  if (playbook.parameters.concurrentConnections > MAX_CONNECTIONS) {
    violations.push(
      `concurrentConnections=${playbook.parameters.concurrentConnections} 超过上限 ${MAX_CONNECTIONS}`
    );
  }

  // 目标 URL 主机白名单检查(简单 includes)
  try {
    const url = new URL(playbook.parameters.targetUrl);
    const host = url.hostname;
    const allowed = scope.allowedTargets.some((t) => host === t || host.endsWith('.' + t));
    if (!allowed) {
      violations.push(`目标 host "${host}" 不在白名单 [${scope.allowedTargets.join(', ')}]`);
    }
  } catch {
    violations.push(`targetUrl 不是合法 URL: ${playbook.parameters.targetUrl}`);
  }

  return { ok: violations.length === 0, violations };
}

/** 强制把 Playbook 收敛到 Scope 上限,而不是直接拒绝(demo 友好) */
export function clampPlaybookToScope(playbook: AttackPlaybook, scope: Scope): AttackPlaybook {
  const clamped: AttackPlaybook = { ...playbook, parameters: { ...playbook.parameters } };
  if (clamped.parameters.durationSec > scope.maxDurationSec) {
    clamped.parameters.durationSec = scope.maxDurationSec;
  }
  if (clamped.parameters.requestsPerSecond != null && clamped.parameters.requestsPerSecond > MAX_RPS) {
    clamped.parameters.requestsPerSecond = MAX_RPS;
  }
  if (clamped.parameters.concurrentConnections > MAX_CONNECTIONS) {
    clamped.parameters.concurrentConnections = MAX_CONNECTIONS;
  }
  if (!scope.allowedStrategies.includes(clamped.strategy)) {
    clamped.strategy = scope.allowedStrategies[0];
  }
  return clamped;
}
