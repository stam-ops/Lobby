-- Comptes du Chance-o-mètre (service public de Campok), dans une base `chance` à part de maindb.
-- LobbyWS les gère (module src/chance) pour le compte du serveur du Chance-o-mètre, qui relaie les
-- demandes de ses visiteurs ; le backoffice Campok les lit par /admin/chance.
--
-- À exécuter UNE FOIS sur l'instance MySQL managée, avec un compte qui a le droit de créer une base
-- (LobbyWS ne crée jamais rien lui-même) :
--
--   mysql -h <hôte managé> -u <admin> -p < sql/002_chance.sql
--
-- puis donner à l'utilisateur MySQL de LobbyWS les seuls droits nécessaires sur cette base :
--
--   GRANT SELECT, INSERT, UPDATE, DELETE ON chance.* TO '<utilisateur de LobbyWS>'@'%';
--
-- Nom de la base : CHANCE_DB dans le .env de LobbyWS (défaut `chance`).
-- Convention de nommage maindb : minuscules sans underscore.

CREATE DATABASE IF NOT EXISTS chance CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Un compte n'existe qu'une fois l'adresse prouvée : il est créé au premier clic sur le lien (ou au
-- code) reçu par e-mail, jamais à la simple demande. Aucun mot de passe.
CREATE TABLE IF NOT EXISTS chance.chanceuser (
  chanceuserid    INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(190) NOT NULL,
  adult           TINYINT(1)   NOT NULL DEFAULT 0,   -- « J'ai 18 ans ou plus », coché à la création
  newsletter      TINYINT(1)   NOT NULL DEFAULT 0,   -- case « nouvelles », facultative, non cochée par défaut
  newsletterts    DATETIME     NULL,                 -- date de l'accord (ou du retrait) pour les nouvelles
  playerid        INT          NULL,                 -- compte Campok relié (offre 2), NULL sinon
  linkts          DATETIME     NULL,                 -- date du rattachement Campok
  sessionversion  INT          NOT NULL DEFAULT 1,   -- incrémentée par « Se déconnecter partout »
  creationts      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastlogints     DATETIME     NULL,
  UNIQUE KEY uq_chanceuser_email (email),
  UNIQUE KEY uq_chanceuser_playerid (playerid),
  KEY ix_chanceuser_creationts (creationts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Demandes envoyées par e-mail : lien de connexion (et son code à 6 chiffres), création de compte,
-- suppression. Seules les empreintes (HMAC avec CHANCE_TOKEN_SECRET) sont gardées : une fuite de la
-- table ne donne ni lien ni code utilisable. Lignes de plus de 7 jours effacées au fil de l'eau.
CREATE TABLE IF NOT EXISTS chance.chancelogin (
  chanceloginid   INT AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(190) NOT NULL,
  purpose         VARCHAR(10)  NOT NULL,             -- 'login' | 'signup' | 'delete' | 'none' (adresse sans compte)
  tokenhash       CHAR(64)     NULL,
  codehash        CHAR(64)     NULL,
  attempts        TINYINT      NOT NULL DEFAULT 0,   -- essais de code (5 au plus)
  newsletter      TINYINT(1)   NOT NULL DEFAULT 0,   -- choix fait à la demande de création
  ip              VARCHAR(45)  NOT NULL DEFAULT '',  -- adresse du visiteur, pour la limite par IP
  creationts      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expirests       DATETIME     NOT NULL,
  usedts          DATETIME     NULL,
  UNIQUE KEY uq_chancelogin_tokenhash (tokenhash),
  KEY ix_chancelogin_email (email, creationts),
  KEY ix_chancelogin_ip (ip, creationts),
  KEY ix_chancelogin_creationts (creationts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
