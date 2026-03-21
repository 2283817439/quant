"""
RAG 知识库管理工具
功能：
1. 批量索引回测报告、交易日志
2. 文档添加/删除/查询
3. 知识库统计信息
4. 语义检索测试
"""
import csv
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

# 添加项目根目录到路径
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from config.config import config
from utils.database import get_database_manager
try:
    from ai.sub_models import KnowledgeBase
except ImportError as exc:
    raise ImportError(
        "无法导入 ai.sub_models.KnowledgeBase，请确认已安装内部 AI SDK "
        "或在 PYTHONPATH 中提供该模块。详见 docs/DEPLOYMENT.md。"
    ) from exc

RECORDS_ROOT = PROJECT_ROOT / (config.get("record.file_path", "records") or "records")
BACKTEST_REPORT_FILE = RECORDS_ROOT / "backtest_report_record.csv"


class KnowledgeBaseManager:
    """知识库管理器 - 提供命令行交互界面"""
    
    def __init__(self):
        self.db = get_database_manager(config)
        self.kb = KnowledgeBase(config, self.db)
    
    def _load_backtest_reports(self) -> List[Dict[str, Any]]:
        """优先从数据库加载性能指标，缺失时退回 CSV"""
        records: List[Dict[str, Any]] = []
        if self.db:
            try:
                with self.db.get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        """
                        SELECT date,
                               COALESCE(strategy_name, ?) AS strategy_name,
                               total_return,
                               annual_return,
                               max_drawdown,
                               sharpe_ratio,
                               trade_count,
                               total_pnl,
                               win_rate,
                               profit_factor
                        FROM performance_metrics
                        ORDER BY date DESC
                        LIMIT 200
                        """,
                        [config.get("strategy.class", "Strategy")],
                    )
                    rows = cursor.fetchall()
                records.extend(dict(row) for row in rows)
            except Exception as exc:
                print(f"[WARN] 加载 performance_metrics 失败，改用 CSV：{exc}")
        if not records and BACKTEST_REPORT_FILE.exists():
            try:
                with BACKTEST_REPORT_FILE.open("r", encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        records.append(row)
            except Exception as exc:
                print(f"[WARN] 读取 {BACKTEST_REPORT_FILE} 失败：{exc}")
        return records

    def _load_trade_logs(self, days: int) -> List[Dict[str, Any]]:
        """从 trade_logs 表读取最近 N 天记录"""
        if not self.db:
            return []
        cutoff = datetime.now() - timedelta(days=days)
        try:
            with self.db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT timestamp, level, module, message, extra_data
                    FROM trade_logs
                    WHERE timestamp >= ?
                    ORDER BY timestamp DESC
                    LIMIT 500
                    """,
                    [cutoff],
                )
                rows = cursor.fetchall()
        except Exception as exc:
            print(f"[WARN] 读取 trade_logs 失败：{exc}")
            return []

        logs: List[Dict[str, Any]] = []
        for row in rows:
            payload = row["extra_data"]
            parsed: Dict[str, Any] = {}
            if payload:
                try:
                    parsed = json.loads(payload)
                except json.JSONDecodeError:
                    parsed = {"raw": payload}
            logs.append(
                {
                    "timestamp": row["timestamp"],
                    "level": row["level"],
                    "module": row["module"],
                    "message": row["message"],
                    "extra": parsed,
                }
            )
        return logs
        
    def index_all_backtest_reports(self):
        """索引所有回测报告"""
        print("\n" + "="*60)
        print("索引回测报告")
        print("="*60)
        
        try:
            reports = self._load_backtest_reports()
            if not reports:
                print("⚠️  未找到可索引的回测数据，请确认 performance_metrics 或 CSV 文件。")
                return
            
            for report in reports:
                strategy_name = report.get('strategy_name') or config.get("strategy.class", "Strategy")
                symbols = report.get('symbols') or config.get("strategy.symbols", [])
                symbols_text = ', '.join(symbols) if isinstance(symbols, list) else str(symbols or "")
                start_date = report.get('start_date') or config.get("backtest.start_date", "")
                end_date = report.get('end_date') or report.get('date') or config.get("backtest.end_date", "")
                total_return = float(report.get('total_return') or 0.0)
                annual_return = float(report.get('annual_return') or total_return)
                max_drawdown = float(report.get('max_drawdown') or 0.0)
                sharpe_ratio = float(report.get('sharpe_ratio') or 0.0)
                trade_count = int(float(report.get('trade_count') or 0))
                win_rate = float(report.get('win_rate') or 0.0)
                profit_factor = float(report.get('profit_factor') or 0.0)
                total_pnl = float(report.get('total_pnl') or 0.0)

                text = f"""
回测报告摘要
策略名称：{strategy_name}
标的：{symbols_text or 'N/A'}
时间范围：{start_date} ~ {end_date}

核心指标:
- 总收益：{total_return:.2%}
- 年化收益：{annual_return:.2%}
- 最大回撤：{max_drawdown:.2%}
- 夏普比率：{sharpe_ratio:.2f}
- 交易次数：{trade_count}
- 胜率：{win_rate:.2%}
- 盈亏比：{profit_factor:.2f}
- 累计收益 (货币)：{total_pnl:,.2f}

分析与总结:
策略总体收益 {total_return:.2%}，夏普 {sharpe_ratio:.2f}。最大回撤 {max_drawdown:.2%}，需关注风险控制。
"""
                
                doc_id = self.kb.add_document(
                    doc_text=text,
                    metadata={
                        'type': 'backtest_report',
                        'date': end_date,
                        'strategy': strategy_name,
                        'source': 'backtest_system',
                        'symbols': symbols_text
                    }
                )
                
                if doc_id:
                    print(f"✓ 已索引：{strategy_name} ({end_date}) -> {doc_id}")
            
            print("\n✅ 回测报告索引完成")
            
        except Exception as e:
            print(f"\n❌ 索引失败：{str(e)}")
    
    def index_trade_logs(self, days=30):
        """索引最近 N 天的交易日志"""
        print("\n" + "="*60)
        print(f"索引最近 {days} 天的交易日志")
        print("="*60)
        
        try:
            logs = self._load_trade_logs(days)
            if not logs:
                print("⚠️  未获取到 trade_logs 数据，请确认数据库中有实时日志。")
                return
            
            for log in logs:
                timestamp = log.get('timestamp')
                date_str = timestamp.split(" ")[0] if isinstance(timestamp, str) else str(timestamp)
                level = log.get('level', 'INFO')
                module = log.get('module', 'monitor')
                message = log.get('message', '')
                extra = log.get('extra', {}) or {}
                daily_pnl = float(extra.get('daily_pnl') or extra.get('pnl') or 0.0)
                trade_count = int(extra.get('trade_count') or extra.get('orders') or 0)
                max_drawdown = float(extra.get('max_drawdown') or extra.get('drawdown') or 0.0)
                strategy_name = extra.get('strategy_name') or config.get("strategy.class", "Strategy")
                operations = extra.get('operations') or extra.get('orders') or message
                lessons = extra.get('lessons') or extra.get('insight') or extra.get('risk_note') or "无额外备注。"
                
                text = f"""
交易日志
日期：{date_str}
策略：{strategy_name}

绩效数据:
- 当日收益：{daily_pnl:.2%}
- 交易数量：{trade_count}
- 最大回撤：{max_drawdown:.2%}
- 风险等级：{level}
- 模块：{module}

操作记录:
{operations}

反思总结:
{lessons}
"""
                
                doc_id = self.kb.add_document(
                    doc_text=text,
                    metadata={
                        'type': 'trade_log',
                        'date': date_str,
                        'strategy': strategy_name,
                        'source': module
                    }
                )
                
                if doc_id:
                    print(f"✓ 已索引：{date_str} {strategy_name} -> {doc_id}")
            
            print(f"\n✅ 交易日志索引完成 ({len(logs)} 条)")
            
        except Exception as e:
            print(f"\n❌ 索引失败：{str(e)}")
    
    def add_manual_document(self, text: str, metadata: dict):
        """手动添加文档"""
        print("\n" + "="*60)
        print("添加文档到知识库")
        print("="*60)
        
        doc_id = self.kb.add_document(text, metadata)
        
        if doc_id:
            print(f"\n✅ 文档已添加\nID: {doc_id}")
        else:
            print("\n❌ 添加失败")
    
    def query_knowledge_base(self, question: str):
        """查询知识库"""
        print("\n" + "="*60)
        print(f"查询：{question}")
        print("="*60)
        
        answer = self.kb.query(question, top_k=5)
        
        print(f"\n{answer}")
    
    def show_statistics(self):
        """显示知识库统计信息"""
        print("\n" + "="*60)
        print("知识库统计信息")
        print("="*60)
        
        stats = self.kb.get_statistics()
        
        print(f"\n📊 统计结果:")
        for key, value in stats.items():
            print(f"  {key}: {value}")
    
    def interactive_mode(self):
        """进入交互模式"""
        print("\n" + "="*60)
        print("RAG 知识库管理系统 - 交互模式")
        print("="*60)
        print("\n可用命令:")
        print("  1. index_reports   - 索引回测报告")
        print("  2. index_logs      - 索引交易日志")
        print("  3. add             - 添加文档")
        print("  4. query           - 查询问题")
        print("  5. stats           - 查看统计")
        print("  6. help            - 帮助")
        print("  7. exit            - 退出")
        print("\n输入命令开始操作:\n")
        
        while True:
            try:
                cmd = input(">>> ").strip().lower()
                
                if cmd == 'exit' or cmd == 'quit':
                    print("再见!")
                    break
                
                elif cmd == 'index_reports':
                    self.index_all_backtest_reports()
                
                elif cmd == 'index_logs':
                    self.index_trade_logs()
                
                elif cmd == 'stats':
                    self.show_statistics()
                
                elif cmd == 'query':
                    question = input("请输入问题：").strip()
                    self.query_knowledge_base(question)
                
                elif cmd == 'add':
                    print("请输入文档内容 (输入 END 结束):")
                    lines = []
                    while True:
                        line = input()
                        if line.strip() == 'END':
                            break
                        lines.append(line)
                    
                    text = "\n".join(lines)
                    metadata = {
                        'type': 'manual',
                        'date': datetime.now().strftime('%Y-%m-%d'),
                        'source': 'user_input'
                    }
                    self.add_manual_document(text, metadata)
                
                elif cmd == 'help':
                    print("""
RAG 知识库管理系统

功能说明:
- index_reports: 将历史回测报告向量化存储
- index_logs: 将交易日志向量化存储
- add: 手动添加经验、教训等到知识库
- query: 使用自然语言查询知识库（支持语义检索）
- stats: 查看知识库统计信息

示例:
1. 索引所有回测报告：index_reports
2. 查询："如何提高策略收益率？"
3. 添加文档：add -> 输入内容 -> END

知识库会持续学习，越用越智能!
""")
                
                else:
                    print(f"未知命令：{cmd}，输入 help 查看帮助")
                
            except KeyboardInterrupt:
                print("\n\n再见!")
                break
            except Exception as e:
                print(f"\n错误：{str(e)}")
    
    def shutdown(self):
        """关闭"""
        self.kb.shutdown()


def main():
    """主函数"""
    print("\n" + "🧠"*30)
    print("OpenClaw RAG 知识库管理系统")
    print("🧠"*30 + "\n")
    
    manager = KnowledgeBaseManager()
    
    # 如果提供了命令行参数，执行对应操作
    if len(sys.argv) > 1:
        cmd = sys.argv[1].lower()
        
        if cmd == 'index':
            manager.index_all_backtest_reports()
            manager.index_trade_logs()
        elif cmd == 'demo':
            print("\n演示模式：展示 RAG 查询能力")
            print("="*60)
            
            # 先索引一些数据
            manager.index_all_backtest_reports()
            manager.index_trade_logs()
            
            # 然后查询
            questions = [
                "双均线策略的表现如何？",
                "RSI 策略有什么风险？",
                "如何提高策略的胜率？"
            ]
            
            for q in questions:
                print(f"\n问：{q}")
                manager.query_knowledge_base(q)
                print("-"*60)
        else:
            print(f"未知命令：{cmd}")
            print("用法：python rag_manager.py [index|demo]")
    else:
        # 否则进入交互模式
        manager.interactive_mode()
    
    manager.shutdown()


if __name__ == '__main__':
    main()
