import { ApiProperty } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** Maps to maindb.tournamentsubscription */
@Entity('tournamentsubscription')
export class TournamentSubscriptionEntity {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn({ name: 'tournamentsubscriptionid' })
  tournamentsubscriptionid: number;

  @ApiProperty({ example: 55 })
  @Column({ name: 'tournamentid' })
  tournamentid: number;

  @ApiProperty({ example: 123 })
  @Column({ name: 'playerid' })
  playerid: number;

  @ApiProperty({ example: 0, description: '0=inscrit, 1=désinscrit' })
  @Column({ default: 0 })
  subscription: number;

  @ApiProperty()
  @Column({ name: 'subscriptionts', type: 'timestamp' })
  subscriptionts: Date;
}
