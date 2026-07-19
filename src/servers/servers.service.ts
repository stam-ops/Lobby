import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FrontServerDto, SipServerDto } from './dto/server.dto';

const toBool = (v: unknown): boolean => v === true || v === 1 || v === '1' || Number(v) === 1;

/**
 * Supervision des serveurs (backoffice).
 *
 *  - Fronts (table `front`)   : actif = endts vaut 0 (le load balancer route les fronts à endts=0 ;
 *    endFront met endts = NOW() à l'arrêt). cf. Bdd/.../Front.java.
 *  - SipServers (table `sipserver`) : vivacité via le heartbeat `lastts` (rafraîchi ~30 s). Le code
 *    (getAvailableCamServerInfo) considère vivant si lastts > NOW() - 60 s. `endts` n'est plus
 *    maintenu. Seuil configurable via SIP_ALIVE_SECONDS (défaut 60). cf. Bdd/.../SipServer.java.
 *
 * IP stockée en int signé → INET_NTOA(ip & 0xFFFFFFFF) pour l'affichage IPv4.
 */
@Injectable()
export class ServersService {
  private readonly sipAliveSeconds: number;

  constructor(
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.sipAliveSeconds = config.get<number>('SIP_ALIVE_SECONDS', 60);
  }

  async fronts(): Promise<FrontServerDto[]> {
    const rows = await this.dataSource.query<FrontServerDto[]>(`
      SELECT frontid AS frontId, fqdn, INET_NTOA(ip & 4294967295) AS ip,
             weight, maxconnection AS maxConnection, \`master\`,
             startts AS startTs, endts AS endTs,
             (endts = 0) AS active
      FROM front
      ORDER BY frontid DESC
    `);
    for (const r of rows) {
      r.active = toBool(r.active);
      r.master = toBool(r.master);
    }
    return rows;
  }

  /**
   * Modifie la capacité d'un front. C'est bien cette colonne que le load balancer utilise :
   * getConnectFqdn filtre `connexions ouvertes < f.maxconnection` (cf. front.service.ts).
   * Mettre 0 retirerait le front de la rotation → refusé.
   */
  async setFrontMaxConnection(frontId: number, maxConnection: number): Promise<FrontServerDto[]> {
    if (!Number.isInteger(maxConnection) || maxConnection < 1) {
      throw new BadRequestException('maxConnection doit être un entier >= 1 (0 retirerait le front de la rotation)');
    }
    const res = await this.dataSource.query(
      'UPDATE front SET maxconnection = ? WHERE frontid = ?', [maxConnection, frontId],
    );
    if (!res?.affectedRows) throw new NotFoundException(`Front ${frontId} introuvable`);
    return this.fronts();
  }

  async sipServers(): Promise<SipServerDto[]> {
    const rows = await this.dataSource.query<SipServerDto[]>(
      `
      SELECT sipserverid AS sipServerId, name, INET_NTOA(ip & 4294967295) AS ip, port,
             maxtables AS maxTables, fqdn, lastts AS lastTs,
             (lastts > NOW() - INTERVAL ? SECOND) AS active
      FROM sipserver
      ORDER BY sipserverid DESC
      `,
      [this.sipAliveSeconds],
    );
    for (const r of rows) r.active = toBool(r.active);
    return rows;
  }
}
