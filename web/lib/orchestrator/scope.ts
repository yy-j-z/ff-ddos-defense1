/**
 * Scope 校验工具 —— 在执行前确保 Playbook 不越界
 */
import type { AttackPlaybook, Scope } from '../types';

export interface ScopeCheckResult {
  ok: boolean;
  violations: string[];
}

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
  if (!scope.allowedStrategies.includes(clamped.strategy)) {
    clamped.strategy = scope.allowedStrategies[0];
  }
  return clamped;
}
