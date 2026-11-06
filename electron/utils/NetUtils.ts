import net from "net";

class NetUtils {
  /**
   * 检查指定端口是否不可用
   * @param port 端口号
   * @param host 主机地址，默认为 localhost
   * @returns Promise<boolean> true表示端口无法绑定，false表示端口可用
   */
  static async checkPortInUse(
    port: number,
    host: string = "localhost"
  ): Promise<boolean> {
    return new Promise(resolve => {
      const server = net.createServer();

      server.listen(port, host, () => {
        server.once("close", () => {
          resolve(false); // 端口可用
        });
        server.close();
      });

      server.once("error", () => {
        resolve(true); // 被占用、被系统排除或无权绑定时均不可用
      });
    });
  }

  static async findAvailablePort(
    startPort: number,
    host: string = "localhost",
    excludePorts: number[] = []
  ): Promise<number> {
    let currentPort = startPort;
    const excludes = new Set(excludePorts);

    while (currentPort <= 65535) {
      if (!excludes.has(currentPort)) {
        const inUse = await NetUtils.checkPortInUse(currentPort, host);
        if (!inUse) {
          return currentPort;
        }
      }
      currentPort++;
    }

    throw new Error("No available port found");
  }
}

export default NetUtils;
