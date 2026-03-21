/**
 * 数据优化分析脚本
 * 分析回测数据，生成优化建议
 * 运行方式: node server/optimization.mjs
 */

import mysql from 'mysql2/promise';
import { URL } from 'url';

async function analyzeBacktestData() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ DATABASE_URL 环境变量未设置');
      return;
    }

    // 解析连接字符串
    const url = new URL(dbUrl);
    const connection = await mysql.createConnection({
      host: url.hostname,
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    });

    console.log('📊 开始分析回测数据...\n');

    // 1. 策略胜率分析
    console.log('📈 策略胜率分析:');
    const [winRateData] = await connection.execute(`
      SELECT 
        s.name,
        COUNT(br.id) as total_backtests,
        AVG(CAST(br.winRate as DECIMAL(10,4))) as avg_win_rate,
        MAX(CAST(br.winRate as DECIMAL(10,4))) as max_win_rate,
        MIN(CAST(br.winRate as DECIMAL(10,4))) as min_win_rate
      FROM strategies s
      LEFT JOIN backtest_records br ON s.id = br.strategyId
      WHERE br.id IS NOT NULL
      GROUP BY s.id, s.name
      ORDER BY avg_win_rate DESC
      LIMIT 10
    `);

    winRateData.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.name}`);
      console.log(`     平均胜率: ${(row.avg_win_rate * 100).toFixed(2)}%`);
      console.log(`     最高: ${(row.max_win_rate * 100).toFixed(2)}% | 最低: ${(row.min_win_rate * 100).toFixed(2)}%`);
      console.log(`     回测次数: ${row.total_backtests}`);
    });

    // 2. 回撤控制分析
    console.log('\n📉 回撤控制分析:');
    const [drawdownData] = await connection.execute(`
      SELECT 
        s.name,
        AVG(CAST(br.maxDrawdown as DECIMAL(10,4))) as avg_drawdown,
        MIN(CAST(br.maxDrawdown as DECIMAL(10,4))) as best_drawdown,
        MAX(CAST(br.maxDrawdown as DECIMAL(10,4))) as worst_drawdown,
        AVG(CAST(br.sharpeRatio as DECIMAL(10,4))) as avg_sharpe
      FROM strategies s
      LEFT JOIN backtest_records br ON s.id = br.strategyId
      WHERE br.id IS NOT NULL
      GROUP BY s.id, s.name
      ORDER BY avg_drawdown ASC
      LIMIT 10
    `);

    drawdownData.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.name}`);
      console.log(`     平均回撤: ${(row.avg_drawdown * 100).toFixed(2)}%`);
      console.log(`     最佳: ${(row.best_drawdown * 100).toFixed(2)}% | 最差: ${(row.worst_drawdown * 100).toFixed(2)}%`);
      console.log(`     平均夏普: ${row.avg_sharpe.toFixed(4)}`);
    });

    // 3. 交易成本分析
    console.log('\n💰 交易成本分析:');
    const [costData] = await connection.execute(`
      SELECT 
        br.id,
        br.name,
        br.totalTrades,
        SUM(CAST(t.commission as DECIMAL(15,2))) as total_commission,
        SUM(CAST(t.stampDuty as DECIMAL(15,2))) as total_stamp_duty,
        CAST(br.totalPnl as DECIMAL(15,2)) as total_pnl,
        (SUM(CAST(t.commission as DECIMAL(15,2))) + SUM(CAST(t.stampDuty as DECIMAL(15,2)))) / CAST(br.totalPnl as DECIMAL(15,2)) * 100 as cost_ratio
      FROM backtest_records br
      LEFT JOIN trades t ON br.id = t.backtestRecordId
      WHERE br.totalTrades > 0
      GROUP BY br.id, br.name, br.totalPnl, br.totalTrades
      ORDER BY cost_ratio DESC
      LIMIT 10
    `);

    costData.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.name}`);
      console.log(`     总交易数: ${row.totalTrades}`);
      console.log(`     佣金: ¥${row.total_commission?.toFixed(2) || 0}`);
      console.log(`     印花税: ¥${row.total_stamp_duty?.toFixed(2) || 0}`);
      console.log(`     成本占比: ${row.cost_ratio?.toFixed(2) || 0}%`);
    });

    // 4. 持仓分析
    console.log('\n📊 持仓分析:');
    const [positionData] = await connection.execute(`
      SELECT 
        br.name,
        COUNT(DISTINCT ps.symbol) as unique_symbols,
        AVG(CAST(ps.marketValue as DECIMAL(15,2))) as avg_position_value,
        MAX(CAST(ps.marketValue as DECIMAL(15,2))) as max_position_value,
        AVG(CAST(ps.returnRate as DECIMAL(10,4))) as avg_return_rate
      FROM backtest_records br
      LEFT JOIN position_snapshots ps ON br.id = ps.backtestRecordId
      WHERE ps.id IS NOT NULL
      GROUP BY br.id, br.name
      ORDER BY unique_symbols DESC
      LIMIT 10
    `);

    positionData.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.name}`);
      console.log(`     持仓标的数: ${row.unique_symbols}`);
      console.log(`     平均持仓值: ¥${row.avg_position_value?.toFixed(2) || 0}`);
      console.log(`     最大持仓值: ¥${row.max_position_value?.toFixed(2) || 0}`);
      console.log(`     平均持仓收益: ${(row.avg_return_rate * 100).toFixed(2)}%`);
    });

    // 5. 风险告警分析
    console.log('\n⚠️  风险告警分析:');
    const [alertData] = await connection.execute(`
      SELECT 
        level,
        COUNT(*) as alert_count,
        COUNT(DISTINCT backtestRecordId) as affected_backtests
      FROM risk_alerts
      GROUP BY level
      ORDER BY alert_count DESC
    `);

    alertData.forEach((row) => {
      const levelLabel = {
        'INFO': '📘 信息',
        'WARNING': '⚠️  警告',
        'ERROR': '❌ 错误',
        'CRITICAL': '🚨 严重'
      }[row.level] || row.level;
      
      console.log(`  ${levelLabel}: ${row.alert_count} 条告警，影响 ${row.affected_backtests} 个回测`);
    });

    // 6. 优化建议
    console.log('\n💡 优化建议:');
    
    // 检查高成本策略
    const highCostStrategies = costData.filter(d => d.cost_ratio > 5);
    if (highCostStrategies.length > 0) {
      console.log(`  1. 高成本策略 (${highCostStrategies.length} 个):`);
      console.log(`     建议: 优化交易频率或与券商协商降低佣金率`);
    }

    // 检查低胜率策略
    const lowWinRateStrategies = winRateData.filter(d => d.avg_win_rate < 0.45);
    if (lowWinRateStrategies.length > 0) {
      console.log(`  2. 低胜率策略 (${lowWinRateStrategies.length} 个):`);
      console.log(`     建议: 增加信号确认周期，优化入场条件`);
    }

    // 检查高回撤策略
    const highDrawdownStrategies = drawdownData.filter(d => d.avg_drawdown > 0.15);
    if (highDrawdownStrategies.length > 0) {
      console.log(`  3. 高回撤策略 (${highDrawdownStrategies.length} 个):`);
      console.log(`     建议: 增加止损限制，优化风险控制参数`);
    }

    console.log('\n✅ 分析完成！');
    await connection.end();
  } catch (error) {
    console.error('❌ 分析失败:', error.message);
  }
}

analyzeBacktestData();
