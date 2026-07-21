import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

/** Maps to maindb.backofficeuser — utilisateurs du backoffice (auth JWT). */
@Entity('backofficeuser')
export class BackofficeUserEntity {
  @PrimaryGeneratedColumn({ name: 'backofficeuserid' })
  backofficeuserid: number;

  @Column()
  email: string;

  /** Hash bcrypt — jamais exposé dans les réponses API. */
  @Column()
  password: string;

  @Column({ nullable: true })
  firstname: string;

  @Column({ nullable: true })
  lastname: string;

  /** 'admin' | 'support' | 'club' */
  @Column({ default: 'support' })
  role: string;

  /** Organisateur rattaché — NULL pour le personnel interne. */
  @Column({ nullable: true })
  organizerid: number | null;

  @Column({ default: 1 })
  active: number;

  @Column({ name: 'lastlogints', nullable: true })
  lastlogints: Date;
}
