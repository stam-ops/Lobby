/**
 * Crée (ou met à jour) un utilisateur backoffice.
 *
 *   npm run seed:admin -- email@example.com motdepasse [role] [prénom] [nom]
 *
 * role : 'admin' (défaut) | 'support'. Si l'email existe déjà, le mot de passe et le rôle
 * sont mis à jour (pratique pour réinitialiser un accès).
 */
import { NestFactory } from '@nestjs/core';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { BackofficeUserEntity } from './entities/backoffice-user.entity';

async function run() {
  const [email, password, role = 'admin', firstname, lastname] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npm run seed:admin -- <email> <password> [role] [firstname] [lastname]');
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const repo = app.get<Repository<BackofficeUserEntity>>(getRepositoryToken(BackofficeUserEntity));

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await repo.findOne({ where: { email } });

  if (existing) {
    await repo.update(existing.backofficeuserid, { password: passwordHash, role, active: 1 });
    console.log(`✔ Utilisateur backoffice mis à jour : ${email} (role=${role})`);
  } else {
    const user = repo.create({ email, password: passwordHash, role, firstname, lastname, active: 1 });
    const saved = await repo.save(user);
    console.log(`✔ Utilisateur backoffice créé : ${email} (id=${saved.backofficeuserid}, role=${role})`);
  }

  await app.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Échec du seed :', err.message);
  process.exit(1);
});
