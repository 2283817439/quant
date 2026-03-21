"""
量化交易平台 - 前后端连通性测试脚本
测试所有核心 API端点与前端页面的数据连接
"""
import requests
import json
import time
from datetime import datetime, timedelta

API_BASE = "http://127.0.0.1:8080"

def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")

def test_api(name, url, method="GET", payload=None, expected_status=200):
    """测试 API端点"""
    try:
        start = time.time()
        if method == "GET":
            resp = requests.get(f"{API_BASE}{url}", timeout=5)
        elif method == "POST":
            resp = requests.post(f"{API_BASE}{url}", json=payload, timeout=5)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        elapsed = (time.time() - start) * 1000
        
        if resp.status_code == expected_status:
            status_icon = "✅"
            result = "SUCCESS"
        else:
            status_icon = "⚠️"
            result = f"UNEXPECTED ({resp.status_code})"
        
        print(f"{status_icon} {name}")
        print(f"   URL: {method} {url}")
        print(f"   Status: {result} | Time: {elapsed:.0f}ms")
        
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict):
                print(f"   Keys: {list(data.keys())[:5]}")
            elif isinstance(data, list):
                print(f"   Count: {len(data)}")
        
        return resp.status_code == expected_status
    
    except Exception as e:
        print(f"❌ {name}")
        print(f"   ERROR: {str(e)}")
        return False

# ==================== 开始测试 ====================

print_section("🚀 量化交易平台 - 前后端连通性测试")
print(f"测试时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"API 地址：{API_BASE}")

results = []

# 1. 基础服务测试
print_section("1️⃣ 基础服务测试")
results.append(test_api("健康检查", "/health"))
results.append(test_api("策略信息", "/api/strategy/info"))

# 2. Dashboard 相关
print_section("2️⃣ Dashboard 指挥总台")
results.append(test_api("仪表盘概览", "/api/dashboard/overview"))
results.append(test_api("权益曲线", "/api/equity/curve"))
results.append(test_api("回撤曲线", "/api/equity/drawdown"))

# 3. 回测相关
print_section("3️⃣ 回测验证")
results.append(test_api("回测报告", "/api/backtest/report"))
results.append(test_api("月度收益", "/api/backtest/monthly_returns"))
results.append(test_api("回测配置", "/api/backtest/config"))
results.append(test_api("绩效历史", "/api/backtest/metrics/history"))

# 4. 持仓相关
print_section("4️⃣ 持仓簿")
results.append(test_api("当前持仓", "/api/positions/current"))
results.append(test_api("持仓风险", "/api/risk/position_analysis"))

# 5. 风控相关
print_section("5️⃣ 风险控制")
results.append(test_api("风控状态", "/api/risk/status"))

# 6. AI 相关
print_section("6️⃣ AI 管理")
results.append(test_api("AI Agent 列表", "/paperclip/agents/list"))
results.append(test_api("AI 工作流列表", "/ai/workflows"))
results.append(test_api("监控池配置", "/ai/monitor/config"))
results.append(test_api("监控池列表", "/ai/monitor/pool"))

# 7. QMT桥接
print_section("7️⃣ QMT桥接服务")
results.append(test_api("QMT 健康", "/qmt/health"))
results.append(test_api("账户持仓", "/qmt/account/positions", method="POST", payload={"account_id": None}))
results.append(test_api("风控指标", "/qmt/risk_metrics"))

# 8. 行情数据
print_section("8️⃣ 行情数据")
results.append(test_api("市场热度", "/market/api/market/heat"))
results.append(test_api("资金流向", "/market/api/market/capital-flow"))
results.append(test_api("大盘指数", "/market/api/market/indexes"))

# 9. 排行榜
print_section("9️⃣ 排行榜")
results.append(test_api("涨跌幅榜", "/market/api/rank/change?top_n=10"))
results.append(test_api("成交额榜", "/market/api/rank/turnover?top_n=10"))
results.append(test_api("换手率榜", "/market/api/rank/turnover-rate?top_n=10"))

# 10. tRPC 系统端点 (通过 Fetch 测试)
print_section("🔟 tRPC 系统端点")
try:
    # tRPC 使用 GET 请求，路径格式特殊
    trpc_url = "http://127.0.0.1:8080/trpc/system.serverTime"
    resp = requests.get(trpc_url, timeout=3)
    if resp.status_code == 200:
        print(f"✅ tRPC 系统时间")
        print(f"   URL: GET {trpc_url}")
        print(f"   Response: {resp.json()}")
        results.append(True)
    else:
        print(f"⚠️ tRPC 系统时间 - Status: {resp.status_code}")
        results.append(False)
except Exception as e:
    print(f"❌ tRPC 系统时间 - Error: {e}")
    results.append(False)

# ==================== 测试结果汇总 ====================

print_section("📊 测试结果汇总")
total = len(results)
passed = sum(results)
failed = total - passed
success_rate = (passed / total * 100) if total > 0 else 0

print(f"总测试数：{total}")
print(f"✅ 成功：{passed}")
print(f"❌ 失败：{failed}")
print(f"📈 成功率：{success_rate:.1f}%")

if success_rate >= 90:
    print("\n🎉 优秀！系统连接状态良好")
elif success_rate >= 70:
    print("\n✨ 良好！大部分服务正常运行")
elif success_rate >= 50:
    print("\n⚠️ 注意！部分服务需要检查")
else:
    print("\n🚨 警告！大量服务连接失败")

print(f"\n测试完成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("="*60 + "\n")

# 导出详细报告
report_file = "test_api_report.json"
report_data = {
    "timestamp": datetime.now().isoformat(),
    "api_base": API_BASE,
    "total": total,
    "passed": passed,
    "failed": failed,
    "success_rate": success_rate,
}

with open(report_file, "w", encoding="utf-8") as f:
    json.dump(report_data, f, indent=2, ensure_ascii=False)

print(f"📄 详细报告已保存至：{report_file}")
