import fs from "fs";
import SystemService from "./SystemService";
import ServerService from "./ServerService";
import PathUtils from "../utils/PathUtils";

class LogService {
  private readonly _systemService: SystemService;
  private readonly _serverService: ServerService;
  private readonly _appPath: string = PathUtils.getAppLogFilePath();

  constructor(systemService: SystemService, serverService: ServerService) {
    this._systemService = systemService;
    this._serverService = serverService;
  }

  async getFrpLogContent(serverId: string) {
    const logPath = PathUtils.getServerLogFilePath(serverId);
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(logPath)) {
        resolve("");
        return;
      }
      try {
        const data = fs.readFileSync(logPath, "utf-8");
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAppLogContent() {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(this._appPath)) {
        resolve("");
        return;
      }
      try {
        const data = fs.readFileSync(this._appPath, "utf-8");
        resolve(data);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getServerLogOptions() {
    const profiles = await this._serverService.getServerProfiles();
    return profiles.map(profile => ({
      _id: profile._id,
      name: profile.name,
      serverAddr: profile.serverAddr,
      serverPort: profile.serverPort
    }));
  }

  openFrpcLogFile(serverId: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this._systemService
        .openLocalFile(PathUtils.getServerLogFilePath(serverId))
        .then(result => resolve(result))
        .catch(err => reject(err));
    });
  }

  openAppLogFile(): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      this._systemService
        .openLocalFile(this._appPath)
        .then(result => resolve(result))
        .catch(err => reject(err));
    });
  }
}

export default LogService;
