import { ApiProperty } from '@nestjs/swagger';

export class OpinionRowDto {
  @ApiProperty() playerOpinionId: number;
  @ApiProperty() playerId: number;
  @ApiProperty({ nullable: true }) screenName: string;
  @ApiProperty({ nullable: true }) creationTs: string;
  @ApiProperty({ nullable: true }) textFree: string;
  @ApiProperty({ description: 'note1 = Global' }) noteGlobal: number;
  @ApiProperty({ description: 'note2 = Design' }) noteDesign: number;
  @ApiProperty({ description: 'note3 = Simplicité' }) noteSimplicity: number;
  @ApiProperty({ description: 'note4 = Expérience de jeu' }) noteGameplay: number;
}

export class OpinionListDto {
  @ApiProperty({ type: [OpinionRowDto] }) items: OpinionRowDto[];
  @ApiProperty() total: number;
}
