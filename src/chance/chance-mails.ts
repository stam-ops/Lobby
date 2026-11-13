/**
 * Textes des e-mails du Chance-o-mètre (tutoiement, comme la page). Texte brut : lisible partout,
 * aucun traceur. Les liens mènent au service public (CHANCE_PUBLIC_URL), jamais à LobbyWS.
 */
export interface ChanceMail { subject: string; text: string }

const FOOTER = '\n— Le Chance-o-mètre de Campok\n';

/** Date ISO → « 14 décembre 2026 » (heure de Paris). */
const frDay = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

export function loginMail(link: string, code: string): ChanceMail {
  return {
    subject: 'Ta connexion au Chance-o-mètre',
    text:
      `Bonjour,\n\nPour te connecter au Chance-o-mètre, ouvre ce lien (valable 15 minutes, une seule fois) :\n\n${link}\n\n`
      + `Tu lis cet e-mail sur un autre appareil que celui où la page est ouverte ? Tape ce code sur la page : ${code}\n\n`
      + `Tu n’as rien demandé ? Ignore ce message : personne ne peut se connecter sans ce lien ou ce code.\n${FOOTER}`,
  };
}

export function signupMail(link: string, code: string): ChanceMail {
  return {
    subject: 'Confirme ton compte Chance-o-mètre',
    text:
      `Bonjour,\n\nPour créer ton compte gratuit au Chance-o-mètre, ouvre ce lien (valable 15 minutes, une seule fois) :\n\n${link}\n\n`
      + `Tu lis cet e-mail sur un autre appareil que celui où la page est ouverte ? Tape ce code sur la page : ${code}\n\n`
      + `Tu n’as rien demandé ? Ignore ce message : aucun compte n’est créé sans ce lien ou ce code.\n${FOOTER}`,
  };
}

/** Demande de connexion pour une adresse sans compte : même délai et même réponse côté page. */
export function noAccountMail(pageUrl: string): ChanceMail {
  return {
    subject: 'Connexion au Chance-o-mètre',
    text:
      `Bonjour,\n\nQuelqu’un a demandé à se connecter au Chance-o-mètre avec cette adresse, mais aucun compte ne lui est associé.\n\n`
      + `Pour créer un compte gratuit, fais d’abord ta vérification sur ${pageUrl}, puis choisis « Créer mon compte ».\n\n`
      + `Tu n’as rien demandé ? Ignore ce message.\n${FOOTER}`,
  };
}

/**
 * Confirmation de la résiliation d'un abonnement, sur support durable (art. L215-1-1 du Code de la consommation) :
 * envoyée dès le clic sur « Résilier », avec la date de fin. `until` : fin de ce qui est payé (ISO), ou null.
 */
export function cancelMail(offer: 'analyse' | 'vip', until: string | null, pageUrl: string): ChanceMail {
  const name = offer === 'analyse' ? 'l’offre Analyse' : 'Campok VIP';
  const day = until ? frDay(until) : null;
  return {
    subject: offer === 'analyse' ? 'Résiliation de ton offre Analyse' : 'Résiliation de ton abonnement Campok VIP',
    text:
      `Bonjour,\n\nTa résiliation de l’abonnement mensuel à ${name} est bien prise en compte.\n\n`
      + (day ? `Ce que tu as payé reste à toi : tu gardes ${name} jusqu’au ${day}. ` : '')
      + `Aucun nouveau prélèvement ne sera fait.\n\n`
      + `Tu peux te réabonner quand tu veux depuis « Mon compte » : ${pageUrl}\n\n`
      + `Tu n’es pas à l’origine de cette résiliation ? Choisis « Se déconnecter partout » dans « Mon compte », `
      + `puis reconnecte-toi avec un nouveau lien.\n${FOOTER}`,
  };
}

/**
 * Confirmation de la suppression du compte (faite par le joueur ou par le support) : données effacées et abonnements.
 * `analyseStopped` : abonnement de l'offre Analyse arrêté ; `vip` : abonnement Campok VIP pris ici résilié (VIP payé
 * gardé dans l'app jusqu'à `vipUntil`).
 */
export function deletedMail(subs: { analyseStopped: boolean; vip: { vipUntil: string | null } | null }, pageUrl: string): ChanceMail {
  const lines: string[] = [];
  if (subs.analyseStopped) lines.push('Ton abonnement à l’offre Analyse est arrêté : plus aucun prélèvement ne sera fait.');
  if (subs.vip) {
    const day = subs.vip.vipUntil ? frDay(subs.vip.vipUntil) : null;
    lines.push('Ton abonnement Campok VIP, qui se gérait depuis ce compte, est résilié : plus aucun prélèvement ne sera fait.'
      + (day ? ` Le VIP déjà payé reste sur ton compte Campok jusqu’au ${day}.` : ''));
  }
  if (!lines.length) lines.push('Aucun abonnement n’était en cours : aucun prélèvement ne sera fait.');
  return {
    subject: 'Ton compte Chance-o-mètre est supprimé',
    text:
      `Bonjour,\n\nTon compte Chance-o-mètre est supprimé. Ont été effacés : ton compte, ton bilan de chance, `
      + `les mains envoyées au module d’analyse et ton inscription aux nouvelles.\n\n`
      + `${lines.join('\n\n')}\n\n`
      + `Les paiements déjà faits restent seulement dans notre comptabilité, le temps exigé par la loi.\n\n`
      + `Tu peux recréer un compte gratuit quand tu veux sur ${pageUrl}\n${FOOTER}`,
  };
}

export function deleteMail(link: string): ChanceMail {
  return {
    subject: 'Suppression de ton compte Chance-o-mètre',
    text:
      `Bonjour,\n\nPour supprimer ton compte, ouvre ce lien (valable 15 minutes) puis confirme :\n\n${link}\n\n`
      + `Ton compte, les mains et les bilans enregistrés et ton inscription aux nouvelles seront effacés. Ce n’est pas réversible.\n\n`
      + `Tu n’as rien demandé ? Ignore ce message : ton compte reste intact.\n${FOOTER}`,
  };
}
