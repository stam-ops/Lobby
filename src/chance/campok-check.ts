/**
 * Vérification de l'export des mains Campok (offre 2 du Chance-o-mètre) sur la base :
 *
 *   npm run campok:check -- <playerid> [nombre de mains, 1000 par défaut]
 *
 * Relit les dernières mains du joueur comme la route POST /chance/campok/hands, compte celles qui ne se relisent pas
 * et montre, pour les 3 premières, la raison et leurs lignes brutes : joueurs J1, J2… dans l'ordre des sièges (« moi »
 * pour le joueur vérifié), aucun pseudo, cartes cachées des autres remplacées par « ?? ». À coller tel quel pour
 * corriger la reconstruction (campok-hands.ts).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ChanceService } from './chance.service';
import { campokHand } from './campok-hands';

const TYPES: Record<number, string> = {
  0: 'cave', 1: 'recave', 2: 'quitte', 3: 'check', 4: 'mise/suit', 5: 'relance', 6: 'passe', 7: 'montre', 8: 'donne',
  9: 'flop', 10: 'turn', 11: 'river', 12: 'gagne', 13: 'rebuy', 14: 'addon',
};
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const SUITS = ['', 'd', 'c', 's', 'h'];

async function run() {
  const pid = Number(process.argv[2]), n = Math.min(Math.max(Number(process.argv[3]) || 1000, 1), 20000);
  if (!Number.isSafeInteger(pid) || pid <= 0) {
    console.error('Usage : npm run campok:check -- <playerid> [nombre de mains]');
    process.exit(1);
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const { rows, seats, actions, cards } = await app.get(ChanceService).campokRows(pid, null, n);
  const bad: { id: number; why: string }[] = [];
  for (const r of rows) {
    const k = Number(r.id);
    let why = 'erreur';
    let raw: string | null = null;
    try { raw = campokHand(pid, r, seats.get(k) || [], actions.get(k) || [], cards.get(k) || [], w => (why = w)); }
    catch (e) { why = 'erreur : ' + (e as Error).message; }
    if (!raw) bad.push({ id: k, why });
  }
  console.log(`${rows.length} mains lues, ${rows.length - bad.length} relues, ${bad.length} écartées.`);
  const reasons: Record<string, number> = {};
  for (const b of bad) reasons[b.why] = (reasons[b.why] || 0) + 1;
  for (const [w, c] of Object.entries(reasons)) console.log(`  ${w} : ${c}`);
  for (const b of bad.slice(0, 3)) {
    const h = rows.find(r => Number(r.id) === b.id)!;
    const S = (seats.get(b.id) || []).slice().sort((x, y) => Number(x.seat) - Number(y.seat));
    const label = new Map(S.map((s, i) => [Number(s.gtp), Number(s.pid) === pid ? 'moi' : 'J' + (i + 1)]));
    console.log(`\n=== main ${b.id} : ${b.why} (table de type ${h.tt}, ${h.maxp ?? '?'} places)`);
    for (const s of S) console.log(`  siège ${s.seat} ${label.get(Number(s.gtp))} tapis ${s.init} commission ${s.rake}`);
    const C = new Map<number, string[]>();
    for (const c of (cards.get(b.id) || []).slice().sort((x, y) => x.num - y.num)) {
      const l = C.get(Number(c.action)) || [];
      l.push((RANKS[c.value] || '?') + (SUITS[c.color] || '?'));
      C.set(Number(c.action), l);
    }
    for (const a of (actions.get(b.id) || []).slice().sort((x, y) => Number(x.id) - Number(y.id))) {
      const who = a.gtp == null ? '—' : label.get(Number(a.gtp)) || 'inconnu';
      let cs = C.get(Number(a.id)) || [];
      if (Number(a.type) === 8 && who !== 'moi') cs = cs.map(() => '??');
      console.log(`  ${a.id} ${who} ${TYPES[Number(a.type)] ?? a.type} rue ${a.round} montant ${a.amount}${cs.length ? ' [' + cs.join(' ') + ']' : ''}`);
    }
  }
  await app.close();
  process.exit(0);
}

run().catch(err => {
  console.error('Échec de la vérification :', err.message);
  process.exit(1);
});
