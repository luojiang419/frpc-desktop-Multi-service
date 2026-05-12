import Logger from "../core/Logger";
import LogService from "../service/LogService";
import ResponseUtils from "../utils/ResponseUtils";
import BaseController from "./BaseController";

class LogController extends BaseController {
  private readonly _logService: LogService;

  constructor(logService: LogService) {
    super();
    this._logService = logService;
  }

  getFrpLogContent(req: ControllerParam) {
    this._logService
      .getFrpLogContent(req.args)
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("LogController.getFrpLogContent", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  getAppLogContent(req: ControllerParam) {
    this._logService
      .getAppLogContent()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("LogController.getAppLogContent", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  getServerLogOptions(req: ControllerParam) {
    this._logService
      .getServerLogOptions()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("LogController.getServerLogOptions", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  openFrpcLogFile(req: ControllerParam) {
    this._logService
      .openFrpcLogFile(req.args)
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("LogController.openFrpcLogFile", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  openAppLogFile(req: ControllerParam) {
    this._logService
      .openAppLogFile()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("LogController.openAppLogFile", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }
}

export default LogController;
