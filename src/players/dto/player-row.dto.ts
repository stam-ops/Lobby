import { ApiProperty } from '@nestjs/swagger';

/** Ligne de la liste joueurs. Codes bruts (accountType…) — libellés côté front via enums. */
export class PlayerRowDto {
  @ApiProperty() playerId: number;
  @ApiProperty() screenName: string;
  @ApiProperty({ description: 'campok.client.codes.Player.AccountType (0=normal,1=premium,2-7=mod)' }) accountType: number;
  @ApiProperty({ nullable: true }) creationTs: string;
  @ApiProperty({ nullable: true, description: 'Fin d\'abonnement VIP' }) endVipTs: string;
  @ApiProperty({ description: 'Compte marqué pour suppression' }) toRemove: boolean;
  @ApiProperty({ description: 'Solde total (amount + amountbonus)' }) solde: number;
  @ApiProperty({ description: "Crédits Cam's" }) cams: number;
  @ApiProperty({ description: 'Banni du site (table blacklist)' }) siteBanned: boolean;
}

export class PlayerListDto {
  @ApiProperty({ type: [PlayerRowDto] }) items: PlayerRowDto[];
  @ApiProperty() total: number;
}

/** Fiche détail d'un joueur. */
export class PlayerDetailDto extends PlayerRowDto {
  @ApiProperty({ nullable: true }) email: string;
  @ApiProperty({ nullable: true }) firstName: string;
  @ApiProperty({ nullable: true }) lastName: string;
  @ApiProperty({ description: '0=homme, 1=femme' }) sex: number;
  @ApiProperty({ nullable: true }) birthdate: string;
  @ApiProperty({ description: '0=FB, 1=iOS, 2=téléphone' }) signInMethod: number;
  @ApiProperty({ nullable: true }) fbUid: string;
  @ApiProperty({ description: 'Plateforme (code brut)' }) os: number;
  @ApiProperty({ description: 'langid : 2=français, sinon anglais' }) langId: number;
  @ApiProperty({ nullable: true, description: 'Version de l\'app rapportée par le client' }) appVersion: number;
  @ApiProperty({ nullable: true, description: 'Token push FCM' }) tokenFb: string;
  @ApiProperty({ nullable: true, description: 'Token push iOS/APNs' }) tokenIos: string;
  @ApiProperty({ nullable: true }) lastRate: string;
  @ApiProperty({ nullable: true }) lastOpinion: string;
  @ApiProperty({ description: 'Notifications générales activées (0/1)' }) notifGeneral: number;
  @ApiProperty({ description: 'Notifications perso activées (0/1)' }) notifPerso: number;
  @ApiProperty({ nullable: true, description: 'Solde jetons (playeraccount.amount)' }) amount: number;
  @ApiProperty({ nullable: true, description: 'Solde bonus (playeraccount.amountbonus)' }) amountBonus: number;
  @ApiProperty({ nullable: true, description: "Crédits Cam's (playeraccount.cams)" }) cams: number;
  @ApiProperty() chatBanned: boolean;
  @ApiProperty() camBanned: boolean;
}
