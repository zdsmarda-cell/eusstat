import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { MariaDbConfig, MovementRecord, DbStatus } from '../types.js';

// Always load .env immediately upon module import
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const CONFIG_FILE_PATH = path.resolve(process.cwd(), 'data', 'db-config.json');
const PERSISTENT_DATA_PATH = path.resolve(process.cwd(), 'data', 'warehouse_movements.json');

// Ensure data folder exists
try {
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch {
  // ignore
}

function parseSslFlag(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  if (typeof val === 'number') return val === 1;
  return false;
}

function isNoSslSupportError(err: any): boolean {
  const msg = String(err?.message || err || '');
  return (
    err?.code === 'HANDSHAKE_NO_SSL_SUPPORT' ||
    msg.includes('Server does not support secure connection') ||
    msg.includes('does not support SSL')
  );
}

function loadSavedConfig(): MariaDbConfig {
  let fileConfig: Partial<MariaDbConfig> = {};
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      fileConfig = JSON.parse(content);
    } catch (e) {
      console.warn('Could not read db-config.json:', e);
    }
  }

  const host = fileConfig.host || process.env.DB_HOST || process.env.MARIADB_HOST || 'db.mobilgroup.cz';
  // db.mobilgroup.cz standardně běží bez SSL na portu 3306
  const rawSsl = fileConfig.ssl !== undefined
    ? parseSslFlag(fileConfig.ssl)
    : (parseSslFlag(process.env.DB_SSL) || parseSslFlag(process.env.MARIADB_SSL));

  return {
    host,
    port: Number(
      fileConfig.port ||
      process.env.DB_PORT ||
      process.env.MARIADB_PORT ||
      (Number(process.env.PORT) === 3306 ? 3306 : undefined)
    ) || 3306,
    user: fileConfig.user || process.env.DB_USER || process.env.MARIADB_USER || 'fhb_crm',
    password: fileConfig.password !== undefined ? fileConfig.password : (process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || ''),
    database: fileConfig.database || process.env.DB_NAME || process.env.DB_DATABASE || process.env.MARIADB_DATABASE || 'fhb_crm',
    ssl: rawSsl,
  };
}

function saveConfigToFile(config: MariaDbConfig): void {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write db-config.json:', err);
  }

  // Also update .env file if it exists or create it
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    const updates: Record<string, string> = {
      DB_HOST: config.host,
      DB_PORT: String(config.port),
      DB_USER: config.user,
      DB_PASSWORD: config.password || '',
      DB_NAME: config.database,
      DB_SSL: String(Boolean(config.ssl)),
    };

    for (const [k, v] of Object.entries(updates)) {
      const regex = new RegExp(`^${k}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${k}="${v}"`);
      } else {
        envContent += `\n${k}="${v}"`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
  } catch {
    // ignore
  }
}

// Persistent fallback dataset stored on disk (not just RAM)
let memoryMovements: MovementRecord[] = [];

// Načtení z disku: Pokud MariaDB nemá platné heslo nebo není dostupná, používáme persistentní disk
let currentConfig: MariaDbConfig = loadSavedConfig();
const isProductionEnv = process.env.NODE_ENV === 'production' && Boolean(currentConfig.password);

if (fs.existsSync(PERSISTENT_DATA_PATH)) {
  try {
    const raw = fs.readFileSync(PERSISTENT_DATA_PATH, 'utf-8');
    memoryMovements = JSON.parse(raw);
    console.log(`📂 Načteno ${memoryMovements.length} uložených záznamů z diskového úložiště (${PERSISTENT_DATA_PATH})`);
  } catch (e) {
    console.warn('Could not read persistent warehouse_movements.json:', e);
  }
}

function saveMovementsToDisk(): void {
  try {
    fs.writeFileSync(PERSISTENT_DATA_PATH, JSON.stringify(memoryMovements), 'utf-8');
  } catch (err) {
    console.error('Failed to save movements to disk:', err);
  }
}

let pool: mysql.Pool | null = null;
let poolInitPromise: Promise<mysql.Pool | null> | null = null;
let lastConnectionError: string | null = null;
let schemaInitialized = false;
let tableHasWarehouseColumn = true;

export function getDbConfig(): MariaDbConfig {
  return {
    ...currentConfig,
    password: currentConfig.password ? '••••••••' : '',
  };
}

export async function setDbConfig(config: Partial<MariaDbConfig>): Promise<DbStatus> {
  const newPassword = config.password !== undefined && config.password !== '••••••••'
    ? config.password
    : currentConfig.password;

  currentConfig = {
    ...currentConfig,
    ...config,
    ssl: config.ssl !== undefined ? parseSslFlag(config.ssl) : currentConfig.ssl,
    password: newPassword,
  };

  saveConfigToFile(currentConfig);
  statsMemoryCache.clear();

  if (pool) {
    try {
      await pool.end();
    } catch {
      // ignore
    }
    pool = null;
  }
  poolInitPromise = null;
  schemaInitialized = false;

  return await testConnection();
}

function createMysqlPoolInstance(useSsl: boolean): mysql.Pool {
  return mysql.createPool({
    host: currentConfig.host,
    port: currentConfig.port,
    user: currentConfig.user,
    password: currentConfig.password,
    database: currentConfig.database,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    dateStrings: true,
    decimalNumbers: true,
  });
}

export async function getPool(): Promise<mysql.Pool | null> {
  if (pool) return pool;
  if (poolInitPromise) return await poolInitPromise;

  if (!currentConfig.host || !currentConfig.user || !currentConfig.database) {
    lastConnectionError = 'Chybí host, uživatel nebo název databáze.';
    return null;
  }
  if (!currentConfig.password) {
    lastConnectionError = 'Chybí heslo k databázi fhb_crm na db.mobilgroup.cz. Zadejte heslo v Nastavení DB pro trvalé ukládání.';
    return null;
  }

  poolInitPromise = (async () => {
    let newPool = createMysqlPoolInstance(Boolean(currentConfig.ssl));

    try {
      if (!schemaInitialized) {
        try {
          await initMariaDbSchema(newPool);
        } catch (firstErr: any) {
          if (currentConfig.ssl && isNoSslSupportError(firstErr)) {
            console.warn(`⚠️ Server ${currentConfig.host} nepodporuje SSL spojení (Server does not support secure connection). Automaticky vypínám SSL a opakuji připojení...`);
            try {
              await newPool.end();
            } catch {
              // ignore
            }
            currentConfig.ssl = false;
            saveConfigToFile(currentConfig);
            newPool = createMysqlPoolInstance(false);
            await initMariaDbSchema(newPool);
          } else {
            throw firstErr;
          }
        }
        schemaInitialized = true;
        lastConnectionError = null;
        console.log(`✅ MariaDB spojení a schéma ověřeno: ${currentConfig.user}@${currentConfig.host}:${currentConfig.port}/${currentConfig.database} (SSL: ${currentConfig.ssl ? 'ANO' : 'NE'})`);
      } else {
        try {
          await newPool.query('SELECT 1');
        } catch (pingErr: any) {
          if (currentConfig.ssl && isNoSslSupportError(pingErr)) {
            console.warn(`⚠️ Server ${currentConfig.host} nepodporuje SSL spojení. Automaticky vypínám SSL a opakuji připojení...`);
            try {
              await newPool.end();
            } catch {
              // ignore
            }
            currentConfig.ssl = false;
            saveConfigToFile(currentConfig);
            newPool = createMysqlPoolInstance(false);
            await newPool.query('SELECT 1');
          } else {
            throw pingErr;
          }
        }
      }

      pool = newPool;
      return pool;
    } catch (err: any) {
      lastConnectionError = err?.message || 'Chyba při vytváření MariaDB poolu';
      console.error('Failed to initialize MariaDB pool:', lastConnectionError);
      try {
        await newPool.end();
      } catch {
        // ignore
      }
      pool = null;
      return null;
    } finally {
      poolInitPromise = null;
    }
  })();

  return await poolInitPromise;
}

export async function initMariaDbSchema(p: mysql.Pool): Promise<void> {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS warehouse_movements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      warehouse VARCHAR(50) NOT NULL DEFAULT 'ruse',
      box_id VARCHAR(100) NULL,
      sberny_box VARCHAR(100) NOT NULL,
      cycle_no INT NULL DEFAULT 1,
      obsah_objednavek VARCHAR(100) NOT NULL,
      pocet_produktu INT NOT NULL,
      ean_produktu VARCHAR(100) NOT NULL,
      pocet_ks INT NOT NULL DEFAULT 1,
      zacatek_pickovani DATETIME NOT NULL,
      konec_pickovani DATETIME NOT NULL,
      zacatek_sortingu DATETIME NULL,
      konec_sortingu DATETIME NULL,
      zacatek_baleni DATETIME NULL,
      konec_baleni DATETIME NULL,
      pick_duration_s DECIMAL(10,2) NOT NULL,
      sort_duration_s DECIMAL(10,2) NULL DEFAULT 0,
      pack_duration_s DECIMAL(10,2) NULL DEFAULT 0,
      pick_per_item_s DECIMAL(10,2) NOT NULL,
      sort_per_item_s DECIMAL(10,2) NULL DEFAULT 0,
      pack_per_item_s DECIMAL(10,2) NULL DEFAULT 0,
      bracket VARCHAR(10) NOT NULL,
      packer VARCHAR(100) NULL,
      station VARCHAR(50) NULL,
      sec_per_scan DECIMAL(10,2) NULL,
      wait_after_picking_min DECIMAL(10,2) NULL,
      wait_sort_to_pack_min DECIMAL(10,2) NULL,
      wait_pick_to_pack_min DECIMAL(10,2) NULL,
      is_sorted TINYINT(1) DEFAULT 1,
      is_packed TINYINT(1) DEFAULT 1,
      units_sorted INT DEFAULT 0,
      box_units_sorted INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_warehouse (warehouse),
      INDEX idx_box (sberny_box),
      INDEX idx_box_id (box_id),
      INDEX idx_order (obsah_objednavek),
      INDEX idx_pick_start (zacatek_pickovani),
      INDEX idx_bracket (bracket),
      INDEX idx_wh_pick (warehouse, zacatek_pickovani)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await p.query(createTableSql);

  // Helper/cache table for precalculated aggregations and query results
  const createCacheTableSql = `
    CREATE TABLE IF NOT EXISTS warehouse_stats_cache (
      cache_key VARCHAR(190) NOT NULL PRIMARY KEY,
      warehouse VARCHAR(50) NOT NULL,
      record_count INT NOT NULL DEFAULT 0,
      stats_json LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_cache_wh (warehouse)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await p.query(createCacheTableSql);

  // Inspect existing columns in warehouse_movements so we only run ALTER TABLE for missing columns
  // and use standard SQL syntax compatible with all MySQL & MariaDB versions
  try {
    const [cols]: any = await p.query('SHOW COLUMNS FROM warehouse_movements');
    const existingCols = new Set<string>(
      Array.isArray(cols) ? cols.map((c: any) => String(c.Field || '').toLowerCase()) : []
    );

    const columnMigrations: Array<{ col: string; sql: string }> = [
      { col: 'warehouse', sql: "ALTER TABLE warehouse_movements ADD COLUMN warehouse VARCHAR(50) NOT NULL DEFAULT 'ruse'" },
      { col: 'box_id', sql: 'ALTER TABLE warehouse_movements ADD COLUMN box_id VARCHAR(100) NULL' },
      { col: 'cycle_no', sql: 'ALTER TABLE warehouse_movements ADD COLUMN cycle_no INT NULL DEFAULT 1' },
      { col: 'zacatek_sortingu', sql: 'ALTER TABLE warehouse_movements ADD COLUMN zacatek_sortingu DATETIME NULL' },
      { col: 'konec_sortingu', sql: 'ALTER TABLE warehouse_movements ADD COLUMN konec_sortingu DATETIME NULL' },
      { col: 'sort_duration_s', sql: 'ALTER TABLE warehouse_movements ADD COLUMN sort_duration_s DECIMAL(10,2) NULL DEFAULT 0' },
      { col: 'sort_per_item_s', sql: 'ALTER TABLE warehouse_movements ADD COLUMN sort_per_item_s DECIMAL(10,2) NULL DEFAULT 0' },
      { col: 'station', sql: 'ALTER TABLE warehouse_movements ADD COLUMN station VARCHAR(50) NULL' },
      { col: 'wait_after_picking_min', sql: 'ALTER TABLE warehouse_movements ADD COLUMN wait_after_picking_min DECIMAL(10,2) NULL' },
      { col: 'wait_sort_to_pack_min', sql: 'ALTER TABLE warehouse_movements ADD COLUMN wait_sort_to_pack_min DECIMAL(10,2) NULL' },
      { col: 'wait_pick_to_pack_min', sql: 'ALTER TABLE warehouse_movements ADD COLUMN wait_pick_to_pack_min DECIMAL(10,2) NULL' },
      { col: 'is_sorted', sql: 'ALTER TABLE warehouse_movements ADD COLUMN is_sorted TINYINT(1) DEFAULT 1' },
      { col: 'is_packed', sql: 'ALTER TABLE warehouse_movements ADD COLUMN is_packed TINYINT(1) DEFAULT 1' },
      { col: 'units_sorted', sql: 'ALTER TABLE warehouse_movements ADD COLUMN units_sorted INT DEFAULT 0' },
      { col: 'box_units_sorted', sql: 'ALTER TABLE warehouse_movements ADD COLUMN box_units_sorted INT DEFAULT 0' },
    ];

    for (const mig of columnMigrations) {
      if (!existingCols.has(mig.col)) {
        try {
          await p.query(mig.sql);
          existingCols.add(mig.col);
        } catch (migErr: any) {
          console.warn(`Poznámka k migraci sloupce ${mig.col}:`, migErr?.message || migErr);
        }
      }
    }

    tableHasWarehouseColumn = existingCols.has('warehouse');
  } catch (err: any) {
    console.warn('Nelze ověřit sloupce warehouse_movements:', err?.message || err);
  }
}

export async function testConnection(): Promise<DbStatus> {
  statsMemoryCache.clear();
  if (!currentConfig.host || !currentConfig.user || !currentConfig.database) {
    return {
      connected: false,
      type: 'memory',
      totalRows: memoryMovements.length,
      lastError: 'MariaDB není nakonfigurována (využívá se lokální diskové úložiště)',
    };
  }

  if (!currentConfig.password) {
    return {
      connected: false,
      type: 'memory',
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      totalRows: memoryMovements.length,
      lastError: 'Chybí heslo k databázi. Zadejte heslo k databázi fhb_crm na db.mobilgroup.cz.',
    };
  }

  const startTime = Date.now();
  try {
    const p = await getPool();
    if (!p) {
      throw new Error(lastConnectionError || 'Nepodařilo se vytvořit connection pool.');
    }

    const [rows]: any = await p.query('SELECT VERSION() as version, DATABASE() as db');
    const latency = Date.now() - startTime;
    const version = rows[0]?.version || 'MariaDB';

    await initMariaDbSchema(p);

    const [countRows]: any = await p.query('SELECT COUNT(*) as count FROM warehouse_movements');
    const totalRows = countRows[0]?.count || 0;

    lastConnectionError = null;
    return {
      connected: true,
      type: 'mariadb',
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      latencyMs: latency,
      version,
      totalRows: Number(totalRows),
    };
  } catch (err: any) {
    const errMsg = err?.message || 'Chyba připojení k MariaDB';
    lastConnectionError = errMsg;
    return {
      connected: false,
      type: 'memory',
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      lastError: errMsg,
      totalRows: memoryMovements.length,
    };
  }
}

export async function getDbStatus(): Promise<DbStatus> {
  const p = await getPool();
  if (!p) {
    return {
      connected: false,
      type: 'memory',
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      totalRows: memoryMovements.length,
      lastError: lastConnectionError || (currentConfig.password ? 'Nelze navázat spojení se serverem MariaDB' : 'Chybí heslo k MariaDB databázi'),
    };
  }

  try {
    const startTime = Date.now();
    const [rows]: any = await p.query('SELECT VERSION() as version');
    const latency = Date.now() - startTime;
    const [countRows]: any = await p.query('SELECT COUNT(*) as count FROM warehouse_movements');
    lastConnectionError = null;
    return {
      connected: true,
      type: 'mariadb',
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      latencyMs: latency,
      version: rows[0]?.version,
      totalRows: Number(countRows[0]?.count || 0),
    };
  } catch (err: any) {
    lastConnectionError = err?.message || 'Chyba komunikace s MariaDB';
    return {
      connected: false,
      type: 'memory',
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      totalRows: memoryMovements.length,
      lastError: lastConnectionError || undefined,
    };
  }
}

function safeDate(val: any): Date {
  if (!val) return new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

function safeDateNullable(val: any): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

let saveDiskTimeout: NodeJS.Timeout | null = null;
let isSavingDisk = false;
let pendingSaveDisk = false;

async function saveMovementsToDiskAsync(): Promise<void> {
  if (isSavingDisk) {
    pendingSaveDisk = true;
    return;
  }
  isSavingDisk = true;
  pendingSaveDisk = false;
  try {
    const jsonStr = JSON.stringify(memoryMovements);
    await fs.promises.writeFile(PERSISTENT_DATA_PATH, jsonStr, 'utf-8');
  } catch (err) {
    console.error('Failed to save movements to disk:', err);
  } finally {
    isSavingDisk = false;
    if (pendingSaveDisk) {
      saveMovementsToDiskAsync();
    }
  }
}

export function scheduleSaveMovementsToDisk(delayMs = 2000): void {
  if (saveDiskTimeout) clearTimeout(saveDiskTimeout);
  saveDiskTimeout = setTimeout(() => {
    saveMovementsToDiskAsync();
  }, delayMs);
}

export async function flushMovementsToDisk(): Promise<void> {
  if (saveDiskTimeout) {
    clearTimeout(saveDiskTimeout);
    saveDiskTimeout = null;
  }
  await saveMovementsToDiskAsync();
}

/**
 * Automatická migrace záznamů z diskového úložiště do MariaDB,
 * pokud se právě připojila prázdná databáze.
 */
async function syncPendingMovementsToMariaDb(p: mysql.Pool): Promise<void> {
  if (memoryMovements.length === 0) return;
  try {
    const [countRows]: any = await p.query('SELECT COUNT(*) as count FROM warehouse_movements');
    const totalInDb = Number(countRows[0]?.count || 0);
    if (totalInDb === 0 && memoryMovements.length > 0) {
      console.log(`🔄 Synchronizuji ${memoryMovements.length} existujících záznamů do prázdné MariaDB tabulky...`);
      await insertMovementsDirect(p, memoryMovements);
      console.log(`✅ ${memoryMovements.length} záznamů úspěšně uloženo do MariaDB.`);
    }
  } catch (e) {
    console.warn('Sync to MariaDB failed:', e);
  }
}

async function insertMovementsDirect(p: mysql.Pool, records: MovementRecord[]): Promise<void> {
  await initMariaDbSchema(p);

  const insertSql = `
    INSERT INTO warehouse_movements (
      warehouse, box_id, sberny_box, cycle_no, obsah_objednavek, pocet_produktu, ean_produktu, pocet_ks,
      zacatek_pickovani, konec_pickovani, zacatek_sortingu, konec_sortingu, zacatek_baleni, konec_baleni,
      pick_duration_s, sort_duration_s, pack_duration_s, pick_per_item_s, sort_per_item_s, pack_per_item_s,
      bracket, packer, station, sec_per_scan, wait_after_picking_min, wait_sort_to_pack_min, wait_pick_to_pack_min,
      is_sorted, is_packed, units_sorted, box_units_sorted
    ) VALUES ?
  `;

  const values = records.map(r => [
    r.warehouse || 'ruse',
    r.box_id ? String(r.box_id) : null,
    r.sberny_box,
    r.cycle_no || 1,
    r.obsah_objednavek,
    r.pocet_produktu,
    r.ean_produktu,
    r.pocet_ks || 1,
    safeDate(r.zacatek_pickovani),
    safeDate(r.konec_pickovani),
    r.zacatek_sortingu ? safeDateNullable(r.zacatek_sortingu) : null,
    r.konec_sortingu ? safeDateNullable(r.konec_sortingu) : null,
    r.zacatek_baleni ? safeDateNullable(r.zacatek_baleni) : null,
    r.konec_baleni ? safeDateNullable(r.konec_baleni) : null,
    r.pick_duration_s || 0,
    r.sort_duration_s || 0,
    r.pack_duration_s || 0,
    r.pick_per_item_s || 0,
    r.sort_per_item_s || 0,
    r.pack_per_item_s || 0,
    r.bracket || '1',
    r.packer || null,
    r.station || null,
    r.sec_per_scan !== undefined ? r.sec_per_scan : null,
    r.wait_after_picking_min !== undefined ? r.wait_after_picking_min : null,
    r.wait_sort_to_pack_min !== undefined ? r.wait_sort_to_pack_min : null,
    r.wait_pick_to_pack_min !== undefined ? r.wait_pick_to_pack_min : null,
    r.is_sorted !== undefined ? (r.is_sorted ? 1 : 0) : 1,
    r.is_packed !== undefined ? (r.is_packed ? 1 : 0) : 1,
    r.units_sorted !== undefined ? Number(r.units_sorted) : 0,
    r.box_units_sorted !== undefined ? Number(r.box_units_sorted) : 0,
  ]);

  // Větší chunk size 2500 pro radikálně rychlejší MariaDB import
  const chunkSize = 2500;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await p.query(insertSql, [chunk]);
  }
}

export async function insertMovements(records: MovementRecord[]): Promise<{ count: number; destination: 'mariadb' | 'memory' }> {
  if (records.length === 0) return { count: 0, destination: 'memory' };

  const p = await getPool();
  if (p) {
    try {
      await insertMovementsDirect(p, records);
      await clearStatsCache(records[0]?.warehouse);
      return { count: records.length, destination: 'mariadb' };
    } catch (err: any) {
      console.error('❌ Chyba při vkládání do MariaDB:', err?.message || err);
      lastConnectionError = err?.message || 'Chyba zápisu do MariaDB';
      if (isProductionEnv && currentConfig.password) {
        throw new Error(`Nepodařilo se zapsat data do MariaDB: ${lastConnectionError}`);
      }
    }
  } else if (isProductionEnv && currentConfig.password) {
    throw new Error(`Není k dispozici spojení s MariaDB: ${lastConnectionError || 'Zkontrolujte přístupové údaje'}`);
  }

  // Fallback do lokální paměti pro vývojový režim nebo když MariaDB nemá heslo
  memoryMovements = [...records, ...memoryMovements];
  scheduleSaveMovementsToDisk(1500);
  await clearStatsCache(records[0]?.warehouse);
  return { count: records.length, destination: 'memory' };
}

function formatDbDateStr(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    return val.trim().replace(' ', 'T').substring(0, 19);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}T${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}`;
  }
  return String(val);
}

function normalizeDbRow(row: any): MovementRecord {
  const units = Math.max(1, Number(row.pocet_produktu) || Number(row.pocet_ks) || 1);
  const pickDur = Number(row.pick_duration_s) || 0;
  const sortDur = Number(row.sort_duration_s) || 0;
  const packDur = Number(row.pack_duration_s) || 0;
  const pickPerItem = row.pick_per_item_s !== null && row.pick_per_item_s !== undefined
    ? Number(row.pick_per_item_s) || 0
    : Number((pickDur / units).toFixed(2));
  const sortPerItem = row.sort_per_item_s !== null && row.sort_per_item_s !== undefined
    ? Number(row.sort_per_item_s) || 0
    : (sortDur > 0 ? Number((sortDur / units).toFixed(2)) : 0);
  const packPerItem = row.pack_per_item_s !== null && row.pack_per_item_s !== undefined
    ? Number(row.pack_per_item_s) || 0
    : (packDur > 0 ? Number((packDur / units).toFixed(2)) : 0);
  const totalPerItem = Number((pickPerItem + sortPerItem + packPerItem).toFixed(2));

  const rawWh = row.warehouse ? String(row.warehouse).trim().toLowerCase() : 'ruse';
  const warehouse = (rawWh === 'svj' ? 'svj' : 'ruse') as 'ruse' | 'svj';

  let bracket = String(row.bracket || '').trim();
  if (!['1', '2', '3', '4', '5', '6+'].includes(bracket)) {
    bracket = units >= 6 ? '6+' : String(units);
  }

  return {
    id: row.id,
    warehouse,
    box_id: row.box_id !== null && row.box_id !== undefined ? String(row.box_id) : undefined,
    sberny_box: String(row.sberny_box || ''),
    cycle_no: Number(row.cycle_no) || 1,
    obsah_objednavek: String(row.obsah_objednavek || ''),
    pocet_produktu: units,
    ean_produktu: String(row.ean_produktu || ''),
    pocet_ks: Number(row.pocet_ks) || 1,
    zacatek_pickovani: formatDbDateStr(row.zacatek_pickovani),
    konec_pickovani: formatDbDateStr(row.konec_pickovani),
    zacatek_sortingu: row.zacatek_sortingu ? formatDbDateStr(row.zacatek_sortingu) : undefined,
    konec_sortingu: row.konec_sortingu ? formatDbDateStr(row.konec_sortingu) : undefined,
    zacatek_baleni: formatDbDateStr(row.zacatek_baleni),
    konec_baleni: formatDbDateStr(row.konec_baleni),
    pick_duration_s: pickDur,
    sort_duration_s: sortDur,
    pack_duration_s: packDur,
    pick_per_item_s: pickPerItem,
    sort_per_item_s: sortPerItem,
    pack_per_item_s: packPerItem,
    total_per_item_s: totalPerItem,
    bracket: bracket as any,
    packer: row.packer !== null && row.packer !== undefined ? String(row.packer) : undefined,
    station: row.station !== null && row.station !== undefined ? String(row.station) : undefined,
    sec_per_scan: row.sec_per_scan !== null && row.sec_per_scan !== undefined ? Number(row.sec_per_scan) : undefined,
    wait_after_picking_min: row.wait_after_picking_min !== null && row.wait_after_picking_min !== undefined ? Number(row.wait_after_picking_min) : undefined,
    wait_sort_to_pack_min: row.wait_sort_to_pack_min !== null && row.wait_sort_to_pack_min !== undefined ? Number(row.wait_sort_to_pack_min) : undefined,
    wait_pick_to_pack_min: row.wait_pick_to_pack_min !== null && row.wait_pick_to_pack_min !== undefined ? Number(row.wait_pick_to_pack_min) : undefined,
    is_sorted: row.is_sorted !== null && row.is_sorted !== undefined ? Boolean(Number(row.is_sorted)) : undefined,
    is_packed: row.is_packed !== null && row.is_packed !== undefined ? Boolean(Number(row.is_packed)) : true,
    units_sorted: row.units_sorted !== null && row.units_sorted !== undefined ? Number(row.units_sorted) : undefined,
    box_units_sorted: row.box_units_sorted !== null && row.box_units_sorted !== undefined ? Number(row.box_units_sorted) : undefined,
    created_at: row.created_at ? formatDbDateStr(row.created_at) : undefined,
  };
}

export async function getMovements(params: {
  warehouse?: string;
  dateFrom?: string;
  dateTo?: string;
  bracket?: string;
  box?: string;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<{ records: MovementRecord[]; total: number; source: 'mariadb' | 'memory' }> {
  const p = await getPool();

  if (p) {
    try {
      let conditions: string[] = [];
      let queryParams: any[] = [];

      if (params.warehouse && params.warehouse !== 'all') {
        if (!tableHasWarehouseColumn) {
          if (params.warehouse === 'svj') {
            return { records: [], total: 0, source: 'mariadb' };
          }
        } else if (params.warehouse === 'ruse') {
          conditions.push("(LOWER(TRIM(warehouse)) = 'ruse' OR warehouse IS NULL OR TRIM(warehouse) = '')");
        } else {
          conditions.push('LOWER(TRIM(warehouse)) = ?');
          queryParams.push(params.warehouse.toLowerCase());
        }
      }
      if (params.dateFrom) {
        conditions.push('zacatek_pickovani >= ?');
        queryParams.push(`${params.dateFrom} 00:00:00`);
      }
      if (params.dateTo) {
        conditions.push('(konec_baleni <= ? OR (konec_baleni IS NULL AND konec_pickovani <= ?))');
        queryParams.push(`${params.dateTo} 23:59:59`, `${params.dateTo} 23:59:59`);
      }
      if (params.bracket && params.bracket !== 'all') {
        conditions.push('bracket = ?');
        queryParams.push(params.bracket);
      }
      if (params.box) {
        conditions.push('sberny_box LIKE ?');
        queryParams.push(`%${params.box}%`);
      }
      if (params.query) {
        conditions.push('(obsah_objednavek LIKE ? OR ean_produktu LIKE ? OR sberny_box LIKE ?)');
        const q = `%${params.query}%`;
        queryParams.push(q, q, q);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const [countResult]: any = await p.query(
        `SELECT COUNT(*) as total FROM warehouse_movements ${whereClause}`,
        queryParams
      );
      const total = Number(countResult[0]?.total || 0);

      const limit = params.limit !== undefined && params.limit > 0 ? params.limit : 500000;
      const offset = params.offset || 0;

      const [rows]: any = await p.query(
        `SELECT * FROM warehouse_movements ${whereClause}
         ORDER BY zacatek_pickovani DESC
         LIMIT ? OFFSET ?`,
        [...queryParams, limit, offset]
      );

      const mapped = Array.isArray(rows) ? rows.map(normalizeDbRow) : [];

      return {
        records: mapped,
        total,
        source: 'mariadb',
      };
    } catch (err: any) {
      console.error('Chyba při dotazu MariaDB (getMovements):', err?.message || err);
      lastConnectionError = err?.message || 'Chyba dotazu do MariaDB';
      if (isProductionEnv && currentConfig.password) {
        return {
          records: [],
          total: 0,
          source: 'mariadb',
        };
      }
    }
  }

  // Pouze v ostré produkci s heslem k MariaDB bez spojení nevracíme paměť
  if (isProductionEnv && currentConfig.password) {
    return {
      records: [],
      total: 0,
      source: 'mariadb',
    };
  }

  // Fallback to disk-persisted store pouze pro lokální vývoj
  let filtered = [...memoryMovements];

  if (params.warehouse && params.warehouse !== 'all') {
    filtered = filtered.filter(r => (r.warehouse || 'ruse') === params.warehouse);
  }
  if (params.dateFrom) {
    const fromTime = new Date(`${params.dateFrom}T00:00:00`).getTime();
    filtered = filtered.filter(r => new Date(r.zacatek_pickovani).getTime() >= fromTime);
  }
  if (params.dateTo) {
    const toTime = new Date(`${params.dateTo}T23:59:59`).getTime();
    filtered = filtered.filter(r => new Date(r.konec_baleni).getTime() <= toTime);
  }
  if (params.bracket && params.bracket !== 'all') {
    filtered = filtered.filter(r => r.bracket === params.bracket);
  }
  if (params.box) {
    filtered = filtered.filter(r => r.sberny_box.toLowerCase().includes(params.box!.toLowerCase()));
  }
  if (params.query) {
    const q = params.query.toLowerCase();
    filtered = filtered.filter(
      r =>
        r.obsah_objednavek.toLowerCase().includes(q) ||
        r.ean_produktu.toLowerCase().includes(q) ||
        r.sberny_box.toLowerCase().includes(q)
    );
  }

  const total = filtered.length;
  const offset = params.offset || 0;
  const limit = params.limit !== undefined && params.limit > 0 ? params.limit : total;
  const paged = filtered.slice(offset, offset + limit);

  return {
    records: paged,
    total,
    source: 'memory',
  };
}

export async function clearMovements(warehouse?: string): Promise<void> {
  if (warehouse && warehouse !== 'all') {
    memoryMovements = memoryMovements.filter(r => (r.warehouse || 'ruse') !== warehouse);
  } else {
    memoryMovements = [];
  }
  scheduleSaveMovementsToDisk(500);
  await clearStatsCache(warehouse);

  const p = await getPool();
  if (p) {
    try {
      if (warehouse && warehouse !== 'all') {
        await p.query('DELETE FROM warehouse_movements WHERE warehouse = ?', [warehouse]);
      } else {
        await p.query('TRUNCATE TABLE warehouse_movements');
      }
    } catch {
      // ignore
    }
  }
}

// In-memory cache for ultra-fast analytics serving (< 5ms)
const statsMemoryCache = new Map<string, { data: any; count: number; savedAt: number }>();

export async function getCachedStats(cacheKey: string, expectedCount?: number): Promise<any | null> {
  const p = await getPool();

  // Pokud je aktivní připojení k MariaDB, vždy ověřujeme tabulku warehouse_stats_cache v DB jako primární zdroj pravdy.
  // Pokud uživatel tabulku warehouse_stats_cache v DB promazal, záznam v DB nebude a my jej ihned znovu spočítáme a uložíme!
  if (p) {
    try {
      const [rows]: any = await p.query(
        'SELECT record_count, stats_json FROM warehouse_stats_cache WHERE cache_key = ? LIMIT 1',
        [cacheKey]
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        const dbCount = Number(row.record_count || 0);
        // Nikdy nepoužíváme prázdnou (0-řádkovou) cache
        if (dbCount <= 0) {
          statsMemoryCache.delete(cacheKey);
          return null;
        }
        if (expectedCount === undefined || dbCount === expectedCount) {
          const parsed = JSON.parse(row.stats_json);
          if (parsed && Number(parsed.recordCount) > 0) {
            // Ověření schématu pro SVJ bypass (ochrana před starším formátem v cache)
            const svjByp = parsed.svjBypassAnalysis || parsed.svjSummary?.svjBypassAnalysis;
            if (svjByp && (!svjByp.recommendedSet || !svjByp.categories?.[0]?.categoryKey)) {
              statsMemoryCache.delete(cacheKey);
              return null;
            }
            statsMemoryCache.set(cacheKey, { data: parsed, count: dbCount, savedAt: Date.now() });
            return parsed;
          }
        }
      } else {
        // V MariaDB tabulce warehouse_stats_cache záznam není -> invalidujeme i RAM cache, aby se znovu spočítal a zapsal do DB
        statsMemoryCache.delete(cacheKey);
        return null;
      }
    } catch (err: any) {
      console.warn('Chyba při čtení z warehouse_stats_cache:', err?.message || err);
    }
    return null;
  }

  // Fallback na RAM cache pouze pokud není aktivní MariaDB
  const mem = statsMemoryCache.get(cacheKey);
  if (mem && mem.count > 0) {
    if (expectedCount === undefined || mem.count === expectedCount) {
      return mem.data;
    }
  }

  return null;
}

function compactStatsForCache(stats: any): any {
  if (!stats || typeof stats !== 'object') return stats;
  const copy = { ...stats };
  if (copy.synergyData && Array.isArray(copy.synergyData.boxStats)) {
    copy.synergyData = {
      ...copy.synergyData,
      totalBoxesCount: copy.synergyData.totalBoxesCount || copy.synergyData.boxStats.length,
      boxStats: copy.synergyData.boxStats.slice(0, 25),
    };
  }
  if (copy.ruseSummary && typeof copy.ruseSummary === 'object') {
    copy.ruseSummary = compactStatsForCache(copy.ruseSummary);
  }
  if (copy.svjSummary && typeof copy.svjSummary === 'object') {
    copy.svjSummary = compactStatsForCache(copy.svjSummary);
  }
  return copy;
}

export async function saveCachedStats(
  cacheKey: string,
  warehouse: string,
  recordCount: number,
  stats: any
): Promise<void> {
  // Nikdy neukládáme nulové výsledky (0 záznamů) do cache, aby nedošlo k uzamčení nulových hodnot
  if (!recordCount || recordCount <= 0) {
    statsMemoryCache.delete(cacheKey);
    return;
  }

  const compacted = compactStatsForCache(stats);
  statsMemoryCache.set(cacheKey, { data: compacted, count: recordCount, savedAt: Date.now() });

  const p = await getPool();
  if (p) {
    try {
      const statsJson = typeof compacted === 'string' ? compacted : JSON.stringify(compacted);
      await p.query(
        `INSERT INTO warehouse_stats_cache (cache_key, warehouse, record_count, stats_json)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE record_count = VALUES(record_count), stats_json = VALUES(stats_json), updated_at = NOW()`,
        [cacheKey, warehouse, recordCount, statsJson]
      );
    } catch (err: any) {
      console.error('Chyba při zápisu do warehouse_stats_cache:', err?.message || err);
    }
  }
}

export async function clearStatsCache(warehouse?: string): Promise<void> {
  // 1. Vyčistit paměťovou mezipaměť pro konzistentní výsledky
  statsMemoryCache.clear();

  // 2. Vyčistit MariaDB tabulku mezipaměti
  const p = await getPool();
  if (p) {
    try {
      if (warehouse && warehouse !== 'all') {
        await p.query("DELETE FROM warehouse_stats_cache WHERE warehouse = ? OR warehouse = 'all'", [warehouse]);
      } else {
        await p.query('TRUNCATE TABLE warehouse_stats_cache');
      }
    } catch {
      // ignore
    }
  }
}

export interface WarehouseRecordFilters {
  excludeOutliers?: boolean;
  datePreset?: string;
  dateFrom?: string;
  dateTo?: string;
  bracket?: string;
  box?: string;
  query?: string;
}

export async function getWarehouseRecords(
  warehouse: 'ruse' | 'svj' | 'all',
  filters?: WarehouseRecordFilters
): Promise<MovementRecord[]> {
  const p = await getPool();
  if (p) {
    try {
      let sql = `SELECT * FROM warehouse_movements`;

      const conditions: string[] = [];
      const params: any[] = [];

      if (warehouse !== 'all') {
        if (!tableHasWarehouseColumn) {
          // Pokud tabulka nemá sloupec warehouse, všechna historická data patří skladu Ruse
          if (warehouse === 'svj') {
            return [];
          }
        } else if (warehouse === 'ruse') {
          conditions.push("(LOWER(TRIM(warehouse)) = 'ruse' OR warehouse IS NULL OR TRIM(warehouse) = '')");
        } else {
          conditions.push('LOWER(TRIM(warehouse)) = ?');
          params.push(warehouse.toLowerCase());
        }
      }

      if (filters?.excludeOutliers) {
        conditions.push('(pick_duration_s <= 1800 AND (pack_duration_s IS NULL OR pack_duration_s <= 1800))');
      }

      if (filters?.bracket && filters.bracket !== 'all') {
        conditions.push('bracket = ?');
        params.push(filters.bracket);
      }

      if (filters?.box && filters.box.trim()) {
        conditions.push('sberny_box LIKE ?');
        params.push(`%${filters.box.trim()}%`);
      }

      if (filters?.query && filters.query.trim()) {
        conditions.push('(obsah_objednavek LIKE ? OR ean_produktu LIKE ? OR sberny_box LIKE ?)');
        const q = `%${filters.query.trim()}%`;
        params.push(q, q, q);
      }

      if (filters?.datePreset && filters.datePreset !== 'all') {
        if (filters.datePreset === 'today') {
          conditions.push('zacatek_pickovani >= CURDATE()');
        } else if (filters.datePreset === '7days') {
          conditions.push('zacatek_pickovani >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
        } else if (filters.datePreset === '14days') {
          conditions.push('zacatek_pickovani >= DATE_SUB(NOW(), INTERVAL 14 DAY)');
        } else if (filters.datePreset === '30days') {
          conditions.push('zacatek_pickovani >= DATE_SUB(NOW(), INTERVAL 30 DAY)');
        } else if (filters.datePreset === 'custom') {
          if (filters.dateFrom) {
            conditions.push('zacatek_pickovani >= ?');
            params.push(`${filters.dateFrom} 00:00:00`);
          }
          if (filters.dateTo) {
            conditions.push('(konec_baleni <= ? OR (konec_baleni IS NULL AND konec_pickovani <= ?))');
            params.push(`${filters.dateTo} 23:59:59`, `${filters.dateTo} 23:59:59`);
          }
        }
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY zacatek_pickovani DESC';

      try {
        const [rows]: any = await p.query(sql, params);
        return Array.isArray(rows) ? rows.map(normalizeDbRow) : [];
      } catch (queryErr: any) {
        if (currentConfig.ssl && isNoSslSupportError(queryErr)) {
          console.warn('⚠️ getWarehouseRecords zjistil chybu SSL podpory serveru – vypínám SSL a opakuji dotaz...');
          try {
            await p.end();
          } catch {
            // ignore
          }
          pool = null;
          currentConfig.ssl = false;
          saveConfigToFile(currentConfig);
          const retryPool = await getPool();
          if (retryPool) {
            const [retryRows]: any = await retryPool.query(sql, params);
            return Array.isArray(retryRows) ? retryRows.map(normalizeDbRow) : [];
          }
        }
        throw queryErr;
      }
    } catch (err: any) {
      console.error('Chyba při dotazu getWarehouseRecords z MariaDB:', err?.message || err);
      if (isProductionEnv && currentConfig.password) {
        throw new Error(err?.message || 'Chyba při dotazu do MariaDB');
      }
    }
  }

  // Pouze v ostré produkci s heslem bez DB spojení nevracíme paměť
  if (isProductionEnv && currentConfig.password) {
    return [];
  }

  // Memory fallback pro vývojový režim nebo když MariaDB nemá heslo
  let filtered = [...memoryMovements];
  if (warehouse !== 'all') {
    filtered = filtered.filter(r => (r.warehouse || 'ruse') === warehouse);
  }
  if (filters?.excludeOutliers) {
    filtered = filtered.filter(r => r.pick_duration_s <= 1800 && r.pack_duration_s <= 1800);
  }
  if (filters?.bracket && filters.bracket !== 'all') {
    filtered = filtered.filter(r => r.bracket === filters.bracket);
  }
  return filtered;
}
