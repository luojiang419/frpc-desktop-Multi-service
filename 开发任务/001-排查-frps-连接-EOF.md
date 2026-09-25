# frps 连接 EOF 排查

[CODEX_LONG_TASK_CONTINUE_V3]

- 状态：本机诊断与连接状态显示修复完成；实际握手失败仍需 frps 同时段日志定位。
- 下一步：取得 frps 日志或服务器访问能力后，确认远端拒绝原因，修复并验证重新登录。
- TODO：核对失败服务的 frps 日志；验证实际重新登录成功。
- 最近验证：2026-09-25 `npm run build`、`npm test` 通过；10:36 失败服务仍为 `EOF`。TCP 可建立，frpc 0.68.1 的最小配置在 TCP/TLS 两种模式下均无法登录。
- branch/commit：fix/frps-eof-status；状态显示修复作为本分支首个提交。
- 阻塞：用户暂无法提供 frps 日志，也没有该服务器的管理权限；无法区分 frps 主动关闭与链路设备断开。

## 目标与验收

找出第二台 frps 的连接失败原因，修复可由客户端控制的问题，并保证界面显示真实连接数。验收要求：两台服务均出现 `login to server success`，界面显示已连接 2/2。

## 证据

- 安装目录：`D:\Program Files\Frpc-Desktop`；运行数据和 frpc 日志在 `%APPDATA%\Frpc-Desktop`。
- 失败服务 9 月 22–25 日日志没有成功登录，反复出现 `EOF` 和 `connectex ... actively refused it`。9 月 25 日重启后仍失败。另一服务同时成功登录。
- 失败服务已在 `127.0.0.1:57401` 监听管理端口；Windows 当前排除端口范围不含 57400/57401。
- 当前选用 frpc 0.63.0。用已安装的 0.68.1 去掉代理做最小连接测试，仍返回 `EOF`；开启 TLS 也未能登录。诊断进程和临时配置已清理。
- 应用原逻辑把 frpc 进程存活当成连接成功，导致“运行中 2/2”误导。

## 涉及文件

- `electron/service/FrpcProcessService.ts`：依据最新登录事件计算连接状态。
- `src/store/frpcDesktop.ts`、`src/views/home/index.vue`、`src/lang/*.ts`：显示已连接数与单服务状态。
