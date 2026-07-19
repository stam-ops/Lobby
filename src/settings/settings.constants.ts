/**
 * Pages de configuration éditables depuis le backoffice.
 *
 * Une PAGE peut agréger des champs de PLUSIEURS tables (ex. « Paramètres généraux » = quelques
 * colonnes de `generalparameters` + les limites de `sociallimit`) : chaque champ porte donc sa
 * table d'origine, et l'écriture fait un UPDATE par table concernée.
 *
 * Toutes ces tables ont UNE SEULE ligne (le legacy les lit sans WHERE).
 *
 * IMPORTANT — le type est déclaré colonne par colonne (whitelist), PAS déduit du type SQL :
 * plusieurs `tinyint` ne sont pas des booléens (socialxpword, minwordsforxp…). Un flag vaut
 * 0 = off / 1 = on (cf. migration-generalparameters-fblogin.sql).
 *
 * La whitelist sert aussi de garde-fou SQL : seuls ces noms de table/colonne peuvent être écrits.
 */
export type ConfigFieldType = 'number' | 'flag';

export interface ConfigField {
  /** Table d'origine de la colonne. */
  table: string;
  name: string;
  type: ConfigFieldType;
  /** Affiché mais non modifiable (colonne conservée en base mais plus lue par le poker). */
  readOnly?: boolean;
  /** Explication affichée à côté du champ. */
  note?: string;
}

export interface ConfigGroup {
  title: string;
  /** Légende explicative du groupe. */
  note?: string;
  /** Avertissement mis en évidence (ex. redémarrage de service nécessaire). */
  warning?: string;
  fields: ConfigField[];
}

export interface ConfigPage {
  label: string;
  groups: ConfigGroup[];
}

const GP = 'generalparameters';
const SL = 'sociallimit';
const CC = 'costconfig';

export const CONFIG_PAGES: Record<string, ConfigPage> = {
  [GP]: {
    label: 'Paramètres généraux',
    groups: [
      {
        title: 'Plateforme',
        fields: [
          { table: GP, name: 'maxconnections', type: 'number', note: 'connexions simultanées max' },
          { table: GP, name: 'fbloginenabled', type: 'flag', note: 'affichage du bouton de login Facebook' },
        ],
      },
      {
        title: 'Anti-spam des push notifications',
        note: 'Garde-fou anti-spam des push. 0 = limite désactivée (illimité).',
        fields: [
          { table: SL, name: 'maxnotifperday', type: 'number', note: 'max sur 1 jour glissant' },
          { table: SL, name: 'maxnotifperweek', type: 'number', note: 'max sur 7 jours glissants' },
          { table: SL, name: 'maxnotifpermonth', type: 'number', note: 'max sur 30 jours glissants' },
          { table: SL, name: 'daybetweennotif', type: 'number', note: 'jours min entre 2 rappels daily bonus (joueurs inactifs)' },
        ],
      },
      {
        title: 'Avis & bonus',
        fields: [
          { table: SL, name: 'sessiontorate', type: 'number', note: 'nb de sessions avant de proposer l\'avis' },
          { table: SL, name: 'maxbankrolltogetbonus', type: 'number', note: 'daily bonus accordé seulement si le solde est sous ce plafond' },
          { table: SL, name: 'mintogetcambonus', type: 'number', note: 'seuil de minutes cam de la veille pour le bonus caméra' },
        ],
      },
      {
        title: 'Tchat en table',
        warning: 'Nécessite un redémarrage du TableServer pour être pris en compte.',
        fields: [
          { table: SL, name: 'minwordsforxp', type: 'number', note: 'nb de mots min pour gagner de l\'XP' },
          { table: SL, name: 'socialxpword', type: 'number', note: 'XP gagnée par message' },
          { table: SL, name: 'maxsocialperday', type: 'number', note: 'XP sociale max par jour' },
          { table: SL, name: 'maxbanmessage', type: 'number', note: 'bannissement auto pour spam de tchat' },
          { table: SL, name: 'minbbnotifcashpot', type: 'number', note: 'notif « gros gain » si le pot dépasse N big blinds' },
        ],
      },
      {
        title: 'Campokes & partage',
        fields: [
          { table: SL, name: 'maxcampokeperday', type: 'number', note: 'plafond d\'invitations CREATE_CAMPOKE' },
          { table: SL, name: 'maxcampokeperdayvip', type: 'number', note: 'plafond d\'invitations CREATE_CAMPOKE (VIP)' },
          { table: SL, name: 'maxbonusshareperday', type: 'number', note: 'plafond du bonus de partage' },
          { table: SL, name: 'maxbonusshareperdayvip', type: 'number', note: 'plafond du bonus de partage (VIP)' },
        ],
      },
    ],
  },

  [CC]: {
    label: 'Coûts (Cam\'s) & bonus quotidiens',
    groups: [
      {
        title: 'Bonus quotidiens',
        fields: [
          { table: CC, name: 'vipdailybonus', type: 'number', note: 'bonus quotidien VIP' },
          { table: CC, name: 'novipdailybonus', type: 'number', note: 'bonus quotidien non-VIP' },
        ],
      },
      {
        title: 'Coûts en Cam\'s',
        fields: [
          { table: CC, name: 'camdatecost', type: 'number', note: 'entrée CamDate' },
          { table: CC, name: 'privtablecost2', type: 'number', note: 'création table privée 2 places' },
          { table: CC, name: 'privtablecost4', type: 'number', note: 'création table privée 4 places' },
          { table: CC, name: 'privtablecost6', type: 'number', note: 'création table privée 6 places' },
          { table: CC, name: 'privtablecost8', type: 'number', note: 'création table privée 8 places' },
          { table: CC, name: 'giftcost', type: 'number', note: 'cadeau' },
        ],
      },
      {
        title: 'Héritage dating',
        note: 'Colonnes conservées en base mais plus lues côté poker.',
        fields: [
          { table: CC, name: 'nbdayvipoffer', type: 'number', readOnly: true, note: 'non utilisé (héritage dating)' },
          { table: CC, name: 'initialbankroll', type: 'number', readOnly: true, note: 'non utilisé (héritage dating)' },
        ],
      },
    ],
  },
};

export const CONFIG_PAGE_KEYS = Object.keys(CONFIG_PAGES);

/** Tous les champs d'une page, à plat. Les noms de colonne sont uniques au sein d'une page. */
export const pageFields = (page: ConfigPage): ConfigField[] => page.groups.flatMap((g) => g.fields);
