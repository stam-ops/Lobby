import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ArchetypeDetailDto, ArchetypeRowDto, TournamentArchetypeRowDto,
  TournamentDetailDto, TournamentListDto, TournamentRowDto,
} from './dto/catalog.dto';

/** Archetypes de table (gametablearchetype) et tournois (tournament + tournamentarchetype). */
@Injectable()
export class CatalogService {
  constructor(private readonly dataSource: DataSource) {}

  archetypes(): Promise<ArchetypeRowDto[]> {
    return this.dataSource.query(`
      SELECT gametablearchetypeid AS id, label, type AS archetypeType, tabletype AS tableType,
             buyin AS buyIn, maxplayers AS maxPlayers, hasvideo AS hasVideo, isvalid AS isValid
      FROM gametablearchetype
      ORDER BY gametablearchetypeid DESC
    `);
  }

  async archetype(id: number): Promise<ArchetypeDetailDto> {
    const rows = await this.dataSource.query<ArchetypeDetailDto[]>(
      `SELECT gametablearchetypeid AS id, label, type AS archetypeType, tabletype AS tableType,
              buyin AS buyIn, minplayers AS minPlayers, maxplayers AS maxPlayers,
              moneytype AS moneyType, gametype AS gameType, limittype AS limitType,
              initstack AS initStack, blindstructureid AS blindStructureId,
              prizestructureid AS prizeStructureId, gametimeid AS gameTimeId,
              hasvideo AS hasVideo, isvalid AS isValid, clientid AS clientId
       FROM gametablearchetype WHERE gametablearchetypeid = ?`,
      [id],
    );
    if (!rows.length) throw new NotFoundException(`Archetype ${id} introuvable`);
    return rows[0];
  }

  tournamentArchetypes(): Promise<TournamentArchetypeRowDto[]> {
    return this.dataSource.query(`
      SELECT tournamentarchetypeid AS id, label, type, buyin AS buyIn, maxplayers AS maxPlayers,
             tablesize AS tableSize, structuretype AS structureType, hasvideo AS hasVideo, isvalid AS isValid
      FROM tournamentarchetype
      ORDER BY tournamentarchetypeid DESC
    `);
  }

  async tournaments(archetypeId: number | undefined, limit: number, offset: number): Promise<TournamentListDto> {
    const where = archetypeId != null ? 'WHERE tournamentarchetypeid = ?' : '';
    const filterArgs = archetypeId != null ? [archetypeId] : [];
    const items = await this.dataSource.query<TournamentRowDto[]>(
      `SELECT tournamentid AS id, label, starttime AS startTime, launchstate AS launchState,
              subscriptionstate AS subscriptionState, gamestate AS gameState,
              playerscount AS playersCount, ingameplayerscount AS inGamePlayersCount,
              tournamentarchetypeid AS tournamentArchetypeId
       FROM tournament ${where} ORDER BY tournamentid DESC LIMIT ? OFFSET ?`,
      [...filterArgs, limit, offset],
    );
    const totalRow = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*) AS total FROM tournament ${where}`, filterArgs,
    );
    return { items, total: totalRow[0]?.total ?? 0 };
  }

  async tournament(id: number): Promise<TournamentDetailDto> {
    const rows = await this.dataSource.query<TournamentDetailDto[]>(
      `SELECT t.tournamentid AS id, t.label, t.starttime AS startTime,
              t.launchstate AS launchState, t.subscriptionstate AS subscriptionState,
              t.gamestate AS gameState, t.playerscount AS playersCount,
              t.ingameplayerscount AS inGamePlayersCount, t.tournamentarchetypeid AS tournamentArchetypeId,
              ta.label AS archetypeLabel, ta.description AS description, ta.type AS archetypeType,
              ta.buyin AS buyIn, ta.moneytype AS moneyType, ta.gametype AS gameType,
              ta.limittype AS limitType, ta.structuretype AS structureType, ta.starttype AS startType,
              ta.minplayers AS minPlayers, ta.maxplayers AS maxPlayers, ta.tablesize AS tableSize,
              ta.hasvideo AS hasVideo, ta.initstack AS initStack, ta.minlevel AS minLevel
       FROM tournament t
       JOIN tournamentarchetype ta ON ta.tournamentarchetypeid = t.tournamentarchetypeid
       WHERE t.tournamentid = ?`,
      [id],
    );
    if (!rows.length) throw new NotFoundException(`Tournoi ${id} introuvable`);
    return rows[0];
  }
}
