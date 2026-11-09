-- Liaison d'un compte du Chance-o-mètre à un compte Campok (offre 2), par un code à 6 chiffres reçu dans
-- l'app : LobbyWS insère une notification interne de type chanceLink (23, NotificationType de ClientCodes)
-- dans maindb.notification ; FrontWebCampok la signale à l'app ouverte (SOCIAL_NOTIFICATION), l'app la lit
-- par GET /social/notifications/:playerId, où le code n'est ajouté que pour le joueur lui-même.
--
-- À exécuter UNE FOIS, après 002_chance.sql, avec le même compte administrateur :
--
--   mysql -h <hôte managé> -u <admin> -p < sql/003_chance_link.sql
--
-- Droits : ceux de 002 sur chance.* suffisent ; l'utilisateur de LobbyWS doit aussi pouvoir écrire dans
-- maindb.notification (INSERT, UPDATE).

-- Une ligne par demande. Le code est gardé EN CLAIR tant qu'il peut servir (10 minutes au plus), car
-- l'app doit pouvoir l'afficher ; il est effacé (NULL) dès qu'il est utilisé, remplacé ou expiré.
-- playerid NULL : pseudo inconnu (la ligne sert seulement aux limites par compte et par adresse IP).
CREATE TABLE IF NOT EXISTS chance.chancelink (
  chancelinkid    INT AUTO_INCREMENT PRIMARY KEY,
  chanceuserid    INT          NOT NULL,             -- compte du Chance-o-mètre qui demande
  playerid        INT          NULL,                 -- joueur Campok visé (NULL si pseudo inconnu)
  code            CHAR(6)      NULL,                 -- en clair, NULL dès qu'il ne sert plus
  notificationid  INT          NULL,                 -- maindb.notification insérée pour ce code
  attempts        TINYINT      NOT NULL DEFAULT 0,   -- essais de code (5 au plus)
  ip              VARCHAR(45)  NOT NULL DEFAULT '',
  creationts      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expirests       DATETIME     NOT NULL,
  usedts          DATETIME     NULL,                 -- utilisé, remplacé par une nouvelle demande, ou abandonné
  UNIQUE KEY uq_chancelink_notificationid (notificationid),
  KEY ix_chancelink_user (chanceuserid, creationts),
  KEY ix_chancelink_player (playerid, creationts),
  KEY ix_chancelink_ip (ip, creationts),
  KEY ix_chancelink_creationts (creationts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
