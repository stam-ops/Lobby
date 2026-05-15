import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** Maps to maindb.tournament */
@Entity('tournament')
export class TournamentEntity {
  @ApiProperty({ example: 55 })
  @PrimaryGeneratedColumn({ name: 'tournamentid' })
  tournamentid: number;

  @ApiProperty({ example: 2 })
  @Column({ name: 'tournamentarchetypeid' })
  tournamentarchetypeid: number;

  @ApiProperty({ example: 'Sunday Major 50€' })
  @Column()
  label: string;

  @ApiProperty({ example: '2024-05-15T18:00:00.000Z' })
  @Column({ name: 'starttime', type: 'timestamp' })
  starttime: Date;

  @ApiProperty({ example: 0, description: 'Mis à jour par ServersManager puis TournamentServer' })
  @Column({ default: 0 })
  launchstate: number;

  @ApiProperty({ example: 0, description: 'Mis à jour par TournamentServer' })
  @Column({ default: 0 })
  subscriptionstate: number;

  @ApiProperty({ example: 0 })
  @Column({ default: 0 })
  gamestate: number;

  @ApiProperty({ example: 243 })
  @Column({ default: 0 })
  playerscount: number;

  @ApiProperty({ example: 120 })
  @Column({ default: 0 })
  ingameplayerscount: number;
}
