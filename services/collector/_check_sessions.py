import requests
import json

BASE = "http://127.0.0.1:3000"

# 获取会话列表
r = requests.get(f"{BASE}/api/sessions")
data = r.json()
sessions = data.get("sessions", [])

print("=" * 60)
print(f"共 {len(sessions)} 个会话")
print("=" * 60)

for s in sessions:
    print(f"\n{'─' * 40}")
    print(f"ID: {s['id'][:20]}...")
    print(f"名称: {s['name']}")
    print(f"状态: {s['status']}")
    print(f"创建时间: {s.get('createdAt', 'N/A')}")

# 获取每个 session 的详情
for s in sessions:
    sid = s['id']
    r2 = requests.get(f"{BASE}/api/stream/{sid}")
    # SSE stream - won't work as REST. Let's try a different approach.
    # Actually the session detail is on the dashboard page.

print("\n\n说明：以上是数据库中的会话记录。")
print("要查看详细执行过程，请打开浏览器对应的会话页面。")
