import { ApiProperty } from '@nestjs/swagger';

export class SubscribableArchetypeDto {
  @ApiProperty({ description: 'gametablearchetype.gametablearchetypeid' })
  archetypeId: number;

  @ApiProperty({ description: 'gametablearchetype.type (0=classic, 1=mixedGendersSNG, 2=publicSNG, 3=publicCG, 4=privateCG)' })
  archetypeType: number;

  @ApiProperty({ description: 'gametablearchetype.tabletype (0=cashGame, 1=seatAndGo)' })
  tableType: number;

  @ApiProperty()
  tableSize: number;

  @ApiProperty()
  buyIn: number;

  @ApiProperty()
  hasVideo: number;

  @ApiProperty({ description: 'gametablearchetype.label' })
  label: string;

  @ApiProperty({ description: 'Petite blinde (CG uniquement, 0 pour les SNG)' })
  smallBlind: number;

  @ApiProperty({ description: 'Grosse blinde (CG uniquement, 0 pour les SNG)' })
  bigBlind: number;

  @ApiProperty({ description: 'Ante (CG uniquement, 0 pour les SNG)' })
  ante: number;
}
