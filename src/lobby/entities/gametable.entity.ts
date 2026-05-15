import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** Maps to maindb.gametable */
@Entity('gametable')
export class GametableEntity {
  @ApiProperty({ example: 12 })
  @PrimaryGeneratedColumn({ name: 'gametableid' })
  gametableid: number;

  @ApiPropertyOptional({ example: 'NL Hold\'em 1/2' })
  @Column({ nullable: true })
  label: string;

  @ApiProperty({ example: 0, description: 'campok.client.codes.GameTable.LaunchState' })
  @Column({ default: 0 })
  launchstate: number;

  @ApiProperty({ example: 0, description: 'campok.client.codes.GameTable.GameState' })
  @Column({ default: 0 })
  gamestate: number;

  @ApiProperty({ example: 4 })
  @Column({ default: 0 })
  playerscount: number;

  @ApiProperty({ example: 0, description: '0=cashgame, 1=SNG, 2=tournament' })
  @Column({ default: 0 })
  tabletype: number;

  @ApiPropertyOptional({ example: 456 })
  @Column({ nullable: true })
  ownerplayerid: number;

  @ApiPropertyOptional({ example: 3 })
  @Column({ nullable: true })
  gametablearchetypeid: number;

  @ApiPropertyOptional({ example: 7 })
  @Column({ nullable: true })
  tournamentid: number;
}
