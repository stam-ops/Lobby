import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** Maps to maindb.gametableplayer */
@Entity('gametableplayer')
export class GametablePlayerEntity {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn({ name: 'gametableplayerid' })
  gametableplayerid: number;

  @ApiProperty({ example: 12 })
  @Column({ name: 'gametableid' })
  gametableid: number;

  @ApiProperty({ example: 123 })
  @Column({ name: 'playerid' })
  playerid: number;

  @ApiProperty({ example: 3 })
  @Column({ name: 'seatno' })
  seatno: number;

  @ApiProperty({ example: 45200, description: 'Tapis en centimes' })
  @Column()
  stack: number;

  @ApiProperty({ example: 0, description: '0=présent, 1=AFK' })
  @Column({ default: 0 })
  ingamestate: number;

  @ApiProperty({ example: 0, description: '0=connecté, 1=déconnecté' })
  @Column({ default: 0 })
  tableconnectionstate: number;

  @ApiProperty({ example: 0, description: '1=chip leader, 0=en jeu (non classé)' })
  @Column({ default: 0 })
  rank: number;
}
