import mysql from 'mysql2/promise';
import { MariaDbConfig, MovementRecord, DbStatus } from '../types.js';

let pool: mysql.Pool | null = null;
let currentConfig: MariaDbConfig = {
  host: process.env.DB_HOST || process.env.MARIADB_HOST || '',
  port: Number(process.env.DB_PORT || process.env.MARIADB_PORT) || 3306,
  user: process.env.DB_USER || process.env.MARIADB_USER || '',
  password: process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || '',
  database: process.env.DB_NAME || process.env.DB_DATABASE || process.env.MARIADB_DATABASE || '',
  ssl: process.env.DB_SSL === 'true' || process.env.MARIADB_SSL === 'true',
};

// In-memory fallback dataset so analytics work immediately out-of-the-box
let memoryMovements: MovementRecord[] = [];

export function getDbConfig(): MariaDbConfig {
  return {
    ...currentConfig,
    password: currentConfig.password ? '••••••••' : '',
  };
}

export async function setDbConfig(config: Partial<MariaDbConfig>): Promise<DbStatus> {
  currentConfig = {
    ...currentConfig,
    ...config,
    password: config.password !== undefined && config.password !== '••••••••' ? config.password : currentConfig.password,
  };

  if (pool) {
    try {
      await pool.end();
    } catch {
      // ignore
    }
    pool = null;
  }

  return await testConnection();
}

let schemaInitialized = false;

export async function getPool(): Promise<mysql.Pool | null> {
  if (pool) return pool;
  if (!currentConfig.host || !currentConfig.user || !currentConfig.database) {
    return null;
  }

  try {
    const newPool = mysql.createPool({
      host: currentConfig.host,
      port: currentConfig.port,
      user: currentConfig.user,
      password: currentConfig.password,
      database: currentConfig.database,
      ssl: currentConfig.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 8000,
    });

    if (!schemaInitialized) {
      try {
        await initMariaDbSchema(newPool);
        schemaInitialized = true;
        console.log(`MariaDB schema verified for database '${currentConfig.database}' on ${currentConfig.host}`);
      } catch (schemaErr: any) {
        console.warn('Warning: Could not auto-initialize schema on pool creation:', schemaErr?.message);
      }
    }

    pool = newPool;
    return pool;
  } catch (err) {
    console.error('Failed to create MariaDB pool:', err);
    pool = null;
    return null;
  }
}

export async function initMariaDbSchema(p: mysql.Pool): Promise<void> {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS warehouse_movements (
      id INT AUTO_INCREMENT PRIMARY KEY,
      box_id VARCHAR(100) NULL,
      sberny_box VARCHAR(100) NOT NULL,
      obsah_objednavek VARCHAR(100) NOT NULL,
      pocet_produktu INT NOT NULL,
      ean_produktu VARCHAR(100) NOT NULL,
      pocet_ks INT NOT NULL DEFAULT 1,
      zacatek_pickovani DATETIME NOT NULL,
      konec_pickovani DATETIME NOT NULL,
      zacatek_baleni DATETIME NOT NULL,
      konec_baleni DATETIME NOT NULL,
      pick_duration_s DECIMAL(10,2) NOT NULL,
      pack_duration_s DECIMAL(10,2) NOT NULL,
      pick_per_item_s DECIMAL(10,2) NOT NULL,
      pack_per_item_s DECIMAL(10,2) NOT NULL,
      bracket VARCHAR(10) NOT NULL,
      packer VARCHAR(50) NULL,
      sec_per_scan DECIMAL(10,2) NULL,
      wait_pick_to_pack_min DECIMAL(10,2) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_box (sberny_box),
      INDEX idx_box_id (box_id),
      INDEX idx_order (obsah_objednavek),
      INDEX idx_pick_start (zacatek_pickovani),
      INDEX idx_bracket (bracket)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await p.query(createTableSql);

  // Soft migration for existing tables if columns are missing
  try {
    await p.query('ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS box_id VARCHAR(100) NULL AFTER id');
    await p.query('ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS packer VARCHAR(50) NULL AFTER bracket');
    await p.query('ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS sec_per_scan DECIMAL(10,2) NULL AFTER packer');
    await p.query('ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS wait_pick_to_pack_min DECIMAL(10,2) NULL AFTER sec_per_scan');
  } catch {
    // Column might already exist or MariaDB doesn't support IF NOT EXISTS in ADD COLUMN
  }
}

export async function testConnection(): Promise<DbStatus> {
  if (!currentConfig.host || !currentConfig.user || !currentConfig.database) {
    return {
      connected: false,
      type: 'memory',
      totalRows: memoryMovements.length,
      lastError: 'MariaDB není nakonfigurována (využívá se lokální paměťové úložiště)',
    };
  }

  const startTime = Date.now();
  try {
    const p = await getPool();
    if (!p) {
      throw new Error('Nepodařilo se vytvořit connection pool.');
    }

    const [rows]: any = await p.query('SELECT VERSION() as version, DATABASE() as db');
    const latency = Date.now() - startTime;
    const version = rows[0]?.version || 'MariaDB';

    await initMariaDbSchema(p);

    const [countRows]: any = await p.query('SELECT COUNT(*) as count FROM warehouse_movements');
    const totalRows = countRows[0]?.count || 0;

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
    return {
      connected: false,
      type: 'memory',
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      lastError: err?.message || 'Chyba připojení k MariaDB',
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
      totalRows: memoryMovements.length,
      lastError: 'MariaDB není připojena (používá se lokální režim)',
    };
  }

  try {
    const startTime = Date.now();
    const [rows]: any = await p.query('SELECT VERSION() as version');
    const latency = Date.now() - startTime;
    const [countRows]: any = await p.query('SELECT COUNT(*) as count FROM warehouse_movements');
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
    return {
      connected: false,
      type: 'memory',
      totalRows: memoryMovements.length,
      lastError: err.message,
    };
  }
}

function safeDate(val: any): Date {
  if (!val) return new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date() : d;
}

export async function insertMovements(records: MovementRecord[]): Promise<{ count: number; destination: 'mariadb' | 'memory' }> {
  if (records.length === 0) return { count: 0, destination: 'memory' };

  const p = await getPool();
  if (p) {
    try {
      await initMariaDbSchema(p);
      
      const insertSql = `
        INSERT INTO warehouse_movements (
          box_id, sberny_box, obsah_objednavek, pocet_produktu, ean_produktu, pocet_ks,
          zacatek_pickovani, konec_pickovani, zacatek_baleni, konec_baleni,
          pick_duration_s, pack_duration_s, pick_per_item_s, pack_per_item_s, bracket,
          packer, sec_per_scan, wait_pick_to_pack_min
        ) VALUES ?
      `;

      const values = records.map(r => [
        r.box_id ? String(r.box_id) : null,
        r.sberny_box,
        r.obsah_objednavek,
        r.pocet_produktu,
        r.ean_produktu,
        r.pocet_ks || 1,
        safeDate(r.zacatek_pickovani),
        safeDate(r.konec_pickovani),
        safeDate(r.zacatek_baleni),
        safeDate(r.konec_baleni),
        r.pick_duration_s || 0,
        r.pack_duration_s || 0,
        r.pick_per_item_s || 0,
        r.pack_per_item_s || 0,
        r.bracket || '1',
        r.packer || null,
        r.sec_per_scan !== undefined ? r.sec_per_scan : null,
        r.wait_pick_to_pack_min !== undefined ? r.wait_pick_to_pack_min : null,
      ]);

      // Chunk in blocks of 500 for high stability
      const chunkSize = 500;
      for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        await p.query(insertSql, [chunk]);
      }

      // Also mirror in memory cache for immediate instant query speeds
      memoryMovements = [...records, ...memoryMovements];

      return { count: records.length, destination: 'mariadb' };
    } catch (err) {
      console.error('Error inserting into MariaDB, falling back to local memory store:', err);
    }
  }

  // Fallback to memory
  memoryMovements = [...records, ...memoryMovements];
  return { count: records.length, destination: 'memory' };
}

export async function getMovements(params: {
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

      if (params.dateFrom) {
        conditions.push('zacatek_pickovani >= ?');
        queryParams.push(`${params.dateFrom} 00:00:00`);
      }
      if (params.dateTo) {
        conditions.push('konec_baleni <= ?');
        queryParams.push(`${params.dateTo} 23:59:59`);
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
        `SELECT 
          id, box_id, sberny_box, obsah_objednavek, pocet_produktu, ean_produktu, pocet_ks,
          DATE_FORMAT(zacatek_pickovani, '%Y-%m-%dT%H:%i:%s') as zacatek_pickovani,
          DATE_FORMAT(konec_pickovani, '%Y-%m-%dT%H:%i:%s') as konec_pickovani,
          DATE_FORMAT(zacatek_baleni, '%Y-%m-%dT%H:%i:%s') as zacatek_baleni,
          DATE_FORMAT(konec_baleni, '%Y-%m-%dT%H:%i:%s') as konec_baleni,
          CAST(pick_duration_s AS DOUBLE) as pick_duration_s,
          CAST(pack_duration_s AS DOUBLE) as pack_duration_s,
          CAST(pick_per_item_s AS DOUBLE) as pick_per_item_s,
          CAST(pack_per_item_s AS DOUBLE) as pack_per_item_s,
          ROUND(CAST(pick_per_item_s AS DOUBLE) + CAST(pack_per_item_s AS DOUBLE), 2) as total_per_item_s,
          bracket,
          packer,
          CAST(sec_per_scan AS DOUBLE) as sec_per_scan,
          CAST(wait_pick_to_pack_min AS DOUBLE) as wait_pick_to_pack_min,
          created_at
        FROM warehouse_movements ${whereClause}
        ORDER BY zacatek_pickovani DESC
        LIMIT ? OFFSET ?`,
        [...queryParams, limit, offset]
      );

      return {
        records: rows as MovementRecord[],
        total,
        source: 'mariadb',
      };
    } catch (err) {
      console.error('Error querying MariaDB, falling back to memory:', err);
    }
  }

  // Memory filtering
  let filtered = [...memoryMovements];

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

export async function clearMovements(): Promise<void> {
  memoryMovements = [];
  const p = await getPool();
  if (p) {
    try {
      await p.query('TRUNCATE TABLE warehouse_movements');
    } catch {
      // ignore
    }
  }
}
