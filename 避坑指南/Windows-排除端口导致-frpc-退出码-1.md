# Windows 排除端口导致 frpc 退出码 1

## 现象

- `frpc verify -c <config>` 校验成功，`frps` 地址和端口也可以建立 TCP 连接。
- `frpc` 启动后立即退出，应用只显示 `frpc exited with code 1`。
- frpc 文件日志可能只有 `start frpc service` 和 `stopped`，没有明确错误。
- 前台运行时会看到：`listen tcp 127.0.0.1:<port>: bind: An attempt was made to access a socket in a way forbidden by its access permissions.`

## 根因

Windows、Hyper-V、WSL 或容器网络可能动态排除一段 TCP 端口。端口没有进程监听并不代表当前用户可以绑定。

原端口探测只把 `EADDRINUSE` 视为不可用；遇到 Windows 排除端口返回的 `EACCES` 时反而判定为可用。frpc 随后无法绑定本地管理端口并以退出码 1 结束。进程重试又会复用上次选中的失败端口，导致持续失败。

可用以下命令确认 Windows 排除范围：

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
netsh interface ipv6 show excludedportrange protocol=tcp
```

## 修复原则

1. 端口探测只有在 `listen` 成功后才判为可用；任何绑定错误都应判为不可用并继续扫描。
2. frpc 进程已退出后，重启时必须重新探测管理端口，不能无条件复用旧端口。
3. 捕获 frpc 的 stdout 和 stderr，并在快速退出时将原始错误写入应用日志和启动结果。

## 验证

- 对一个非本机地址执行绑定探测，应返回不可用，用于覆盖非 `EADDRINUSE` 错误。
- 从落在 Windows 排除范围内的端口开始扫描，最终返回的端口必须能实际 `listen`。
- 启动客户端后确认日志依次出现：
  - `admin server listen on 127.0.0.1:<可用端口>`
  - `login to server success`
  - `start proxy success`

## 容易误判的另一类日志

`connect to local service ... actively refused it` 表示 frpc 已连接服务器，但代理指向的本机服务没有监听。此时应启动对应本地服务或修正代理的 `localIP/localPort`，不应修改 frps 登录配置。
