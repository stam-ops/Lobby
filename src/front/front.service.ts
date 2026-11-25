import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FrontAddressDto } from './dto/front-address.dto';
import { LobbyConnectionDto } from './dto/lobby-connection.dto';
import { GeneralParametersDto, GeneralParameters2Dto } from './dto/general-parameters.dto';
import { BonusAmountsDto } from './dto/bonus-amounts.dto';

@Injectable()
export class FrontService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Montants de bonus (parrainage + VIP) pour affichage côté client (arguments d'incitation).
   * Parrainage + daily VIP : table `bonus` (bonustype 12 = sponsorBonus/filleul, 3 = dailyBonusVip).
   * Cam's/mois VIP : table `offer` (abonnement VIP = producttype 1 ; l'offre MENSUELLE = la plus courte
   * en vipdays → camamount, ex. 30). Valeurs manquantes → 0 (le client masque la ligne concernée).
   */
  async getBonusAmounts(): Promise<BonusAmountsDto> {
    const [bonusRows, vipRows, gpRows] = await Promise.all([
      this.dataSource.query<{ bonustype: number; bankrollval: number; cams: number }[]>(`
        SELECT bonustype, bankrollval, cams FROM bonus WHERE bonustype IN (3, 12)
      `),
      this.dataSource.query<{ camamount: number }[]>(`
        SELECT camamount FROM offer
        WHERE active = 1 AND producttype = 1 AND camamount > 0
        ORDER BY vipdays ASC LIMIT 1
      `),
      this.dataSource.query<{ privatetablevipbonusactive: number }[]>(`
        SELECT privatetablevipbonusactive FROM generalparameters LIMIT 1
      `),
    ]);
    const by = (type: number) => bonusRows.find((r) => Number(r.bonustype) === type);
    const sponsor = by(12);
    const dailyVip = by(3);
    return {
      sponsorBonusP:     Number(sponsor?.bankrollval ?? 0),
      sponsorBonusCams:  Number(sponsor?.cams ?? 0),
      dailyVipBonusP:    Number(dailyVip?.bankrollval ?? 0),
      dailyVipBonusCams: Number(dailyVip?.cams ?? 0),
      monthlyVipCams:    Number(vipRows?.[0]?.camamount ?? 0),
      privateTableVipBonusActive: Number(gpRows?.[0]?.privatetablevipbonusactive ?? 0) === 1,
    };
  }

  // Source: Front.java → getAvailableFrontsCount()
  // front.maxconnection = limite par serveur front (colonne directe sur la table)
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
  // ip est stocké en INT → INET_NTOA pour obtenir la chaîne lisible
  getFrontConnectionAddresses(): Promise<FrontAddressDto[]> {
    return this.dataSource.query<FrontAddressDto[]>(`
      SELECT INET_NTOA(f.ip) AS ip, f.fqdn
      FROM front f
      WHERE f.endts = 0
        AND (SELECT COUNT(*) FROM connection c WHERE c.frontid = f.frontid AND c.endts = 0)
            < (SELECT maxfrontconnections FROM frontparameters LIMIT 1)
    `);
  }

  /**
   * Load balancer : renvoie le `fqdn` d'UN front à utiliser pour ouvrir la WebSocket client
   * (lien client = http://<fqdn>/FrontWebCampok/websocketendpoint).
   *
   * Fronts « dispos » = actifs (endts = 0) ET pas pleins (connexions ouvertes < maxconnection du front).
   * Parmi eux, tirage aléatoire PONDÉRÉ par `weight` (un front de poids 2x reçoit ~2x plus de clients).
   * Renvoie { fqdn: '' } si aucun front dispo (le client gère le cas → réessai / maintenance).
   */
  async getConnectFqdn(): Promise<{ fqdn: string }> {
    const rows = await this.dataSource.query<{ fqdn: string; weight: number }[]>(`
      SELECT f.fqdn, f.weight
      FROM front f
      WHERE f.endts = 0
        AND (SELECT COUNT(*) FROM connection c WHERE c.frontid = f.frontid AND c.endts = 0)
            < f.maxconnection
    `);
    if (!rows.length) return { fqdn: '' };

    const weights = rows.map(r => (Number(r.weight) > 0 ? Number(r.weight) : 0));
    const total = weights.reduce((s, w) => s + w, 0);
    if (total <= 0) return { fqdn: rows[0].fqdn }; // poids tous nuls → premier dispo

    let r = Math.random() * total;
    for (let i = 0; i < rows.length; i++) {
      r -= weights[i];
      if (r < 0) return { fqdn: rows[i].fqdn };
    }
    return { fqdn: rows[rows.length - 1].fqdn };
  }

  // Source: Front.java → getLobbyConnection()
  getLobby(): Promise<LobbyConnectionDto[]> {
    return this.dataSource.query<LobbyConnectionDto[]>(`
      SELECT INET_NTOA(ip) AS ip, weight FROM lobby WHERE endts = 0
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
