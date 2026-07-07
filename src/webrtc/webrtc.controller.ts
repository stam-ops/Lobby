import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Auth } from '../auth/auth.decorator';

/**
 * Fournit les `iceServers` (STUN + TURN) au client juste avant un appel WebRTC (cam 2 joueurs).
 * Les credentials TURN sont ÉPHÉMÈRES (coturn REST / `use-auth-secret`) : jamais de mot de passe
 * statique embarqué dans l'app. username = `<expiration_unix>:campok`, credential = base64(HMAC-SHA1
 * du username avec le secret partagé). coturn recalcule le même HMAC pour valider.
 *
 * Route authentifiée (guard global @Auth('player')) → seuls les joueurs connectés obtiennent des creds
 * de relais → limite l'abus de bande passante. Si TURN non configuré, on renvoie STUN seul.
 */
@ApiTags('WebRTC')
@ApiBearerAuth()
@Auth('player', 'admin')
@Controller('webrtc')
export class WebrtcController {
  constructor(private readonly config: ConfigService) {}

  @Get('ice')
  ice(): { iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> } {
    // Scalabilité (Option 1) : liste de serveurs TURN dans TURN_HOSTS (séparés par des virgules),
    // TOUS avec le MÊME static-auth-secret. On en tire UN au hasard par requête → la charge se
    // répartit sur les N serveurs. Le credential est valide sur n'importe lequel (secret partagé).
    // Rétro-compat : TURN_HOST (singulier) accepté si TURN_HOSTS absent.
    const hosts = (this.config.get<string>('TURN_HOSTS') || this.config.get<string>('TURN_HOST') || 'turn.campok.app')
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    const host = hosts[Math.floor(Math.random() * hosts.length)];
    const secret = this.config.get<string>('TURN_SECRET');
    const ttl = Number(this.config.get('TURN_TTL', 3600));

    const iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> = [
      { urls: `stun:${host}:3478` },
    ];

    if (secret) {
      const expiry = Math.floor(Date.now() / 1000) + ttl;
      const username = `${expiry}:campok`;
      const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
      // Base : TURN en clair (UDP + TCP). Le média WebRTC est déjà chiffré (DTLS-SRTP) → pas besoin de
      // TLS pour la confidentialité. `turns:` (TLS) ne sert qu'à traverser les firewalls très stricts ;
      // on ne l'ajoute QUE si un port TLS est configuré (TURN_TLS_PORT), sinon le client tenterait une
      // URL sans listener → gathering ICE ralenti pour rien.
      const urls = [
        `turn:${host}:3478?transport=udp`,
        `turn:${host}:3478?transport=tcp`,
      ];
      const tlsPort = this.config.get<string>('TURN_TLS_PORT');
      if (tlsPort) {
        urls.push(`turns:${host}:${tlsPort}?transport=tcp`);
      }
      iceServers.push({ urls, username, credential });
    }

    return { iceServers };
  }
}
