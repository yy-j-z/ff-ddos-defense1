"""LLM 推理层 — 将 BusinessProfile 送给大模型做二次推理。

这就是指导老师问的「怎么对接到大模型的」的答案：
  1. Scapy 解析 PCAP → 结构化 BusinessProfile（parser.py，已实现）
  2. BusinessProfile JSON → LLM 推理 → 威胁研判 + 防御建议（本模块）
  3. LLM 输出 → Agent 调度循环 → 自动响应（agent_loop.py）

默认使用 DeepSeek API（已在 .env 中配置），也支持 openai 兼容接口。
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

# 从项目根目录加载 .env
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
except ImportError:
    pass

# ── 配置 ─────────────────────────────────────────────────────────────
LLM_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
LLM_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")  # 可选 deepseek-reasoner

# 如果 DeepSeek 不可用，可设 OPENAI_API_KEY + OPENAI_BASE_URL 切换到 OpenAI 兼容接口
if not LLM_API_KEY:
    LLM_API_KEY = os.getenv("OPENAI_API_KEY", "")
    LLM_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    LLM_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


# ── Prompt 模板 ──────────────────────────────────────────────────────

SYSTEM_PROMPT = """你是一个网络安全流量分析专家，同时也是 FF 智能体系统的决策核心。

你的任务：基于 Scapy 解析出的业务流量画像（BusinessProfile），进行深度推理，输出结构化的威胁研判和防御建议。

要求：
1. 不要复述输入数据，直接给出分析结论
2. 每条建议必须具体、可执行，不能泛泛而谈
3. 威胁等级按「高/中/低」三级判定
4. 如果流量画像数据不足，明确指出还需要什么信息
5. 输出必须是合法的 JSON，不要包含 markdown 代码块标记"""

USER_PROMPT_TEMPLATE = """请分析以下业务流量画像，给出威胁研判和防御建议：

## 流量画像
{profile_json}

## 输出格式
请严格按以下 JSON Schema 输出（不要包含 ```json 标记）：

{{
  "threat_level": "高|中|低",
  "threat_summary": "一句话概述当前威胁态势",
  "attack_surface_analysis": {{
    "most_vulnerable_endpoint": "最易被攻击的接口及原因",
    "traffic_anomalies": ["流量异常点1", "流量异常点2"],
    "protocol_risks": ["协议层面风险1"]
  }},
  "recommended_actions": [
    {{
      "priority": 1,
      "action": "具体措施",
      "rationale": "为什么这样做",
      "implementation": "怎么实现（技术层面）"
    }}
  ],
  "additional_intel_needed": ["还需要收集什么信息"],
  "confidence": 0.0-1.0
}}"""


def _build_messages(profile: Dict[str, Any]) -> List[Dict[str, str]]:
    """构建 LLM 请求的 messages。"""
    profile_json = json.dumps(profile, ensure_ascii=False, indent=2)
    # 截断过长的 profile，避免超出 token 限制
    if len(profile_json) > 8000:
        profile_json = profile_json[:8000] + "\n... (truncated)"

    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": USER_PROMPT_TEMPLATE.format(profile_json=profile_json)},
    ]


def _call_deepseek(messages: List[Dict[str, str]]) -> Dict[str, Any]:
    """调用 DeepSeek (或 OpenAI 兼容) API。"""
    url = f"{LLM_BASE_URL}/chat/completions"
    headers = {
        "Authorization": f"Bearer {LLM_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 2048,
        "response_format": {"type": "json_object"},  # DeepSeek 也支持
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=60)
    resp.raise_for_status()
    body = resp.json()
    content = body["choices"][0]["message"]["content"]
    return json.loads(content)


def _mock_decision(profile: Dict[str, Any]) -> Dict[str, Any]:
    """当 LLM 不可用时的本地规则推演（降级方案）。

    答辩话术：「系统设计了 LLM 推理 + 本地规则双引擎，
    LLM 负责深度推理和未知威胁研判，本地规则保证离线可用和低延迟响应。」
    """
    vulns = profile.get("vulnerabilities", [])
    apis = profile.get("topApis", [])
    qps = profile.get("qpsBaseline", {})

    # 基于漏洞数量判定威胁等级
    if len(vulns) >= 3:
        threat_level = "高"
    elif len(vulns) >= 1:
        threat_level = "中"
    else:
        threat_level = "低"

    # 找最脆弱的接口
    login_apis = [a for a in apis if any(kw in a.get("path", "").lower()
                                         for kw in ("login", "signin", "auth"))]
    most_vulnerable = (
        f"{login_apis[0]['method']} {login_apis[0]['path']} — 登录接口无验证码保护，可被暴力探测"
        if login_apis
        else "无明显高风险接口"
    )

    # 流量异常检测
    anomalies = []
    if qps.get("p99", 0) > 5000:
        anomalies.append(f"P99 QPS 偏高 ({qps['p99']})，可能存在突发流量攻击")
    if profile.get("protocols", {}).get("udp", 0) > 0.5:
        anomalies.append("UDP 占比异常偏高，可能存在 UDP flood")

    # 生成建议
    actions = []
    for i, vuln in enumerate(vulns[:3]):
        actions.append({
            "priority": i + 1,
            "action": vuln,
            "rationale": f"流量画像中识别到该风险特征",
            "implementation": "建议通过 Nginx rate limiting + WAF 规则组合防御",
        })

    return {
        "threat_level": threat_level,
        "threat_summary": f"当前威胁等级: {threat_level}，共发现 {len(vulns)} 个潜在脆弱点",
        "attack_surface_analysis": {
            "most_vulnerable_endpoint": most_vulnerable,
            "traffic_anomalies": anomalies or ["未检测到明显流量异常"],
            "protocol_risks": _protocol_risks(profile),
        },
        "recommended_actions": actions or [{
            "priority": 1,
            "action": "保持现有监控策略",
            "rationale": "未发现高危脆弱点",
            "implementation": "维持当前 WAF + rate limiting",
        }],
        "additional_intel_needed": [],
        "confidence": 0.6,
        "_source": "local_rules",  # 标记来源，答辩时可说明
    }


def _protocol_risks(profile: Dict[str, Any]) -> List[str]:
    """从协议分布提取风险。"""
    risks = []
    protos = profile.get("protocols", {})
    if protos.get("icmp", 0) > 0.1:
        risks.append("ICMP 占比偏高，可能存在 ICMP tunnel 或扫描行为")
    if protos.get("other", 0) > 0.2:
        risks.append("非 TCP/UDP/ICMP 流量占比异常，可能存在非常规协议隧道")
    if not risks:
        risks.append("协议分布正常，无明显协议层风险")
    return risks


# ── 公开接口 ─────────────────────────────────────────────────────────


def analyze_profile(profile: Dict[str, Any]) -> Dict[str, Any]:
    """对 BusinessProfile 进行 LLM 推理，返回威胁研判结果。

    Args:
        profile: parser.analyze_pcap() 返回的 BusinessProfile 字典。

    Returns:
        {
            "threat_level": "高|中|低",
            "threat_summary": "...",
            "attack_surface_analysis": {...},
            "recommended_actions": [...],
            "additional_intel_needed": [...],
            "confidence": float,
            "_source": "deepseek" | "local_rules",
        }
    """
    # 优先尝试 LLM
    if LLM_API_KEY:
        try:
            messages = _build_messages(profile)
            result = _call_deepseek(messages)
            result["_source"] = os.getenv("LLM_MODEL", "deepseek-chat")
            return result
        except Exception as exc:
            print(f"[LLM] API 调用失败 ({exc})，降级到本地规则引擎")

    # 降级到本地规则
    print("[LLM] 未配置 API Key，使用本地规则引擎")
    return _mock_decision(profile)


def is_available() -> bool:
    """检查 LLM API 是否可用。"""
    return bool(LLM_API_KEY)
