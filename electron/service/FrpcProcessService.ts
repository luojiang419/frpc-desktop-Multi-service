import { exec, execFile, spawn } from "child_process";
import { app, BrowserWindow, Notification } from "electron";
import fs from "fs";
import path from "path";
import treeKill from "tree-kill";
import BeanFactory from "../core/BeanFactory";
import { BusinessError, ResponseCode } from "../core/BusinessError";
import GlobalConstant from "../core/GlobalConstant";
import Logger from "../core/Logger";
import VersionRepository from "../repository/VersionRepository";
import NetUtils from "../utils/NetUtils";
import PathUtils from "../utils/PathUtils";
import ResponseUtils from "../utils/ResponseUtils";
import ServerService from "./ServerService";
import SystemService from "./SystemService";

const MAC_LAUNCHER_PATH = "/usr/local/bin/frpc-desktop-launcher";
const MAC_SUDOERS_FILE = "/etc/sudoers.d/frpc-desktop";
const FRPC_ERROR_PATTERNS = [
  "connect to server error",
  "login to server failed"
];
const FRPC_SUCCESS_PATTERNS = [
  "login to server success",
  "start proxy success",
  "proxy added success"
];
const DEFAULT_WEB_SERVER_PORT = 57400;

type ManagedFrpcProcessState = FrpcProcessState & {
  process?: any;
  notified: boolean;
};

class FrpcProcessService {
  private readonly _serverService: ServerService;
  private readonly _systemService: SystemService;
  private readonly _versionRepository: VersionRepository;
  private readonly _processStates = new Map<string, ManagedFrpcProcessState>();
  private _frpcProcessListener: NodeJS.Timeout | null = null;

  constructor() {
    this._serverService = BeanFactory.getBean("serverService");
    this._systemService = BeanFactory.getBean("systemService");
    this._versionRepository = BeanFactory.getBean("versionRepository");
  }

  private isMacHelperReady(): boolean {
    return fs.existsSync(MAC_LAUNCHER_PATH) && fs.existsSync(MAC_SUDOERS_FILE);
  }

  private async installMacHelper(): Promise<void> {
    const launcherContent = [
      "#!/bin/bash",
      'ACTION="$1"',
      'if [ "$ACTION" = "start" ]; then',
      '  "$2" -c "$3" &',
      "  echo $!",
      'elif [ "$ACTION" = "stop" ]; then',
      '  kill "$2"',
      "fi",
      ""
    ].join("\n");

    const tempLauncher = "/tmp/frpc_desktop_launcher_setup.sh";
    const username = process.env.USER || "ALL";
    const tempSudoers = "/tmp/frpc_desktop_sudoers_setup";

    fs.writeFileSync(tempLauncher, launcherContent, { mode: 0o644 });
    fs.writeFileSync(
      tempSudoers,
      `${username} ALL=(ALL) NOPASSWD: ${MAC_LAUNCHER_PATH}\n`,
      { mode: 0o644 }
    );

    const installCmd = [
      "mkdir -p /usr/local/bin",
      `cp ${tempLauncher} ${MAC_LAUNCHER_PATH}`,
      `chmod 755 ${MAC_LAUNCHER_PATH}`,
      `chown root:wheel ${MAC_LAUNCHER_PATH}`,
      `cp ${tempSudoers} ${MAC_SUDOERS_FILE}`,
      `chmod 440 ${MAC_SUDOERS_FILE}`,
      `chown root:wheel ${MAC_SUDOERS_FILE}`
    ].join(" && ");

    await new Promise<void>((resolve, reject) => {
      exec(
        `osascript -e 'do shell script "${installCmd}" with administrator privileges'`,
        err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }

  private isPidRunning(pid: number | null): boolean {
    if (!pid) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch (err: any) {
      if (err.code === "EPERM") {
        return true;
      }
      return false;
    }
  }

  isRunning(serverId?: string): boolean {
    if (serverId) {
      const state = this._processStates.get(serverId);
      return state ? this.isPidRunning(state.pid) : false;
    }
    return Array.from(this._processStates.values()).some(state =>
      this.isPidRunning(state.pid)
    );
  }

  private createState(
    profile: FrpsServerProfile,
    overrides?: Partial<ManagedFrpcProcessState>
  ): ManagedFrpcProcessState {
    return {
      serverId: profile._id,
      pid: null,
      running: false,
      success: false,
      lastStartTime: -1,
      connectionError: null,
      webServerPort: null,
      configPath: PathUtils.getServerTomlConfigFilePath(profile._id),
      logPath: PathUtils.getServerLogFilePath(profile._id),
      message: "Stopped",
      notified: false,
      ...overrides
    };
  }

  private async getVersionOrThrow() {
    const settings = await this._serverService.getGlobalSettings();
    if (!settings.frpcVersion) {
      throw new BusinessError(ResponseCode.NOT_FOUND_VERSION);
    }
    const version = await this._versionRepository.findByGithubReleaseId(
      settings.frpcVersion
    );
    if (!version) {
      throw new BusinessError(ResponseCode.NOT_FOUND_VERSION);
    }

    const frpcFilename =
      process.platform === "win32"
        ? PathUtils.getWinFrpFilename()
        : PathUtils.getFrpcFilename();
    const frpcBinaryPath = path.join(version.localPath, frpcFilename);
    if (!fs.existsSync(frpcBinaryPath)) {
      await this._versionRepository.deleteById(version._id);
      throw new BusinessError(ResponseCode.NOT_FOUND_VERSION);
    }

    return version;
  }

  private getBinaryPath(version: FrpcVersion) {
    return path.join(
      version.localPath,
      process.platform === "win32"
        ? PathUtils.getWinFrpFilename()
        : PathUtils.getFrpcFilename()
    );
  }

  private getCommand(configPath: string) {
    if (process.platform === "win32") {
      return `${PathUtils.getWinFrpFilename()} -c "${configPath}"`;
    }
    return `./${PathUtils.getFrpcFilename()} -c "${configPath}"`;
  }

  private getReloadCommand(configPath: string) {
    if (process.platform === "win32") {
      return `${PathUtils.getWinFrpFilename()} reload -c "${configPath}"`;
    }
    return `./${PathUtils.getFrpcFilename()} reload -c "${configPath}"`;
  }

  private async verifyConfig(version: FrpcVersion, configPath: string) {
    const binaryPath = this.getBinaryPath(version);
    await new Promise<void>((resolve, reject) => {
      execFile(binaryPath, ["verify", "-c", configPath], error => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  private async reserveWebServerPort(excludePorts: number[] = []) {
    return await NetUtils.findAvailablePort(
      DEFAULT_WEB_SERVER_PORT,
      GlobalConstant.LOCAL_IP,
      excludePorts
    );
  }

  private async delay(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
  }

  private readLogError(logPath: string, lastStartTime: number): string | null {
    if (!fs.existsSync(logPath) || lastStartTime === -1) {
      return null;
    }
    try {
      const stat = fs.statSync(logPath);
      if (stat.size === 0) {
        return null;
      }
      const readSize = Math.min(stat.size, 8192);
      const buf = Buffer.alloc(readSize);
      const fd = fs.openSync(logPath, "r");
      fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
      fs.closeSync(fd);
      const lines = buf
        .toString("utf-8")
        .split("\n")
        .filter(line => line.trim());
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (FRPC_SUCCESS_PATTERNS.some(pattern => line.includes(pattern))) {
          return null;
        }
        const errorPattern = FRPC_ERROR_PATTERNS.find(pattern =>
          line.includes(pattern)
        );
        if (errorPattern) {
          const match = line.match(new RegExp(`${errorPattern}.*`));
          return match ? match[0].trim() : line.trim();
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  readFrpcConnectionError(serverId: string): string | null {
    const state = this._processStates.get(serverId);
    if (!state) {
      return null;
    }
    return this.readLogError(state.logPath, state.lastStartTime);
  }

  private async syncState(profile: FrpsServerProfile) {
    const existing = this._processStates.get(profile._id);
    if (!existing) {
      return;
    }

    const wasRunning = existing.running;
    existing.running = this.isPidRunning(existing.pid);
    existing.connectionError =
      existing.running || existing.lastStartTime > -1
        ? this.readLogError(existing.logPath, existing.lastStartTime)
        : null;
    existing.success = existing.running && !existing.connectionError;

    if (existing.running) {
      existing.message = existing.connectionError || "Running";
      existing.notified = false;
      return;
    }

    if (existing.lastStartTime === -1) {
      existing.message = "Stopped";
      return;
    }

    if (existing.connectionError) {
      existing.message = existing.connectionError;
      return;
    }

    if (wasRunning || existing.pid) {
      existing.message = existing.message || "Process exited";
    }
  }

  private toLaunchResult(
    profile: FrpsServerProfile,
    state?: ManagedFrpcProcessState
  ): FrpcLaunchResult {
    if (!state) {
      return {
        serverId: profile._id,
        name: profile.name,
        serverAddr: profile.serverAddr,
        serverPort: profile.serverPort,
        running: false,
        success: false,
        message: "Stopped",
        connectionError: null,
        webServerPort: null,
        pid: null,
        lastStartTime: -1
      };
    }
    return {
      serverId: profile._id,
      name: profile.name,
      serverAddr: profile.serverAddr,
      serverPort: profile.serverPort,
      running: state.running,
      success: state.success,
      message: state.message,
      connectionError: state.connectionError,
      webServerPort: state.webServerPort,
      pid: state.pid,
      lastStartTime: state.lastStartTime
    };
  }

  private async startSingleProfile(
    profile: FrpsServerProfile,
    version: FrpcVersion,
    reservedPorts: number[]
  ) {
    const existing = this._processStates.get(profile._id);
    if (existing && this.isPidRunning(existing.pid)) {
      await this.syncState(profile);
      return this.toLaunchResult(profile, existing);
    }

    const configPath = PathUtils.getServerTomlConfigFilePath(profile._id);
    const logPath = PathUtils.getServerLogFilePath(profile._id);
    const webServerPort =
      existing?.webServerPort ||
      (await this.reserveWebServerPort([
        ...reservedPorts,
        ...Array.from(this._processStates.values())
          .map(state => state.webServerPort)
          .filter((port): port is number => typeof port === "number")
      ]));

    reservedPorts.push(webServerPort);
    fs.writeFileSync(logPath, "", { flag: "w" });

    const state = this.createState(profile, {
      configPath,
      logPath,
      webServerPort,
      lastStartTime: Date.now(),
      message: "Starting"
    });
    this._processStates.set(profile._id, state);

    try {
      await this._serverService.genTomlConfig(profile, configPath, {
        webServerPort,
        logPath
      });
      await this.verifyConfig(version, configPath);

      if (process.platform === "darwin") {
        if (!this.isMacHelperReady()) {
          await this.installMacHelper();
        }
        if (!fs.existsSync(logPath)) {
          fs.writeFileSync(logPath, "", { mode: 0o644 });
        }
        const frpcBinary = path.join(
          version.localPath,
          PathUtils.getFrpcFilename()
        );
        const pidStr = await new Promise<string>((resolve, reject) => {
          exec(
            `sudo -n "${MAC_LAUNCHER_PATH}" start "${frpcBinary}" "${configPath}"`,
            (err, stdout) => {
              if (err) {
                reject(err);
              } else {
                resolve(stdout.trim());
              }
            }
          );
        });

        state.pid = parseInt(pidStr, 10) || null;
      } else {
        const binaryPath = this.getBinaryPath(version);
        state.process = spawn(binaryPath, ["-c", configPath], {
          cwd: version.localPath,
          shell: false
        });
        state.pid = state.process.pid ?? null;
        state.process.stdout?.on("data", data => {
          Logger.debug("FrpcProcessService.startSingleProfile", `${data}`);
        });
        state.process.stderr?.on("data", data => {
          Logger.debug("FrpcProcessService.startSingleProfile", `${data}`);
        });
        state.process.on("exit", code => {
          const currentState = this._processStates.get(profile._id);
          if (!currentState) {
            return;
          }
          currentState.running = false;
          currentState.success = false;
          currentState.connectionError = this.readLogError(
            currentState.logPath,
            currentState.lastStartTime
          );
          currentState.message =
            currentState.connectionError ||
            `frpc exited with code ${code ?? "unknown"}`;
        });
      }

      await this.delay(1500);
      await this.syncState(profile);

      if (!state.running) {
        state.success = false;
        state.message = state.connectionError || state.message || "Start failed";
      }

      return this.toLaunchResult(profile, state);
    } catch (error: any) {
      state.running = false;
      state.success = false;
      state.connectionError =
        this.readLogError(state.logPath, state.lastStartTime) || null;
      state.message =
        state.connectionError || error?.message || "Start failed";
      Logger.error(
        "FrpcProcessService.startSingleProfile",
        error instanceof Error ? error : new Error(state.message)
      );
      return this.toLaunchResult(profile, state);
    }
  }

  async startFrpcProcess(): Promise<FrpcLaunchSummary> {
    const profiles = await this._serverService.getServerProfiles();
    if (profiles.length < 1) {
      throw new BusinessError(ResponseCode.NOT_CONFIG);
    }

    const version = await this.getVersionOrThrow();
    const reservedPorts: number[] = [];
    const results: FrpcLaunchResult[] = [];

    for (const profile of profiles) {
      results.push(
        await this.startSingleProfile(profile, version, reservedPorts)
      );
    }

    return await this.getStatusSummary(results);
  }

  private async stopSingleProcess(serverId: string) {
    const state = this._processStates.get(serverId);
    if (!state) {
      return;
    }
    const pid = state.pid;

    if (pid && this.isPidRunning(pid)) {
      if (process.platform === "darwin") {
        await new Promise<void>((resolve, reject) => {
          exec(`sudo -n "${MAC_LAUNCHER_PATH}" stop ${pid}`, err => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }).catch(error => {
          Logger.error("FrpcProcessService.stopSingleProcess", error as Error);
        });
      } else {
        await new Promise<void>(resolve => {
          treeKill(pid, () => resolve());
        });
      }
    }

    this._processStates.delete(serverId);
  }

  async stopFrpcProcess(serverId?: string): Promise<FrpcLaunchSummary> {
    if (serverId) {
      await this.stopSingleProcess(serverId);
    } else {
      const ids = Array.from(this._processStates.keys());
      for (const id of ids) {
        await this.stopSingleProcess(id);
      }
    }
    return await this.getStatusSummary();
  }

  async reloadFrpcProcess() {
    if (!this.isRunning()) {
      return;
    }

    const settings = await this._serverService.getGlobalSettings();
    if (!settings.frpcVersion) {
      throw new BusinessError(ResponseCode.NOT_FOUND_VERSION);
    }
    const version = await this.getVersionOrThrow();
    const profiles = await this._serverService.getServerProfiles();

    for (const profile of profiles) {
      const state = this._processStates.get(profile._id);
      if (!state || !state.running || !state.webServerPort) {
        continue;
      }

      await this._serverService.genTomlConfig(profile, state.configPath, {
        webServerPort: state.webServerPort,
        logPath: state.logPath
      });

      const command = this.getReloadCommand(state.configPath);
      exec(
        command,
        {
          cwd: version.localPath
        },
        error => {
          if (error) {
            Logger.error("FrpcProcessService.reloadFrpcProcess", error);
          }
        }
      );
    }
  }

  private async refreshStates(profiles: FrpsServerProfile[]) {
    for (const profile of profiles) {
      await this.syncState(profile);
    }
  }

  private buildSummaryFromProfiles(
    profiles: FrpsServerProfile[],
    forcedResults?: FrpcLaunchResult[]
  ): FrpcLaunchSummary {
    const results =
      forcedResults ||
      profiles.map(profile =>
        this.toLaunchResult(profile, this._processStates.get(profile._id))
      );

    const runningCount = results.filter(result => result.running).length;
    const errorCount = results.filter(
      result =>
        !!result.connectionError ||
        (result.lastStartTime > 0 && !result.running && !result.success)
    ).length;

    let status: FrpcLaunchStatus = "stopped";
    if (results.length > 0) {
      if (runningCount === results.length && errorCount === 0) {
        status = "running";
      } else if (runningCount > 0 || errorCount > 0) {
        status = "error";
      }
    }

    return {
      status,
      total: results.length,
      runningCount,
      errorCount,
      results
    };
  }

  async getStatusSummary(
    forcedResults?: FrpcLaunchResult[]
  ): Promise<FrpcLaunchSummary> {
    const profiles = await this._serverService.getServerProfiles();
    await this.refreshStates(profiles);
    return this.buildSummaryFromProfiles(profiles, forcedResults);
  }

  async frpcProcessGuardian() {
    Logger.info(
      "FrpcProcessService.frpcProcessGuardian",
      `Guardian started, interval=${GlobalConstant.FRPC_PROCESS_STATUS_CHECK_INTERVAL}s`
    );

    setInterval(async () => {
      const summary = await this.getStatusSummary();
      const hasStoppedStartedProcess = summary.results.some(
        result => result.lastStartTime > 0 && !result.running
      );
      if (!hasStoppedStartedProcess) {
        return;
      }

      const netStatus = await this._systemService.checkInternetConnect();
      if (netStatus) {
        await this.startFrpcProcess().catch(error => {
          Logger.error("FrpcProcessService.frpcProcessGuardian", error);
        });
      }
    }, GlobalConstant.FRPC_PROCESS_STATUS_CHECK_INTERVAL * 1000);
  }

  watchFrpcProcess(listenerParam: ListenerParam) {
    if (this._frpcProcessListener) {
      clearInterval(this._frpcProcessListener);
    }

    this._frpcProcessListener = setInterval(async () => {
      const summary = await this.getStatusSummary();

      summary.results.forEach(result => {
        const state = this._processStates.get(result.serverId);
        if (
          state &&
          result.lastStartTime > 0 &&
          !result.running &&
          !state.notified
        ) {
          new Notification({
            title: app.getName(),
            body: `${result.name} connection lost, please check logs.`
          }).show();
          state.notified = true;
        }
      });

      const win: BrowserWindow = BeanFactory.getBean("win");
      if (win && !win.isDestroyed()) {
        win.webContents.send(listenerParam.channel, ResponseUtils.success(summary));
      }
    }, GlobalConstant.FRPC_PROCESS_STATUS_CHECK_INTERVAL * 1000);
  }
}

export default FrpcProcessService;
