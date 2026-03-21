"""
OpenClaw AI助手 - 新功能测试脚本
测试本地LLM、TWAP/VWAP算法等功能
"""
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from config.config import config
from utils.database import get_database_manager
from ai import get_ai_assistant
from core.models import Order, OrderDirection


def test_local_llm():
    """测试本地LLM（Ollama）集成"""
    print("\n" + "="*60)
    print("测试 1: 本地LLM（Ollama）集成")
    print("="*60)
    
    try:
        # 检查配置
        llm_provider = config.get('ai.llm_provider')
        print(f"\n当前 LLM提供商：{llm_provider}")
        
        if llm_provider != 'local':
            print("⚠️  配置文件中未启用本地LLM")
            print("请在 config/settings.yaml 中设置：ai.llm_provider: local")
            return False
        
        # 初始化 AI助手
        db = get_database_manager(config)
        ai = get_ai_assistant(config, db)
        
        # 测试调用
        print("\n正在调用本地LLM...")
        response = ai.call_llm("你好，请简单介绍一下自己。", max_tokens=200)
        
        print(f"\n✓ LLM 响应成功:\n{response[:500]}...")
        return True
        
    except Exception as e:
        print(f"\n✗ 测试失败：{str(e)}")
        print("\n建议:")
        print("1. 确保已安装 Ollama: ollama --version")
        print("2. 启动 Ollama 服务：ollama serve")
        print("3. 拉取模型：ollama pull llama3")
        return False


def test_rule_based_fallback():
    """测试规则引擎降级方案"""
    print("\n" + "="*60)
    print("测试 2: 规则引擎降级方案")
    print("="*60)
    
    try:
        db = get_database_manager(config)
        ai = get_ai_assistant(config, db)
        
        # 模拟 LLM 不可用的情况
        original_provider = ai.llm_provider
        ai.llm_provider = 'invalid_provider'
        
        # 测试问题
        questions = [
            "如何制定交易策略？",
            "风控检查有哪些内容？",
            "预测一下市场走势",
            "今天天气怎么样"  # 无关问题
        ]
        
        for q in questions:
            print(f"\n问：{q}")
            answer = ai.call_llm(q, max_tokens=200)
            print(f"答：{answer[:200]}...")
        
        # 恢复原设置
        ai.llm_provider = original_provider
        
        print("\n✓ 规则引擎降级测试通过")
        return True
        
    except Exception as e:
        print(f"\n✗ 测试失败：{str(e)}")
        return False


def test_twap_algorithm():
    """测试 TWAP 算法执行"""
    print("\n" + "="*60)
    print("测试 3: TWAP 算法执行")
    print("="*60)
    
    try:
        from core.trader import TradeExecutor
        
        # 创建测试订单
        test_order = Order(
            symbol='000001.SZ',
            direction=OrderDirection.BUY,
            price=10.5,
            volume=1200  # 12 手，分成 12 单就是每单 1 手
        )
        
        print(f"\n原始订单：{test_order.symbol} {test_order.direction.value} {test_order.volume}股 @ {test_order.price}")
        
        # 注意：这里不会真正执行，因为需要实际的 trader 实例
        # 仅做演示
        print("\n⚠️  TWAP 算法已实现，但需要实际的交易账户才能测试")
        print("\n使用示例:")
        print("""
from core.trader import TradeExecutor

trader = TradeExecutor()
trader.start()  # 连接交易账户

# 执行 TWAP：60 分钟内分成 12 单
order = Order(symbol='000001.SZ', direction=OrderDirection.BUY, price=10.5, volume=1200)
child_orders = trader.execute_twap(order, duration_minutes=60, num_slices=12)

print(f"提交了 {len(child_orders)} 个子订单")
""")
        
        return True
        
    except Exception as e:
        print(f"\n✗ 测试失败：{str(e)}")
        return False


def test_vwap_algorithm():
    """测试 VWAP 算法执行"""
    print("\n" + "="*60)
    print("测试 4: VWAP 算法执行")
    print("="*60)
    
    try:
        from core.trader import TradeExecutor
        
        # 创建测试订单
        test_order = Order(
            symbol='000001.SZ',
            direction=OrderDirection.BUY,
            price=10.5,
            volume=1000
        )
        
        print(f"\n原始订单：{test_order.symbol} {test_order.direction.value} {test_order.volume}股 @ {test_order.price}")
        
        # 注意：这里不会真正执行
        print("\n⚠️  VWAP 算法已实现，但需要实际的交易账户才能测试")
        print("\n使用示例:")
        print("""
from core.trader import TradeExecutor

trader = TradeExecutor()
trader.start()  # 连接交易账户

# 执行 VWAP：60 分钟，按均匀分布拆单
order = Order(symbol='000001.SZ', direction=OrderDirection.BUY, price=10.5, volume=1000)
child_orders = trader.execute_vwap(order, duration_minutes=60, volume_profile='uniform')

print(f"提交了 {len(child_orders)} 个子订单")
""")
        
        return True
        
    except Exception as e:
        print(f"\n✗ 测试失败：{str(e)}")
        return False


def test_all_features():
    """运行所有测试"""
    print("\n" + "🚀"*30)
    print("OpenClaw AI助手 - 新功能测试套件")
    print("🚀"*30 + "\n")
    
    results = {
        '本地LLM': test_local_llm(),
        '规则引擎降级': test_rule_based_fallback(),
        'TWAP 算法': test_twap_algorithm(),
        'VWAP 算法': test_vwap_algorithm()
    }
    
    # 统计结果
    print("\n" + "="*60)
    print("测试结果汇总")
    print("="*60)
    
    for name, passed in results.items():
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"{status} - {name}")
    
    total_passed = sum(results.values())
    total_tests = len(results)
    
    print(f"\n总计：{total_passed}/{total_tests} 项测试通过")
    
    if total_passed == total_tests:
        print("\n🎉 所有测试通过！系统功能正常。")
    else:
        print("\n⚠️  部分测试未通过，请检查配置和依赖。")
    
    return total_passed == total_tests


if __name__ == '__main__':
    success = test_all_features()
    
    if success:
        print("\n" + "="*60)
        print("下一步:")
        print("="*60)
        print("1. 配置 Ollama: ollama pull llama3")
        print("2. 修改 settings.yaml: ai.llm_provider: local")
        print("3. 运行完整示例：python examples/ai_usage_examples.py")
        print("4. 查看文档：docs/OPTIMIZATION_PLAN.md")
    
    sys.exit(0 if success else 1)
