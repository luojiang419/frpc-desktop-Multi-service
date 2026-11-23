import BaseRepository from "./BaseRepository";

class ServerRepository extends BaseRepository<any> {
  constructor() {
    super("server");
  }

  exists(id: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.db.count({ _id: id }, (err, count) => {
        if (err) {
          reject(err);
        } else {
          resolve(count > 0);
        }
      });
    });
  }

  findLegacyConfig(): Promise<OpenSourceFrpcDesktopServer | null> {
    return new Promise((resolve, reject) => {
      this.db.findOne({ _id: "1" }, (err, document) => {
        if (err) {
          reject(err);
        } else {
          resolve(document || null);
        }
      });
    });
  }
}

export default ServerRepository;
