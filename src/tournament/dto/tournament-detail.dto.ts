import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SngStaticInfoDto {
  @ApiProperty({ example: 0, description: '0=réel, 1=fictif' })
  moneyType: number;

  @ApiProperty({ example: 0 })
  hasVideo: number;

  @ApiProperty({ example: 5000, description: 'Stack initial en jetons' })
  initialStack: number;

  @ApiProperty({ example: 300, description: 'Durée d\'un niveau en secondes' })
  levelDuration: number;

  @ApiProperty({ example: 9, description: 'Taille de la table' })
  tableSize: number;
}

export class TournamentStaticInfoDto {
  @ApiProperty({ example: 0 })
  moneyType: number;

  @ApiProperty({ example: 2 })
  minPlayers: number;

  @ApiProperty({ example: 0 })
  hasVideo: number;

  @ApiProperty({ example: 2, description: 'Dernier niveau pour late register' })
  lastLateRegisterLevel: number;

  @ApiProperty({ example: 0, description: 'ClientCodes.Tournament.StructureType' })
  structureType: number;

  @ApiProperty({ example: 0, description: 'Index du break addon (0 = pas de rebuy)' })
  addonBreakIndex: number;

  @ApiProperty({ example: 10000, description: 'Stack initial en jetons' })
  initialStack: number;

  @ApiProperty({ example: 600, description: 'Durée d\'un niveau en secondes' })
  levelDuration: number;

  @ApiProperty({ example: 9 })
  tableSize: number;

  @ApiProperty({ example: 1715000000, description: 'UNIX_TIMESTAMP(tournament.starttime)' })
  startTime: number;

  @ApiProperty({ example: 5000, description: 'Buy-in en centimes' })
  buyIn: number;

  @ApiProperty({ example: 100, description: 'Nombre de joueurs inscrits' })
  playersCount: number;

  @ApiProperty({ example: 0, description: '0=fill-up/SNG, 1=scheduled' })
  startType: number;

  @ApiProperty({ example: 0, description: 'tournamentarchetype.type' })
  type: number;

  @ApiProperty({ example: 0 })
  minLevel: number;

  @ApiPropertyOptional({ example: 1715003600, description: 'Fin de la période d\'inscription (startTime - timeForSubscriptions * 60s)' })
  registrationStartTime?: number;

  @ApiPropertyOptional({ example: 1715007200, description: 'Fin de la période de rebuy/addon' })
  rebuyAddOnEndTime?: number;

  @ApiPropertyOptional({ example: 1715005400, description: 'Fin du late register' })
  lateRegisterEndTime?: number;
}

export class TournamentDynamicInfoDto {
  @ApiProperty({ example: 150 })
  playersCount: number;

  @ApiProperty({ example: 120 })
  inGamePlayersCount: number;

  @ApiProperty({ example: 1, description: '0=non démarré, 1=en jeu, 2=break, 3=break addon, 4=terminé' })
  gameState: number;

  @ApiProperty({ example: 0 })
  subscriptionState: number;

  @ApiProperty({ example: 750000, description: 'Prize pool calculé en centimes' })
  prizePool: number;

  @ApiPropertyOptional({ example: 1715003600, description: 'Timestamp fin de break (si en break)' })
  breakEnd?: number;

  @ApiProperty({ example: 3, description: 'Niveau de blind actuel' })
  blindLevel: number;

  @ApiProperty({ example: 1715000000 })
  startTime: number;
}

export class BlindLevelDto {
  @ApiProperty({ example: 50 })
  smallBlind: number;

  @ApiProperty({ example: 100 })
  bigBlind: number;

  @ApiProperty({ example: 0 })
  ante: number;
}

export class TournamentBlindStructureDto {
  @ApiProperty({ example: 600 })
  levelTime: number;

  @ApiProperty({ type: [BlindLevelDto] })
  levels: BlindLevelDto[];
}

export class TournamentTableDto {
  @ApiProperty({ example: 12 })
  tableId: number;

  @ApiProperty({ example: 8 })
  playersCount: number;

  @ApiProperty({ example: 2500 })
  minStack: number;

  @ApiProperty({ example: 45000 })
  maxStack: number;
}

export class TournamentBlindInfoDto {
  @ApiProperty({ example: 3 })
  blindLevel: number;

  @ApiProperty({ example: 120, description: 'Secondes restantes dans le niveau actuel' })
  levelTimeLeft: number;

  @ApiProperty({ example: 100 })
  currentSmallBlind: number;

  @ApiProperty({ example: 200 })
  currentBigBlind: number;

  @ApiProperty({ example: 0 })
  currentAnte: number;

  @ApiPropertyOptional({ example: 150 })
  nextSmallBlind?: number;

  @ApiPropertyOptional({ example: 300 })
  nextBigBlind?: number;

  @ApiPropertyOptional({ example: 25 })
  nextAnte?: number;
}

export class ArchetypeDto {
  @ApiProperty({ example: 1 })
  tableArchetypeId: number;

  @ApiProperty({ example: 'NL Hold\'em 1/2' })
  label: string;

  @ApiProperty({ example: 9 })
  maxPlayers: number;

  @ApiProperty({ example: 1000, description: 'Buy-in en centimes' })
  buyIn: number;

  @ApiProperty({ example: 0 })
  moneyType: number;

  @ApiProperty({ example: 1 })
  gameType: number;

  @ApiProperty({ example: 0 })
  limitType: number;

  @ApiProperty({ example: 0 })
  hasVideo: number;

  @ApiProperty({ example: 2, description: 'ArchetypeType: 0=publicCG, 1=privateCG, 2=publicSNG, 3=mixedGendersSNG' })
  type: number;

  @ApiPropertyOptional({ example: 5, description: 'Nb joueurs en attente d\'inscription' })
  waitingCount?: number;
}

export class TablesPlayersCountDto {
  @ApiProperty({ example: 12 })
  tableId: number;

  @ApiProperty({ example: 6 })
  playersCount: number;
}

export class MixedSNGMissingPlayersDto {
  @ApiProperty({ example: 2 })
  menMissingCount: number;

  @ApiProperty({ example: 3 })
  womenMissingCount: number;
}

export class PrizeLevelDto {
  @ApiProperty({ example: 1 })
  position: number;

  @ApiProperty({ example: 50000, description: 'Gain en centimes' })
  amount: number;
}

export class TournamentPrizeStructureDto {
  @ApiProperty({ example: 100000, description: 'Prize pool total en centimes' })
  totalPrize: number;

  @ApiProperty({ type: [PrizeLevelDto] })
  levels: PrizeLevelDto[];
}

export class EventPlayerDto {
  @ApiProperty({ example: 123 })
  playerId: number;

  @ApiProperty({ example: 'JohnDoe' })
  screenName: string;

  @ApiProperty({ example: '123456789' })
  fbUid: string;
}

export class CGArchetypeTableDto {
  @ApiProperty({ example: 1 })
  tableArchetypeId: number;

  @ApiProperty({ example: 'NL Hold\'em 1/2' })
  label: string;

  @ApiProperty({ example: 9 })
  maxPlayers: number;

  @ApiProperty({ example: 100 })
  smallBlind: number;

  @ApiProperty({ example: 200 })
  bigBlind: number;

  @ApiProperty({ example: 0 })
  moneyType: number;

  @ApiProperty({ example: 1 })
  gameType: number;

  @ApiProperty({ example: 0 })
  limitType: number;
}
