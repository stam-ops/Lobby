/**
 * Mains Campok pour l'offre 2 du Chance-o-mètre : chaque main où le joueur relié était assis devient une ligne JSON lue
 * par `parseCampok` de core.js (stampok et kamasoft), comme l'historique d'une autre salle.
 *
 * Ce que TableServer enregistre (HandManager, GameAction.insertPlayerActions) :
 * - les actions sont écrites joueur par joueur (gameactionid croissant pour un même joueur, mais pas d'un joueur à
 *   l'autre) et l'heure n'est qu'à la seconde : l'ordre du coup est refait en rejouant les tours de parole ;
 * - avant la donne (type 8), chaque joueur a son ante puis sa blinde (type 4) ; blinde et ante ne sont pas distingués :
 *   il y a des antes dès qu'un joueur a deux mises avant la donne ;
 * - ordre des joueurs (activePlayers) : à partir de la petite blinde à plus de deux joueurs, sinon de la grosse ; avant
 *   le flop, parle le troisième de la liste (le deuxième à deux joueurs ou sans petite blinde), après, le premier ;
 * - relance (5) = total engagé sur la rue sans l'ante, suivi (4) = montant ajouté, mise après le flop = relance ;
 * - le bouton n'est pas enregistré : dernier de la liste (petite blinde à deux joueurs) ;
 * - cartes : valeur 1 (as) à 13 (roi), couleur 1 carreau, 2 trèfle, 3 pique, 4 cœur ; la donne (8) porte les cartes
 *   de chaque joueur, montrées ou non ;
 * - « montre ses cartes » (7) n'a pas de joueur : on ne sait pas qui a montré. Cartes adverses exportées seulement
 *   quand elles ont été montrées à coup sûr : tous à tapis avant la fin (cartes retournées), gagnants à l'abattage,
 *   tous les joueurs de l'abattage quand il y a autant de « montre » que de joueurs, gagnant sans abattage qui montre ;
 * - mise non suivie rendue avant le pot (pas dans « gagne le pot ») ; commission du cash par joueur (handplayer.rake).
 * Jamais exporté : les cartes non montrées, les pseudos (joueurs nommés « p » + playerid).
 */

export const CAMPOK_HAND_VERSION = 1;

export interface HandRow { id: number; ts: Date; label: string; tt: number; tid: number | null; maxp: number | null }
export interface SeatRow { hand: number; gtp: number; pid: number; seat: number; init: number; rake: number }
export interface ActionRow { hand: number; id: number; gtp: number | null; type: number; round: number; amount: number }
export interface CardRow { action: number; num: number; color: number; value: number }

const T = { check: 3, call: 4, raise: 5, fold: 6, show: 7, deal: 8, flop: 9, turn: 10, river: 11, wins: 12 } as const;
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const SUITS = ['', 'd', 'c', 's', 'h'];
const card = (c: CardRow) => (RANKS[c.value] && SUITS[c.color] ? RANKS[c.value] + SUITS[c.color] : null);

interface Act { type: number; a: number }
interface P {
  name: string; seat: number; init: number; rake: number; posts: number[]; cards: (string | null)[]; q: Act[][]; won: number;
  ante: number; blind: number; left: number; commit: number; inHand: boolean; allin: boolean;
}
type Ev = [number, string, string, number?];

/** Paris, AAAA-MM-JJTHH:MM:SS (comme les historiques des salles françaises). */
export function parisDate(d: Date): string {
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Tours de parole rejoués pour un ordre de joueurs donné ; null si les actions enregistrées n'y entrent pas. */
function replay(order: P[], firstPre: number, sb: P | null, bb: P, board: number) {
  const n = order.length;
  for (const p of order) {
    p.left = p.init - p.ante - p.blind; p.commit = p.blind; p.inHand = true; p.allin = p.left <= 0;
  }
  const q = order.map(p => p.q.map(s => s.slice()));
  const ev: Ev[] = [];
  if (sb) ev.push([0, sb.name, 'sb', sb.blind]);
  ev.push([0, bb.name, 'bb', bb.blind]);
  for (const p of order) if (p.blind > 0 && p !== sb && p !== bb) ev.push([0, p.name, 'post', p.blind]);
  let maxBet = Math.max(...order.map(p => p.blind));
  let runout: P[] | null = null;
  const elig = (p: P) => p.inHand && !p.allin;
  const inHand = () => order.filter(p => p.inHand).length;
  for (let st = 0; st < 4; st++) {
    if (st > 0) {
      if (board < st + 2 || inHand() < 2) break;
      for (const p of order) p.commit = 0;
      maxBet = 0;
    }
    if (inHand() < 2) break;
    const E = order.filter(elig);
    // Un seul joueur qui peut encore miser (les autres à tapis) : il ne parle que s'il doit suivre.
    let need = new Set(E.length >= 2 ? E : []);
    let idx = st === 0 ? firstPre % n : 0, guard = 0;
    for (;;) {
      if (inHand() < 2) break;
      if (!order.some(p => elig(p) && (need.has(p) || p.commit < maxBet))) break;
      if (guard++ > 1000) return null;
      const i = idx; idx = (idx + 1) % n;
      const p = order[i];
      if (!(elig(p) && (need.has(p) || p.commit < maxBet))) continue;
      const a = q[i][st].shift();
      if (!a) return null;
      if (a.type === T.fold) { p.inHand = false; ev.push([st, p.name, 'fold']); }
      else if (a.type === T.check || (a.type === T.call && a.a === 0)) {
        if (p.commit < maxBet) return null;
        ev.push([st, p.name, 'check']);
      } else if (a.type === T.call) {
        p.commit += a.a; p.left -= a.a; if (p.left <= 0) p.allin = true;
        ev.push([st, p.name, 'call', a.a]);
        // Suivi qui dépasse la mise (cas particulier de TableServer, grosse blinde à tapis) : rouvre la parole.
        if (p.commit > maxBet) { maxBet = p.commit; need = new Set(order.filter(x => x !== p && elig(x))); }
      } else if (a.type === T.raise) {
        const add = a.a - p.commit;
        if (add <= 0) return null;
        p.left -= add; p.commit = a.a; if (p.left <= 0) p.allin = true;
        ev.push([st, p.name, st > 0 && maxBet === 0 ? 'bet' : 'raise', a.a]);
        if (a.a > maxBet) { maxBet = a.a; need = new Set(order.filter(x => x !== p && elig(x))); }
      } else return null;
      need.delete(p);
    }
    // Fin des enchères d'une rue avant la river avec un seul joueur (ou aucun) qui peut encore miser : cartes retournées.
    if (!runout && st < 3 && inHand() >= 2 && order.filter(elig).length < 2) runout = order.filter(p => p.inHand);
  }
  if (q.some(s => s.some(x => x.length))) return null;
  return { ev, runout, last: order.filter(p => p.inHand) };
}

/** Une main en ligne JSON (ou null si elle ne se relit pas : main incomplète, joueur absent, ordre introuvable). */
export function campokHand(heroPid: number, h: HandRow, seats: SeatRow[], actions: ActionRow[], cards: CardRow[],
  why: (reason: string) => void = () => undefined): string | null {
  const no = (reason: string) => { why(reason); return null; };
  const byGtp = new Map<number, P>();
  const ps = seats.slice().sort((a, b) => a.seat - b.seat).map(s => {
    const p: P = {
      name: 'p' + s.pid, seat: Number(s.seat), init: Number(s.init), rake: Number(s.rake) || 0, posts: [], cards: [],
      q: [[], [], [], []], won: 0, ante: 0, blind: 0, left: 0, commit: 0, inHand: true, allin: false,
    };
    byGtp.set(Number(s.gtp), p);
    return p;
  });
  const hero = ps.find(p => p.name === 'p' + heroPid);
  if (!hero) return no('joueur absent');
  if (ps.length < 2 || new Set(ps.map(p => p.name)).size !== ps.length) return no('sièges');
  const cardsOf = new Map<number, CardRow[]>();
  for (const c of cards) { const l = cardsOf.get(Number(c.action)) || []; l.push(c); cardsOf.set(Number(c.action), l); }
  const cs = (id: number) => (cardsOf.get(id) || []).sort((a, b) => a.num - b.num).map(card);
  const flop: (string | null)[] = [], turn: (string | null)[] = [], river: (string | null)[] = [];
  let shows = 0;
  const dealt = new Set<P>();
  for (const a of actions.slice().sort((x, y) => x.id - y.id)) {
    const type = Number(a.type), amount = Number(a.amount) || 0, round = Number(a.round);
    if (a.gtp == null) {
      if (type === T.show) shows++;
      else if (type === T.flop) flop.push(...cs(Number(a.id)));
      else if (type === T.turn) turn.push(...cs(Number(a.id)));
      else if (type === T.river) river.push(...cs(Number(a.id)));
      continue;
    }
    const p = byGtp.get(Number(a.gtp));
    if (!p) continue;
    if (type === T.deal) { p.cards = cs(Number(a.id)); dealt.add(p); continue; }
    if (type === T.wins) { p.won += amount; continue; }
    if (!dealt.has(p)) { if (type === T.call) p.posts.push(amount); continue; }
    if ([T.check, T.call, T.raise, T.fold].includes(type as 3) && round >= 0 && round <= 3) p.q[round].push({ type, a: amount });
  }
  const board = [...flop.slice(0, 3), ...turn.slice(0, 1), ...river.slice(0, 1)];
  if (board.some(c => !c) || (board.length && board.length < 3)) return no('tableau');
  if (ps.some(p => !dealt.has(p) || p.cards.length !== 2 || p.cards.some(c => !c))) return no('donne');
  // Antes : dès qu'un joueur a deux mises avant la donne, la première de chacun est son ante.
  const antes = ps.some(p => p.posts.length >= 2);
  for (const p of ps) {
    if (p.posts.length > (antes ? 2 : 1)) return no('mises avant la donne');
    p.ante = antes ? p.posts[0] || 0 : 0;
    p.blind = (antes ? p.posts[1] : p.posts[0]) || 0;
  }
  const posters = ps.filter(p => p.blind > 0);
  if (!posters.length) return no('pas de blinde');
  // Petite et grosse blindes : la plus petite et la suivante d'abord, puis toutes les autres possibilités (blinde à
  // tapis plus petite que la petite blinde, joueur qui revient en payant la grosse) ; la première qui se rejoue gagne.
  const n = ps.length, at = (p: P) => ps.indexOf(p);
  const rot = (p: P) => [...ps.slice(at(p)), ...ps.slice(0, at(p))];
  const tries: [P | null, P][] = [];
  const min = Math.min(...posters.map(p => p.blind)), max = Math.max(...posters.map(p => p.blind));
  const small = posters.filter(p => p.blind === min);
  if (min < max && small.length === 1) {
    const bb = rot(small[0]).slice(1).find(p => p.blind === max);
    if (bb) tries.push([small[0], bb]);
  }
  for (const b of posters) { for (const s of posters) if (s !== b) tries.push([s, b]); tries.push([null, b]); }
  let r: ReturnType<typeof replay> = null, btn: P | null = null, sbP: P | null = null;
  for (const [s, b] of tries) {
    let order: P[], first: number;
    if (n === 2) { if (s && s !== ps.find(p => p !== b)) continue; order = rot(b); first = 1; }
    else if (s) { order = rot(s); if (order[1] !== b) continue; first = 2; }
    else { order = rot(b); first = 1; }
    r = replay(order, first, s, b, board.length);
    if (r) { btn = order[n === 2 ? 1 : n - 1]; sbP = s; break; }
  }
  if (!r) return no('ordre des coups');
  // Cartes montrées à coup sûr (voir plus haut). Les miennes sont toujours connues.
  const shown = new Set<P>(r.runout || []);
  if (r.last.length >= 2) {
    for (const p of r.last) if (p.won > 0) shown.add(p);
    if (shows >= r.last.length) r.last.forEach(p => shown.add(p));
  } else if (r.last.length === 1 && shows > 0) shown.add(r.last[0]);
  const won: Record<string, number> = {}, showsOut: Record<string, string> = {}, ante: Record<string, number> = {};
  for (const p of ps) {
    if (p.won > 0) won[p.name] = Math.max(0, p.won - p.rake);
    if (p.ante > 0) ante[p.name] = p.ante;
    if (shown.has(p)) showsOut[p.name] = p.cards.join(' ');
  }
  const out = {
    campok: CAMPOK_HAND_VERSION, id: String(h.id), date: parisDate(new Date(h.ts)), table: h.label || null,
    kind: Number(h.tt) === 0 ? 'cash' : Number(h.tt) === 1 ? 'sng' : 'mtt', tid: h.tid != null ? Number(h.tid) : null,
    max: h.maxp != null ? Number(h.maxp) : null, btn: btn!.seat, sb: sbP ? sbP.blind : 0, bb: max,
    hero: hero.name, cards: hero.cards.join(' '),
    seats: ps.map(p => [p.seat, p.name, p.init]), ante, acts: r.ev, board, shows: showsOut, won,
    rake: ps.reduce((s, p) => s + p.rake, 0),
  };
  return JSON.stringify(out);
}

/** Mains par appel : 250 mains font environ 400 Ko de JSON. */
export const CAMPOK_HANDS_MAX = 250;
