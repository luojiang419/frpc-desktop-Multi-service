import fs from "fs";
import Logger from "../core/Logger";
import FrpcProcessService from "../service/FrpcProcessService";
import ServerService from "../service/ServerService";
import SystemService from "../service/SystemService";
import PathUtils from "../utils/PathUtils";
import ResponseUtils from "../utils/ResponseUtils";
import BaseController from "./BaseController";

class ConfigController extends BaseController {
  private readonly _serverService: ServerService;
  private readonly _systemService: SystemService;
  private readonly _frpcProcessService: FrpcProcessService;

  constructor(
    serverService: ServerService,
    systemService: SystemService,
    frpcProcessService: FrpcProcessService
  ) {
    super();
    this._serverService = serverService;
    this._systemService = systemService;
    this._frpcProcessService = frpcProcessService;
  }

  saveGlobalSettings(req: ControllerParam) {
    this._serverService
      .saveGlobalSettings(req.args)
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.saveGlobalSettings", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  getGlobalSettings(req: ControllerParam) {
    this._serverService
      .getGlobalSettings()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.getGlobalSettings", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  saveServerProfile(req: ControllerParam) {
    this._serverService
      .saveServerProfile(req.args)
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.saveServerProfile", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  getServerProfiles(req: ControllerParam) {
    this._serverService
      .getServerProfiles()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.getServerProfiles", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  deleteServerProfile(req: ControllerParam) {
    this._frpcProcessService
      .stopFrpcProcess(req.args)
      .then(() => this._serverService.deleteServerProfile(req.args))
      .then(() => {
        req.event.reply(req.channel, ResponseUtils.success());
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.deleteServerProfile", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  openAppData(req: ControllerParam) {
    this._systemService
      .openLocalPath(PathUtils.getAppData())
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.openAppData", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  resetAllConfig(req: ControllerParam) {
    this._frpcProcessService
      .stopFrpcProcess()
      .then(() => {
        fs.rmSync(PathUtils.getDataBaseStoragePath(), {
          recursive: true,
          force: true
        });
        fs.rmSync(PathUtils.getDownloadStoragePath(), {
          recursive: true,
          force: true
        });
        fs.rmSync(PathUtils.getVersionStoragePath(), {
          recursive: true,
          force: true
        });
        fs.rmSync(PathUtils.getFrpcLogStoragePath(), {
          recursive: true,
          force: true
        });
        fs.rmSync(PathUtils.getServerConfigStoragePath(), {
          recursive: true,
          force: true
        });
        req.event.reply(req.channel, ResponseUtils.success());
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.resetAllConfig", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  exportConfig(req: ControllerParam) {
    this._serverService
      .exportAllConfigs()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.exportConfig", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  importTomlConfig(req: ControllerParam) {
    this._serverService
      .importTomlConfig()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.importTomlConfig", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  getLanguage(req: ControllerParam) {
    this._serverService
      .getLanguage()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.getLanguage", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  saveLanguage(req: ControllerParam) {
    this._serverService
      .saveLanguage(req.args)
      .then(() => {
        req.event.reply(req.channel, ResponseUtils.success());
      })
      .catch((err: Error) => {
        Logger.error("ConfigController.saveLanguage", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }
}

export default ConfigController;
