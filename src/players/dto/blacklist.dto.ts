import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Entrée blacklist (blocage d'accès total au site). Fournir AU MOINS un critère.
 * On peut cibler un joueur, une connexion ou une IP.
 */
export class BlacklistEntryDto {
  @ApiPropertyOptional({ example: 12345 })
  @IsOptional() @IsInt() @Min(1)
  playerId?: number;

  @ApiPropertyOptional({ example: 678 })
  @IsOptional() @IsInt() @Min(1)
  connectionId?: number;

  @ApiPropertyOptional({ description: 'IPv4 stockée en int (conversion depuis string à brancher plus tard)' })
  @IsOptional() @IsInt()
  ip?: number;
}
