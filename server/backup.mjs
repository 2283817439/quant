/**
 * 自动备份任务脚本
 * 定期备份数据库和重要配置文件
 * 运行方式: node server/backup.mjs
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BACKUP_DIR = path.join(__dirname, '../backups');
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const BACKUP_FILE = path.join(BACKUP_DIR, `backup_${TIMESTAMP}.sql`);

async function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    console.log(`✓ 创建备份目录: ${BACKUP_DIR}`);
  }
}

async function backupDatabase() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ DATABASE_URL 环境变量未设置');
      return false;
    }

    // 解析数据库连接字符串
    const url = new URL(dbUrl);
    const host = url.hostname;
    const port = url.port || 3306;
    const user = url.username;
    const password = url.password;
    const database = url.pathname.slice(1);

    // 执行 mysqldump 命令
    const command = `mysqldump -h ${host} -P ${port} -u ${user} -p${password} ${database} > ${BACKUP_FILE}`;
    
    console.log(`📦 开始备份数据库: ${database}`);
    await execAsync(command);
    
    const stats = fs.statSync(BACKUP_FILE);
    const fileSizeInMB = (stats.size / 1024 / 1024).toFixed(2);
    
    console.log(`✓ 数据库备份成功`);
    console.log(`  文件: ${BACKUP_FILE}`);
    console.log(`  大小: ${fileSizeInMB} MB`);
    
    return true;
  } catch (error) {
    console.error('❌ 数据库备份失败:', error.message);
    return false;
  }
}

async function cleanOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.sql'))
      .map(f => ({
        name: f,
        path: path.join(BACKUP_DIR, f),
        time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.time - a.time);

    // 保留最近 7 个备份
    const filesToDelete = backupFiles.slice(7);
    
    for (const file of filesToDelete) {
      fs.unlinkSync(file.path);
      console.log(`🗑️  删除旧备份: ${file.name}`);
    }

    if (filesToDelete.length === 0) {
      console.log(`✓ 无需清理旧备份（当前备份数: ${backupFiles.length}）`);
    } else {
      console.log(`✓ 清理完成，删除了 ${filesToDelete.length} 个旧备份`);
    }
  } catch (error) {
    console.error('❌ 清理旧备份失败:', error.message);
  }
}

async function generateBackupReport() {
  try {
    const files = fs.readdirSync(BACKUP_DIR);
    const backupFiles = files
      .filter(f => f.startsWith('backup_') && f.endsWith('.sql'))
      .map(f => {
        const filePath = path.join(BACKUP_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: (stats.size / 1024 / 1024).toFixed(2),
          date: stats.mtime.toLocaleString(),
        };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    console.log('\n📊 备份统计:');
    console.log(`  总备份数: ${backupFiles.length}`);
    console.log(`  总大小: ${(backupFiles.reduce((sum, f) => sum + parseFloat(f.size), 0)).toFixed(2)} MB`);
    console.log('\n📋 最近备份:');
    backupFiles.slice(0, 5).forEach((f, idx) => {
      console.log(`  ${idx + 1}. ${f.name} (${f.size} MB) - ${f.date}`);
    });
  } catch (error) {
    console.error('❌ 生成备份报告失败:', error.message);
  }
}

async function main() {
  console.log('🚀 开始执行自动备份任务...\n');
  
  try {
    await ensureBackupDir();
    const success = await backupDatabase();
    
    if (success) {
      await cleanOldBackups();
      await generateBackupReport();
      console.log('\n✅ 备份任务完成！');
    } else {
      console.log('\n❌ 备份任务失败');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ 备份任务出错:', error);
    process.exit(1);
  }
}

main();
