import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FrontAddressDto } from './dto/front-address.dto';
import { LobbyConnectionDto } from './dto/lobby-connection.dto';
import { GeneralParametersDto, GeneralParameters2Dto } from './dto/general-parameters.dto';

@Injectable()
export class FrontService {
  constructor(private readonly dataSource: DataSource) {}

  // Source: Front.java → getAvailableFrontsCount()
  async isFrontAvailable(): Promise<{ available: boolean }> {
    const rows = await this.dataSource.query<{ mycount: number }[]>(`
      SELECT COUNT(*) as mycount
      FROM front f
      WHERE f.endts = 0
        AND (SELECT COUNT(*) FROM connection c WHERE c.frontid = f.frontid AND c.endts = 0)
            < (SELECT maxfrontconnections FROM frontparameters LIMIT 1)
    `);
    return { available: rows[0].mycount > 0 };
  }

  // Source: Front.java → getFrontConnectionAdresses()
  getFrontConnectionAddresses(): Promise<FrontAddressDto[]> {
    return this.dataSource.query<FrontAddressDto[]>(`
      SELECT f.ip, f.port
      FROM front f
      WHERE f.endts = 0
        AND (SELECT COUNT(*) FROM connection c WHERE c.frontid = f.frontid AND c.endts = 0)
            < (SELECT maxfrontconnections FROM frontparameters LIMIT 1)
    `);
  }

  // Source: Front.java → getLobbyConnection()
  getLobby(): Promise<LobbyConnectionDto[]> {
    return this.dataSource.query<LobbyConnectionDto[]>(`
      SELECT ip, weight FROM lobby WHERE endts = 0
    `);
  }

  // Source: Front.java → getGeneralParameters()
  async getGeneralParameters(): Promise<GeneralParametersDto> {
    const [params, connCount] = await Promise.all([
      this.dataSource.query<any[]>(`
        SELECT friendswsperiod, gamewsperiod, getmaxplayer, getmaxfriends,
               getmaxsponsored, getmaxnotif, getmaxtrresult, maxconnections
        FROM generalparameters LIMIT 1
      `),
      this.dataSource.query<{ nb: number }[]>(`
        SELECT COUNT(*) as nb FROM connection WHERE endts = 0
      `),
    ]);
    const p = params[0];
    const nbConn = connCount[0].nb;
    return {
      friendWsPeriod: p.friendswsperiod,
      gameWsPeriod: p.gamewsperiod,
      maintenance: nbConn >= p.maxconnections,
      maxPlayer: p.getmaxplayer,
      maxFriends: p.getmaxfriends,
      maxSponsored: p.getmaxsponsored,
      maxNotif: p.getmaxnotif,
      maxTrResult: p.getmaxtrresult,
    };
  }

  // Source: Front.java → getGeneralParameters2()
  async getGeneralParameters2(): Promise<GeneralParameters2Dto> {
    const [params, connCount] = await Promise.all([
      this.dataSource.query<any[]>(`
        SELECT friendswsperiod, gamewsperiod, getmaxplayer, getmaxfriends,
               getmaxsponsored, getmaxnotif, getmaxtrresult, maxconnections,
               getmaxnetworkfriends, getmaxclubtournaments
        FROM generalparameters LIMIT 1
      `),
      this.dataSource.query<{ nb: number }[]>(`
        SELECT COUNT(*) as nb FROM connection WHERE endts = 0
      `),
    ]);
    const p = params[0];
    const nbConn = connCount[0].nb;
    return {
      friendWsPeriod: p.friendswsperiod,
      gameWsPeriod: p.gamewsperiod,
      maintenance: nbConn >= p.maxconnections,
      maxPlayer: p.getmaxplayer,
      maxFriends: p.getmaxfriends,
      maxSponsored: p.getmaxsponsored,
      maxNotif: p.getmaxnotif,
      maxTrResult: p.getmaxtrresult,
      maxNetworkFriends: p.getmaxnetworkfriends,
      maxClubTournaments: p.getmaxclubtournaments,
    };
  }
}
