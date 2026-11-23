import BaseRepository from "./BaseRepository";

class ServerProfileRepository extends BaseRepository<FrpsServerProfile> {
  constructor() {
    super("server-profile");
  }
}

export default ServerProfileRepository;
