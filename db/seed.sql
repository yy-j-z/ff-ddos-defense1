-- 演示种子数据 —— 替代前端硬编码的 mock。
-- 注意:init.sql 在容器首次初始化(建表之前)运行,无法 INSERT;
-- 因此种子数据独立成本文件,由 scripts/start.sh 在 drizzle 迁移之后执行。
-- 可重复执行(先清后插)。

BEGIN;

DELETE FROM agent_traces;
DELETE FROM verifications;
DELETE FROM playbooks;
DELETE FROM profiles;
DELETE FROM sessions;

-- ───────────────────────── Sessions ─────────────────────────
INSERT INTO sessions (id, name, status, scope, created_at, updated_at) VALUES
('11111111-1111-1111-1111-111111111111', '电商靶机演练', 'completed',
 '{"maxRounds":5,"maxDurationSec":120,"maxBandwidthMbps":100,"allowedTargets":["target","defender"],"allowedStrategies":["slowloris","http_flood","syn_flood"]}'::jsonb,
 '2026-05-27 09:12:33', '2026-05-27 09:25:00'),
('22222222-2222-2222-2222-222222222222', '金融 API 防护回归', 'completed',
 '{"maxRounds":5,"maxDurationSec":120,"maxBandwidthMbps":100,"allowedTargets":["target","defender"],"allowedStrategies":["slowloris","http_flood"]}'::jsonb,
 '2026-05-26 18:42:01', '2026-05-26 19:10:00'),
('33333333-3333-3333-3333-333333333333', 'CDN 边缘节点对抗', 'stopped',
 '{"maxRounds":3,"maxDurationSec":120,"maxBandwidthMbps":100,"allowedTargets":["target","defender"],"allowedStrategies":["http_flood"]}'::jsonb,
 '2026-05-26 14:01:17', '2026-05-26 14:09:00');

-- ───────────────────────── Profile (s1) ─────────────────────────
INSERT INTO profiles (id, session_id, data, created_at) VALUES
('11111111-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111',
 '{"summary":"中型电商业务,HTTPS API 主导,登录与下单接口流量集中,移动端 UA 占比偏高","protocols":{"tcp":0.82,"udp":0.12,"icmp":0.02,"other":0.04},"qpsBaseline":{"avg":1230,"p99":3580},"topApis":[{"path":"/api/login","method":"POST","ratio":0.31},{"path":"/api/cart/checkout","method":"POST","ratio":0.22},{"path":"/api/product/list","method":"GET","ratio":0.18},{"path":"/api/user/profile","method":"GET","ratio":0.11}],"tlsFingerprints":["ja3:e7d705a3286e19ea42f587b344ee6865"],"userAgentDistribution":[{"ua":"Mozilla/5.0 (iPhone; CPU iPhone OS 17_2)","ratio":0.42},{"ua":"Mozilla/5.0 (Linux; Android 14; Pixel 8)","ratio":0.28},{"ua":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120","ratio":0.21}],"vulnerabilities":["/api/login 无验证码,可被慢速暴力枚举","业务对 UA 异常较敏感,模仿真实分布即可规避指纹检测","p99 与 avg 差距大,短时突发被视为正常"]}'::jsonb,
 '2026-05-27 09:13:00');

-- ───────────────────────── Playbooks (s1: 3 轮演进) ─────────────────────────
INSERT INTO playbooks (id, session_id, round, intent, strategy, yaml, data, score, created_at) VALUES
('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1,
 '简单 SYN flood 探测防御阈值', 'syn_flood',
 'id: pb-001\nstrategy: syn_flood\nintent: 简单 SYN flood 探测防御阈值',
 '{"id":"pb-001","round":1,"intent":"简单 SYN flood 探测防御阈值","strategy":"syn_flood","parameters":{"targetUrl":"http://defender:8080","targetEndpoints":["/"],"concurrentConnections":2000,"requestsPerSecond":8000,"durationSec":30,"userAgents":["Mozilla/5.0"]},"expectedBypass":"直接打满 SYN 队列,观察防御响应","hypothesis":"防御只看 SYN 半连接数,无 cookie 校验"}'::jsonb,
 24, '2026-05-27 09:13:30'),
('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2,
 'L7 slowloris 慢速消耗连接池', 'slowloris',
 'id: pb-002\nstrategy: slowloris\nintent: L7 slowloris 慢速消耗连接池',
 '{"id":"pb-002","round":2,"intent":"L7 slowloris 慢速消耗连接池","strategy":"slowloris","parameters":{"targetUrl":"http://defender:8080","targetEndpoints":["/api/login"],"concurrentConnections":5000,"sendIntervalMs":10000,"durationSec":60,"userAgents":["Mozilla/5.0 (iPhone; CPU iPhone OS 17_2)","Mozilla/5.0 (Linux; Android 14; Pixel 8)"]},"expectedBypass":"单连接低速率,绕过 IP RPS 限流","hypothesis":"防御只看 IP 速率不看连接持续时间"}'::jsonb,
 72, '2026-05-27 09:18:00'),
('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 3,
 '模仿业务 UA 的分布式 HTTP flood', 'http_flood',
 'id: pb-003\nstrategy: http_flood\nintent: 模仿业务 UA 的分布式 HTTP flood',
 '{"id":"pb-003","round":3,"intent":"模仿业务 UA 的分布式 HTTP flood","strategy":"http_flood","parameters":{"targetUrl":"http://defender:8080","targetEndpoints":["/api/login","/api/cart/checkout"],"concurrentConnections":800,"requestsPerSecond":1100,"durationSec":45,"userAgents":["Mozilla/5.0 (iPhone; CPU iPhone OS 17_2)","Mozilla/5.0 (Linux; Android 14; Pixel 8)","Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120"],"headers":{"Accept-Language":"zh-CN,zh;q=0.9"}},"expectedBypass":"请求形态与基线难以区分,贴近 p99 不触发突发告警","hypothesis":"防御按 UA 指纹聚类,真实 UA 分布可规避"}'::jsonb,
 88, '2026-05-27 09:24:00'),
-- s2 代表性剧本
('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 5,
 '低速 HTTP flood 贴合交易峰值', 'http_flood',
 'id: pb-s2\nstrategy: http_flood',
 '{"id":"pb-s2","round":5,"intent":"低速 HTTP flood 贴合交易峰值","strategy":"http_flood","parameters":{"targetUrl":"http://defender:8080","targetEndpoints":["/api/pay"],"concurrentConnections":600,"requestsPerSecond":900,"durationSec":40,"userAgents":["Mozilla/5.0"]},"expectedBypass":"贴近交易高峰 QPS,规避阈值","hypothesis":"防御阈值按静态峰值设定"}'::jsonb,
 88, '2026-05-26 19:05:00'),
-- s3 代表性剧本
('cccccccc-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 1,
 'HTTP flood 直接压边缘节点', 'http_flood',
 'id: pb-s3\nstrategy: http_flood',
 '{"id":"pb-s3","round":1,"intent":"HTTP flood 直接压边缘节点","strategy":"http_flood","parameters":{"targetUrl":"http://defender:8080","targetEndpoints":["/"],"concurrentConnections":1500,"requestsPerSecond":5000,"durationSec":30,"userAgents":["curl/8.0"]},"expectedBypass":"高频直接打满","hypothesis":"边缘无 UA 过滤"}'::jsonb,
 24, '2026-05-26 14:05:00');

-- ───────────────────────── Verifications ─────────────────────────
INSERT INTO verifications (id, playbook_id, reachability, defender_triggered, defender_latency_ms, score, metrics, created_at) VALUES
('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 0.92, true, 1200, 24,
 '{"playbookId":"pb-001","reachability":0.92,"avgLatencyMs":120,"defenderTriggered":true,"defenderLatencyMs":1200,"defenderRulesHit":["syn_rate_limit","half_open_threshold"],"totalRequests":240000,"blockedRequests":232800,"businessImpact":"low","score":24}'::jsonb,
 '2026-05-27 09:14:00'),
('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 0.55, true, 8500, 72,
 '{"playbookId":"pb-002","reachability":0.55,"avgLatencyMs":3400,"defenderTriggered":true,"defenderLatencyMs":8500,"defenderRulesHit":["conn_idle_timeout"],"totalRequests":5000,"blockedRequests":2100,"businessImpact":"medium","score":72}'::jsonb,
 '2026-05-27 09:19:00'),
('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000003', 0.31, false, NULL, 88,
 '{"playbookId":"pb-003","reachability":0.31,"avgLatencyMs":5200,"defenderTriggered":false,"defenderLatencyMs":null,"defenderRulesHit":[],"totalRequests":49500,"blockedRequests":2100,"businessImpact":"high","score":88}'::jsonb,
 '2026-05-27 09:25:00'),
('dddddddd-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000001', 0.28, false, NULL, 88,
 '{"playbookId":"pb-s2","reachability":0.28,"avgLatencyMs":4800,"defenderTriggered":false,"defenderLatencyMs":null,"defenderRulesHit":[],"totalRequests":36000,"blockedRequests":1500,"businessImpact":"high","score":88}'::jsonb,
 '2026-05-26 19:09:00'),
('dddddddd-0000-0000-0000-000000000005', 'cccccccc-0000-0000-0000-000000000001', 0.95, true, 800, 24,
 '{"playbookId":"pb-s3","reachability":0.95,"avgLatencyMs":90,"defenderTriggered":true,"defenderLatencyMs":800,"defenderRulesHit":["ua_blacklist:curl","rate_limit"],"totalRequests":150000,"blockedRequests":146000,"businessImpact":"low","score":24}'::jsonb,
 '2026-05-26 14:06:00');

-- ───────────────────────── Agent Traces (s1) ─────────────────────────
INSERT INTO agent_traces (id, session_id, round, agent_name, input, output, thinking, duration_ms, created_at) VALUES
('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, 'analyzer',
 '{"pcap":"demo.pcap"}'::jsonb, 'null'::jsonb,
 '正在解析 PCAP 摘要... TCP 占比 82%,以 HTTPS 为主。Top API 集中在 /api/login 和 /api/cart/checkout,登录接口无验证码可被滥用。UA 以移动端为主,攻击者可通过模仿真实 UA 分布规避指纹检测。',
 4280, '2026-05-27 09:13:10'),
('eeeeeeee-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 2, 'attacker',
 '{"intent":"L7 slow-rate bypass"}'::jsonb, 'null'::jsonb,
 '基于业务画像,选择 slowloris 策略。配置 5000 并发连接,每 10 秒发送 1 字节维持连接。User-Agent 池采用业务画像中占比最高的移动端 UA,目标端点选 /api/login(高价值且无 challenge)。假设防御只看 IP RPS 不看连接占用,本策略可绕过。',
 3120, '2026-05-27 09:18:10'),
('eeeeeeee-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 2, 'verifier',
 '{"playbookId":"pb-002"}'::jsonb, 'null'::jsonb,
 '拨测靶机响应率 55%,平均延迟 3.4s(基线 120ms)。防御组件在 8.5s 后触发 conn_idle_timeout 规则,部分连接被回收。综合得分 72,业务影响 medium。',
 60100, '2026-05-27 09:19:10'),
('eeeeeeee-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 3, 'judge',
 '{"round":3}'::jsonb,
 '{"verdict":"success","reasoning":"第 3 回合采用业务画像中的 UA 分布,请求形态与基线无明显差异,防御未触发清洗规则。靶机可达性降至 31%,业务影响为 high,认定攻击成功,本回合可作为高价值剧本沉淀。","nextIntent":null,"defenseWeaknesses":["未对 UA 分布做基线学习,无法识别\"形似\"的攻击流量","依赖单一 RPS 阈值,缺少多维度异常检测","/api/login 接口无 challenge,可被低速持续打满"],"recommendations":["引入业务画像基线,异常 UA 比例突变时触发二级校验","关键写接口加入 JS challenge / CAPTCHA","增加 TLS JA3 + UA 联合指纹白名单"]}'::jsonb,
 '第 3 回合 http_flood 配合真实 UA 分布,防御未触发清洗,靶机可达性降至 31%。攻击成功,沉淀为高价值剧本。防御方主要短板在于缺乏 UA 基线学习和多维异常检测。',
 12400, '2026-05-27 09:25:10');

COMMIT;
