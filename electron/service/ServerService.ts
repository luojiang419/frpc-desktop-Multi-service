import { app, dialog } from "electron";
import fs from "fs";
import path from "path";
import TOML from "smol-toml";
import GlobalConstant from "../core/GlobalConstant";
import Logger from "../core/Logger";
import ProxyRepository from "../repository/ProxyRepository";
import ServerProfileRepository from "../repository/ServerProfileRepository";
import ServerRepository from "../repository/ServerRepository";
import PathUtils from "../utils/PathUtils";
import BaseService from "./BaseService";

type TomlRuntimeOptions = {
  webServerPort: number;
  logPath: string;
};

type ImportTomlResult = {
  canceled: boolean;
  path: string;
  profile?: FrpsServerProfile;
};

type ExportTomlResult = {
  canceled: boolean;
  paths: string[];
};

class ServerService extends BaseService<FrpcGlobalSettings> {
  private readonly _serverDao: ServerRepository;
  private readonly _serverProfileDao: ServerProfileRepository;
  private readonly _proxyDao: ProxyRepository;
  private readonly _settingsId = "global-settings";
  private _migrationPromise: Promise<void> | null = null;

  constructor(
    serverDao: ServerRepository,
    serverProfileDao: ServerProfileRepository,
    proxyDao: ProxyRepository
  ) {
    super();
    this._serverDao = serverDao;
    this._serverProfileDao = serverProfileDao;
    this._proxyDao = proxyDao;
  }

  private getDefaultGlobalSettings(): FrpcGlobalSettings {
    return {
      _id: this._settingsId,
      frpcVersion: null,
      system: {
        launchAtStartup: false,
        silentStartup: false,
        autoConnectOnStartup: false,
        language: GlobalConstant.DEFAULT_LANGUAGE
      }
    };
  }

  private getDefaultServerProfile(): FrpsServerProfile {
    return {
      _id: "",
      name: "",
      multiuser: false,
      loginFailExit: false,
      udpPacketSize: 1500,
      serverAddr: "",
      serverPort: 7000,
      auth: {
        method: "none",
        token: ""
      },
      log: {
        to: "",
        level: "info",
        maxDays: 3,
        disablePrintColor: false
      },
      transport: {
        dialServerTimeout: 10,
        dialServerKeepalive: 7200,
        poolCount: 0,
        tcpMux: true,
        tcpMuxKeepaliveInterval: 30,
        protocol: "tcp",
        connectServerLocalIP: "",
        proxyURL: "",
        tls: {
          enable: true,
          certFile: "",
          keyFile: "",
          trustedCaFile: "",
          serverName: "",
          disableCustomTLSFirstByte: true
        },
        heartbeatInterval: 30,
        heartbeatTimeout: 90
      },
      metadatas: {
        token: ""
      },
      user: ""
    };
  }

  private normalizeGlobalSettings(
    settings?: Partial<FrpcGlobalSettings> | null
  ): FrpcGlobalSettings {
    const defaults = this.getDefaultGlobalSettings();
    return {
      _id: settings?._id || defaults._id,
      frpcVersion:
        settings?.frpcVersion === undefined || settings?.frpcVersion === null
          ? defaults.frpcVersion
          : settings.frpcVersion,
      system: {
        ...defaults.system,
        ...(settings?.system || {})
      }
    };
  }

  private normalizeServerProfile(
    profile?: Partial<FrpsServerProfile> | null
  ): FrpsServerProfile {
    const defaults = this.getDefaultServerProfile();
    const normalized = {
      ...defaults,
      ...(profile || {}),
      auth: {
        ...defaults.auth,
        ...(profile?.auth || {})
      },
      log: {
        ...defaults.log,
        ...(profile?.log || {})
      },
      transport: {
        ...defaults.transport,
        ...(profile?.transport || {}),
        tls: {
          ...defaults.transport.tls,
          ...(profile?.transport?.tls || {})
        }
      },
      metadatas: {
        ...defaults.metadatas,
        ...(profile?.metadatas || {})
      }
    } as FrpsServerProfile;

    if (!normalized.name) {
      normalized.name =
        normalized.serverAddr?.trim() || `Server ${normalized.serverPort}`;
    }
    if (!normalized.auth.method) {
      normalized.auth.method = "none";
    }

    return normalized;
  }

  private convertLegacyToGlobalSettings(
    legacyConfig: OpenSourceFrpcDesktopServer
  ): FrpcGlobalSettings {
    return this.normalizeGlobalSettings({
      _id: this._settingsId,
      frpcVersion: legacyConfig.frpcVersion,
      system: legacyConfig.system
    });
  }

  private convertLegacyToServerProfile(
    legacyConfig: OpenSourceFrpcDesktopServer
  ): FrpsServerProfile {
    return this.normalizeServerProfile({
      name: legacyConfig.serverAddr || "Migrated Server",
      multiuser: legacyConfig.multiuser,
      loginFailExit: legacyConfig.loginFailExit,
      udpPacketSize: legacyConfig.udpPacketSize,
      serverAddr: legacyConfig.serverAddr,
      serverPort: legacyConfig.serverPort,
      auth: legacyConfig.auth,
      log: legacyConfig.log,
      transport: legacyConfig.transport,
      metadatas: legacyConfig.metadatas,
      user: legacyConfig.user
    });
  }

  private async ensureMigrated() {
    if (!this._migrationPromise) {
      this._migrationPromise = this.migrateLegacyData();
    }
    await this._migrationPromise;
  }

  private async migrateLegacyData() {
    const [settingsExists, legacyConfig, profiles] = await Promise.all([
      this._serverDao.exists(this._settingsId),
      this._serverDao.findLegacyConfig(),
      this._serverProfileDao.findAll()
    ]);

    let migrated = false;

    if (!settingsExists) {
      if (legacyConfig && legacyConfig.serverAddr) {
        await this._serverDao.updateById(
          this._settingsId,
          this.convertLegacyToGlobalSettings(legacyConfig)
        );
        migrated = true;
      } else {
        await this._serverDao.updateById(
          this._settingsId,
          this.getDefaultGlobalSettings()
        );
      }
    }

    if (profiles.length === 0 && legacyConfig && legacyConfig.serverAddr) {
      await this._serverProfileDao.insert(
        this.convertLegacyToServerProfile(legacyConfig)
      );
      migrated = true;
    }

    if (migrated) {
      try {
        await this._serverDao.deleteById("1");
      } catch (error) {
        Logger.warn("ServerService.migrateLegacyData", `${error}`);
      }
    }
  }

  async saveGlobalSettings(
    settings: Partial<FrpcGlobalSettings>
  ): Promise<FrpcGlobalSettings> {
    await this.ensureMigrated();
    const normalized = this.normalizeGlobalSettings({
      ...(await this.getGlobalSettings()),
      ...settings,
      _id: this._settingsId
    });
    const newConfig = await this._serverDao.updateById(
      this._settingsId,
      normalized
    );
    try {
      app.setLoginItemSettings({
        openAtLogin: newConfig.system.launchAtStartup || false,
        openAsHidden: newConfig.system.launchAtStartup || false
      });
    } catch (error) {
      Logger.error("ServerService.saveGlobalSettings", error);
    }
    return newConfig;
  }

  async getGlobalSettings(): Promise<FrpcGlobalSettings> {
    await this.ensureMigrated();
    const settings = await this._serverDao.findById(this._settingsId);
    if (!settings) {
      return this.getDefaultGlobalSettings();
    }
    return this.normalizeGlobalSettings(settings);
  }

  async saveServerProfile(
    profile: Partial<FrpsServerProfile>
  ): Promise<FrpsServerProfile> {
    await this.ensureMigrated();
    const normalized = this.normalizeServerProfile(profile);
    let saved: FrpsServerProfile;
    if (normalized._id) {
      saved = await this._serverProfileDao.updateById(normalized._id, normalized);
    } else {
      saved = await this._serverProfileDao.insert(normalized);
    }
    Logger.setLevel(saved.log.level || "info");
    return saved;
  }

  async getServerProfiles(): Promise<FrpsServerProfile[]> {
    await this.ensureMigrated();
    const profiles = await this._serverProfileDao.findAll();
    return profiles
      .map(profile => this.normalizeServerProfile(profile))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getServerProfile(serverId: string): Promise<FrpsServerProfile | null> {
    await this.ensureMigrated();
    const profile = await this._serverProfileDao.findById(serverId);
    return profile ? this.normalizeServerProfile(profile) : null;
  }

  async deleteServerProfile(serverId: string): Promise<void> {
    await this.ensureMigrated();
    await this._serverProfileDao.deleteById(serverId);
  }

  async hasServerConfig(): Promise<boolean> {
    const profiles = await this.getServerProfiles();
    return profiles.some(profile => !!profile.serverAddr);
  }

  private isRangePort(proxy: FrpcProxy) {
    return (
      ["tcp", "udp"].indexOf(proxy.type) >= 0 &&
      (String(proxy.localPort).indexOf("-") !== -1 ||
        String(proxy.localPort).indexOf(",") !== -1)
    );
  }

  private isVisitors(proxy: FrpcProxy) {
    return (
      ["stcp", "sudp", "xtcp"].indexOf(proxy.type) >= 0 &&
      proxy.visitorsModel === "visitors"
    );
  }

  private isEnableProxy(proxy: FrpcProxy) {
    return proxy.status === 1;
  }

  private isHttps2http(proxy: FrpcProxy) {
    return proxy.https2http;
  }

  private buildRuntimeServerConfig(
    profile: FrpsServerProfile,
    runtime: TomlRuntimeOptions
  ): FrpcCommonConfig {
    return {
      user: profile.user,
      serverAddr: profile.serverAddr,
      serverPort: profile.serverPort,
      loginFailExit: GlobalConstant.FRPC_LOGIN_FAIL_EXIT,
      log: {
        to: runtime.logPath,
        level: profile.log.level,
        maxDays: profile.log.maxDays,
        disablePrintColor: profile.log.disablePrintColor
      },
      auth:
        profile.auth.method === "none"
          ? null
          : {
              method: profile.auth.method,
              token: profile.auth.token
            },
      webServer: {
        addr: GlobalConstant.LOCAL_IP,
        port: runtime.webServerPort,
        user: "",
        password: "",
        pprofEnable: false
      },
      transport: {
        dialServerTimeout: profile.transport.dialServerTimeout,
        dialServerKeepalive: profile.transport.dialServerKeepalive,
        poolCount: profile.transport.poolCount,
        tcpMux: profile.transport.tcpMux,
        tcpMuxKeepaliveInterval: profile.transport.tcpMuxKeepaliveInterval,
        protocol: profile.transport.protocol,
        connectServerLocalIP: profile.transport.connectServerLocalIP,
        proxyURL: profile.transport.proxyURL,
        tls: {
          enable: profile.transport.tls.enable,
          certFile: profile.transport.tls.certFile,
          keyFile: profile.transport.tls.keyFile,
          trustedCaFile: profile.transport.tls.trustedCaFile,
          serverName: profile.transport.tls.serverName,
          disableCustomTLSFirstByte:
            profile.transport.tls.disableCustomTLSFirstByte
        },
        heartbeatInterval: profile.transport.heartbeatInterval,
        heartbeatTimeout: profile.transport.heartbeatTimeout
      },
      udpPacketSize: profile.udpPacketSize,
      metadatas: {
        ...profile.metadatas
      }
    } as FrpcCommonConfig;
  }

  async genTomlConfig(
    profile: FrpsServerProfile,
    outputPath: string,
    runtime: TomlRuntimeOptions
  ) {
    if (!outputPath) {
      return;
    }
    const proxies = await this._proxyDao.findAll();

    const enabledRangePortProxies = proxies
      .filter(proxy => this.isEnableProxy(proxy))
      .filter(proxy => !this.isVisitors(proxy))
      .filter(proxy => this.isRangePort(proxy))
      .map(proxy => {
        return `
{{- range $_, $v := parseNumberRangePair "${proxy.localPort}" "${proxy.remotePort}" }}
[[proxies]]

type = "${proxy.type}"
name = "${proxy.name}-{{ $v.First }}"
localIP = "${proxy.localIP}"
localPort = {{ $v.First }}
remotePort = {{ $v.Second }}
{{- end }}
`;
      });

    const enabledProxies = proxies
      .filter(proxy => this.isEnableProxy(proxy))
      .filter(proxy => !this.isVisitors(proxy))
      .filter(proxy => !this.isRangePort(proxy))
      .map(proxy => {
        if (proxy.type === "tcp" || proxy.type === "udp") {
          return {
            name: proxy.name,
            type: proxy.type,
            localIP: proxy.localIP,
            localPort: parseInt(proxy.localPort),
            remotePort: parseInt(proxy.remotePort),
            transport: proxy.transport
          };
        }
        if (proxy.type === "http" || proxy.type === "https") {
          const locations = proxy.locations.filter(location => location !== "");
          if (this.isHttps2http(proxy) && proxy.type === "https") {
            return {
              name: proxy.name,
              type: proxy.type,
              customDomains: proxy.customDomains,
              subdomain: proxy.subdomain,
              transport: proxy.transport,
              ...(locations.length > 0 ? { locations } : {}),
              ...(proxy.https2http
                ? {
                    plugin: {
                      type: "https2http",
                      localAddr: `${proxy.localIP}:${proxy.localPort}`,
                      crtPath: proxy.https2httpCaFile,
                      keyPath: proxy.https2httpKeyFile
                    }
                  }
                : {})
            };
          }
          return {
            name: proxy.name,
            type: proxy.type,
            localIP: proxy.localIP,
            localPort: parseInt(proxy.localPort),
            customDomains: proxy.customDomains,
            transport: proxy.transport,
            subdomain: proxy.subdomain,
            ...(locations.length > 0 ? { locations } : {}),
            ...(proxy.basicAuth
              ? { httpUser: proxy.httpUser, httpPassword: proxy.httpPassword }
              : {})
          };
        }
        if (
          proxy.type === "stcp" ||
          proxy.type === "xtcp" ||
          proxy.type === "sudp"
        ) {
          return {
            name: proxy.name,
            type: proxy.type,
            transport: proxy.transport,
            localIP: proxy.localIP,
            localPort: parseInt(proxy.localPort),
            secretKey: proxy.secretKey
          };
        }
        return null;
      })
      .filter(Boolean);

    const enableVisitors = proxies
      .filter(proxy => this.isEnableProxy(proxy))
      .filter(proxy => this.isVisitors(proxy))
      .map(proxy => {
        if (proxy.type === "xtcp") {
          return {
            name: proxy.name,
            type: proxy.type,
            serverName: proxy.serverName,
            secretKey: proxy.secretKey,
            bindAddr: proxy.bindAddr,
            bindPort: proxy.bindPort,
            keepTunnelOpen: proxy.keepTunnelOpen,
            fallbackTo: proxy.fallbackTo,
            fallbackTimeoutMs: proxy.fallbackTimeoutMs
          };
        }
        return {
          name: proxy.name,
          type: proxy.type,
          serverName: proxy.serverName,
          secretKey: proxy.secretKey,
          bindAddr: proxy.bindAddr,
          bindPort: proxy.bindPort
        };
      });

    const frpcConfig = this.buildRuntimeServerConfig(profile, runtime);

    let toml = TOML.stringify({
      ...frpcConfig,
      ...(enabledProxies.length > 0 ? { proxies: enabledProxies } : {}),
      ...(enableVisitors.length > 0 ? { visitors: enableVisitors } : {})
    });

    enabledRangePortProxies.forEach(content => {
      toml += `\n${content}`;
    });

    fs.writeFileSync(outputPath, toml, { flag: "w" });
  }

  private mapTomlToServerProfile(
    sourceConfig: Record<string, any>,
    filePath: string
  ): FrpsServerProfile {
    const config = this.getDefaultServerProfile();
    config.name = path.basename(filePath, path.extname(filePath));

    if (sourceConfig.loginFailExit !== undefined) {
      config.loginFailExit = sourceConfig.loginFailExit as boolean;
    }
    if (sourceConfig.udpPacketSize !== undefined) {
      config.udpPacketSize = sourceConfig.udpPacketSize as number;
    }
    if (sourceConfig.serverAddr !== undefined) {
      config.serverAddr = sourceConfig.serverAddr as string;
    }
    if (sourceConfig.serverPort !== undefined) {
      config.serverPort = sourceConfig.serverPort as number;
    }
    if (sourceConfig.user !== undefined) {
      config.user = sourceConfig.user as string;
    }

    if (sourceConfig.auth) {
      if ((sourceConfig.auth as AuthConfig).method !== undefined) {
        config.auth.method = (sourceConfig.auth as AuthConfig).method as string;
      }
      if ((sourceConfig.auth as AuthConfig).token !== undefined) {
        config.auth.token = (sourceConfig.auth as AuthConfig).token as string;
      }
    }

    if (sourceConfig.log as LogConfig) {
      if ((sourceConfig.log as LogConfig).level !== undefined) {
        config.log.level = (sourceConfig.log as LogConfig).level as string;
      }
      if ((sourceConfig.log as LogConfig).maxDays !== undefined) {
        config.log.maxDays = (sourceConfig.log as LogConfig).maxDays as number;
      }
      if ((sourceConfig.log as LogConfig).disablePrintColor !== undefined) {
        config.log.disablePrintColor = (sourceConfig.log as LogConfig)
          .disablePrintColor as boolean;
      }
    }

    if (sourceConfig.transport as TransportConfig) {
      if (
        (sourceConfig.transport as TransportConfig).dialServerTimeout !==
        undefined
      ) {
        config.transport.dialServerTimeout = (
          sourceConfig.transport as TransportConfig
        ).dialServerTimeout as number;
      }
      if (
        (sourceConfig.transport as TransportConfig).dialServerKeepalive !==
        undefined
      ) {
        config.transport.dialServerKeepalive = (
          sourceConfig.transport as TransportConfig
        ).dialServerKeepalive as number;
      }
      if ((sourceConfig.transport as TransportConfig).poolCount !== undefined) {
        config.transport.poolCount = (
          sourceConfig.transport as TransportConfig
        ).poolCount as number;
      }
      if ((sourceConfig.transport as TransportConfig).tcpMux !== undefined) {
        config.transport.tcpMux = (
          sourceConfig.transport as TransportConfig
        ).tcpMux as boolean;
      }
      if (
        (sourceConfig.transport as TransportConfig).tcpMuxKeepaliveInterval !==
        undefined
      ) {
        config.transport.tcpMuxKeepaliveInterval = (
          sourceConfig.transport as TransportConfig
        ).tcpMuxKeepaliveInterval as number;
      }
      if ((sourceConfig.transport as TransportConfig).protocol !== undefined) {
        config.transport.protocol = (
          sourceConfig.transport as TransportConfig
        ).protocol as string;
      }
      if (
        (sourceConfig.transport as TransportConfig).connectServerLocalIP !==
        undefined
      ) {
        config.transport.connectServerLocalIP = (
          sourceConfig.transport as TransportConfig
        ).connectServerLocalIP as string;
      }
      if ((sourceConfig.transport as TransportConfig).proxyURL !== undefined) {
        config.transport.proxyURL = (
          sourceConfig.transport as TransportConfig
        ).proxyURL as string;
      }
      if (
        (sourceConfig.transport as TransportConfig).heartbeatInterval !==
        undefined
      ) {
        config.transport.heartbeatInterval = (
          sourceConfig.transport as TransportConfig
        ).heartbeatInterval as number;
      }
      if (
        (sourceConfig.transport as TransportConfig).heartbeatTimeout !==
        undefined
      ) {
        config.transport.heartbeatTimeout = (
          sourceConfig.transport as TransportConfig
        ).heartbeatTimeout as number;
      }

      if ((sourceConfig.transport as TransportTlsConfig).enable !== undefined) {
        config.transport.tls.enable = (
          sourceConfig.transport as TransportTlsConfig
        ).enable as boolean;
      }
      if (
        (sourceConfig.transport as TransportTlsConfig).certFile !== undefined
      ) {
        config.transport.tls.certFile = (
          sourceConfig.transport as TransportTlsConfig
        ).certFile as string;
      }
      if ((sourceConfig.transport as TransportTlsConfig).keyFile !== undefined) {
        config.transport.tls.keyFile = (
          sourceConfig.transport as TransportTlsConfig
        ).keyFile as string;
      }
      if (
        (sourceConfig.transport as TransportTlsConfig).trustedCaFile !==
        undefined
      ) {
        config.transport.tls.trustedCaFile = (
          sourceConfig.transport as TransportTlsConfig
        ).trustedCaFile as string;
      }
      if (
        (sourceConfig.transport as TransportTlsConfig).serverName !== undefined
      ) {
        config.transport.tls.serverName = (
          sourceConfig.transport as TransportTlsConfig
        ).serverName as string;
      }
      if (
        (sourceConfig.transport as TransportTlsConfig).disableCustomTLSFirstByte !==
        undefined
      ) {
        config.transport.tls.disableCustomTLSFirstByte = (
          sourceConfig.transport as TransportTlsConfig
        ).disableCustomTLSFirstByte as boolean;
      }
    }

    if (sourceConfig.metadatas as Record<string, any>) {
      if ((sourceConfig.metadatas as Record<string, any>).token !== undefined) {
        config.metadatas.token = (sourceConfig.metadatas as Record<string, any>)
          .token as string;
      }
    }

    return this.normalizeServerProfile(config);
  }

  async importTomlConfig(): Promise<ImportTomlResult> {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Frpc Toml ConfigFile", extensions: ["toml"] }]
    });
    if (result.canceled) {
      return {
        canceled: true,
        path: ""
      };
    }

    const filePath = result.filePaths[0];
    const fileExtension = path.extname(filePath);
    if (fileExtension !== GlobalConstant.TOML_EXT) {
      throw new Error(`导入失败，暂不支持 ${fileExtension} 格式文件`);
    }

    const tomlData = fs.readFileSync(filePath, "utf-8");
    const sourceConfig = TOML.parse(tomlData) as Record<string, any>;
    const profile = await this.saveServerProfile(
      this.mapTomlToServerProfile(sourceConfig, filePath)
    );

    return {
      canceled: false,
      path: filePath,
      profile
    };
  }

  private sanitizeFileName(name: string) {
    return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim() || "server";
  }

  async exportAllConfigs(): Promise<ExportTomlResult> {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"]
    });
    if (result.canceled) {
      return {
        canceled: true,
        paths: []
      };
    }

    const targetDir = result.filePaths[0];
    const profiles = await this.getServerProfiles();
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "");
    const paths: string[] = [];

    for (const profile of profiles) {
      const outputPath = path.join(
        targetDir,
        `frpc-${this.sanitizeFileName(profile.name)}-${timestamp}.toml`
      );
      await this.genTomlConfig(profile, outputPath, {
        webServerPort: 57400,
        logPath: PathUtils.getServerLogFilePath(profile._id)
      });
      paths.push(outputPath);
    }

    return {
      canceled: false,
      paths
    };
  }

  async isSilentStart() {
    const settings = await this.getGlobalSettings();
    return settings.system.silentStartup;
  }

  async isAutoConnectOnStartup() {
    const settings = await this.getGlobalSettings();
    return settings.system.autoConnectOnStartup;
  }

  async getLoggerLevel() {
    const profiles = await this.getServerProfiles();
    return profiles[0]?.log.level || "info";
  }

  async getLanguage() {
    const settings = await this.getGlobalSettings();
    return settings.system.language || GlobalConstant.DEFAULT_LANGUAGE;
  }

  async saveLanguage(language: string) {
    const settings = await this.getGlobalSettings();
    settings.system.language = language;
    await this.saveGlobalSettings(settings);
  }
}

export default ServerService;
