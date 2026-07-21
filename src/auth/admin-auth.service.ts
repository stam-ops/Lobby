import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { BackofficeUserEntity } from './entities/backoffice-user.entity';
import { AdminJwtPayload, AdminRole } from './auth.types';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(BackofficeUserEntity)
    private readonly users: Repository<BackofficeUserEntity>,
    private readonly jwt: JwtService,
  ) {}

  /** Vérifie email + mot de passe, retourne un JWT + le profil (sans le hash). 401 sinon. */
  async login(email: string, password: string) {
    const user = await this.users.findOne({ where: { email } });
    if (!user || !user.active) throw new UnauthorizedException('Identifiants invalides');

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('Identifiants invalides');

    await this.users.update(user.backofficeuserid, { lastlogints: new Date() });

    const role = user.role as AdminRole;

    // Un compte 'club' sans organisateur rattaché n'a aucun périmètre de données : plutôt que de
    // laisser passer un jeton qui ferait échouer chaque requête plus loin (ou pire, en ferait
    // passer une non filtrée), on refuse la connexion ici.
    if (role === 'club' && !user.organizerid) {
      throw new UnauthorizedException('Compte organisateur incomplet — contactez le support.');
    }

    const payload: AdminJwtPayload = {
      sub: user.backofficeuserid,
      email: user.email,
      role,
      ...(user.organizerid ? { organizerId: user.organizerid } : {}),
    };
    const accessToken = await this.jwt.signAsync(payload);

    return {
      accessToken,
      user: {
        backofficeuserid: user.backofficeuserid,
        email: user.email,
        firstname: user.firstname,
        lastname: user.lastname,
        role: user.role,
        organizerId: user.organizerid ?? null,
      },
    };
  }

  /** Vérifie un JWT admin. Retourne le payload, ou null si invalide/expiré. */
  async verifyToken(token: string): Promise<AdminJwtPayload | null> {
    try {
      return await this.jwt.verifyAsync<AdminJwtPayload>(token);
    } catch {
      return null;
    }
  }
}
