// server.ts
import express from "express";
import http from "http";
import https from "https";
import tls from "tls";
import fs2 from "fs";
import path2 from "path";
import { fileURLToPath } from "url";
import dotenv2 from "dotenv";

// src/server/db.ts
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
var CONFIG_FILE_PATH = path.resolve(process.cwd(), "data", "db-config.json");
var PERSISTENT_DATA_PATH = path.resolve(process.cwd(), "data", "warehouse_movements.json");
try {
  const dataDir = path.resolve(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
} catch {
}
function loadSavedConfig() {
  let fileConfig = {};
  if (fs.existsSync(CONFIG_FILE_PATH)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE_PATH, "utf-8");
      fileConfig = JSON.parse(content);
    } catch (e) {
      console.warn("Could not read db-config.json:", e);
    }
  }
  return {
    host: fileConfig.host || process.env.DB_HOST || process.env.MARIADB_HOST || "db.mobilgroup.cz",
    port: Number(fileConfig.port || process.env.DB_PORT || process.env.MARIADB_PORT) || 3306,
    user: fileConfig.user || process.env.DB_USER || process.env.MARIADB_USER || "fhb_crm",
    password: fileConfig.password !== void 0 ? fileConfig.password : process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || "",
    database: fileConfig.database || process.env.DB_NAME || process.env.DB_DATABASE || process.env.MARIADB_DATABASE || "fhb_crm",
    ssl: fileConfig.ssl !== void 0 ? Boolean(fileConfig.ssl) : process.env.DB_SSL === "true" || process.env.MARIADB_SSL === "true"
  };
}
function saveConfigToFile(config) {
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to write db-config.json:", err);
  }
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }
    const updates = {
      DB_HOST: config.host,
      DB_PORT: String(config.port),
      DB_USER: config.user,
      DB_PASSWORD: config.password || "",
      DB_NAME: config.database,
      DB_SSL: String(config.ssl)
    };
    for (const [k, v] of Object.entries(updates)) {
      const regex = new RegExp(`^${k}=.*$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${k}="${v}"`);
      } else {
        envContent += `
${k}="${v}"`;
      }
    }
    fs.writeFileSync(envPath, envContent.trim() + "\n", "utf-8");
  } catch {
  }
}
var memoryMovements = [];
try {
  if (fs.existsSync(PERSISTENT_DATA_PATH)) {
    const raw = fs.readFileSync(PERSISTENT_DATA_PATH, "utf-8");
    memoryMovements = JSON.parse(raw);
    console.log(`\u{1F4C2} Na\u010Dteno ${memoryMovements.length} ulo\u017Een\xFDch z\xE1znam\u016F z diskov\xE9ho \xFAlo\u017Ei\u0161t\u011B (${PERSISTENT_DATA_PATH})`);
  }
} catch (e) {
  console.warn("Could not read persistent warehouse_movements.json:", e);
}
function saveMovementsToDisk() {
  try {
    fs.writeFileSync(PERSISTENT_DATA_PATH, JSON.stringify(memoryMovements), "utf-8");
  } catch (err) {
    console.error("Failed to save movements to disk:", err);
  }
}
var pool = null;
var currentConfig = loadSavedConfig();
var lastConnectionError = null;
function getDbConfig() {
  return {
    ...currentConfig,
    password: currentConfig.password ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : ""
  };
}
async function setDbConfig(config) {
  const newPassword = config.password !== void 0 && config.password !== "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" ? config.password : currentConfig.password;
  currentConfig = {
    ...currentConfig,
    ...config,
    password: newPassword
  };
  saveConfigToFile(currentConfig);
  if (pool) {
    try {
      await pool.end();
    } catch {
    }
    pool = null;
  }
  schemaInitialized = false;
  return await testConnection();
}
var schemaInitialized = false;
async function getPool() {
  if (pool) return pool;
  if (!currentConfig.host || !currentConfig.user || !currentConfig.database) {
    lastConnectionError = "Chyb\xED host, u\u017Eivatel nebo n\xE1zev datab\xE1ze.";
    return null;
  }
  if (!currentConfig.password) {
    lastConnectionError = "Chyb\xED heslo k datab\xE1zi fhb_crm na db.mobilgroup.cz. Zadejte heslo v Nastaven\xED DB pro trval\xE9 ukl\xE1d\xE1n\xED.";
    return null;
  }
  try {
    const newPool = mysql.createPool({
      host: currentConfig.host,
      port: currentConfig.port,
      user: currentConfig.user,
      password: currentConfig.password,
      database: currentConfig.database,
      ssl: currentConfig.ssl ? { rejectUnauthorized: false } : void 0,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 7e3,
      enableKeepAlive: true,
      keepAliveInitialDelay: 1e4
    });
    if (!schemaInitialized) {
      try {
        await initMariaDbSchema(newPool);
        schemaInitialized = true;
        lastConnectionError = null;
        console.log(`\u2705 MariaDB spojen\xED a sch\xE9ma ov\u011B\u0159eno: ${currentConfig.user}@${currentConfig.host}:${currentConfig.port}/${currentConfig.database}`);
        syncPendingMovementsToMariaDb(newPool).catch(() => {
        });
      } catch (schemaErr) {
        lastConnectionError = schemaErr?.message || "Chyba inicializace MariaDB sch\xE9matu";
        console.warn("Warning: Could not auto-initialize schema on pool creation:", lastConnectionError);
      }
    }
    pool = newPool;
    return pool;
  } catch (err) {
    lastConnectionError = err?.message || "Chyba p\u0159i vytv\xE1\u0159en\xED MariaDB poolu";
    console.error("Failed to create MariaDB pool:", lastConnectionError);
    pool = null;
    return null;
  }
}
async function initMariaDbSchema(p) {
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
  try {
    await p.query("ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS box_id VARCHAR(100) NULL AFTER id");
    await p.query("ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS packer VARCHAR(50) NULL AFTER bracket");
    await p.query("ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS sec_per_scan DECIMAL(10,2) NULL AFTER packer");
    await p.query("ALTER TABLE warehouse_movements ADD COLUMN IF NOT EXISTS wait_pick_to_pack_min DECIMAL(10,2) NULL AFTER sec_per_scan");
  } catch {
  }
}
async function testConnection() {
  if (!currentConfig.host || !currentConfig.user || !currentConfig.database) {
    return {
      connected: false,
      type: "memory",
      totalRows: memoryMovements.length,
      lastError: "MariaDB nen\xED nakonfigurov\xE1na (vyu\u017E\xEDv\xE1 se lok\xE1ln\xED diskov\xE9 \xFAlo\u017Ei\u0161t\u011B)"
    };
  }
  if (!currentConfig.password) {
    return {
      connected: false,
      type: "memory",
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      totalRows: memoryMovements.length,
      lastError: "Chyb\xED heslo k datab\xE1zi. Zadejte heslo k datab\xE1zi fhb_crm na db.mobilgroup.cz."
    };
  }
  const startTime = Date.now();
  try {
    const p = await getPool();
    if (!p) {
      throw new Error(lastConnectionError || "Nepoda\u0159ilo se vytvo\u0159it connection pool.");
    }
    const [rows] = await p.query("SELECT VERSION() as version, DATABASE() as db");
    const latency = Date.now() - startTime;
    const version = rows[0]?.version || "MariaDB";
    await initMariaDbSchema(p);
    const [countRows] = await p.query("SELECT COUNT(*) as count FROM warehouse_movements");
    const totalRows = countRows[0]?.count || 0;
    lastConnectionError = null;
    return {
      connected: true,
      type: "mariadb",
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      latencyMs: latency,
      version,
      totalRows: Number(totalRows)
    };
  } catch (err) {
    const errMsg = err?.message || "Chyba p\u0159ipojen\xED k MariaDB";
    lastConnectionError = errMsg;
    return {
      connected: false,
      type: "memory",
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      lastError: errMsg,
      totalRows: memoryMovements.length
    };
  }
}
async function getDbStatus() {
  const p = await getPool();
  if (!p) {
    return {
      connected: false,
      type: "memory",
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      totalRows: memoryMovements.length,
      lastError: lastConnectionError || (currentConfig.password ? "Nelze nav\xE1zat spojen\xED se serverem MariaDB" : "Chyb\xED heslo k MariaDB datab\xE1zi")
    };
  }
  try {
    const startTime = Date.now();
    const [rows] = await p.query("SELECT VERSION() as version");
    const latency = Date.now() - startTime;
    const [countRows] = await p.query("SELECT COUNT(*) as count FROM warehouse_movements");
    lastConnectionError = null;
    return {
      connected: true,
      type: "mariadb",
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      latencyMs: latency,
      version: rows[0]?.version,
      totalRows: Number(countRows[0]?.count || 0)
    };
  } catch (err) {
    lastConnectionError = err?.message || "Chyba komunikace s MariaDB";
    return {
      connected: false,
      type: "memory",
      host: currentConfig.host,
      database: currentConfig.database,
      user: currentConfig.user,
      totalRows: memoryMovements.length,
      lastError: lastConnectionError || void 0
    };
  }
}
function safeDate(val) {
  if (!val) return /* @__PURE__ */ new Date();
  const d = new Date(val);
  return isNaN(d.getTime()) ? /* @__PURE__ */ new Date() : d;
}
async function syncPendingMovementsToMariaDb(p) {
  if (memoryMovements.length === 0) return;
  try {
    const [countRows] = await p.query("SELECT COUNT(*) as count FROM warehouse_movements");
    const totalInDb = Number(countRows[0]?.count || 0);
    if (totalInDb === 0 && memoryMovements.length > 0) {
      console.log(`\u{1F504} Synchronizuji ${memoryMovements.length} existuj\xEDc\xEDch z\xE1znam\u016F do pr\xE1zdn\xE9 MariaDB tabulky...`);
      await insertMovementsDirect(p, memoryMovements);
      console.log(`\u2705 ${memoryMovements.length} z\xE1znam\u016F \xFAsp\u011B\u0161n\u011B ulo\u017Eeno do MariaDB.`);
    }
  } catch (e) {
    console.warn("Sync to MariaDB failed:", e);
  }
}
async function insertMovementsDirect(p, records) {
  await initMariaDbSchema(p);
  const insertSql = `
    INSERT INTO warehouse_movements (
      box_id, sberny_box, obsah_objednavek, pocet_produktu, ean_produktu, pocet_ks,
      zacatek_pickovani, konec_pickovani, zacatek_baleni, konec_baleni,
      pick_duration_s, pack_duration_s, pick_per_item_s, pack_per_item_s, bracket,
      packer, sec_per_scan, wait_pick_to_pack_min
    ) VALUES ?
  `;
  const values = records.map((r) => [
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
    r.bracket || "1",
    r.packer || null,
    r.sec_per_scan !== void 0 ? r.sec_per_scan : null,
    r.wait_pick_to_pack_min !== void 0 ? r.wait_pick_to_pack_min : null
  ]);
  const chunkSize = 500;
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    await p.query(insertSql, [chunk]);
  }
}
async function insertMovements(records) {
  if (records.length === 0) return { count: 0, destination: "memory" };
  const p = await getPool();
  if (p) {
    try {
      await insertMovementsDirect(p, records);
      memoryMovements = [...records, ...memoryMovements];
      saveMovementsToDisk();
      return { count: records.length, destination: "mariadb" };
    } catch (err) {
      console.error("\u274C Chyba p\u0159i vkl\xE1d\xE1n\xED do MariaDB, ukl\xE1d\xE1m do lok\xE1ln\xEDho perzistentn\xEDho \xFAlo\u017Ei\u0161t\u011B:", err?.message || err);
      lastConnectionError = err?.message || "Chyba z\xE1pisu do MariaDB";
    }
  }
  memoryMovements = [...records, ...memoryMovements];
  saveMovementsToDisk();
  return { count: records.length, destination: "memory" };
}
async function getMovements(params) {
  const p = await getPool();
  if (p) {
    try {
      let conditions = [];
      let queryParams = [];
      if (params.dateFrom) {
        conditions.push("zacatek_pickovani >= ?");
        queryParams.push(`${params.dateFrom} 00:00:00`);
      }
      if (params.dateTo) {
        conditions.push("konec_baleni <= ?");
        queryParams.push(`${params.dateTo} 23:59:59`);
      }
      if (params.bracket && params.bracket !== "all") {
        conditions.push("bracket = ?");
        queryParams.push(params.bracket);
      }
      if (params.box) {
        conditions.push("sberny_box LIKE ?");
        queryParams.push(`%${params.box}%`);
      }
      if (params.query) {
        conditions.push("(obsah_objednavek LIKE ? OR ean_produktu LIKE ? OR sberny_box LIKE ?)");
        const q = `%${params.query}%`;
        queryParams.push(q, q, q);
      }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const [countResult] = await p.query(
        `SELECT COUNT(*) as total FROM warehouse_movements ${whereClause}`,
        queryParams
      );
      const total2 = Number(countResult[0]?.total || 0);
      const limit2 = params.limit !== void 0 && params.limit > 0 ? params.limit : 5e5;
      const offset2 = params.offset || 0;
      const [rows] = await p.query(
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
        [...queryParams, limit2, offset2]
      );
      return {
        records: rows,
        total: total2,
        source: "mariadb"
      };
    } catch (err) {
      console.error("Error querying MariaDB, falling back to persistent disk store:", err?.message || err);
      lastConnectionError = err?.message || "Chyba dotazu do MariaDB";
    }
  }
  let filtered = [...memoryMovements];
  if (params.dateFrom) {
    const fromTime = (/* @__PURE__ */ new Date(`${params.dateFrom}T00:00:00`)).getTime();
    filtered = filtered.filter((r) => new Date(r.zacatek_pickovani).getTime() >= fromTime);
  }
  if (params.dateTo) {
    const toTime = (/* @__PURE__ */ new Date(`${params.dateTo}T23:59:59`)).getTime();
    filtered = filtered.filter((r) => new Date(r.konec_baleni).getTime() <= toTime);
  }
  if (params.bracket && params.bracket !== "all") {
    filtered = filtered.filter((r) => r.bracket === params.bracket);
  }
  if (params.box) {
    filtered = filtered.filter((r) => r.sberny_box.toLowerCase().includes(params.box.toLowerCase()));
  }
  if (params.query) {
    const q = params.query.toLowerCase();
    filtered = filtered.filter(
      (r) => r.obsah_objednavek.toLowerCase().includes(q) || r.ean_produktu.toLowerCase().includes(q) || r.sberny_box.toLowerCase().includes(q)
    );
  }
  const total = filtered.length;
  const offset = params.offset || 0;
  const limit = params.limit !== void 0 && params.limit > 0 ? params.limit : total;
  const paged = filtered.slice(offset, offset + limit);
  return {
    records: paged,
    total,
    source: "memory"
  };
}
async function clearMovements() {
  memoryMovements = [];
  saveMovementsToDisk();
  const p = await getPool();
  if (p) {
    try {
      await p.query("TRUNCATE TABLE warehouse_movements");
    } catch {
    }
  }
}

// src/server/sampleData.ts
function generateSampleWarehouseData(daysBack = 14, totalRecords = 420) {
  const records = [];
  const now = /* @__PURE__ */ new Date();
  const sampleEans = [
    "PND01079",
    "WMS0000615",
    "PND02241",
    "WMS0001842",
    "PND03310",
    "WMS0002190",
    "PND04455",
    "WMS0003011",
    "PND05599",
    "WMS0004120",
    "PND06712",
    "WMS0005510",
    "8594001230012",
    "8594001230029",
    "8594001230036",
    "8594001230043"
  ];
  const boxCodes = [
    "L1Z2-TR-0252",
    "L1Z3-TR-0001",
    "L1Z1-TR-0118",
    "L2Z4-TR-0305",
    "L1Z2-TR-0412",
    "L2Z1-TR-0089",
    "L3Z2-TR-0155",
    "L1Z4-TR-0210"
  ];
  const packers = ["P028", "P017", "P034", "P009", "P042", "P015"];
  let orderSequence = 8385399;
  let boxIdSequence = 150020;
  for (let i = 0; i < totalRecords; i++) {
    const dayOffset = Math.floor(Math.random() * daysBack);
    const date = new Date(now.getTime() - dayOffset * 24 * 3600 * 1e3);
    const hour = 7 + Math.floor(Math.random() * 10);
    const minute = Math.floor(Math.random() * 60);
    const second = Math.floor(Math.random() * 60);
    date.setHours(hour, minute, second, 0);
    const roll = Math.random();
    let itemCount;
    let bracket;
    if (roll < 0.34) {
      itemCount = 1;
      bracket = "1";
    } else if (roll < 0.58) {
      itemCount = 2;
      bracket = "2";
    } else if (roll < 0.73) {
      itemCount = 3;
      bracket = "3";
    } else if (roll < 0.84) {
      itemCount = 4;
      bracket = "4";
    } else if (roll < 0.92) {
      itemCount = 5;
      bracket = "5";
    } else {
      itemCount = 6 + Math.floor(Math.random() * 6);
      bracket = "6+";
    }
    const ordersPerBox = 6;
    const boxIndex = Math.floor(i / ordersPerBox);
    const currentBoxId = boxIdSequence + boxIndex;
    const randomBoxCode = boxCodes[boxIndex % boxCodes.length];
    const boxTier = boxIndex % 3;
    const isHighMultipickBox = boxTier === 0;
    const isMediumMultipickBox = boxTier === 1;
    const isLowMultipickBox = boxTier === 2;
    let randomEan;
    if (isHighMultipickBox) {
      const coreEan = sampleEans[boxIndex % sampleEans.length];
      randomEan = Math.random() < 0.85 ? coreEan : sampleEans[(boxIndex + 1) % sampleEans.length];
    } else if (isMediumMultipickBox) {
      const coreEan = sampleEans[boxIndex * 2 % sampleEans.length];
      randomEan = Math.random() < 0.5 ? coreEan : sampleEans[(boxIndex * 2 + 1) % sampleEans.length];
    } else {
      randomEan = sampleEans[(i * 3 + i % 7) % sampleEans.length];
    }
    let basePickWalkSec;
    let pickTimePerUnitSec;
    if (isHighMultipickBox) {
      basePickWalkSec = 7 + Math.random() * 6;
      pickTimePerUnitSec = 6 + Math.random() * 4;
    } else if (isMediumMultipickBox) {
      basePickWalkSec = 14 + Math.random() * 8;
      pickTimePerUnitSec = 9 + Math.random() * 5;
    } else {
      basePickWalkSec = 24 + Math.random() * 14;
      pickTimePerUnitSec = 13 + Math.random() * 7;
    }
    const rawPickDuration = basePickWalkSec + itemCount * pickTimePerUnitSec;
    const pickDurationSec = Math.max(8, Math.round(rawPickDuration * (Math.random() < 0.04 ? 1.2 : 1)));
    let basePackSetupSec;
    let secPerScan;
    if (isHighMultipickBox) {
      basePackSetupSec = 8 + Math.random() * 5;
      secPerScan = 5 + Math.random() * 2.5;
    } else if (isMediumMultipickBox) {
      basePackSetupSec = 14 + Math.random() * 7;
      secPerScan = 7 + Math.random() * 3;
    } else {
      basePackSetupSec = 22 + Math.random() * 12;
      secPerScan = 9 + Math.random() * 4;
    }
    const rawPackDuration = basePackSetupSec + itemCount * secPerScan;
    const packDurationSec = Math.max(6, Math.round(rawPackDuration));
    const pickStartTime = new Date(date);
    const pickEndTime = new Date(pickStartTime.getTime() + pickDurationSec * 1e3);
    const waitPickToPackMin = Number((60 + Math.random() * 120).toFixed(2));
    const packStartTime = new Date(pickEndTime.getTime() + waitPickToPackMin * 60 * 1e3);
    const packEndTime = new Date(packStartTime.getTime() + packDurationSec * 1e3);
    const pickPerItem = Number((pickDurationSec / itemCount).toFixed(2));
    const packPerItem = Number((packDurationSec / itemCount).toFixed(2));
    const totalPerItem = Number(((pickDurationSec + packDurationSec) / itemCount).toFixed(2));
    const orderId = String(orderSequence++);
    const randomPacker = packers[Math.floor(Math.random() * packers.length)];
    records.push({
      id: i + 1,
      box_id: currentBoxId,
      sberny_box: randomBoxCode,
      obsah_objednavek: orderId,
      pocet_produktu: itemCount,
      ean_produktu: itemCount > 1 ? `${randomEan} (+${itemCount - 1})` : randomEan,
      pocet_ks: itemCount,
      zacatek_pickovani: pickStartTime.toISOString(),
      konec_pickovani: pickEndTime.toISOString(),
      zacatek_baleni: packStartTime.toISOString(),
      konec_baleni: packEndTime.toISOString(),
      pick_duration_s: pickDurationSec,
      pack_duration_s: packDurationSec,
      pick_per_item_s: pickPerItem,
      pack_per_item_s: packPerItem,
      total_per_item_s: totalPerItem,
      bracket,
      packer: randomPacker,
      sec_per_scan: secPerScan,
      wait_pick_to_pack_min: waitPickToPackMin,
      box_unique_eans: isHighMultipickBox ? 3 : isMediumMultipickBox ? 6 : 14,
      box_total_units: isHighMultipickBox ? 48 : isMediumMultipickBox ? 36 : 24,
      box_shared_skus_count: isHighMultipickBox ? 5 : isMediumMultipickBox ? 2 : 0,
      created_at: pickStartTime.toISOString()
    });
  }
  records.sort((a, b) => new Date(b.zacatek_pickovani).getTime() - new Date(a.zacatek_pickovani).getTime());
  return records;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path2.dirname(__filename);
dotenv2.config();
dotenv2.config({ path: path2.resolve(process.cwd(), ".env") });
dotenv2.config({ path: path2.resolve(__dirname, ".env") });
dotenv2.config({ path: path2.resolve(__dirname, "..", ".env") });
process.on("uncaughtException", (err) => {
  console.error("\u274C [NEZACHYCEN\xC1 CHYBA SERVERU]:", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("\u274C [NEZACHYCEN\xDD PROMISE REJECTION]:", reason?.message || reason);
});
var app = express();
var PORT = Number(process.env.PORT || process.env.APP_PORT || process.env.API_PORT) || 3e3;
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
(async () => {
  try {
    const status = await getDbStatus();
    if (status.connected && status.type === "mariadb") {
      console.log(`\u2705 \xDAsp\u011B\u0161n\u011B p\u0159ipojeno k MariaDB: ${status.user}@${status.host}/${status.database} (\u0159\xE1dk\u016F: ${status.totalRows})`);
    } else {
      console.log(`\u2139\uFE0F Aplikace b\u011B\u017E\xED v lok\xE1ln\xEDm re\u017Eimu (pam\u011B\u0165). Pro p\u0159ipojen\xED MariaDB nastavte DB_HOST, DB_USER, DB_PASSWORD, DB_NAME v .env.`);
    }
    if (process.env.NODE_ENV !== "production" && !process.env.DB_HOST && !process.env.MARIADB_HOST && status.totalRows === 0) {
      console.log("Generuji uk\xE1zkov\xE1 data skladu pro v\xFDvojov\xE9 prost\u0159ed\xED...");
      const samples = generateSampleWarehouseData(14, 380);
      await insertMovements(samples);
    }
  } catch (err) {
    console.error("Chyba p\u0159i inicializaci DB:", err?.message || err);
  }
})();
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "eusfhb" && password === "Master353") {
    return res.json({
      success: true,
      user: { username: "eusfhb" },
      token: "authenticated_eusfhb_353"
    });
  }
  return res.status(401).json({
    success: false,
    error: "Neplatn\xE9 p\u0159ihla\u0161ovac\xED \xFAdaje / Invalid credentials"
  });
});
app.get("/api/db/config", (req, res) => {
  res.json(getDbConfig());
});
app.get("/api/db/status", async (req, res) => {
  const status = await getDbStatus();
  res.json(status);
});
app.post("/api/db/test", async (req, res) => {
  const { host, port, user, password, database, ssl } = req.body;
  const status = await setDbConfig({
    host,
    port: Number(port) || 3306,
    user,
    password,
    database,
    ssl: Boolean(ssl)
  });
  res.json(status);
});
app.post("/api/db/save", async (req, res) => {
  const { host, port, user, password, database, ssl } = req.body;
  const status = await setDbConfig({
    host,
    port: Number(port) || 3306,
    user,
    password,
    database,
    ssl: Boolean(ssl)
  });
  res.json({ success: true, status });
});
app.get("/api/movements", async (req, res) => {
  try {
    const { dateFrom, dateTo, bracket, box, query, limit, offset } = req.query;
    const result = await getMovements({
      dateFrom,
      dateTo,
      bracket,
      box,
      query,
      limit: limit ? Number(limit) : 5e5,
      offset: offset ? Number(offset) : 0
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err?.message || "Chyba p\u0159i na\u010D\xEDt\xE1n\xED dat" });
  }
});
app.post("/api/movements/import", async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "Nebyly poskytnuty \u017E\xE1dn\xE9 z\xE1znamy k importu." });
    }
    const result = await insertMovements(records);
    res.json({
      success: true,
      importedCount: result.count,
      destination: result.destination,
      message: `\xDAsp\u011B\u0161n\u011B importov\xE1no ${result.count} z\xE1znam\u016F (${result.destination === "mariadb" ? "MariaDB datab\xE1ze" : "lok\xE1ln\xED pam\u011B\u0165"}).`
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Chyba p\u0159i ukl\xE1d\xE1n\xED z\xE1znam\u016F" });
  }
});
app.post("/api/movements/seed-sample", async (req, res) => {
  try {
    const count = Number(req.body.count) || 400;
    const days = Number(req.body.days) || 14;
    await clearMovements();
    const records = generateSampleWarehouseData(days, count);
    const result = await insertMovements(records);
    res.json({
      success: true,
      importedCount: result.count,
      message: `Vygenerov\xE1no a vlo\u017Eeno ${result.count} uk\xE1zkov\xFDch z\xE1znam\u016F za ${days} dn\xED.`
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Chyba p\u0159i generov\xE1n\xED vzorov\xFDch dat" });
  }
});
app.delete("/api/movements", async (req, res) => {
  try {
    await clearMovements();
    res.json({ success: true, message: "V\u0161echna data o pohybech byla promaz\xE1na." });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Chyba p\u0159i maz\xE1n\xED dat" });
  }
});
app.use("/api", (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.method} ${req.originalUrl}' nenalezen.` });
});
app.use("/api", (err, req, res, next) => {
  console.error("API Error:", err);
  res.status(err.status || 500).json({ error: err?.message || "Intern\xED chyba serveru" });
});
var isProduction = process.env.NODE_ENV === "production";
if (!isProduction) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa"
  });
  app.use(vite.middlewares);
} else {
  const distDir = path2.resolve(__dirname, "dist");
  const indexHtml = path2.resolve(distDir, "index.html");
  try {
    const fs3 = await import("fs");
    if (fs3.existsSync(indexHtml)) {
      app.use(express.static(distDir));
      app.get("*", (req, res) => {
        res.sendFile(indexHtml);
      });
    } else {
      app.get("/", (req, res) => {
        res.json({
          status: "ok",
          service: "Warehouse Pick & Pack Analytics Backend API",
          version: "1.0.0"
        });
      });
    }
  } catch {
    app.get("/", (req, res) => {
      res.json({ status: "ok", service: "Warehouse Analytics API" });
    });
  }
}
var sslKeyPath = process.env.SSL_KEY_PATH;
var sslCertPath = process.env.SSL_CERT_PATH || process.env.SSL_CRT_PATH;
var sslCaPath = process.env.SSL_CA_PATH || process.env.SSL_CHAIN_PATH;
var server;
var isHttps = false;
if (sslKeyPath && sslCertPath) {
  try {
    let resolvedCertPath = sslCertPath;
    const crtCandidate = sslCertPath.replace(/\.csr$/, ".crt");
    const pemCandidate = sslCertPath.replace(/\.csr$/, ".pem");
    if (!fs2.existsSync(resolvedCertPath)) {
      if (fs2.existsSync(crtCandidate)) {
        console.log(`\u2139\uFE0F Cesta ${sslCertPath} neexistuje, pou\u017E\xEDv\xE1m nalezen\xFD certifik\xE1t: ${crtCandidate}`);
        resolvedCertPath = crtCandidate;
      } else if (fs2.existsSync(pemCandidate)) {
        console.log(`\u2139\uFE0F Cesta ${sslCertPath} neexistuje, pou\u017E\xEDv\xE1m nalezen\xFD certifik\xE1t: ${pemCandidate}`);
        resolvedCertPath = pemCandidate;
      }
    }
    if (fs2.existsSync(sslKeyPath) && fs2.existsSync(resolvedCertPath)) {
      const keyContent = fs2.readFileSync(sslKeyPath);
      let certContent = fs2.readFileSync(resolvedCertPath);
      const certStr = certContent.toString("utf8");
      if (certStr.includes("CERTIFICATE REQUEST") && !certStr.includes("BEGIN CERTIFICATE")) {
        console.warn(`\u26A0\uFE0F POZOR: Soubor ${resolvedCertPath} je \u017E\xE1dost (CSR), nikoliv certifik\xE1t!`);
        if (fs2.existsSync(crtCandidate)) {
          console.log(`\u2705 Nalezen skute\u010Dn\xFD certifik\xE1t: ${crtCandidate}`);
          resolvedCertPath = crtCandidate;
          certContent = fs2.readFileSync(crtCandidate);
        } else if (fs2.existsSync(pemCandidate)) {
          console.log(`\u2705 Nalezen skute\u010Dn\xFD certifik\xE1t: ${pemCandidate}`);
          resolvedCertPath = pemCandidate;
          certContent = fs2.readFileSync(pemCandidate);
        } else {
          throw new Error(`Soubor ${resolvedCertPath} je pouze \u017E\xE1dost (.csr). V .env nastavte cestu ke skute\u010Dn\xE9mu certifik\xE1tu (.crt nebo .pem)!`);
        }
      }
      const httpsOptions = {
        key: keyContent,
        cert: certContent
      };
      if (sslCaPath && fs2.existsSync(sslCaPath)) {
        httpsOptions.ca = fs2.readFileSync(sslCaPath);
      }
      tls.createSecureContext({
        key: keyContent,
        cert: certContent,
        ca: httpsOptions.ca
      });
      server = https.createServer(httpsOptions, app);
      isHttps = true;
      console.log(`\u{1F512} SSL certifik\xE1ty aktivov\xE1ny:
   KEY:  ${sslKeyPath}
   CERT: ${resolvedCertPath}`);
    } else {
      console.warn(`\u26A0\uFE0F SSL soubory nenalezeny:
   KEY (${sslKeyPath}): ${fs2.existsSync(sslKeyPath) ? "nalezen" : "NENALEZEN"}
   CERT (${resolvedCertPath}): ${fs2.existsSync(resolvedCertPath) ? "nalezen" : "NENALEZEN"}
   \u{1F449} Spou\u0161t\xEDm server v HTTP re\u017Eimu na portu ${PORT}.`);
      server = http.createServer(app);
    }
  } catch (sslErr) {
    console.error(`\u26A0\uFE0F Chyba p\u0159i inicializaci SSL certifik\xE1t\u016F: ${sslErr?.message || sslErr}`);
    console.log(`\u{1F449} Spou\u0161t\xEDm server v HTTP re\u017Eimu na portu ${PORT}, aby byla aplikace dostupn\xE1.`);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}
server.listen(PORT, "0.0.0.0", () => {
  const protocol = isHttps ? "https" : "http";
  console.log(`\u{1F680} Warehouse Pick & Pack Analytics server \xFAsp\u011B\u0161n\u011B b\u011B\u017E\xED na ${protocol}://0.0.0.0:${PORT}`);
});
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`
\u274C CHYBA PORTU: Port ${PORT} je ji\u017E obsazen jin\xFDm procesem (nap\u0159. lok\xE1ln\xEDm MySQL/MariaDB serverem nebo jinou aplikac\xED)!`);
    console.error(`\u{1F449} \u0158e\u0161en\xED pro produkci v souboru .env:`);
    console.error(`   PORT=3000          (port webov\xE9 aplikace pro Nginx proxy_pass)`);
    console.error(`   DB_PORT=3306       (port vzd\xE1len\xE9 MariaDB/MySQL datab\xE1ze)`);
    console.error(`   DB_HOST=db.mobilgroup.cz
`);
  } else {
    console.error("Chyba serveru p\u0159i spu\u0161t\u011Bn\xED:", err);
  }
});
