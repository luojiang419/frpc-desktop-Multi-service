type FrpcDesktopProxy = FrpcProxyConfig & {};

interface BaseEntity {
  _id: string;
}

interface FrpcSystemConfiguration {
  launchAtStartup: boolean;
  silentStartup: boolean;
  autoConnectOnStartup: boolean;
  language: string;
}

type FrpcGlobalSettings = BaseEntity & {
  frpcVersion: number | null;
  system: FrpcSystemConfiguration;
};

type FrpsServerProfile = BaseEntity &
  Omit<FrpcCommonConfig, "webServer"> & {
    name: string;
    multiuser: boolean;
  };

type FrpcDesktopServer = BaseEntity &
  FrpcCommonConfig & {
    frpcVersion: number | null;
    multiuser: boolean;
  };

type FrpcVersion = BaseEntity & {
  githubReleaseId: number;
  githubAssetId: number;
  githubCreatedAt: string;
  name: string;
  assetName: string;
  versionDownloadCount: number;
  assetDownloadCount: number;
  browserDownloadUrl: string;
  downloaded: boolean;
  localPath: string;
  size: string;
};

type OpenSourceFrpcDesktopServer = FrpcDesktopServer & {
  system: FrpcSystemConfiguration;
};

type FrpcProxy = BaseEntity & FrpcProxyConfig & {
  status: number; // 0: disable 1: enable
};

type FrpcLaunchResult = {
  serverId: string;
  name: string;
  serverAddr: string;
  serverPort: number;
  running: boolean;
  success: boolean;
  message: string;
  connectionError: string | null;
  webServerPort: number | null;
  pid: number | null;
  lastStartTime: number;
};

type FrpcLaunchStatus = "running" | "stopped" | "error";

type FrpcLaunchSummary = {
  status: FrpcLaunchStatus;
  total: number;
  runningCount: number;
  errorCount: number;
  results: FrpcLaunchResult[];
};

type FrpcProcessState = {
  serverId: string;
  pid: number | null;
  running: boolean;
  success: boolean;
  lastStartTime: number;
  connectionError: string | null;
  webServerPort: number | null;
  configPath: string;
  logPath: string;
  message: string;
};
