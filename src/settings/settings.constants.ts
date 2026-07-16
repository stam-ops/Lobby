/**
 * Tables de configuration éditables depuis le backoffice.
 *
 * Ce sont des tables à UNE SEULE ligne (le legacy les lit sans WHERE).
 *
 * IMPORTANT — le type est déclaré colonne par colonne (whitelist), PAS déduit du type SQL :
 * plusieurs `tinyint` ne sont pas des booléens (maxnotifperiodinhour, monthbetweenrate,
 * socialxpword…). Un flag vaut 0 = off / 1 = on (cf. migration-generalparameters-fblogin.sql).
 *
 * La whitelist sert aussi de garde-fou SQL : seuls ces noms de colonnes peuvent être écrits.
 */
export type ConfigFieldType = 'number' | 'flag';

export interface ConfigField {
  name: string;
  type: ConfigFieldType;
}

export const CONFIG_TABLES: Record<string, ConfigField[]> = {
  configurationlimits: [
    { name: 'maxuserpicture', type: 'number' },
    { name: 'agesearchdefaultinterval', type: 'number' },
    { name: 'searchdefaultdistance', type: 'number' },
    { name: 'nbloadprofil', type: 'number' },
    { name: 'maxnotifperiodinhour', type: 'number' },
    { name: 'maxnotifperperiod', type: 'number' },
    { name: 'timenotifminsameuser', type: 'number' },
    { name: 'geolocactive', type: 'flag' },
    { name: 'covid', type: 'flag' },
    { name: 'mancancall', type: 'flag' },
    { name: 'istellogin', type: 'flag' },
    { name: 'nbsessiontorate', type: 'number' },
    { name: 'monthbetweenrate', type: 'number' },
    { name: 'iswaitlist', type: 'flag' },
  ],
  generalparameters: [
    { name: 'maxconnections', type: 'number' },
    { name: 'friendswsperiod', type: 'number' },
    { name: 'gamewsperiod', type: 'number' },
    { name: 'getmaxplayer', type: 'number' },
    { name: 'getmaxfriends', type: 'number' },
    { name: 'getmaxsponsored', type: 'number' },
    { name: 'getmaxnotif', type: 'number' },
    { name: 'getmaxtrresult', type: 'number' },
    { name: 'getmaxnetworkfriends', type: 'number' },
    { name: 'getmaxclubtournaments', type: 'number' },
    { name: 'fbloginenabled', type: 'flag' },
  ],
  sociallimit: [
    { name: 'maxcampokeperday', type: 'number' },
    { name: 'maxcampokeperdayvip', type: 'number' },
    { name: 'maxbonusshareperday', type: 'number' },
    { name: 'maxbonusshareperdayvip', type: 'number' },
    { name: 'minbbnotifcashpot', type: 'number' },
    { name: 'minwordsforxp', type: 'number' },
    { name: 'socialxpword', type: 'number' },
    { name: 'maxsocialperday', type: 'number' },
    { name: 'maxbanmessage', type: 'number' },
    { name: 'mintogetcambonus', type: 'number' },
    { name: 'sessiontorate', type: 'number' },
    { name: 'maxnotifperday', type: 'number' },
    { name: 'maxnotifperweek', type: 'number' },
    { name: 'maxnotifpermonth', type: 'number' },
    { name: 'daybetweennotif', type: 'number' },
    { name: 'maxbankrolltogetbonus', type: 'number' },
  ],
};

export const CONFIG_TABLE_NAMES = Object.keys(CONFIG_TABLES);
