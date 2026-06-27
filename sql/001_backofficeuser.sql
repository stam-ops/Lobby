-- Utilisateurs du backoffice Campok (auth JWT, distincts des joueurs).
-- À exécuter sur maindb. Convention de nommage maindb : minuscules sans underscore.
--
--   mysql -u campok -p maindb < sql/001_backofficeuser.sql
--
-- Le 1er admin se crée ensuite via : npm run seed:admin -- email@example.com motdepasse

CREATE TABLE IF NOT EXISTS backofficeuser (
  backofficeuserid INT AUTO_INCREMENT PRIMARY KEY,
  email            VARCHAR(190) NOT NULL,
  password         VARCHAR(100) NOT NULL,          -- hash bcrypt
  firstname        VARCHAR(80)  NULL,
  lastname         VARCHAR(80)  NULL,
  role             VARCHAR(20)  NOT NULL DEFAULT 'support',  -- 'admin' | 'support'
  active           TINYINT(1)   NOT NULL DEFAULT 1,
  creationts       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lastlogints      TIMESTAMP    NULL,
  UNIQUE KEY uq_backofficeuser_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
