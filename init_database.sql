-- ============================================================
-- MariaDB Inicializační skript pro Warehouse Pick & Pack Analytics
-- ============================================================

-- 1. Vytvoření databáze s podporou UTF-8 (vč. českých znaků a emoji)
CREATE DATABASE IF NOT EXISTS `fhb_crm`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

-- 2. Vytvoření uživatele pro vzdálené připojení z jakékoliv IP (%)
-- Poznámka: Pokud se webserver připojuje vzdáleně, je potřeba maska '%'
CREATE USER IF NOT EXISTS 'fhb_crm'@'%' IDENTIFIED BY 'VseDobre411';

-- 3. Vytvoření uživatele pro lokální připojení ze stejného stroje (localhost)
CREATE USER IF NOT EXISTS 'fhb_crm'@'localhost' IDENTIFIED BY 'VseDobre411';

-- V případě, že uživatel již existuje, aktualizujeme heslo a plugin
ALTER USER 'fhb_crm'@'%' IDENTIFIED BY 'VseDobre411';
ALTER USER 'fhb_crm'@'localhost' IDENTIFIED BY 'VseDobre411';

-- 4. Přidělení všech potřebných práv k databázi fhb_crm
GRANT ALL PRIVILEGES ON `fhb_crm`.* TO 'fhb_crm'@'%';
GRANT ALL PRIVILEGES ON `fhb_crm`.* TO 'fhb_crm'@'localhost';

-- 5. Znovunačtení tabulky oprávnění v MariaDB
FLUSH PRIVILEGES;

-- 6. Přepnutí do databáze a vytvoření tabulky pro pohyby skladu
USE `fhb_crm`;

CREATE TABLE IF NOT EXISTS `warehouse_movements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `box_id` VARCHAR(100) NULL,
  `sberny_box` VARCHAR(100) NOT NULL,
  `obsah_objednavek` VARCHAR(100) NOT NULL,
  `pocet_produktu` INT NOT NULL,
  `ean_produktu` VARCHAR(100) NOT NULL,
  `pocet_ks` INT NOT NULL DEFAULT 1,
  `zacatek_pickovani` DATETIME NOT NULL,
  `konec_pickovani` DATETIME NOT NULL,
  `zacatek_baleni` DATETIME NOT NULL,
  `konec_baleni` DATETIME NOT NULL,
  `pick_duration_s` DECIMAL(10,2) NOT NULL,
  `pack_duration_s` DECIMAL(10,2) NOT NULL,
  `pick_per_item_s` DECIMAL(10,2) NOT NULL,
  `pack_per_item_s` DECIMAL(10,2) NOT NULL,
  `bracket` VARCHAR(10) NOT NULL,
  `packer` VARCHAR(50) NULL,
  `sec_per_scan` DECIMAL(10,2) NULL,
  `wait_pick_to_pack_min` DECIMAL(10,2) NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_box` (`sberny_box`),
  INDEX `idx_box_id` (`box_id`),
  INDEX `idx_order` (`obsah_objednavek`),
  INDEX `idx_pick_start` (`zacatek_pickovani`),
  INDEX `idx_bracket` (`bracket`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
