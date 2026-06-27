import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  // CORS pour le backoffice navigateur. L'app React Native n'est pas concernée (pas un navigateur).
  // Origines autorisées via CORS_ORIGINS (séparées par des virgules) ; défaut = Vite en dev.
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  const config = new DocumentBuilder()
    .setTitle('LobbyWS API')
    .setDescription('API REST exposant les tables de cash game, SNG et tournois du lobby Campok')
    .setVersion('1.0')
    .addTag('Cash Game Tables', 'Tables de cash game publiques et privées')
    .addTag('SNG Tables', 'Tables Sit-N-Go')
    .addTag('Tournaments', 'Tournois publics et privés')
    .addTag('Players', 'Joueurs présents sur une table ou un tournoi')
    .addTag('Auth (backoffice)', 'Login backoffice (JWT)')
    // Bouton "Authorize" : coller un JWT admin OU un hash de session joueur.
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
