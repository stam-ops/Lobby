import { ApiProperty } from '@nestjs/swagger';

export class SubscribableArchetypeDto {
  @ApiProperty({ description: 'gametablearchetype.gametablearchetypeid' })
  archetypeId: number;

  @ApiProperty({ description: 'gametablearchetype.type (1=mixedGendersSNG, 2=publicSNG, 3=publicCG...)' })
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
}
