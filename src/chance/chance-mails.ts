/**
 * Textes des e-mails du Chance-o-mètre (tutoiement, comme la page). Texte brut : lisible partout,
 * aucun traceur. Les liens mènent au service public (CHANCE_PUBLIC_URL), jamais à LobbyWS.
 */
export interface ChanceMail { subject: string; text: string }

const FOOTER = '\n— Le Chance-o-mètre de Campok\n';

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

export function deleteMail(link: string): ChanceMail {
  return {
    subject: 'Suppression de ton compte Chance-o-mètre',
    text:
      `Bonjour,\n\nPour supprimer ton compte, ouvre ce lien (valable 15 minutes) puis confirme :\n\n${link}\n\n`
      + `Ton compte, les mains et les bilans enregistrés et ton inscription aux nouvelles seront effacés. Ce n’est pas réversible.\n\n`
      + `Tu n’as rien demandé ? Ignore ce message : ton compte reste intact.\n${FOOTER}`,
  };
}
