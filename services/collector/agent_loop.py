"""FF 智能体调度循环 — 将采集→分析→LLM决策→响应封装为一个持续运行的 Agent。

模块说明（如何封装成智能体）：

  感知 (Perception)
    ├─ 流量采集（pyshark / scapy / file）
    └─ 流量解析（Scapy → BusinessProfile）
        ↓
  决策 (Decision)
    └─ LLM 推理（llm_agent.analyze_profile）
        ↓
  执行 (Action)
    ├─ 告警输出（控制台 / 日志 / Webhook）
    ├─ 自动阻断建议
    └─ 报告持久化
        ↓
  循环 ───→ 回到感知

用法:
  # 持续监控模式 — 每 60 秒抓包一轮，LLM 研判
  python -m services.collector.agent_loop monitor --iface "Wi-Fi" --interval 60

  # 离线样本批量分析 — 遍历 samples/ 目录下所有 PCAP
  python -m services.collector.agent_loop batch --dir ./samples

  # 单文件深度分析 — 一次抓包 + LLM 深度研判
  python -m services.collector.agent_loop once --path ./samples/ecommerce.pcap
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# Windows 控制台 UTF-8 兼容
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# 将项目根目录加入 sys.path，确保能从 collector 包里导入
HERE = Path(__file__).resolve().parent  # services/collector/
PROJECT_ROOT = HERE.parent.parent        # ff-main/
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# 从项目根目录加载 .env（必须在导入 llm_agent 之前，因为它在模块级读环境变量）
try:
    from dotenv import load_dotenv
    _env_path = PROJECT_ROOT / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
except ImportError:
    pass

from services.collector.backends import get_backend
from services.collector.main import analyze_pcap
from services.analyzer.parser import analyze_pcap as parse_pcap_local
from services.analyzer.llm_agent import analyze_profile, is_available as llm_available

# ── 配置 ─────────────────────────────────────────────────────────────

ANALYZER_URL = os.getenv("ANALYZER_URL", "http://127.0.0.1:8001")
COLLECTOR_OUT = os.getenv("COLLECTOR_OUT", "./captures")
ALERT_LOG = os.getenv("ALERT_LOG", "./alerts.jsonl")
DEFAULT_INTERVAL = int(os.getenv("AGENT_INTERVAL", "60"))  # 监控间隔（秒）

# 高威胁阈值 — 超过此等级自动触发告警
ALERT_ON_LEVELS = {"高"}

# 优雅退出标志
_shutdown_requested = False


def _on_signal(signum, frame):
    global _shutdown_requested
    print(f"\n[Agent] 收到信号 {signum}，正在优雅退出...")
    _shutdown_requested = True


signal.signal(signal.SIGINT, _on_signal)
signal.signal(signal.SIGTERM, _on_signal)


# ── 告警 / 响应动作 ──────────────────────────────────────────────────

def log_alert(decision: Dict[str, Any], profile: Dict[str, Any],
              pcap_path: str = "", log_file: str = ALERT_LOG) -> None:
    """将告警写入 JSONL 日志。"""
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "threat_level": decision.get("threat_level"),
        "threat_summary": decision.get("threat_summary"),
        "pcap_path": pcap_path,
        "source": decision.get("_source", "unknown"),
        "confidence": decision.get("confidence"),
    }
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception as exc:
        print(f"[Agent] [WARN] 告警日志写入失败: {exc}")


def print_alert(decision: Dict[str, Any], profile: Dict[str, Any]) -> None:
    """格式化输出告警到控制台。"""
    level = decision.get("threat_level", "未知")
    emoji = {"高": "[HIGH]", "中": "[MED ]", "低": "[LOW ]"}.get(level, "[????]")

    print(f"\n{'='*60}")
    print(f"  {emoji} 威胁等级: {level}")
    print(f"  [INFO] {decision.get('threat_summary', '')}")
    print(f"  [CONF] 置信度: {decision.get('confidence', 'N/A')}")
    print(f"  [ENGN] 推理引擎: {decision.get('_source', 'unknown')}")

    attack = decision.get("attack_surface_analysis", {})
    if attack:
        print(f"  [VULN] 最脆弱接口: {attack.get('most_vulnerable_endpoint', 'N/A')}")

    actions = decision.get("recommended_actions", [])
    if actions:
        print(f"  ---- 建议措施 ----")
        for a in actions[:5]:
            print(f"  [{a.get('priority', '?')}] {a.get('action', '')}")
            imp = a.get("implementation", "")
            if imp:
                print(f"      实现: {imp}")

    print(f"{'='*60}\n")


# ── 核心循环 ─────────────────────────────────────────────────────────

def run_once(pcap_path: str, use_llm: bool = True,
             analyzer_url: str = ANALYZER_URL) -> Dict[str, Any]:
    """单次分析：加载 PCAP → 解析 → LLM 推理 → 输出。

    这是智能体的一个完整「感知→决策→执行」周期。
    """
    print(f"[Agent] ---- 开始分析周期 ----")
    t0 = time.time()

    # 1. 感知：加载 + 解析 PCAP
    #    优先调用 pcap-analyzer 服务（自动上传），不可达时本地解析
    print(f"[Agent] 感知阶段: 解析 {pcap_path}")
    profile = None
    # 尝试 HTTP 上传到 analyzer
    try:
        print(f"[Agent]   尝试上传到 pcap-analyzer ({analyzer_url}) ...")
        profile = analyze_pcap(pcap_path, analyzer_url)
        print(f"[Agent]   pcap-analyzer 远程解析成功")
    except Exception:
        print(f"[Agent]   pcap-analyzer 不可达，切换本地解析")
    # 降级：本地 Scapy 解析
    if profile is None:
        try:
            profile = parse_pcap_local(pcap_path)
        except Exception as exc:
            print(f"[Agent] [WARN] 解析失败: {exc}")
            return {"status": "error", "error": str(exc)}

    t1 = time.time()
    print(f"[Agent] 解析完成 ({t1-t0:.1f}s): {profile.get('summary', '')}")

    # 2. 决策：LLM 推理
    decision = {}
    if use_llm:
        print(f"[Agent] 决策阶段: LLM 推理中...")
        decision = analyze_profile(profile)
        t2 = time.time()
        print(f"[Agent] LLM 推理完成 ({t2-t1:.1f}s)  [{decision.get('_source', '?')}]")
    else:
        decision = {
            "threat_level": "低",
            "threat_summary": "跳过 LLM 推理（--no-llm）",
            "attack_surface_analysis": {},
            "recommended_actions": [],
            "additional_intel_needed": [],
            "confidence": 0.0,
            "_source": "skipped",
        }

    # 3. 执行：告警输出 + 持久化
    print(f"[Agent] 执行阶段: 输出研判结果")
    print_alert(decision, profile)
    log_alert(decision, profile, pcap_path=pcap_path)

    result = {
        "profile": profile,
        "decision": decision,
        "timing": {"parse_s": round(t1 - t0, 2), "llm_s": round(time.time() - t1, 2)},
    }

    # 保存完整报告
    out_dir = Path(COLLECTOR_OUT)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_path = out_dir / f"agent_report_{ts}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, default=str)
    print(f"[Agent] 报告已保存: {report_path}")

    return result


def monitor_loop(backend_name: str = "file", interval: int = DEFAULT_INTERVAL,
                 use_llm: bool = True, analyzer_url: str = ANALYZER_URL,
                 init_kwargs: dict | None = None,
                 capture_kwargs: dict | None = None) -> None:
    """持续监控模式：无限循环，每轮完成一次完整的感知→决策→执行。

    这是智能体的核心——不是跑一次就结束的脚本，而是持续运行的自主系统。
    """
    print(f"[Agent] [START] 智能体启动")
    print(f"[Agent]    模式: 持续监控")
    print(f"[Agent]    后端: {backend_name}")
    print(f"[Agent]    间隔: {interval}s")
    print(f"[Agent]    LLM:  {'已连接 (' + os.getenv('LLM_MODEL', 'deepseek-chat') + ')' if llm_available() and use_llm else '本地规则'}")
    print(f"[Agent]    Ctrl+C 停止\n")

    cycle = 0
    backend = get_backend(backend_name, **(init_kwargs or {}))

    while not _shutdown_requested:
        cycle += 1
        print(f"\n{'─'*40}")
        print(f"[Agent] 周期 #{cycle}  {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'─'*40}")

        try:
            # 1. 感知：采集流量
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            pcap_path = backend.capture(
                output_path=str(Path(COLLECTOR_OUT) / f"monitor_cycle{cycle}_{ts}.pcap"),
                **(capture_kwargs or {}),
            )
            print(f"[Agent] 采集完成: {pcap_path}")

            # 2. 决策 + 执行
            run_once(pcap_path, use_llm=use_llm, analyzer_url=analyzer_url)

        except Exception as exc:
            print(f"[Agent] [WARN] 周期 #{cycle} 异常: {exc}")
            # 单周期失败不影响后续循环（智能体的韧性）

        if _shutdown_requested:
            break

        # 等待下一轮
        print(f"[Agent] 等待 {interval}s 后进入下一轮...")
        for _ in range(interval):
            if _shutdown_requested:
                break
            time.sleep(1)

    print(f"\n[Agent] [STOP] 智能体已停止，共运行 {cycle} 个周期")


def batch_mode(pcap_dir: str, use_llm: bool = True,
               analyzer_url: str = ANALYZER_URL) -> None:
    """批量分析模式：遍历目录下所有 PCAP 文件，逐一分析。"""
    base = Path(pcap_dir)
    if not base.exists():
        print(f"[Agent] 目录不存在: {base}")
        return

    pcaps = sorted(base.glob("*.pcap")) + sorted(base.glob("*.pcapng"))
    if not pcaps:
        print(f"[Agent] 目录中无 PCAP 文件: {base}")
        return

    print(f"[Agent] [BATCH] 批量分析模式")
    print(f"[Agent]    文件数: {len(pcaps)}")
    print(f"[Agent]    LLM: {'已连接' if llm_available() and use_llm else '本地规则'}\n")

    results = []
    for i, pcap in enumerate(pcaps, 1):
        print(f"\n{'─'*40}")
        print(f"[Agent] [{i}/{len(pcaps)}] {pcap.name}")
        print(f"{'─'*40}")
        try:
            result = run_once(str(pcap), use_llm=use_llm, analyzer_url=analyzer_url)
            results.append({"file": pcap.name, "status": "ok", "result": result})
        except Exception as exc:
            print(f"[Agent] [WARN] {pcap.name} 分析失败: {exc}")
            results.append({"file": pcap.name, "status": "error", "error": str(exc)})

    # 汇总
    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"\n[Agent] [DONE] 批量分析完成: {ok}/{len(results)} 成功")

    # 保存汇总报告
    summary_path = Path(COLLECTOR_OUT) / f"batch_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2, default=str)
    print(f"[Agent] 汇总报告: {summary_path}")


# ── CLI ──────────────────────────────────────────────────────────────

def main():
    global ANALYZER_URL, COLLECTOR_OUT
    ap = argparse.ArgumentParser(
        description="FF 智能体调度循环 — 感知→决策→执行的自主安全分析 Agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
运行模式:
  monitor   持续监控模式（智能体核心）— 循环采集+LLM研判，Ctrl+C 停止
  once      单次分析模式            — 加载一个 PCAP，深度分析后退出
  batch     批量分析模式            — 遍历目录下所有 PCAP

示例:
  # 用文件后端做持续监控（无需 TShark，演示智能体循环）
  python -m services.collector.agent_loop monitor --path ./samples/ecommerce.pcap --interval 30

  # 实时网卡监控（需 TShark）
  python -m services.collector.agent_loop monitor --backend pyshark --iface "Wi-Fi" --count 200

  # 单文件深度分析
  python -m services.collector.agent_loop once --path ./samples/ecommerce.pcap

  # 批量分析整个 samples 目录
  python -m services.collector.agent_loop batch --dir ./samples
        """,
    )
    ap.add_argument("mode", choices=["monitor", "once", "batch"],
                    help="运行模式")
    ap.add_argument("--backend", default="file",
                    choices=["pyshark", "live", "file"],
                    help="采集后端 (monitor 模式使用，默认 file)")
    ap.add_argument("--path", help="PCAP 文件路径 (once / file后端 使用)")
    ap.add_argument("--dir", default="./samples", help="PCAP 目录 (batch 模式)")
    ap.add_argument("--iface", help="网卡名称 (pyshark/live 后端)")
    ap.add_argument("--count", type=int, default=500, help="抓包数量")
    ap.add_argument("--timeout", type=int, default=30, help="抓包超时(秒)")
    ap.add_argument("--interval", type=int, default=DEFAULT_INTERVAL,
                    help=f"监控间隔秒数 (默认 {DEFAULT_INTERVAL})")
    ap.add_argument("--no-llm", action="store_true",
                    help="跳过 LLM 推理，仅用 Scapy 解析")
    ap.add_argument("--analyzer-url", default=ANALYZER_URL)
    ap.add_argument("--out-dir", default=COLLECTOR_OUT)

    args = ap.parse_args()

    # 更新全局配置（global 声明在函数顶部）
    ANALYZER_URL = args.analyzer_url
    COLLECTOR_OUT = args.out_dir

    use_llm = not args.no_llm

    # 后端参数：分离构造函数参数和 capture() 参数
    backend_init_kwargs = {}
    backend_capture_kwargs = {}
    if args.backend == "pyshark":
        if args.iface:
            backend_init_kwargs["iface"] = args.iface
        backend_capture_kwargs["count"] = args.count
        backend_capture_kwargs["timeout"] = args.timeout
    elif args.backend == "live":
        if args.iface:
            backend_init_kwargs["iface"] = args.iface
        backend_init_kwargs["count"] = args.count
        backend_init_kwargs["timeout"] = args.timeout
    elif args.backend == "file":
        backend_init_kwargs["path"] = args.path or "./samples/ecommerce.pcap"

    if args.mode == "monitor":
        monitor_loop(
            backend_name=args.backend,
            interval=args.interval,
            use_llm=use_llm,
            analyzer_url=args.analyzer_url,
            init_kwargs=backend_init_kwargs,
            capture_kwargs=backend_capture_kwargs,
        )
    elif args.mode == "once":
        pcap_path = args.path
        if pcap_path:
            # 指定了路径 → 直接用 file 后端加载
            backend = get_backend("file", path=pcap_path)
            pcap_path = backend.capture()
        else:
            # 未指定路径 → 用采集后端实时抓包
            backend = get_backend(args.backend, **backend_init_kwargs)
            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
            pcap_path = backend.capture(
                output_path=str(Path(COLLECTOR_OUT) / f"capture_{ts}.pcap"),
                **backend_capture_kwargs,
            )
        run_once(pcap_path, use_llm=use_llm, analyzer_url=args.analyzer_url)
    elif args.mode == "batch":
        batch_mode(args.dir, use_llm=use_llm, analyzer_url=args.analyzer_url)


if __name__ == "__main__":
    main()
