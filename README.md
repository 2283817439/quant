# Quant

这是一个由 **Python 量化引擎/API** 与 **Node.js 前端运行时**组成的混合量化交易系统。Python 侧负责回测、组合、风控、行情和交易桥接；Node 侧提供已构建的 Web UI 与服务运行时；SQLite 是本地默认数据存储，QMT/同花顺等券商 SDK 属于可选运行时依赖。

## Architecture

```text
Web UI (dist/public)
        |
Node runtime (dist/index.js, port 3000)
        |
Python Web API (web_api.py, port 8080)
        |---- SQLite data store (data/)
        |---- Backtest / portfolio / risk modules
        |---- Optional QMT SDK bridge
        |---- Optional Paperclip/AI integrations
```

Python API 启动时不再强制要求 `xtquant`、Paperclip 服务或券商客户端存在。没有这些外部依赖时，系统使用只读的本地适配器，仍可完成回测、API 健康检查和离线规则助手功能；真实交易提交仍会明确拒绝，避免把开发环境误当成实盘环境。

## Quick start

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python3 web_api.py
```

在另一个终端启动已构建的 Web UI：

```bash
pnpm install
pnpm start
```

默认地址为 `http://127.0.0.1:8080/docs`（Python API）和 `http://127.0.0.1:3000/`（Web UI）。

## Validation

```bash
python3 -m compileall -q .
python3 -m pytest -q
node dist/index.js
```

`pytest` 默认只收集 `tests/` 下的自动化测试；根目录的 `test_frontend_backend_connection.py` 是需要服务运行后手动调用的集成脚本，不会再被误当作 pytest fixture 测试。

## Production notes

生产部署前应通过环境变量设置强随机 `JWT_SECRET`/API 密钥，配置真实数据库与券商适配器，并将 QMT/同花顺桥接服务放在独立进程中。`xtquant` 不应加入通用安装依赖，因为它依赖特定 Windows 客户端环境；实盘环境应使用专用部署镜像或主机。
