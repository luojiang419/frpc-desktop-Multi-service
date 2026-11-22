import Logger from "../core/Logger";
import FrpcProcessService from "../service/FrpcProcessService";
import ResponseUtils from "../utils/ResponseUtils";
import BaseController from "./BaseController";

class LaunchController extends BaseController {
  private readonly _frpcProcessService: FrpcProcessService;

  constructor(frpcProcessService: FrpcProcessService) {
    super();
    this._frpcProcessService = frpcProcessService;
  }

  launch(req: ControllerParam) {
    this._frpcProcessService
      .startFrpcProcess()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("LaunchController.launch", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  terminate(req: ControllerParam) {
    this._frpcProcessService
      .stopFrpcProcess()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch(err => {
        Logger.error("LaunchController.terminate", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }

  getStatus(req: ControllerParam) {
    this._frpcProcessService
      .getStatusSummary()
      .then(data => {
        req.event.reply(req.channel, ResponseUtils.success(data));
      })
      .catch((err: Error) => {
        Logger.error("LaunchController.getStatus", err);
        req.event.reply(req.channel, ResponseUtils.fail(err));
      });
  }
}

export default LaunchController;
