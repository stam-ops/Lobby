import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OrganizerSignupService } from './organizer-signup.service';
import { QUOTA_COUNT_SQL } from '../club/organizer-space.service';

export interface OrganizerAdminRow {
  organizerId: number;
  name: string;
  /** Évènements annoncés par le demandeur — base de la décision de validation. */
  description: string | null;
  contactEmail: string;
  emailVerifiedTs: string | null;
  active: boolean;
  creationTs: string;
  maxTournamentsPerMonth: number;
  maxPlayersPerTournament: number;
  /** Compte backoffice rattaché — absent si le compte a été supprimé à la main. */
  backofficeUserId: number | null;
  userActive: boolean;
  lastLoginTs: string | null;
  /** Archétypes créés par cet organisateur (tous, puis sur 30 jours glissants). */
  tournamentsTotal: number;
  tournamentsThisMonth: number;
}

/**
 * Gestion des organisateurs par le personnel interne : file de validation, quotas, désactivation.
 *
 * ⚠️ La validation écrit DEUX drapeaux : `organizer.active` et `backofficeuser.active`. C'est le
 * second qui gouverne réellement l'accès (AdminAuthService.login refuse un compte inactif) ; le
 * premier sert aux services organisateur. Les désynchroniser produirait soit un organisateur
 * validé incapable de se connecter, soit l'inverse — d'où la transaction.
 */
@Injectable()
export class OrganizersAdminService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly signup: OrganizerSignupService,
  ) {}

  /**
   * @param status 'pending' = en attente de validation, 'active' = validés, sinon tous.
   *
   * Les dossiers NON vérifiés sont volontairement inclus : si l'e-mail de confirmation n'est pas
   * parti, l'organisateur ne peut rien faire de son côté et le dossier serait invisible à jamais.
   */
  async list(status: string): Promise<OrganizerAdminRow[]> {
    const conds: string[] = [];
    if (status === 'pending') conds.push('o.active = 0');
    if (status === 'active') conds.push('o.active = 1');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = await this.dataSource.query(`
      SELECT o.organizerid AS organizerId, o.name, o.description, o.contactemail AS contactEmail,
             o.emailverifiedts AS emailVerifiedTs, o.active, o.creationts AS creationTs,
             o.maxtournamentspermonth AS maxTournamentsPerMonth,
             o.maxplayerspertournament AS maxPlayersPerTournament,
             u.backofficeuserid AS backofficeUserId, u.active AS userActive,
             u.lastlogints AS lastLoginTs,
             (SELECT COUNT(*) FROM organizerarchetype oa
               WHERE oa.organizerid = o.organizerid) AS tournamentsTotal,
             -- Même décompte que celui vu par l'organisateur : les tournois annulés ne pèsent pas
             -- sur son quota, l'admin doit voir le même chiffre pour arbitrer une augmentation.
             (${QUOTA_COUNT_SQL.replace('oa.organizerid = ?', 'oa.organizerid = o.organizerid')})
               AS tournamentsThisMonth
      FROM organizer o
      LEFT JOIN backofficeuser u ON u.organizerid = o.organizerid
      ${where}
      ORDER BY o.creationts DESC
    `);

    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      active: Number(r.active) === 1,
      userActive: Number(r.userActive) === 1,
      tournamentsTotal: Number(r.tournamentsTotal),
      tournamentsThisMonth: Number(r.tournamentsThisMonth),
      backofficeUserId: r.backofficeUserId == null ? null : Number(r.backofficeUserId),
    })) as OrganizerAdminRow[];
  }

  /** Valide (ou suspend) un organisateur : les deux drapeaux bougent ensemble. */
  async setActive(organizerId: number, active: boolean): Promise<void> {
    const [org] = await this.dataSource.query<{ emailverifiedts: string | null }[]>(
      'SELECT emailverifiedts FROM organizer WHERE organizerid = ?',
      [organizerId],
    );
    if (!org) throw new NotFoundException(`Organisateur ${organizerId} introuvable`);
    if (active && !org.emailverifiedts) {
      throw new BadRequestException(
        "L'adresse e-mail de cet organisateur n'est pas confirmée. Relancer le lien de "
        + 'vérification avant de valider le dossier.',
      );
    }

    await this.dataSource.transaction(async (tx) => {
      await tx.query('UPDATE organizer SET active = ? WHERE organizerid = ?', [active ? 1 : 0, organizerId]);
      await tx.query('UPDATE backofficeuser SET active = ? WHERE organizerid = ?', [active ? 1 : 0, organizerId]);
    });
  }

  /**
   * File des demandes des organisateurs.
   *
   * @param status 'pending' = à traiter, 'handled' = traitées, sinon toutes.
   *
   * Le quota courant et la consommation sont joints : l'administrateur décide d'un relèvement en
   * regardant ces chiffres, les chercher sur un autre écran l'obligerait à naviguer.
   */
  async listRequests(status: string) {
    const conds: string[] = [];
    if (status === 'pending') conds.push('r.handledts IS NULL');
    if (status === 'handled') conds.push('r.handledts IS NOT NULL');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = await this.dataSource.query(`
      SELECT r.organizerrequestid AS id, r.type, r.message,
             r.creationts AS creationTs, r.handledts AS handledTs,
             u.email AS handledByEmail,
             o.organizerid AS organizerId, o.name AS organizerName,
             o.contactemail AS contactEmail,
             o.maxtournamentspermonth AS maxTournamentsPerMonth,
             o.maxplayerspertournament AS maxPlayersPerTournament,
             (${QUOTA_COUNT_SQL.replace('oa.organizerid = ?', 'oa.organizerid = o.organizerid')})
               AS usedThisMonth
        FROM organizerrequest r
        JOIN organizer o ON o.organizerid = r.organizerid
        LEFT JOIN backofficeuser u ON u.backofficeuserid = r.handledby
      ${where}
      ORDER BY r.handledts IS NOT NULL ASC, r.creationts DESC
    `);

    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      handled: r.handledTs != null,
      usedThisMonth: Number(r.usedThisMonth),
    }));
  }

  /** Marque une demande comme traitée (ou la rouvre). */
  async setRequestHandled(requestId: number, handled: boolean, adminId?: number) {
    const res = await this.dataSource.query(
      `UPDATE organizerrequest
          SET handledts = ${handled ? 'NOW()' : 'NULL'},
              handledby = ?
        WHERE organizerrequestid = ?`,
      [handled ? (adminId ?? null) : null, requestId],
    );
    if (!res?.affectedRows) throw new NotFoundException(`Demande ${requestId} introuvable`);
  }

  /** Ajuste les quotas. 0 = illimité. */
  async setQuota(organizerId: number, perMonth: number, maxPlayers: number): Promise<void> {
    if (!Number.isInteger(perMonth) || perMonth < 0) throw new BadRequestException('Quota mensuel invalide');
    if (!Number.isInteger(maxPlayers) || maxPlayers < 0) throw new BadRequestException('Plafond de joueurs invalide');
    const res = await this.dataSource.query(
      `UPDATE organizer SET maxtournamentspermonth = ?, maxplayerspertournament = ?
        WHERE organizerid = ?`,
      [perMonth, maxPlayers, organizerId],
    );
    if (!res?.affectedRows) throw new NotFoundException(`Organisateur ${organizerId} introuvable`);
  }

  /** Relance le lien de confirmation — utile si le premier envoi a échoué. */
  async resendVerification(organizerId: number): Promise<{ sent: boolean }> {
    const [org] = await this.dataSource.query<{ name: string; contactemail: string; emailverifiedts: string | null }[]>(
      'SELECT name, contactemail, emailverifiedts FROM organizer WHERE organizerid = ?',
      [organizerId],
    );
    if (!org) throw new NotFoundException(`Organisateur ${organizerId} introuvable`);
    if (org.emailverifiedts) throw new BadRequestException('Adresse déjà confirmée.');

    const sent = await this.signup.sendVerificationLink(organizerId, org.name, org.contactemail);
    return { sent };
  }

  /**
   * Supprime un dossier refusé. Refusé si des tournois lui sont rattachés : ils resteraient
   * orphelins alors que les archétypes, eux, continueraient d'être planifiés.
   */
  async remove(organizerId: number): Promise<void> {
    const [{ n }] = await this.dataSource.query<{ n: number }[]>(
      'SELECT COUNT(*) AS n FROM organizerarchetype WHERE organizerid = ?',
      [organizerId],
    );
    if (Number(n) > 0) {
      throw new BadRequestException(
        `Cet organisateur a déjà créé ${n} tournoi(s) : le suspendre plutôt que le supprimer.`,
      );
    }
    await this.dataSource.transaction(async (tx) => {
      // L'utilisateur d'abord : la FK backofficeuser.organizerid empêcherait la suppression.
      await tx.query('DELETE FROM backofficeuser WHERE organizerid = ?', [organizerId]);
      await tx.query('DELETE FROM organizer WHERE organizerid = ?', [organizerId]);
    });
  }
}
