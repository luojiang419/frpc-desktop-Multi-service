# frps 连接 EOF 排查

[CODEX_LONG_TASK_CONTINUE_V3]

- 状态：已完成。服务器实际 IP 已变更，应用中的地址更新到 `64.90.17.151` 后，两台服务器均登录成功。
- 下一步：无。
- 最近验证：2026-09-25 `npm run build`、`npm test` 通过；10:42:57/10:42:59 两台服务分别出现 `login to server success`，第二台代理全部出现 `start proxy success`。持久配置与新旧记录对比，除 `serverAddr` 外其他字段一致。
- branch/commit：fix/frps-eof-status；`866783b` 状态显示修复。
- 阻塞：无。

## 目标与验收

找出第二台 frps 的连接失败原因，修复可由客户端控制的问题，并保证界面显示真实连接数。验收要求：两台服务均出现 `login to server success`。代码中的连接数显示修复已构建验证，尚未替换已安装程序。

## 证据

- 安装目录：`D:\Program Files\Frpc-Desktop`；运行数据和 frpc 日志在 `%APPDATA%\Frpc-Desktop`。
- 失败服务 9 月 22–25 日日志没有成功登录，反复出现 `EOF` 和 `connectex ... actively refused it`。9 月 25 日重启后仍失败。另一服务同时成功登录。
- 失败服务已在 `127.0.0.1:57401` 监听管理端口；Windows 当前排除端口范围不含 57400/57401。
- 当前选用 frpc 0.63.0。用已安装的 0.68.1 去掉代理做最小连接测试，仍返回 `EOF`；开启 TLS 也未能登录。诊断进程和临时配置已清理。
- 应用原逻辑把 frpc 进程存活当成连接成功，导致“运行中 2/2”误导。
- 直连旧地址 `64.90.17.178:7000` 返回“连接被拒绝”；用户随后告知服务器 IP 已变为 `64.90.17.151`。应用配置更新后立即登录成功，说明旧 IP 是这次实际连接失败的原因。
- 更新时应用已经在保存新地址；核验表明 NeDB 最后一条记录和生成的 TOML 均为新 IP，端口 7000 及其他配置保持不变。

## 涉及文件

- `electron/service/FrpcProcessService.ts`：依据最新登录事件计算连接状态。
- `src/store/frpcDesktop.ts`、`src/views/home/index.vue`、`src/lang/*.ts`：显示已连接数与单服务状态。
