import i18n from "@/lang";
import { on, onListener, send } from "@/utils/ipcUtils";
import { ElMessage, ElMessageBox } from "element-plus";
import { defineStore } from "pinia";
import { ipcRouters, listeners } from "../../electron/core/IpcRouter";
import pkg from "../../package.json";

export const useFrpcDesktopStore = defineStore("frpcDesktop", {
  state: () => ({
    processStatus: "stopped" as FrpcLaunchStatus,
    processResults: [] as FrpcLaunchResult[],
    uptime: -1,
    versions: [] as FrpcVersion[],
    lastRelease: null,
    language: null as string | null,
    connectionError: null as string | null
  }),
  getters: {
    frpcProcessRunning: state =>
      state.processResults.some(result => result.running),
    frpcProcessUptime: state => state.uptime,
    frpcConnectionError: state => state.connectionError,
    frpcLaunchResults: state => state.processResults,
    frpcSummaryStatus: state => state.processStatus,
    frpcRunningCount: state =>
      state.processResults.filter(result => result.running).length,
    frpcTotalCount: state => state.processResults.length,
    downloadedVersions: state => state.versions,
    frpcDesktopLastRelease: state => state.lastRelease,
    frpcDesktopLanguage: state => state.language
  },
  actions: {
    hydrateProcessSummary(summary: FrpcLaunchSummary) {
      this.processStatus = summary.status;
      this.processResults = summary.results || [];

      const firstConnectionError = this.processResults.find(
        result => !!result.connectionError
      );
      const firstLaunchError = this.processResults.find(
        result =>
          result.lastStartTime > 0 &&
          !result.running &&
          !result.success &&
          result.message !== "Stopped"
      );

      this.connectionError =
        firstConnectionError?.connectionError || firstLaunchError?.message || null;

      const runningResults = this.processResults.filter(
        result => result.running && result.lastStartTime > 0
      );
      if (runningResults.length > 0) {
        const earliest = Math.min(
          ...runningResults.map(result => result.lastStartTime)
        );
        this.uptime = new Date().getTime() - earliest;
      } else {
        this.uptime = -1;
      }
    },

    onListenerFrpcProcessRunning() {
      onListener(listeners.watchFrpcProcess, data => {
        this.hydrateProcessSummary(data);
      });

      on(ipcRouters.LAUNCH.getStatus, data => {
        this.hydrateProcessSummary(data);
      });
    },

    onListenerDownloadedVersion() {
      on(ipcRouters.VERSION.getDownloadedVersions, data => {
        this.versions = data;
      });
    },

    refreshRunning() {
      send(ipcRouters.LAUNCH.getStatus);
    },

    refreshDownloadedVersion() {
      send(ipcRouters.VERSION.getDownloadedVersions);
    },

    onListenerFrpcDesktopGithubLastRelease(sd?: false) {
      on(ipcRouters.SYSTEM.getFrpcDesktopGithubLastRelease, data => {
        const { manual, version } = data;
        this.lastRelease = version;
        const tagName = this.lastRelease["tag_name"];
        let lastReleaseVersion = true;
        if (!tagName) {
          lastReleaseVersion = false;
        }
        const lastVersion = tagName.replace("v", "").toString();
        const currVersion = pkg.version;
        lastReleaseVersion = currVersion >= lastVersion;
        if (!lastReleaseVersion) {
          let content = this.lastRelease.body;
          content = content.replaceAll("\n", "<br/>");
          ElMessageBox.alert(
            content,
            `🎉 发现新版本 ${this.lastRelease.name}`,
            {
              showCancelButton: true,
              cancelButtonText: "关闭",
              dangerouslyUseHTMLString: true,
              confirmButtonText: "去下载"
            }
          ).then(() => {
            send(ipcRouters.SYSTEM.openUrl, {
              url: this.lastRelease["html_url"]
            });
          });
        } else if (manual) {
          ElMessage({
            message: "当前已是最新版本",
            type: "success"
          });
        }
      });
    },

    checkNewVersion(manual: boolean) {
      send(ipcRouters.SYSTEM.getFrpcDesktopGithubLastRelease, {
        manual: manual
      });
    },

    onListenerFrpcDesktopLanguage() {
      on(ipcRouters.SERVER.getLanguage, data => {
        this.language = data;
        i18n.global.locale = data;
      });
    },

    getLanguage() {
      send(ipcRouters.SERVER.getLanguage);
    }
  }
});
