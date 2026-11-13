-- Offre Analyse du Chance-o-mètre (salles ANJ analysées et ouvertes sans limite), vendue par Stripe
-- (src/chance/analyse-web.service.ts) : abonnement mensuel ou pack de 12 mois payé en une fois.
-- Rattachée au compte du Chance-o-mètre (chanceuser), pas au joueur Campok : pas besoin de compte Campok relié.
--
-- À exécuter UNE FOIS, après 002_chance.sql, avec le même compte administrateur :
--
--   mysql -h <hôte managé> -u <admin> -p < sql/004_chance_analyse.sql
--
-- Droits : ceux de 002 sur chance.* suffisent. Tant que ce fichier n'est pas passé, la vente reste fermée
-- (analyseShop = false) et le profil répond sans l'offre.

-- Offre en cours : une ligne par compte, date de fin. Prolongée à chaque paiement, jamais raccourcie.
-- Effacée avec le compte.
CREATE TABLE IF NOT EXISTS chance.chanceanalyse (
  chanceuserid    INT          NOT NULL PRIMARY KEY,
  untilts         DATETIME     NOT NULL,
  updatedts       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Paiements reçus (une ligne par paiement Stripe, orderid UNIQUE : un événement rejoué ne crédite pas deux
-- fois). Gardés après la suppression du compte (comptabilité), sans adresse ni donnée de carte.
CREATE TABLE IF NOT EXISTS chance.chancepayment (
  chancepaymentid INT AUTO_INCREMENT PRIMARY KEY,
  chanceuserid    INT          NOT NULL,
  product         VARCHAR(20)  NOT NULL,             -- 'analyse'
  plan            VARCHAR(10)  NOT NULL,             -- 'mois' (abonnement) | 'an' (pack de 12 mois)
  cents           INT          NOT NULL,             -- montant payé, en centimes d'euro
  orderid         VARCHAR(100) NOT NULL,             -- 'stripe:' + id de la session Checkout ou de la facture
  subkey          VARCHAR(100) NOT NULL DEFAULT '',  -- id de l'abonnement Stripe ('' pour le pack)
  creationts      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_chancepayment_orderid (orderid),
  KEY ix_chancepayment_user (chanceuserid, creationts)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Abonnements Stripe : 'active' (renouvelé chaque mois), 'canceled' (résilié, l'offre payée reste jusqu'à
-- la fin de la période), 'expired' (terminé, ou arrêté à la suppression du compte).
CREATE TABLE IF NOT EXISTS chance.chancesub (
  chancesubid     INT AUTO_INCREMENT PRIMARY KEY,
  chanceuserid    INT          NOT NULL,
  product         VARCHAR(20)  NOT NULL,             -- 'analyse'
  subkey          VARCHAR(100) NOT NULL,             -- id de l'abonnement Stripe
  status          VARCHAR(20)  NOT NULL,
  creationts      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedts       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_chancesub_subkey (subkey),
  KEY ix_chancesub_user (chanceuserid, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
