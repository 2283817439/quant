"""
修复排行榜 API 的数据字段访问问题
解决 'amount' 和 'volume' 键访问错误
"""

import sys
import os

# 找到 market_data_api.py 的路径
MARKET_API_PATH = "d:/quant_teade_platform/services/market_data_api.py"

def fix_turnover_ranking():
    """修复成交额榜的字段访问问题"""
    
    with open(MARKET_API_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 修复 get_turnover_ranking 函数
    old_code = '''        # 获取成交额数据
        his = xtdata.get_market_data_ex(["amount"], stock_list, period="1d", count=1)
        amount_series = pd.Series({k: v[-1] if len(v) > 0 else 0 for k, v in his["amount"].items()})
        amount_series = amount_series.dropna().sort_values(ascending=False)'''
    
    new_code = '''        # 获取成交额数据
        try:
            his = xtdata.get_market_data_ex(["amount"], stock_list, period="1d", count=1)
            if "amount" not in his or not his["amount"]:
                print("[rank-api] No amount data available", file=sys.stderr)
                return []
            amount_series = pd.Series({k: (v[-1] if len(v) > 0 else 0) for k, v in his["amount"].items()})
            amount_series = amount_series.dropna().sort_values(ascending=False)
        except KeyError as e:
            print(f"[rank-api] Amount data key error: {e}", file=sys.stderr)
            return []'''
    
    content = content.replace(old_code, new_code)
    
    # 修复 get_turnover_rate_ranking 函数
    old_code2 = '''        # 获取成交量
        his = xtdata.get_market_data_ex(["volume"], stock_list, period="1d", count=1)
        
        # 计算换手率
        turnover = {}
        for stock in stock_list:
            vol = his["volume"].get(stock, [])
            if vol and float_shares.get(stock, 0) > 0:
                turnover[stock] = vol[-1] / float_shares[stock] * 100  # 百分比'''
    
    new_code2 = '''        # 获取成交量
        try:
            his = xtdata.get_market_data_ex(["volume"], stock_list, period="1d", count=1)
            if "volume" not in his or not his["volume"]:
                print("[rank-api] No volume data available", file=sys.stderr)
                return []
            
            # 计算换手率
            turnover = {}
            for stock in stock_list:
                vol_data = his["volume"].get(stock, [])
                if vol_data and float_shares.get(stock, 0) > 0:
                    turnover[stock] = vol_data[-1] / float_shares[stock] * 100  # 百分比
        except KeyError as e:
            print(f"[rank-api] Volume data key error: {e}", file=sys.stderr)
            return []'''
    
    content = content.replace(old_code2, new_code2)
    
    # 写入修改后的内容
    with open(MARKET_API_PATH, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ 已修复成交额榜和换手率榜的字段访问问题")
    print("📝 修改内容:")
    print("   - 添加 KeyError 异常捕获")
    print("   - 添加数据可用性检查")
    print("   - 改进错误日志输出")

if __name__ == "__main__":
    if not os.path.exists(MARKET_API_PATH):
        print(f"❌ 文件不存在：{MARKET_API_PATH}")
        sys.exit(1)
    
    fix_turnover_ranking()
    print("\n⚠️ 注意：需要重启后端服务才能生效")
    print("   请关闭当前的后端窗口，然后重新运行：.\\start_all.bat backend")
