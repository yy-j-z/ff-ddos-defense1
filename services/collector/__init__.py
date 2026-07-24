"""FF - 业务流量采集器（Collector Service）

支持多种采集后端，统一输出 PCAP 并自动送入 Analyzer 分析。

用法:
  # 实时抓取 200 个包并分析
  python -m services.collector.main live --iface "Realtek*" --count 200

  # 加载已有 PCAP 文件
  python -m services.collector.main file samples/ecommerce.pcap

  # 使用 pyshark 后端（需安装 tshark）
  python -m services.collector.main pyshark --iface "Wi-Fi" --count 500
"""
