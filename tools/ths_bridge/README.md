# 同花顺 ths_api 桥接服务

本目录提供一个极简的 HTTP 服务脚本 	hs_bridge_agent.py，用来在同花顺策略/脚本环境中直接暴露 	hs_api 的行情与下单能力，供 D:\quant_teade_platform 的实盘适配器通过标准 /api/* 路径复用。

## 能力概览
- /api/auth/login：返回本地访问令牌（默认 local-ths-token）。
- /api/asset、/api/positions、/api/orders：直接读取 xd.g_money / xd.g_position / xd.g_order。
- /api/orders (POST/DELETE)：把 REST 命令转成 xd.cmd，并维护本地下单编号到合同号的映射，方便撤单。
- /api/quotes?symbols=000001,600000：使用 hq.ths_hq_api().get_quote 拉取实时行情。

## 运行前准备
1. **确认同花顺客户端可用**：需要启动同花顺交易终端，并完成券商账号登录。
2. **复制脚本**：仓库启动脚本已经把最新版本拷贝到 E:\同花顺\script\ths_bridge_agent.py，也可以手动复制。后续如需更新，直接覆盖该文件即可。
3. **端口与令牌**：默认监听 127.0.0.1:9015，令牌 local-ths-token。
   - 可在运行前设置 THS_BRIDGE_HOST/THS_BRIDGE_PORT/THS_BRIDGE_TOKEN 环境变量进行覆盖。

## 在同花顺脚本环境中启动
1. 打开同花顺客户端，进入「策略交易 / 脚本策略」面板（不同版本菜单项可能位于“工具”->“策略交易”或者“智能选股”->“脚本策略”）。
2. 选择「Python」脚本类型，点击「打开」或「导入」，加载 E:\同花顺\script\ths_bridge_agent.py。
3. 点击「运行」或「执行」脚本。运行后脚本窗口会输出 	hs_bridge listening on 127.0.0.1:9015 ...，保持该窗口不关闭即可。
4. 如需自定义端口/令牌，可在脚本开头增加：
   `python
   import os
   os.environ["THS_BRIDGE_PORT"] = "9020"
   os.environ["THS_BRIDGE_TOKEN"] = "my-token"
   `
   然后再运行脚本。

> **注意**：由于 	hs_api 仅在同花顺自带 Python 运行时可用，请勿在外部 Conda/系统 Python 中直接执行该脚本。

## 健康检查
脚本成功运行后，可在终端或浏览器中访问：
`ash
curl http://127.0.0.1:9015/health
# => {"status": "ok", "token_required": true}
`

要验证行情/账户接口，可在登录期货/证券账户、执行几笔测试下单后，访问：
`ash
curl -H "token: local-ths-token" http://127.0.0.1:9015/api/asset
curl -H "token: local-ths-token" "http://127.0.0.1:9015/api/quotes?symbols=000001,600000"
`

## 与量化系统的连线
- 在 D:\quant_teade_platform 侧，把 TRADING_WEB_API_URL（或 .env 中相关变量）指向 http://127.0.0.1:9015，即可让 webui/server/trading-adapter.ts 通过该桥接服务完成行情/下单。
- 登录接口 /api/auth/login 会返回 ccess_token，后续请求需在 	oken 请求头中携带。

## 常见问题
- **“ths_api not available”**：说明脚本不在同花顺策略环境中运行；按照上面的步骤在客户端内运行即可。
- **撤单失败**：请确认发单成功后合同号已经映射，可以在桥接脚本窗口的日志中查看 send ths cmd 与 cancel 的输出。
- **端口占用**：修改 THS_BRIDGE_PORT 环境变量或在脚本顶部直接赋值。
