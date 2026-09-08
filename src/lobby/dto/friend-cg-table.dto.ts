import { ApiProperty } from '@nestjs/swagger';
import { CgTableDto } from './cg-table.dto';

/**
 * Table de cash game où au moins un AMI Campok du joueur est actuellement assis (et où le joueur
 * lui-même n'est PAS assis). Étend CgTableDto avec la liste des amis présents → le lobby met ces
 * tables en avant (code couleur distinct des tables où le joueur est actif).
 */
export class FriendCgTableDto extends CgTableDto {
  @ApiProperty({ example: ['Alex', 'Marie'], description: 'Pseudos des amis assis à cette table' })
  friendNames: string[];

  @ApiProperty({ example: 2, description: "Nombre d'amis assis à cette table" })
  friendCount: number;
}
