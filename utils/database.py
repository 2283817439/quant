"""
数据库管理器：统一数据持久化层
负责所有交易相关数据的存储、查询和分析
"""
import os
import json
import gzip
import sqlite3
from pathlib import Path
import pandas as pd
import numpy as np
from datetime import datetime, date, time as dt_time, timedelta
from typing import Dict, List, Optional, Tuple, Any
from contextlib import contextmanager

try:
    import mysql.connector as mysql_connector
except ImportError:  # pragma: no cover - optional dependency
    mysql_connector = None

from config.config import ConfigManager
from core.exceptions import DatabaseError
from utils.logger import sys_logger

logger = sys_logger.getChild('Database')
PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _load_env_file(path: Path) -> None:
    """Best-effort .env loader so Python utilities can reuse Node's environment variables."""

    if not path.exists():
        return
    try:
        for line in path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'\"")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception as exc:  # noqa: BLE001 - defensive best effort
        logger.debug("Failed to parse %s: %s", path, exc)

class DatabaseManager:
    """
    数据库管理器
    提供统一的数据库操作接口，支持 SQLite/MySQL 等
    """
    
    def __init__(self, config: ConfigManager):
        """
        初始化数据库管理器
        :param config: 配置管理器实例
        """
        self._config = config
        
        # 数据库配置
        self.db_type = self._config.get('database.type', 'sqlite')
        self.db_path = self._config.get('database.path', 'data/trading.db')
        
        # 确保数据库目录存在
        if self.db_type == 'sqlite':
            db_dir = os.path.dirname(self.db_path)
            if db_dir and not os.path.exists(db_dir):
                os.makedirs(db_dir)
        
        self.conn = None
        self._initialize_database()

    @staticmethod
    def _json_dumps(data: Any) -> Optional[str]:
        """统一处理 JSON 字段写入"""
        if data is None:
            return None
        if isinstance(data, str):
            return data
        try:
            return json.dumps(data, ensure_ascii=False, default=str)
        except TypeError:
            return json.dumps(str(data), ensure_ascii=False)
        
    @contextmanager
    def get_connection(self):
        """获取数据库连接上下文管理器"""
        conn = None
        try:
            if self.db_type == 'sqlite':
                conn = sqlite3.connect(self.db_path, timeout=30.0)
                conn.row_factory = sqlite3.Row  # 支持字典访问
            # TODO: 支持 MySQL 等其他数据库
            # elif self.db_type == 'mysql':
            #     conn = pymysql.connect(...)
            
            yield conn
        except Exception as e:
            logger.error("Database connection error: %s", str(e), exc_info=True)
            raise DatabaseError(f"数据库连接失败：{str(e)}") from e
        finally:
            if conn:
                conn.close()
    
    def _initialize_database(self):
        """初始化数据库表结构"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # 1. 交易日志表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS trade_logs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp DATETIME NOT NULL,
                        level TEXT NOT NULL,
                        module TEXT NOT NULL,
                        message TEXT,
                        extra_data TEXT
                    )
                ''')
                
                # 2. 订单记录表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS orders (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        order_id INTEGER UNIQUE NOT NULL,
                        strategy_id TEXT,
                        symbol TEXT NOT NULL,
                        direction TEXT NOT NULL,
                        order_type TEXT NOT NULL,
                        price REAL NOT NULL,
                        volume INTEGER NOT NULL,
                        filled_volume INTEGER DEFAULT 0,
                        filled_price REAL DEFAULT 0,
                        status TEXT NOT NULL,
                        create_time DATETIME NOT NULL,
                        update_time DATETIME,
                        remark TEXT
                    )
                ''')
                
                # 3. 持仓记录表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS positions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT UNIQUE NOT NULL,
                        total_volume INTEGER NOT NULL,
                        available_volume INTEGER NOT NULL,
                        avg_price REAL NOT NULL,
                        current_price REAL DEFAULT 0,
                        market_value REAL DEFAULT 0,
                        float_pnl REAL DEFAULT 0,
                        entry_date DATE,
                        highest_price REAL DEFAULT 0,
                        highest_date DATE,
                        update_time DATETIME
                    )
                ''')
                
                # 4. 资金账户表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS accounts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        account_id TEXT UNIQUE NOT NULL,
                        total_asset REAL NOT NULL,
                        available_cash REAL NOT NULL,
                        frozen_cash REAL DEFAULT 0,
                        market_value REAL DEFAULT 0,
                        update_time DATETIME
                    )
                ''')
                
                # 5. 策略信号表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS strategy_signals (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        strategy_name TEXT NOT NULL,
                        symbol TEXT NOT NULL,
                        signal_type TEXT NOT NULL,
                        signal_strength REAL,
                        price REAL,
                        volume INTEGER,
                        reason TEXT,
                        create_time DATETIME NOT NULL,
                        executed BOOLEAN DEFAULT FALSE,
                        execute_time DATETIME
                    )
                ''')
                
                # 6. 绩效指标表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS performance_metrics (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        date DATE NOT NULL,
                        strategy_name TEXT NOT NULL,
                        total_return REAL,
                        daily_return REAL,
                        max_drawdown REAL,
                        sharpe_ratio REAL,
                        win_rate REAL,
                        profit_factor REAL,
                        trade_count INTEGER,
                        total_pnl REAL,
                        create_time DATETIME
                    )
                ''')
                
                # 7. 风控事件表
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS risk_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        event_type TEXT NOT NULL,
                        symbol TEXT,
                        order_id INTEGER,
                        trigger_value REAL,
                        threshold_value REAL,
                        action TEXT,
                        result TEXT,
                        create_time DATETIME
                    )
                ''')
                
                # 8. 市场数据表（缓存历史行情）
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS market_data (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT NOT NULL,
                        date DATE NOT NULL,
                        open REAL,
                        high REAL,
                        low REAL,
                        close REAL,
                        volume INTEGER,
                        amount REAL,
                        create_time DATETIME,
                        UNIQUE(symbol, date)
                    )
                ''')

                # 9. AI 监控股票池（待触发）
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS pc_monitor_pool (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        symbol TEXT NOT NULL,
                        name TEXT,
                        exchange TEXT,
                        status TEXT NOT NULL DEFAULT 'monitoring',
                        quantity INTEGER NOT NULL DEFAULT 0,
                        buy_price REAL,
                        buy_price_type TEXT NOT NULL DEFAULT 'custom',
                        sell_price REAL,
                        sell_price_type TEXT NOT NULL DEFAULT 'custom',
                        dynamic_take_profit REAL,
                        dynamic_stop_loss REAL,
                        time_limit_minutes INTEGER,
                        last_price REAL,
                        last_check DATETIME,
                        triggered_side TEXT,
                        target_account TEXT,
                        order_strategy TEXT,
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                ''')

                # 10. AI 监控股票池（已成交归档）
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS pc_monitor_filled (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        monitor_id INTEGER,
                        symbol TEXT NOT NULL,
                        name TEXT,
                        side TEXT NOT NULL,
                        quantity INTEGER NOT NULL,
                        trigger_price REAL,
                        execution_price REAL,
                        order_id TEXT,
                        status TEXT NOT NULL,
                        filled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        extra TEXT,
                        FOREIGN KEY(monitor_id) REFERENCES pc_monitor_pool(id)
                    )
                ''')

                # 11. AI Agent 定义
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS ai_agents (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        provider TEXT NOT NULL,
                        model TEXT,
                        config TEXT,
                        is_active INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                ''')

                # 12. AI 技能元数据
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS ai_skills (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        version TEXT NOT NULL DEFAULT '1.0.0',
                        description TEXT,
                        runtime TEXT NOT NULL DEFAULT 'python',
                        entrypoint TEXT NOT NULL,
                        parameters_schema TEXT,
                        tags TEXT,
                        checksum TEXT,
                        file_path TEXT,
                        enabled INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_loaded_at DATETIME
                    )
                ''')

                # 13. AI 工作流定义
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS ai_workflows (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        code TEXT UNIQUE NOT NULL,
                        name TEXT NOT NULL,
                        description TEXT,
                        schedule_cron TEXT,
                        timezone TEXT DEFAULT 'Asia/Shanghai',
                        is_enabled INTEGER NOT NULL DEFAULT 1,
                        max_concurrency INTEGER DEFAULT 1,
                        default_agent TEXT,
                        budget_limit REAL,
                        timeout_seconds INTEGER,
                        config TEXT,
                        last_run_at DATETIME,
                        next_run_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                ''')

                # 14. AI 工作流运行记录
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS ai_workflow_runs (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        workflow_id INTEGER NOT NULL,
                        status TEXT NOT NULL,
                        trigger_type TEXT NOT NULL,
                        trigger_payload TEXT,
                        started_at DATETIME,
                        finished_at DATETIME,
                        cost REAL DEFAULT 0,
                        result TEXT,
                        error TEXT,
                        retry_count INTEGER DEFAULT 0,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(workflow_id) REFERENCES ai_workflows(id)
                    )
                ''')

                # 15. AI 工作流任务
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS ai_workflow_tasks (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        run_id INTEGER NOT NULL,
                        parent_task_id INTEGER,
                        step_name TEXT,
                        adapter TEXT NOT NULL,
                        skill_name TEXT,
                        status TEXT NOT NULL,
                        attempt INTEGER DEFAULT 0,
                        input_payload TEXT,
                        output_payload TEXT,
                        error TEXT,
                        started_at DATETIME,
                        finished_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(run_id) REFERENCES ai_workflow_runs(id),
                        FOREIGN KEY(parent_task_id) REFERENCES ai_workflow_tasks(id)
                    )
                ''')

                # 16. AI 事件日志
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS ai_events (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        run_id INTEGER,
                        task_id INTEGER,
                        event_type TEXT NOT NULL,
                        level TEXT DEFAULT 'INFO',
                        message TEXT NOT NULL,
                        payload TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY(run_id) REFERENCES ai_workflow_runs(id),
                        FOREIGN KEY(task_id) REFERENCES ai_workflow_tasks(id)
                    )
                ''')
                
                # 创建索引
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_positions_symbol ON positions(symbol)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_signals_strategy ON strategy_signals(strategy_name)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_performance_date ON performance_metrics(date)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_market_data_symbol_date ON market_data(symbol, date)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_monitor_pool_status ON pc_monitor_pool(status)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_monitor_pool_symbol ON pc_monitor_pool(symbol)')
                cursor.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_skills_name_version ON ai_skills(name, version)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_ai_workflows_code ON ai_workflows(code)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_ai_workflow_runs_workflow ON ai_workflow_runs(workflow_id, status)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_ai_tasks_run ON ai_workflow_tasks(run_id)')
                cursor.execute('CREATE INDEX IF NOT EXISTS idx_ai_events_run ON ai_events(run_id)')
                
                conn.commit()
                logger.info("Database schema initialized")
                
        except Exception as e:
            logger.error("Database initialization failed: %s", str(e), exc_info=True)
            raise DatabaseError(f"数据库初始化失败：{str(e)}") from e
    
    def log_trade_event(self, level: str, module: str, message: str, extra: Optional[Dict[str, Any]] = None) -> int:
        """记录交易监听或实时操作发生的事件"""
        level_text = (level or "INFO").upper()
        module_text = module or "monitor"
        payload = json.dumps(extra, ensure_ascii=False, default=str) if extra else None
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    '''
                    INSERT INTO trade_logs (timestamp, level, module, message, extra_data)
                    VALUES (?, ?, ?, ?, ?)
                    ''',
                    (datetime.now(), level_text, module_text, message, payload)
                )
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to log trade event: %s", str(e), exc_info=True)
            raise DatabaseError(f"记录交易事件失败：{str(e)}") from e
    
    # ==================== 订单管理 ====================
    def insert_order(self, order_data: Dict) -> int:
        """插入订单记录"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO orders (order_id, strategy_id, symbol, direction, order_type, 
                                      price, volume, filled_volume, filled_price, status, 
                                      create_time, update_time, remark)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    order_data.get('order_id'),
                    order_data.get('strategy_id'),
                    order_data.get('symbol'),
                    order_data.get('direction'),
                    order_data.get('order_type'),
                    order_data.get('price'),
                    order_data.get('volume'),
                    order_data.get('filled_volume', 0),
                    order_data.get('filled_price', 0),
                    order_data.get('status'),
                    order_data.get('create_time'),
                    order_data.get('update_time'),
                    order_data.get('remark')
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to insert order: %s", str(e), exc_info=True)
            raise DatabaseError(f"插入订单失败：{str(e)}") from e
    
    def update_order(self, order_id: int, update_data: Dict) -> bool:
        """更新订单状态"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                set_clause = ', '.join([f"{k} = ?" for k in update_data.keys()])
                values = list(update_data.values()) + [order_id]
                
                cursor.execute(f'''
                    UPDATE orders 
                    SET {set_clause}, update_time = ?
                    WHERE order_id = ?
                ''', values + [datetime.now()])
                
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error("Failed to update order: %s", str(e), exc_info=True)
            raise DatabaseError(f"更新订单失败：{str(e)}") from e
    
    def get_orders(self, symbol: str = None, status: str = None, 
                   start_date: date = None, end_date: date = None) -> pd.DataFrame:
        """查询订单记录"""
        try:
            query = "SELECT * FROM orders WHERE 1=1"
            params = []
            
            if symbol:
                query += " AND symbol = ?"
                params.append(symbol)
            if status:
                query += " AND status = ?"
                params.append(status)
            if start_date:
                query += " AND date(create_time) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND date(create_time) <= ?"
                params.append(end_date)
            
            query += " ORDER BY create_time DESC"
            
            with self.get_connection() as conn:
                return pd.read_sql_query(query, conn, params=params)
        except Exception as e:
            logger.error("Failed to query orders: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询订单失败：{str(e)}") from e
    
    # ==================== 持仓管理 ====================
    def upsert_position(self, position_data: Dict) -> int:
        """插入或更新持仓记录"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO positions (symbol, total_volume, available_volume, avg_price,
                                         current_price, market_value, float_pnl, entry_date,
                                         highest_price, highest_date, update_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(symbol) DO UPDATE SET
                        total_volume = excluded.total_volume,
                        available_volume = excluded.available_volume,
                        avg_price = excluded.avg_price,
                        current_price = excluded.current_price,
                        market_value = excluded.market_value,
                        float_pnl = excluded.float_pnl,
                        update_time = excluded.update_time
                ''', (
                    position_data.get('symbol'),
                    position_data.get('total_volume'),
                    position_data.get('available_volume'),
                    position_data.get('avg_price'),
                    position_data.get('current_price'),
                    position_data.get('market_value'),
                    position_data.get('float_pnl'),
                    position_data.get('entry_date'),
                    position_data.get('highest_price'),
                    position_data.get('highest_date'),
                    position_data.get('update_time', datetime.now())
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to upsert position: %s", str(e), exc_info=True)
            raise DatabaseError(f"更新持仓失败：{str(e)}") from e
    
    def get_positions(self, symbol: str = None) -> pd.DataFrame:
        """查询持仓记录"""
        try:
            query = "SELECT * FROM positions"
            params = []
            
            if symbol:
                query += " WHERE symbol = ?"
                params.append(symbol)
            
            with self.get_connection() as conn:
                return pd.read_sql_query(query, conn, params=params)
        except Exception as e:
            logger.error("Failed to query positions: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询持仓失败：{str(e)}") from e
    
    # ==================== 资金管理 ====================
    def update_account(self, account_data: Dict) -> int:
        """更新资金账户"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO accounts (account_id, total_asset, available_cash, 
                                        frozen_cash, market_value, update_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(account_id) DO UPDATE SET
                        total_asset = excluded.total_asset,
                        available_cash = excluded.available_cash,
                        frozen_cash = excluded.frozen_cash,
                        market_value = excluded.market_value,
                        update_time = excluded.update_time
                ''', (
                    account_data.get('account_id'),
                    account_data.get('total_asset'),
                    account_data.get('available_cash'),
                    account_data.get('frozen_cash'),
                    account_data.get('market_value'),
                    account_data.get('update_time', datetime.now())
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to update account: %s", str(e), exc_info=True)
            raise DatabaseError(f"更新账户失败：{str(e)}") from e

    def get_latest_account(self) -> Optional[Dict[str, Any]]:
        """查询最新的资金账户快照"""
        try:
            with self.get_connection() as conn:
                cursor = conn.execute(
                    "SELECT * FROM accounts ORDER BY COALESCE(update_time, datetime('now')) DESC LIMIT 1"
                )
                row = cursor.fetchone()
                if row:
                    return dict(row)
                return None
        except Exception as e:
            logger.error("Failed to load latest account snapshot: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询账户失败：{str(e)}") from e
    
    # ==================== 策略信号管理 ====================
    def insert_signal(self, signal_data: Dict) -> int:
        """插入策略信号"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO strategy_signals (strategy_name, symbol, signal_type, 
                                                 signal_strength, price, volume, reason, 
                                                 create_time, executed, execute_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    signal_data.get('strategy_name'),
                    signal_data.get('symbol'),
                    signal_data.get('signal_type'),
                    signal_data.get('signal_strength'),
                    signal_data.get('price'),
                    signal_data.get('volume'),
                    signal_data.get('reason'),
                    signal_data.get('create_time', datetime.now()),
                    signal_data.get('executed', False),
                    signal_data.get('execute_time')
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to insert signal: %s", str(e), exc_info=True)
            raise DatabaseError(f"插入信号失败：{str(e)}") from e
    
    def update_signal_executed(self, signal_id: int, execute_time: datetime) -> bool:
        """标记信号已执行"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE strategy_signals 
                    SET executed = TRUE, execute_time = ?
                    WHERE id = ?
                ''', (execute_time, signal_id))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error("Failed to update signal status: %s", str(e), exc_info=True)
            raise DatabaseError(f"更新信号状态失败：{str(e)}") from e
    
    # ==================== 绩效管理 ====================
    def insert_performance(self, metrics_data: Dict) -> int:
        """插入绩效指标"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO performance_metrics (date, strategy_name, total_return, 
                                                    daily_return, max_drawdown, sharpe_ratio,
                                                    win_rate, profit_factor, trade_count, 
                                                    total_pnl, create_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    metrics_data.get('date'),
                    metrics_data.get('strategy_name'),
                    metrics_data.get('total_return'),
                    metrics_data.get('daily_return'),
                    metrics_data.get('max_drawdown'),
                    metrics_data.get('sharpe_ratio'),
                    metrics_data.get('win_rate'),
                    metrics_data.get('profit_factor'),
                    metrics_data.get('trade_count'),
                    metrics_data.get('total_pnl'),
                    metrics_data.get('create_time', datetime.now())
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to insert performance metrics: %s", str(e), exc_info=True)
            raise DatabaseError(f"插入绩效失败：{str(e)}") from e
    
    def get_performance_history(self, strategy_name: str = None, 
                               start_date: date = None, 
                               end_date: date = None) -> pd.DataFrame:
        """查询绩效历史"""
        try:
            query = "SELECT * FROM performance_metrics WHERE 1=1"
            params = []
            
            if strategy_name:
                query += " AND strategy_name = ?"
                params.append(strategy_name)
            if start_date:
                query += " AND date >= ?"
                params.append(start_date)
            if end_date:
                query += " AND date <= ?"
                params.append(end_date)
            
            query += " ORDER BY date DESC"
            
            with self.get_connection() as conn:
                return pd.read_sql_query(query, conn, params=params)
        except Exception as e:
            logger.error("Failed to query performance history: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询绩效失败：{str(e)}") from e
    
    # ==================== 风控事件管理 ====================
    def insert_risk_event(self, event_data: Dict) -> int:
        """插入风控事件"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO risk_events (event_type, symbol, order_id, trigger_value, 
                                           threshold_value, action, result, create_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    event_data.get('event_type'),
                    event_data.get('symbol'),
                    event_data.get('order_id'),
                    event_data.get('trigger_value'),
                    event_data.get('threshold_value'),
                    event_data.get('action'),
                    event_data.get('result'),
                    event_data.get('create_time', datetime.now())
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to insert risk event: %s", str(e), exc_info=True)
            raise DatabaseError(f"插入风控事件失败：{str(e)}") from e
    
    # ==================== 市场数据管理 ====================
    def insert_market_data(self, data_list: List[Dict]) -> int:
        """批量插入市场数据"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.executemany('''
                    INSERT OR REPLACE INTO market_data 
                    (symbol, date, open, high, low, close, volume, amount, create_time)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', [
                    (
                        data.get('symbol'),
                        data.get('date'),
                        data.get('open'),
                        data.get('high'),
                        data.get('low'),
                        data.get('close'),
                        data.get('volume'),
                        data.get('amount'),
                        datetime.now()
                    ) for data in data_list
                ])
                conn.commit()
                return cursor.rowcount
        except Exception as e:
            logger.error("Failed to bulk insert market data: %s", str(e), exc_info=True)
            raise DatabaseError(f"批量插入市场数据失败：{str(e)}") from e
    
    def get_market_data(self, symbol: str, start_date: date, end_date: date) -> pd.DataFrame:
        """查询市场数据"""
        try:
            query = '''
                SELECT * FROM market_data 
                WHERE symbol = ? AND date BETWEEN ? AND ?
                ORDER BY date ASC
            '''
            with self.get_connection() as conn:
                return pd.read_sql_query(query, conn, params=[symbol, start_date, end_date])
        except Exception as e:
            logger.error("Failed to query market data: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询市场数据失败：{str(e)}") from e
    
    # ==================== 统计分析 ====================
    def get_trade_statistics(self, symbol: str = None, 
                           start_date: date = None, 
                           end_date: date = None) -> Dict:
        """获取交易统计信息"""
        try:
            query = '''
                SELECT 
                    COUNT(*) as total_trades,
                    SUM(CASE WHEN status = 'FILLED' THEN 1 ELSE 0 END) as filled_trades,
                    AVG(filled_price) as avg_price,
                    SUM(filled_volume) as total_volume
                FROM orders 
                WHERE 1=1
            '''
            params = []
            
            if symbol:
                query += " AND symbol = ?"
                params.append(symbol)
            if start_date:
                query += " AND date(create_time) >= ?"
                params.append(start_date)
            if end_date:
                query += " AND date(create_time) <= ?"
                params.append(end_date)
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                row = cursor.fetchone()
                return dict(row) if row else {}
        except Exception as e:
            logger.error("Failed to get trade statistics: %s", str(e), exc_info=True)
            raise DatabaseError(f"获取交易统计失败：{str(e)}") from e
    
    def export_to_csv(self, table_name: str, output_path: str) -> bool:
        """导出表数据到 CSV"""
        try:
            with self.get_connection() as conn:
                query = f"SELECT * FROM {table_name}"
                df = pd.read_sql_query(query, conn)
                df.to_csv(output_path, index=False, encoding='utf-8-sig')
                logger.info("Exported table %s to %s", table_name, output_path)
                return True
        except Exception as e:
            logger.error("Failed to export data: %s", str(e), exc_info=True)
            raise DatabaseError(f"导出数据失败：{str(e)}") from e
    
    def backup_database(self, backup_path: str) -> bool:
        """备份数据库"""
        try:
            import shutil
            if self.db_type == 'sqlite':
                shutil.copy2(self.db_path, backup_path)
                logger.info("Database backed up to %s", backup_path)
                return True
            else:
                logger.warning("Unsupported database type: %s", self.db_type)
                return False
        except Exception as e:
            logger.error("Failed to back up database: %s", str(e), exc_info=True)
            raise DatabaseError(f"备份数据库失败：{str(e)}") from e
    
    def clear_old_data(self, days: int = 30) -> int:
        """清理旧数据"""
        try:
            cutoff_date = (datetime.now() - timedelta(days=days)).date()
            
            with self.get_connection() as conn:
                cursor = conn.cursor()
                
                # 清理旧订单
                cursor.execute('DELETE FROM orders WHERE date(create_time) < ?', [cutoff_date])
                deleted = cursor.rowcount
                
                # 清理旧日志
                cursor.execute('DELETE FROM trade_logs WHERE date(timestamp) < ?', [cutoff_date])
                deleted += cursor.rowcount
                
                conn.commit()
                logger.info("Cleared %d old records", deleted)
                return deleted
        except Exception as e:
            logger.error("Failed to clear old data: %s", str(e), exc_info=True)
            raise DatabaseError(f"清理旧数据失败：{str(e)}") from e

    # ==================== AI 工作流 / 技能管理 ====================
    def upsert_ai_skill(self, skill_data: Dict[str, Any]) -> int:
        """注册或更新技能元数据"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                params_schema = self._json_dumps(skill_data.get('parameters_schema'))
                tags_payload = self._json_dumps(skill_data.get('tags'))
                enabled = 1 if skill_data.get('enabled', True) else 0
                last_loaded = skill_data.get('last_loaded_at')
                checksum = skill_data.get('checksum')
                cursor.execute('''
                    INSERT INTO ai_skills (
                        name, version, description, runtime, entrypoint,
                        parameters_schema, tags, checksum, file_path,
                        enabled, last_loaded_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(name, version) DO UPDATE SET
                        description = excluded.description,
                        runtime = excluded.runtime,
                        entrypoint = excluded.entrypoint,
                        parameters_schema = excluded.parameters_schema,
                        tags = excluded.tags,
                        checksum = excluded.checksum,
                        file_path = excluded.file_path,
                        enabled = excluded.enabled,
                        updated_at = excluded.updated_at,
                        last_loaded_at = COALESCE(excluded.last_loaded_at, ai_skills.last_loaded_at)
                ''', (
                    skill_data.get('name'),
                    skill_data.get('version', '1.0.0'),
                    skill_data.get('description'),
                    skill_data.get('runtime', 'python'),
                    skill_data.get('entrypoint'),
                    params_schema,
                    tags_payload,
                    checksum,
                    skill_data.get('file_path'),
                    enabled,
                    last_loaded,
                    datetime.now()
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to upsert ai skill: %s", str(e), exc_info=True)
            raise DatabaseError(f"注册 AI 技能失败：{str(e)}") from e

    def list_ai_skills(self, enabled_only: bool = True) -> List[Dict[str, Any]]:
        """列出技能"""
        try:
            query = "SELECT * FROM ai_skills"
            params: List[Any] = []
            if enabled_only:
                query += " WHERE enabled = 1"
            query += " ORDER BY name ASC, version DESC"
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall()
                result: List[Dict[str, Any]] = []
                for row in rows:
                    record = dict(row)
                    for field in ('parameters_schema', 'tags'):
                        if record.get(field):
                            try:
                                record[field] = json.loads(record[field])
                            except json.JSONDecodeError:
                                pass
                    result.append(record)
                return result
        except Exception as e:
            logger.error("Failed to list ai skills: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询 AI 技能失败：{str(e)}") from e

    def upsert_ai_workflow(self, workflow_data: Dict[str, Any]) -> int:
        """创建或更新工作流定义"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                config_payload = self._json_dumps(workflow_data.get('config'))
                enabled = 1 if workflow_data.get('is_enabled', True) else 0
                cursor.execute('''
                    INSERT INTO ai_workflows (
                        code, name, description, schedule_cron, timezone,
                        is_enabled, max_concurrency, default_agent, budget_limit,
                        timeout_seconds, config, last_run_at, next_run_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(code) DO UPDATE SET
                        name = excluded.name,
                        description = excluded.description,
                        schedule_cron = excluded.schedule_cron,
                        timezone = excluded.timezone,
                        is_enabled = excluded.is_enabled,
                        max_concurrency = excluded.max_concurrency,
                        default_agent = excluded.default_agent,
                        budget_limit = excluded.budget_limit,
                        timeout_seconds = excluded.timeout_seconds,
                        config = excluded.config,
                        last_run_at = COALESCE(excluded.last_run_at, ai_workflows.last_run_at),
                        next_run_at = excluded.next_run_at,
                        updated_at = excluded.updated_at
                ''', (
                    workflow_data.get('code'),
                    workflow_data.get('name'),
                    workflow_data.get('description'),
                    workflow_data.get('schedule_cron'),
                    workflow_data.get('timezone', 'Asia/Shanghai'),
                    enabled,
                    workflow_data.get('max_concurrency', 1),
                    workflow_data.get('default_agent'),
                    workflow_data.get('budget_limit'),
                    workflow_data.get('timeout_seconds'),
                    config_payload,
                    workflow_data.get('last_run_at'),
                    workflow_data.get('next_run_at'),
                    datetime.now()
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to upsert ai workflow: %s", str(e), exc_info=True)
            raise DatabaseError(f"注册 AI 工作流失败：{str(e)}") from e

    def update_ai_workflow(self, code: str, update_data: Dict[str, Any]) -> bool:
        """更新工作流属性（如下次运行时间、状态）"""
        try:
            payload = dict(update_data)
            if 'config' in payload:
                payload['config'] = self._json_dumps(payload['config'])
            payload['updated_at'] = datetime.now()
            set_clause = ', '.join([f"{k} = ?" for k in payload.keys()])
            values = list(payload.values()) + [code]
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(f'''
                    UPDATE ai_workflows
                    SET {set_clause}
                    WHERE code = ?
                ''', values)
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error("Failed to update ai workflow: %s", str(e), exc_info=True)
            raise DatabaseError(f"更新 AI 工作流失败：{str(e)}") from e

    def list_ai_workflows(self, enabled_only: bool = False) -> List[Dict[str, Any]]:
        """列出工作流"""
        try:
            query = "SELECT * FROM ai_workflows"
            params: List[Any] = []
            if enabled_only:
                query += " WHERE is_enabled = 1"
            query += " ORDER BY code ASC"
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall()
                records: List[Dict[str, Any]] = []
                for row in rows:
                    record = dict(row)
                    if record.get('config'):
                        try:
                            record['config'] = json.loads(record['config'])
                        except json.JSONDecodeError:
                            pass
                    records.append(record)
                return records
        except Exception as e:
            logger.error("Failed to list ai workflows: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询 AI 工作流失败：{str(e)}") from e

    def get_ai_workflow_by_code(self, code: str) -> Optional[Dict[str, Any]]:
        """根据 code 获取工作流"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM ai_workflows WHERE code = ? LIMIT 1",
                    (code,)
                )
                row = cursor.fetchone()
                if not row:
                    return None
                record = dict(row)
                if record.get('config'):
                    try:
                        record['config'] = json.loads(record['config'])
                    except json.JSONDecodeError:
                        pass
                return record
        except Exception as e:
            logger.error("Failed to load ai workflow: %s", str(e), exc_info=True)
            raise DatabaseError(f"获取 AI 工作流失败：{str(e)}") from e

    def get_ai_workflow_run(self, run_id: int) -> Optional[Dict[str, Any]]:
        """获取单个工作流运行"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT * FROM ai_workflow_runs WHERE id = ? LIMIT 1",
                    (run_id,)
                )
                row = cursor.fetchone()
                if not row:
                    return None
                record = dict(row)
                for field in ('trigger_payload', 'result'):
                    if record.get(field):
                        try:
                            record[field] = json.loads(record[field])
                        except json.JSONDecodeError:
                            pass
                return record
        except Exception as e:
            logger.error("Failed to load ai workflow run: %s", str(e), exc_info=True)
            raise DatabaseError(f"获取 AI 工作流运行失败：{str(e)}") from e

    def list_ai_workflow_runs(
        self,
        status: Optional[str] = None,
        workflow_id: Optional[int] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """列出工作流运行记录"""
        try:
            query = "SELECT * FROM ai_workflow_runs WHERE 1=1"
            params: List[Any] = []
            if status:
                query += " AND status = ?"
                params.append(status)
            if workflow_id:
                query += " AND workflow_id = ?"
                params.append(workflow_id)
            query += " ORDER BY id DESC LIMIT ?"
            params.append(limit)

            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall()
                results: List[Dict[str, Any]] = []
                for row in rows:
                    record = dict(row)
                    for field in ('trigger_payload', 'result'):
                        if record.get(field):
                            try:
                                record[field] = json.loads(record[field])
                            except json.JSONDecodeError:
                                pass
                    results.append(record)
                return results
        except Exception as e:
            logger.error("Failed to list ai workflow runs: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询 AI 工作流运行失败：{str(e)}") from e

    def list_ai_tasks(
        self,
        run_id: Optional[int] = None,
        status: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """列出任务"""
        try:
            query = "SELECT * FROM ai_workflow_tasks WHERE 1=1"
            params: List[Any] = []
            if run_id:
                query += " AND run_id = ?"
                params.append(run_id)
            if status:
                query += " AND status = ?"
                params.append(status)
            query += " ORDER BY id ASC LIMIT ?"
            params.append(limit)

            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall()
                tasks: List[Dict[str, Any]] = []
                for row in rows:
                    record = dict(row)
                    for field in ('input_payload', 'output_payload'):
                        if record.get(field):
                            try:
                                record[field] = json.loads(record[field])
                            except json.JSONDecodeError:
                                pass
                    tasks.append(record)
                return tasks
        except Exception as e:
            logger.error("Failed to list ai workflow tasks: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询 AI 工作流任务失败：{str(e)}") from e

    def list_ai_events(
        self,
        run_id: Optional[int] = None,
        task_id: Optional[int] = None,
        limit: int = 200
    ) -> List[Dict[str, Any]]:
        """列出事件日志"""
        try:
            query = "SELECT * FROM ai_events WHERE 1=1"
            params: List[Any] = []
            if run_id:
                query += " AND run_id = ?"
                params.append(run_id)
            if task_id:
                query += " AND task_id = ?"
                params.append(task_id)
            query += " ORDER BY id ASC LIMIT ?"
            params.append(limit)

            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(query, params)
                rows = cursor.fetchall()
                events: List[Dict[str, Any]] = []
                for row in rows:
                    record = dict(row)
                    if record.get('payload'):
                        try:
                            record['payload'] = json.loads(record['payload'])
                        except json.JSONDecodeError:
                            pass
                    events.append(record)
                return events
        except Exception as e:
            logger.error("Failed to list ai events: %s", str(e), exc_info=True)
            raise DatabaseError(f"查询 AI 工作流事件失败：{str(e)}") from e

    def insert_ai_workflow_run(self, run_data: Dict[str, Any]) -> int:
        """创建工作流运行记录"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                trigger_payload = self._json_dumps(run_data.get('trigger_payload'))
                result_payload = self._json_dumps(run_data.get('result'))
                cursor.execute('''
                    INSERT INTO ai_workflow_runs (
                        workflow_id, status, trigger_type, trigger_payload,
                        started_at, finished_at, cost, result, error, retry_count
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    run_data.get('workflow_id'),
                    run_data.get('status', 'pending'),
                    run_data.get('trigger_type', 'manual'),
                    trigger_payload,
                    run_data.get('started_at'),
                    run_data.get('finished_at'),
                    run_data.get('cost', 0),
                    result_payload,
                    run_data.get('error'),
                    run_data.get('retry_count', 0)
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to insert ai workflow run: %s", str(e), exc_info=True)
            raise DatabaseError(f"创建 AI 工作流运行失败：{str(e)}") from e

    def update_ai_workflow_run(self, run_id: int, update_data: Dict[str, Any]) -> bool:
        """更新工作流运行状态"""
        try:
            payload = dict(update_data)
            for key in ('trigger_payload', 'result'):
                if key in payload:
                    payload[key] = self._json_dumps(payload[key])
            set_clause = ', '.join([f"{k} = ?" for k in payload.keys()])
            values = list(payload.values()) + [run_id]
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(f'''
                    UPDATE ai_workflow_runs
                    SET {set_clause}
                    WHERE id = ?
                ''', values)
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error("Failed to update ai workflow run: %s", str(e), exc_info=True)
            raise DatabaseError(f"更新 AI 工作流运行失败：{str(e)}") from e

    def insert_ai_task(self, task_data: Dict[str, Any]) -> int:
        """新增工作流任务"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                input_payload = self._json_dumps(task_data.get('input_payload'))
                output_payload = self._json_dumps(task_data.get('output_payload'))
                cursor.execute('''
                    INSERT INTO ai_workflow_tasks (
                        run_id, parent_task_id, step_name, adapter, skill_name,
                        status, attempt, input_payload, output_payload, error,
                        started_at, finished_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    task_data.get('run_id'),
                    task_data.get('parent_task_id'),
                    task_data.get('step_name'),
                    task_data.get('adapter'),
                    task_data.get('skill_name'),
                    task_data.get('status', 'pending'),
                    task_data.get('attempt', 0),
                    input_payload,
                    output_payload,
                    task_data.get('error'),
                    task_data.get('started_at'),
                    task_data.get('finished_at')
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to insert ai task: %s", str(e), exc_info=True)
            raise DatabaseError(f"创建 AI 任务失败：{str(e)}") from e

    def update_ai_task(self, task_id: int, update_data: Dict[str, Any]) -> bool:
        """更新任务状态"""
        try:
            payload = dict(update_data)
            for key in ('input_payload', 'output_payload'):
                if key in payload:
                    payload[key] = self._json_dumps(payload[key])
            set_clause = ', '.join([f"{k} = ?" for k in payload.keys()])
            values = list(payload.values()) + [task_id]
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(f'''
                    UPDATE ai_workflow_tasks
                    SET {set_clause}
                    WHERE id = ?
                ''', values)
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            logger.error("Failed to update ai task: %s", str(e), exc_info=True)
            raise DatabaseError(f"更新 AI 任务失败：{str(e)}") from e

    def append_ai_event(self, event_data: Dict[str, Any]) -> int:
        """记录 AI 工作流事件"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                payload = self._json_dumps(event_data.get('payload'))
                cursor.execute('''
                    INSERT INTO ai_events (run_id, task_id, event_type, level, message, payload)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (
                    event_data.get('run_id'),
                    event_data.get('task_id'),
                    event_data.get('event_type'),
                    event_data.get('level', 'INFO'),
                    event_data.get('message'),
                    payload
                ))
                conn.commit()
                return cursor.lastrowid
        except Exception as e:
            logger.error("Failed to append ai event: %s", str(e), exc_info=True)
            raise DatabaseError(f"记录 AI 事件失败：{str(e)}") from e


# 全局数据库实例
_db_manager: Optional[DatabaseManager] = None

def get_database_manager(config: ConfigManager = None) -> DatabaseManager:
    """获取全局数据库管理器实例"""
    global _db_manager
    if _db_manager is None:
        if config is None:
            raise DatabaseError("首次调用必须提供 config 参数")
        _db_manager = DatabaseManager(config)
    return _db_manager


class PaperclipSkillSyncer:
    """轻量封装：将本地技能同步到 Paperclip MySQL pc_skills 表。"""

    def __init__(self, env_path: Optional[Path] = None) -> None:
        self._env_path = env_path or (PROJECT_ROOT / ".env")
        self._env_loaded = False
        self._ensure_env_loaded()
        self._host = os.getenv("DB_HOST")
        self._port = int(os.getenv("DB_PORT", "3306") or 3306)
        self._user = os.getenv("DB_USER")
        self._password = os.getenv("DB_PASSWORD")
        self._database = os.getenv("DB_NAME")
        self._company_name = os.getenv("PAPERCLIP_COMPANY_NAME", "Quant Platform")
        self._company_desc = os.getenv(
            "PAPERCLIP_COMPANY_DESCRIPTION", "Synced from AISkillLoader"
        )
        self._logger = sys_logger.getChild("PaperclipSkillSyncer")
        self._enabled = bool(
            mysql_connector
            and self._host
            and self._user
            and self._database
        )

    def _ensure_env_loaded(self) -> None:
        if self._env_loaded:
            return
        _load_env_file(self._env_path)
        self._env_loaded = True

    def sync(self, company_id: int, skills: List[Dict[str, Any]]) -> None:
        if not self._enabled:
            self._logger.debug("Paperclip skill syncer disabled (missing MySQL env/config)")
            return
        if not skills:
            return

        try:
            conn = mysql_connector.connect(
                host=self._host,
                port=self._port,
                user=self._user,
                password=self._password,
                database=self._database,
            )
        except Exception as exc:  # noqa: BLE001
            self._logger.error("Failed to connect to MySQL for skill sync: %s", exc)
            return

        cursor = None
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO pc_companies (id, name, description, status)
                VALUES (%s, %s, %s, 'active')
                ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description)
                """,
                (company_id, self._company_name, self._company_desc),
            )
            cursor.execute("DELETE FROM pc_skills WHERE companyId = %s", (company_id,))

            insert_sql = """
                INSERT INTO pc_skills (
                    companyId, name, description, category, code, parameters,
                    version, isPublic, usageCount, createdByUserId, createdAt, updatedAt
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, 0, 0, NULL, NOW(), NOW())
            """

            for record in skills:
                params = record.get("parameters")
                params_json = json.dumps(params, ensure_ascii=False) if params is not None else None
                cursor.execute(
                    insert_sql,
                    (
                        company_id,
                        record.get("name"),
                        record.get("description"),
                        record.get("category"),
                        record.get("code") or "",
                        params_json,
                        record.get("version", "1.0.0"),
                    ),
                )
            conn.commit()
            self._logger.info("Synced %s skills to Paperclip MySQL (companyId=%s)", len(skills), company_id)
        except Exception as exc:  # noqa: BLE001
            conn.rollback()
            self._logger.error("Failed to sync skills to Paperclip MySQL: %s", exc, exc_info=True)
        finally:
            if cursor:
                cursor.close()
            conn.close()
