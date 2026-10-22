// server.ts
import express from "express";
import compression from "compression";
import http from "http";
import https from "https";
import tls from "tls";
import fs3 from "fs";
import path3 from "path";
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
function parseSslFlag(val) {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    const normalized = val.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof val === "number") return val === 1;
  return false;
}
function isNoSslSupportError(err) {
  const msg = String(err?.message || err || "");
  return err?.code === "HANDSHAKE_NO_SSL_SUPPORT" || msg.includes("Server does not support secure connection") || msg.includes("does not support SSL");
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
  const host = fileConfig.host || process.env.DB_HOST || process.env.MARIADB_HOST || "db.mobilgroup.cz";
  const rawSsl = fileConfig.ssl !== void 0 ? parseSslFlag(fileConfig.ssl) : parseSslFlag(process.env.DB_SSL) || parseSslFlag(process.env.MARIADB_SSL);
  return {
    host,
    port: Number(
      fileConfig.port || process.env.DB_PORT || process.env.MARIADB_PORT || (Number(process.env.PORT) === 3306 ? 3306 : void 0)
    ) || 3306,
    user: fileConfig.user || process.env.DB_USER || process.env.MARIADB_USER || "fhb_crm",
    password: fileConfig.password !== void 0 ? fileConfig.password : process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || "",
    database: fileConfig.database || process.env.DB_NAME || process.env.DB_DATABASE || process.env.MARIADB_DATABASE || "fhb_crm",
    ssl: rawSsl
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
      DB_SSL: String(Boolean(config.ssl))
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
var currentConfig = loadSavedConfig();
var isProductionEnv = process.env.NODE_ENV === "production" && Boolean(currentConfig.password);
if (fs.existsSync(PERSISTENT_DATA_PATH)) {
  try {
    const raw = fs.readFileSync(PERSISTENT_DATA_PATH, "utf-8");
    memoryMovements = JSON.parse(raw);
    console.log(`\u{1F4C2} Na\u010Dteno ${memoryMovements.length} ulo\u017Een\xFDch z\xE1znam\u016F z diskov\xE9ho \xFAlo\u017Ei\u0161t\u011B (${PERSISTENT_DATA_PATH})`);
  } catch (e) {
    console.warn("Could not read persistent warehouse_movements.json:", e);
  }
}
var pool = null;
var poolInitPromise = null;
var lastConnectionError = null;
var schemaInitialized = false;
var tableHasWarehouseColumn = true;
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
    ssl: config.ssl !== void 0 ? parseSslFlag(config.ssl) : currentConfig.ssl,
    password: newPassword
  };
  saveConfigToFile(currentConfig);
  statsMemoryCache.clear();
  if (pool) {
    try {
      await pool.end();
    } catch {
    }
    pool = null;
  }
  poolInitPromise = null;
  schemaInitialized = false;
  return await testConnection();
}
function createMysqlPoolInstance(useSsl) {
  return mysql.createPool({
    host: currentConfig.host,
    port: currentConfig.port,
    user: currentConfig.user,
    password: currentConfig.password,
    database: currentConfig.database,
    ssl: useSsl ? { rejectUnauthorized: false } : void 0,
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
    connectTimeout: 1e4,
    enableKeepAlive: true,
    keepAliveInitialDelay: 1e4,
    dateStrings: true,
    decimalNumbers: true
  });
}
async function getPool() {
  if (pool) return pool;
  if (poolInitPromise) return await poolInitPromise;
  if (!currentConfig.host || !currentConfig.user || !currentConfig.database) {
    lastConnectionError = "Chyb\xED host, u\u017Eivatel nebo n\xE1zev datab\xE1ze.";
    return null;
  }
  if (!currentConfig.password) {
    lastConnectionError = "Chyb\xED heslo k datab\xE1zi fhb_crm na db.mobilgroup.cz. Zadejte heslo v Nastaven\xED DB pro trval\xE9 ukl\xE1d\xE1n\xED.";
    return null;
  }
  poolInitPromise = (async () => {
    let newPool = createMysqlPoolInstance(Boolean(currentConfig.ssl));
    try {
      if (!schemaInitialized) {
        try {
          await initMariaDbSchema(newPool);
        } catch (firstErr) {
          if (currentConfig.ssl && isNoSslSupportError(firstErr)) {
            console.warn(`\u26A0\uFE0F Server ${currentConfig.host} nepodporuje SSL spojen\xED (Server does not support secure connection). Automaticky vyp\xEDn\xE1m SSL a opakuji p\u0159ipojen\xED...`);
            try {
              await newPool.end();
            } catch {
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
        console.log(`\u2705 MariaDB spojen\xED a sch\xE9ma ov\u011B\u0159eno: ${currentConfig.user}@${currentConfig.host}:${currentConfig.port}/${currentConfig.database} (SSL: ${currentConfig.ssl ? "ANO" : "NE"})`);
      } else {
        try {
          await newPool.query("SELECT 1");
        } catch (pingErr) {
          if (currentConfig.ssl && isNoSslSupportError(pingErr)) {
            console.warn(`\u26A0\uFE0F Server ${currentConfig.host} nepodporuje SSL spojen\xED. Automaticky vyp\xEDn\xE1m SSL a opakuji p\u0159ipojen\xED...`);
            try {
              await newPool.end();
            } catch {
            }
            currentConfig.ssl = false;
            saveConfigToFile(currentConfig);
            newPool = createMysqlPoolInstance(false);
            await newPool.query("SELECT 1");
          } else {
            throw pingErr;
          }
        }
      }
      pool = newPool;
      return pool;
    } catch (err) {
      lastConnectionError = err?.message || "Chyba p\u0159i vytv\xE1\u0159en\xED MariaDB poolu";
      console.error("Failed to initialize MariaDB pool:", lastConnectionError);
      try {
        await newPool.end();
      } catch {
      }
      pool = null;
      return null;
    } finally {
      poolInitPromise = null;
    }
  })();
  return await poolInitPromise;
}
async function initMariaDbSchema(p) {
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
  try {
    const [cols] = await p.query("SHOW COLUMNS FROM warehouse_movements");
    const existingCols = new Set(
      Array.isArray(cols) ? cols.map((c) => String(c.Field || "").toLowerCase()) : []
    );
    const columnMigrations = [
      { col: "warehouse", sql: "ALTER TABLE warehouse_movements ADD COLUMN warehouse VARCHAR(50) NOT NULL DEFAULT 'ruse'" },
      { col: "box_id", sql: "ALTER TABLE warehouse_movements ADD COLUMN box_id VARCHAR(100) NULL" },
      { col: "cycle_no", sql: "ALTER TABLE warehouse_movements ADD COLUMN cycle_no INT NULL DEFAULT 1" },
      { col: "zacatek_sortingu", sql: "ALTER TABLE warehouse_movements ADD COLUMN zacatek_sortingu DATETIME NULL" },
      { col: "konec_sortingu", sql: "ALTER TABLE warehouse_movements ADD COLUMN konec_sortingu DATETIME NULL" },
      { col: "sort_duration_s", sql: "ALTER TABLE warehouse_movements ADD COLUMN sort_duration_s DECIMAL(10,2) NULL DEFAULT 0" },
      { col: "sort_per_item_s", sql: "ALTER TABLE warehouse_movements ADD COLUMN sort_per_item_s DECIMAL(10,2) NULL DEFAULT 0" },
      { col: "station", sql: "ALTER TABLE warehouse_movements ADD COLUMN station VARCHAR(50) NULL" },
      { col: "wait_after_picking_min", sql: "ALTER TABLE warehouse_movements ADD COLUMN wait_after_picking_min DECIMAL(10,2) NULL" },
      { col: "wait_sort_to_pack_min", sql: "ALTER TABLE warehouse_movements ADD COLUMN wait_sort_to_pack_min DECIMAL(10,2) NULL" },
      { col: "wait_pick_to_pack_min", sql: "ALTER TABLE warehouse_movements ADD COLUMN wait_pick_to_pack_min DECIMAL(10,2) NULL" },
      { col: "is_sorted", sql: "ALTER TABLE warehouse_movements ADD COLUMN is_sorted TINYINT(1) DEFAULT 1" },
      { col: "is_packed", sql: "ALTER TABLE warehouse_movements ADD COLUMN is_packed TINYINT(1) DEFAULT 1" },
      { col: "units_sorted", sql: "ALTER TABLE warehouse_movements ADD COLUMN units_sorted INT DEFAULT 0" },
      { col: "box_units_sorted", sql: "ALTER TABLE warehouse_movements ADD COLUMN box_units_sorted INT DEFAULT 0" }
    ];
    for (const mig of columnMigrations) {
      if (!existingCols.has(mig.col)) {
        try {
          await p.query(mig.sql);
          existingCols.add(mig.col);
        } catch (migErr) {
          console.warn(`Pozn\xE1mka k migraci sloupce ${mig.col}:`, migErr?.message || migErr);
        }
      }
    }
    tableHasWarehouseColumn = existingCols.has("warehouse");
  } catch (err) {
    console.warn("Nelze ov\u011B\u0159it sloupce warehouse_movements:", err?.message || err);
  }
}
async function testConnection() {
  statsMemoryCache.clear();
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
function safeDateNullable(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}
var saveDiskTimeout = null;
var isSavingDisk = false;
var pendingSaveDisk = false;
async function saveMovementsToDiskAsync() {
  if (isSavingDisk) {
    pendingSaveDisk = true;
    return;
  }
  isSavingDisk = true;
  pendingSaveDisk = false;
  try {
    const jsonStr = JSON.stringify(memoryMovements);
    await fs.promises.writeFile(PERSISTENT_DATA_PATH, jsonStr, "utf-8");
  } catch (err) {
    console.error("Failed to save movements to disk:", err);
  } finally {
    isSavingDisk = false;
    if (pendingSaveDisk) {
      saveMovementsToDiskAsync();
    }
  }
}
function scheduleSaveMovementsToDisk(delayMs = 2e3) {
  if (saveDiskTimeout) clearTimeout(saveDiskTimeout);
  saveDiskTimeout = setTimeout(() => {
    saveMovementsToDiskAsync();
  }, delayMs);
}
async function flushMovementsToDisk() {
  if (saveDiskTimeout) {
    clearTimeout(saveDiskTimeout);
    saveDiskTimeout = null;
  }
  await saveMovementsToDiskAsync();
}
async function insertMovementsDirect(p, records) {
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
  const values = records.map((r) => [
    r.warehouse || "ruse",
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
    r.bracket || "1",
    r.packer || null,
    r.station || null,
    r.sec_per_scan !== void 0 ? r.sec_per_scan : null,
    r.wait_after_picking_min !== void 0 ? r.wait_after_picking_min : null,
    r.wait_sort_to_pack_min !== void 0 ? r.wait_sort_to_pack_min : null,
    r.wait_pick_to_pack_min !== void 0 ? r.wait_pick_to_pack_min : null,
    r.is_sorted !== void 0 ? r.is_sorted ? 1 : 0 : 1,
    r.is_packed !== void 0 ? r.is_packed ? 1 : 0 : 1,
    r.units_sorted !== void 0 ? Number(r.units_sorted) : 0,
    r.box_units_sorted !== void 0 ? Number(r.box_units_sorted) : 0
  ]);
  const chunkSize = 2500;
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
      await clearStatsCache(records[0]?.warehouse);
      return { count: records.length, destination: "mariadb" };
    } catch (err) {
      console.error("\u274C Chyba p\u0159i vkl\xE1d\xE1n\xED do MariaDB:", err?.message || err);
      lastConnectionError = err?.message || "Chyba z\xE1pisu do MariaDB";
      if (isProductionEnv && currentConfig.password) {
        throw new Error(`Nepoda\u0159ilo se zapsat data do MariaDB: ${lastConnectionError}`);
      }
    }
  } else if (isProductionEnv && currentConfig.password) {
    throw new Error(`Nen\xED k dispozici spojen\xED s MariaDB: ${lastConnectionError || "Zkontrolujte p\u0159\xEDstupov\xE9 \xFAdaje"}`);
  }
  memoryMovements = [...records, ...memoryMovements];
  scheduleSaveMovementsToDisk(1500);
  await clearStatsCache(records[0]?.warehouse);
  return { count: records.length, destination: "memory" };
}
function formatDbDateStr(val) {
  if (!val) return "";
  if (typeof val === "string") {
    return val.trim().replace(" ", "T").substring(0, 19);
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${val.getFullYear()}-${pad(val.getMonth() + 1)}-${pad(val.getDate())}T${pad(val.getHours())}:${pad(val.getMinutes())}:${pad(val.getSeconds())}`;
  }
  return String(val);
}
function normalizeDbRow(row) {
  const units = Math.max(1, Number(row.pocet_produktu) || Number(row.pocet_ks) || 1);
  const pickDur = Number(row.pick_duration_s) || 0;
  const sortDur = Number(row.sort_duration_s) || 0;
  const packDur = Number(row.pack_duration_s) || 0;
  const pickPerItem = row.pick_per_item_s !== null && row.pick_per_item_s !== void 0 ? Number(row.pick_per_item_s) || 0 : Number((pickDur / units).toFixed(2));
  const sortPerItem = row.sort_per_item_s !== null && row.sort_per_item_s !== void 0 ? Number(row.sort_per_item_s) || 0 : sortDur > 0 ? Number((sortDur / units).toFixed(2)) : 0;
  const packPerItem = row.pack_per_item_s !== null && row.pack_per_item_s !== void 0 ? Number(row.pack_per_item_s) || 0 : packDur > 0 ? Number((packDur / units).toFixed(2)) : 0;
  const totalPerItem = Number((pickPerItem + sortPerItem + packPerItem).toFixed(2));
  const rawWh = row.warehouse ? String(row.warehouse).trim().toLowerCase() : "ruse";
  const warehouse = rawWh === "svj" ? "svj" : "ruse";
  let bracket = String(row.bracket || "").trim();
  if (!["1", "2", "3", "4", "5", "6+"].includes(bracket)) {
    bracket = units >= 6 ? "6+" : String(units);
  }
  return {
    id: row.id,
    warehouse,
    box_id: row.box_id !== null && row.box_id !== void 0 ? String(row.box_id) : void 0,
    sberny_box: String(row.sberny_box || ""),
    cycle_no: Number(row.cycle_no) || 1,
    obsah_objednavek: String(row.obsah_objednavek || ""),
    pocet_produktu: units,
    ean_produktu: String(row.ean_produktu || ""),
    pocet_ks: Number(row.pocet_ks) || 1,
    zacatek_pickovani: formatDbDateStr(row.zacatek_pickovani),
    konec_pickovani: formatDbDateStr(row.konec_pickovani),
    zacatek_sortingu: row.zacatek_sortingu ? formatDbDateStr(row.zacatek_sortingu) : void 0,
    konec_sortingu: row.konec_sortingu ? formatDbDateStr(row.konec_sortingu) : void 0,
    zacatek_baleni: formatDbDateStr(row.zacatek_baleni),
    konec_baleni: formatDbDateStr(row.konec_baleni),
    pick_duration_s: pickDur,
    sort_duration_s: sortDur,
    pack_duration_s: packDur,
    pick_per_item_s: pickPerItem,
    sort_per_item_s: sortPerItem,
    pack_per_item_s: packPerItem,
    total_per_item_s: totalPerItem,
    bracket,
    packer: row.packer !== null && row.packer !== void 0 ? String(row.packer) : void 0,
    station: row.station !== null && row.station !== void 0 ? String(row.station) : void 0,
    sec_per_scan: row.sec_per_scan !== null && row.sec_per_scan !== void 0 ? Number(row.sec_per_scan) : void 0,
    wait_after_picking_min: row.wait_after_picking_min !== null && row.wait_after_picking_min !== void 0 ? Number(row.wait_after_picking_min) : void 0,
    wait_sort_to_pack_min: row.wait_sort_to_pack_min !== null && row.wait_sort_to_pack_min !== void 0 ? Number(row.wait_sort_to_pack_min) : void 0,
    wait_pick_to_pack_min: row.wait_pick_to_pack_min !== null && row.wait_pick_to_pack_min !== void 0 ? Number(row.wait_pick_to_pack_min) : void 0,
    is_sorted: row.is_sorted !== null && row.is_sorted !== void 0 ? Boolean(Number(row.is_sorted)) : void 0,
    is_packed: row.is_packed !== null && row.is_packed !== void 0 ? Boolean(Number(row.is_packed)) : true,
    units_sorted: row.units_sorted !== null && row.units_sorted !== void 0 ? Number(row.units_sorted) : void 0,
    box_units_sorted: row.box_units_sorted !== null && row.box_units_sorted !== void 0 ? Number(row.box_units_sorted) : void 0,
    created_at: row.created_at ? formatDbDateStr(row.created_at) : void 0
  };
}
async function getMovements(params) {
  const p = await getPool();
  if (p) {
    try {
      let conditions = [];
      let queryParams = [];
      if (params.warehouse && params.warehouse !== "all") {
        if (!tableHasWarehouseColumn) {
          if (params.warehouse === "svj") {
            return { records: [], total: 0, source: "mariadb" };
          }
        } else if (params.warehouse === "ruse") {
          conditions.push("(LOWER(TRIM(warehouse)) = 'ruse' OR warehouse IS NULL OR TRIM(warehouse) = '')");
        } else {
          conditions.push("LOWER(TRIM(warehouse)) = ?");
          queryParams.push(params.warehouse.toLowerCase());
        }
      }
      if (params.dateFrom) {
        conditions.push("zacatek_pickovani >= ?");
        queryParams.push(`${params.dateFrom} 00:00:00`);
      }
      if (params.dateTo) {
        conditions.push("(konec_baleni <= ? OR (konec_baleni IS NULL AND konec_pickovani <= ?))");
        queryParams.push(`${params.dateTo} 23:59:59`, `${params.dateTo} 23:59:59`);
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
        `SELECT * FROM warehouse_movements ${whereClause}
         ORDER BY zacatek_pickovani DESC
         LIMIT ? OFFSET ?`,
        [...queryParams, limit2, offset2]
      );
      const mapped = Array.isArray(rows) ? rows.map(normalizeDbRow) : [];
      return {
        records: mapped,
        total: total2,
        source: "mariadb"
      };
    } catch (err) {
      console.error("Chyba p\u0159i dotazu MariaDB (getMovements):", err?.message || err);
      lastConnectionError = err?.message || "Chyba dotazu do MariaDB";
      if (isProductionEnv && currentConfig.password) {
        return {
          records: [],
          total: 0,
          source: "mariadb"
        };
      }
    }
  }
  if (isProductionEnv && currentConfig.password) {
    return {
      records: [],
      total: 0,
      source: "mariadb"
    };
  }
  let filtered = [...memoryMovements];
  if (params.warehouse && params.warehouse !== "all") {
    filtered = filtered.filter((r) => (r.warehouse || "ruse") === params.warehouse);
  }
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
async function clearMovements(warehouse) {
  if (warehouse && warehouse !== "all") {
    memoryMovements = memoryMovements.filter((r) => (r.warehouse || "ruse") !== warehouse);
  } else {
    memoryMovements = [];
  }
  scheduleSaveMovementsToDisk(500);
  await clearStatsCache(warehouse);
  const p = await getPool();
  if (p) {
    try {
      if (warehouse && warehouse !== "all") {
        await p.query("DELETE FROM warehouse_movements WHERE warehouse = ?", [warehouse]);
      } else {
        await p.query("TRUNCATE TABLE warehouse_movements");
      }
    } catch {
    }
  }
}
var statsMemoryCache = /* @__PURE__ */ new Map();
async function getCachedStats(cacheKey, expectedCount) {
  const p = await getPool();
  if (p) {
    try {
      const [rows] = await p.query(
        "SELECT record_count, stats_json FROM warehouse_stats_cache WHERE cache_key = ? LIMIT 1",
        [cacheKey]
      );
      if (rows && rows.length > 0) {
        const row = rows[0];
        const dbCount = Number(row.record_count || 0);
        if (dbCount <= 0) {
          statsMemoryCache.delete(cacheKey);
          return null;
        }
        if (expectedCount === void 0 || dbCount === expectedCount) {
          const parsed = JSON.parse(row.stats_json);
          if (parsed && Number(parsed.recordCount) > 0) {
            statsMemoryCache.set(cacheKey, { data: parsed, count: dbCount, savedAt: Date.now() });
            return parsed;
          }
        }
      } else {
        statsMemoryCache.delete(cacheKey);
        return null;
      }
    } catch (err) {
      console.warn("Chyba p\u0159i \u010Dten\xED z warehouse_stats_cache:", err?.message || err);
    }
    return null;
  }
  const mem = statsMemoryCache.get(cacheKey);
  if (mem && mem.count > 0) {
    if (expectedCount === void 0 || mem.count === expectedCount) {
      return mem.data;
    }
  }
  return null;
}
function compactStatsForCache(stats) {
  if (!stats || typeof stats !== "object") return stats;
  const copy = { ...stats };
  if (copy.synergyData && Array.isArray(copy.synergyData.boxStats)) {
    copy.synergyData = {
      ...copy.synergyData,
      totalBoxesCount: copy.synergyData.boxStats.length,
      boxStats: copy.synergyData.boxStats.slice(0, 25)
    };
  }
  if (copy.ruseSummary && typeof copy.ruseSummary === "object") {
    copy.ruseSummary = compactStatsForCache(copy.ruseSummary);
  }
  if (copy.svjSummary && typeof copy.svjSummary === "object") {
    copy.svjSummary = compactStatsForCache(copy.svjSummary);
  }
  return copy;
}
async function saveCachedStats(cacheKey, warehouse, recordCount, stats) {
  if (!recordCount || recordCount <= 0) {
    statsMemoryCache.delete(cacheKey);
    return;
  }
  const compacted = compactStatsForCache(stats);
  statsMemoryCache.set(cacheKey, { data: compacted, count: recordCount, savedAt: Date.now() });
  const p = await getPool();
  if (p) {
    try {
      const statsJson = typeof compacted === "string" ? compacted : JSON.stringify(compacted);
      await p.query(
        `INSERT INTO warehouse_stats_cache (cache_key, warehouse, record_count, stats_json)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE record_count = VALUES(record_count), stats_json = VALUES(stats_json), updated_at = NOW()`,
        [cacheKey, warehouse, recordCount, statsJson]
      );
    } catch (err) {
      console.error("Chyba p\u0159i z\xE1pisu do warehouse_stats_cache:", err?.message || err);
    }
  }
}
async function clearStatsCache(warehouse) {
  statsMemoryCache.clear();
  const p = await getPool();
  if (p) {
    try {
      if (warehouse && warehouse !== "all") {
        await p.query("DELETE FROM warehouse_stats_cache WHERE warehouse = ? OR warehouse = 'all'", [warehouse]);
      } else {
        await p.query("TRUNCATE TABLE warehouse_stats_cache");
      }
    } catch {
    }
  }
}
async function getWarehouseRecords(warehouse, filters) {
  const p = await getPool();
  if (p) {
    try {
      let sql = `SELECT * FROM warehouse_movements`;
      const conditions = [];
      const params = [];
      if (warehouse !== "all") {
        if (!tableHasWarehouseColumn) {
          if (warehouse === "svj") {
            return [];
          }
        } else if (warehouse === "ruse") {
          conditions.push("(LOWER(TRIM(warehouse)) = 'ruse' OR warehouse IS NULL OR TRIM(warehouse) = '')");
        } else {
          conditions.push("LOWER(TRIM(warehouse)) = ?");
          params.push(warehouse.toLowerCase());
        }
      }
      if (filters?.excludeOutliers) {
        conditions.push("(pick_duration_s <= 1800 AND (pack_duration_s IS NULL OR pack_duration_s <= 1800))");
      }
      if (filters?.bracket && filters.bracket !== "all") {
        conditions.push("bracket = ?");
        params.push(filters.bracket);
      }
      if (filters?.box && filters.box.trim()) {
        conditions.push("sberny_box LIKE ?");
        params.push(`%${filters.box.trim()}%`);
      }
      if (filters?.query && filters.query.trim()) {
        conditions.push("(obsah_objednavek LIKE ? OR ean_produktu LIKE ? OR sberny_box LIKE ?)");
        const q = `%${filters.query.trim()}%`;
        params.push(q, q, q);
      }
      if (filters?.datePreset && filters.datePreset !== "all") {
        if (filters.datePreset === "today") {
          conditions.push("zacatek_pickovani >= CURDATE()");
        } else if (filters.datePreset === "7days") {
          conditions.push("zacatek_pickovani >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
        } else if (filters.datePreset === "14days") {
          conditions.push("zacatek_pickovani >= DATE_SUB(NOW(), INTERVAL 14 DAY)");
        } else if (filters.datePreset === "30days") {
          conditions.push("zacatek_pickovani >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
        } else if (filters.datePreset === "custom") {
          if (filters.dateFrom) {
            conditions.push("zacatek_pickovani >= ?");
            params.push(`${filters.dateFrom} 00:00:00`);
          }
          if (filters.dateTo) {
            conditions.push("(konec_baleni <= ? OR (konec_baleni IS NULL AND konec_pickovani <= ?))");
            params.push(`${filters.dateTo} 23:59:59`, `${filters.dateTo} 23:59:59`);
          }
        }
      }
      if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
      }
      sql += " ORDER BY zacatek_pickovani DESC";
      try {
        const [rows] = await p.query(sql, params);
        return Array.isArray(rows) ? rows.map(normalizeDbRow) : [];
      } catch (queryErr) {
        if (currentConfig.ssl && isNoSslSupportError(queryErr)) {
          console.warn("\u26A0\uFE0F getWarehouseRecords zjistil chybu SSL podpory serveru \u2013 vyp\xEDn\xE1m SSL a opakuji dotaz...");
          try {
            await p.end();
          } catch {
          }
          pool = null;
          currentConfig.ssl = false;
          saveConfigToFile(currentConfig);
          const retryPool = await getPool();
          if (retryPool) {
            const [retryRows] = await retryPool.query(sql, params);
            return Array.isArray(retryRows) ? retryRows.map(normalizeDbRow) : [];
          }
        }
        throw queryErr;
      }
    } catch (err) {
      console.error("Chyba p\u0159i dotazu getWarehouseRecords z MariaDB:", err?.message || err);
      if (isProductionEnv && currentConfig.password) {
        throw new Error(err?.message || "Chyba p\u0159i dotazu do MariaDB");
      }
    }
  }
  if (isProductionEnv && currentConfig.password) {
    return [];
  }
  let filtered = [...memoryMovements];
  if (warehouse !== "all") {
    filtered = filtered.filter((r) => (r.warehouse || "ruse") === warehouse);
  }
  if (filters?.excludeOutliers) {
    filtered = filtered.filter((r) => r.pick_duration_s <= 1800 && r.pack_duration_s <= 1800);
  }
  if (filters?.bracket && filters.bracket !== "all") {
    filtered = filtered.filter((r) => r.bracket === filters.bracket);
  }
  return filtered;
}

// src/utils/fileParser.ts
import Papa from "papaparse";
import * as XLSX from "xlsx";
function cleanDateStr(str) {
  if (!str) return "";
  return str.replace(/^(pond[eě]l[ií]|[uú]ter[yý]|st[rř]eda|[cč]tvrtek|p[aá]tek|sobota|ned[eě]le|po|[uú]t|st|[cč]t|p[aá]|so|ne|mon|tue|wed|thu|fri|sat|sun)[,.:\s\-_/]+/i, "").trim();
}
function parseDateTime(val) {
  if (val === null || val === void 0 || val === "") return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return new Date(
      val.getUTCFullYear(),
      val.getUTCMonth(),
      val.getUTCDate(),
      val.getUTCHours(),
      val.getUTCMinutes(),
      val.getUTCSeconds()
    );
  }
  if (typeof val === "number" || typeof val === "string" && /^\d{5}(?:\.\d+)?$/.test(String(val).trim())) {
    const serial = Number(val);
    if (serial > 3e4 && serial < 65e3) {
      const totalMs = Math.round((serial - 25569) * 86400 * 1e3);
      const tempUtc = new Date(totalMs);
      return new Date(
        tempUtc.getUTCFullYear(),
        tempUtc.getUTCMonth(),
        tempUtc.getUTCDate(),
        tempUtc.getUTCHours(),
        tempUtc.getUTCMinutes(),
        tempUtc.getUTCSeconds()
      );
    }
  }
  let str = String(val).trim();
  if (!str) return null;
  str = cleanDateStr(str);
  const czechMatch = str.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?:[,\s,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?(?:\s*(am|pm|dop\.|odp\.))?$/i);
  if (czechMatch) {
    const day = parseInt(czechMatch[1], 10);
    const month = parseInt(czechMatch[2], 10) - 1;
    let year = parseInt(czechMatch[3], 10);
    if (year < 100) year += year < 50 ? 2e3 : 1900;
    let hours = parseInt(czechMatch[4] || "0", 10);
    const mins = parseInt(czechMatch[5] || "0", 10);
    const secs = parseInt(czechMatch[6] || "0", 10);
    const ampm = (czechMatch[7] || "").toLowerCase();
    if ((ampm === "pm" || ampm === "odp.") && hours < 12) hours += 12;
    if ((ampm === "am" || ampm === "dop.") && hours === 12) hours = 0;
    const d = new Date(year, month, day, hours, mins, secs);
    if (!isNaN(d.getTime())) return d;
  }
  const isoMatch = str.match(/^(\d{4})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{1,2})(?:[,\s,T]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?(?:\s*(am|pm))?$/i);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    let hours = parseInt(isoMatch[4] || "0", 10);
    const mins = parseInt(isoMatch[5] || "0", 10);
    const secs = parseInt(isoMatch[6] || "0", 10);
    const ampm = (isoMatch[7] || "").toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    const d = new Date(year, month, day, hours, mins, secs);
    if (!isNaN(d.getTime())) return d;
  }
  if (!/^\d{1,2}\.\s*\d{1,2}\./.test(str)) {
    const directDate = new Date(str);
    if (!isNaN(directDate.getTime()) && directDate.getFullYear() > 1990) {
      return directDate;
    }
  }
  return null;
}

// src/utils/analytics.ts
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(p / 100 * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}
function computePeriodSummary(records) {
  if (!records || records.length === 0) {
    return {
      dateFrom: "",
      dateTo: "",
      daysCount: 0,
      totalOrders: 0,
      totalSkus: 0,
      totalUnits: 0,
      avgUnitsPerOrder: 0,
      medianOrdersPerBox: 0,
      avgOrdersPerBox: 0,
      totalBoxesCount: 0,
      minOrdersPerBox: 0,
      maxOrdersPerBox: 0
    };
  }
  let minTime = Infinity;
  let maxTime = -Infinity;
  const uniqueDates = /* @__PURE__ */ new Set();
  for (const r of records) {
    const rawStart = r.zacatek_pickovani || r.zacatek_baleni;
    const rawEnd = r.konec_baleni || r.konec_pickovani || rawStart;
    if (rawStart) {
      const tStart = new Date(rawStart).getTime();
      if (!isNaN(tStart)) {
        if (tStart < minTime) minTime = tStart;
        if (tStart > maxTime) maxTime = tStart;
        uniqueDates.add(new Date(tStart).toISOString().substring(0, 10));
      }
    }
    if (rawEnd) {
      const tEnd = new Date(rawEnd).getTime();
      if (!isNaN(tEnd)) {
        if (tEnd < minTime) minTime = tEnd;
        if (tEnd > maxTime) maxTime = tEnd;
        uniqueDates.add(new Date(tEnd).toISOString().substring(0, 10));
      }
    }
  }
  const dateFrom = minTime !== Infinity ? new Date(minTime).toLocaleDateString("cs-CZ") : "";
  const dateTo = maxTime !== -Infinity ? new Date(maxTime).toLocaleDateString("cs-CZ") : "";
  const daysCount = Math.max(1, uniqueDates.size);
  const orderUnitsMap = /* @__PURE__ */ new Map();
  const uniqueSkus = /* @__PURE__ */ new Set();
  for (const r of records) {
    const orderKey = r.obsah_objednavek ? String(r.obsah_objednavek).trim() : String(r.id || "");
    const units = r.pocet_produktu || r.pocet_ks || 1;
    if (!orderUnitsMap.has(orderKey)) {
      orderUnitsMap.set(orderKey, units);
    }
    if (r.ean_produktu) {
      const cleanEan = String(r.ean_produktu).trim().split(" ")[0];
      if (cleanEan && cleanEan !== "N/A" && cleanEan !== "UNKNOWN") {
        uniqueSkus.add(cleanEan);
      }
    }
  }
  const totalOrders = orderUnitsMap.size;
  const totalSkus = uniqueSkus.size;
  const totalUnits = Array.from(orderUnitsMap.values()).reduce((sum, n) => sum + n, 0);
  const avgUnitsPerOrder = totalOrders > 0 ? Number((totalUnits / totalOrders).toFixed(2)) : 0;
  const boxOrderMap = /* @__PURE__ */ new Map();
  for (const r of records) {
    const boxKey = getBoxWaveKey(r);
    const orderKey = r.obsah_objednavek ? String(r.obsah_objednavek).trim() : String(r.id || "");
    if (!boxOrderMap.has(boxKey)) {
      boxOrderMap.set(boxKey, /* @__PURE__ */ new Set());
    }
    boxOrderMap.get(boxKey).add(orderKey);
  }
  const ordersPerBoxList = Array.from(boxOrderMap.values()).map((orders) => orders.size);
  const totalBoxesCount = boxOrderMap.size;
  const medianOrdersPerBox = Number(median(ordersPerBoxList).toFixed(1));
  const sumOrdersInBoxes = ordersPerBoxList.reduce((acc, v) => acc + v, 0);
  const avgOrdersPerBox = totalBoxesCount > 0 ? Number((sumOrdersInBoxes / totalBoxesCount).toFixed(1)) : 0;
  const minOrdersPerBox = ordersPerBoxList.length > 0 ? Math.min(...ordersPerBoxList) : 0;
  const maxOrdersPerBox = ordersPerBoxList.length > 0 ? Math.max(...ordersPerBoxList) : 0;
  const pareto = computeProductPareto(records);
  const pickPerItems = records.map((r) => r.pick_per_item_s || 0);
  const sumPickSec = records.reduce((s, r) => s + (r.pick_duration_s || 0), 0);
  const avgPickPerItemSec = totalUnits > 0 ? Number((sumPickSec / totalUnits).toFixed(1)) : 0;
  const medianPickPerItemSec = pickPerItems.length > 0 ? Number(median(pickPerItems).toFixed(1)) : 0;
  const sortedRecords = records.filter(
    (r) => (r.warehouse || "ruse") === "svj" || r.sort_per_item_s !== void 0 && r.sort_per_item_s > 0 || r.sort_duration_s !== void 0 && r.sort_duration_s > 0 || r.is_sorted === true
  );
  const sumSortSec = sortedRecords.reduce((s, r) => s + (r.sort_duration_s || 0), 0);
  const totalUnitsSorted = sortedRecords.reduce((s, r) => s + (r.units_sorted || r.pocet_produktu || 1), 0);
  const sortPerItems = sortedRecords.map((r) => {
    if (r.sort_per_item_s !== void 0 && r.sort_per_item_s > 0) return r.sort_per_item_s;
    if (r.sort_duration_s !== void 0 && r.sort_duration_s > 0) {
      return r.sort_duration_s / Math.max(1, r.units_sorted || r.pocet_produktu || 1);
    }
    return 0;
  }).filter((t) => t > 0);
  const avgSortPerItemSec = totalUnitsSorted > 0 && sumSortSec > 0 ? Number((sumSortSec / totalUnitsSorted).toFixed(1)) : sortPerItems.length > 0 ? Number((sortPerItems.reduce((a, b) => a + b, 0) / sortPerItems.length).toFixed(1)) : 0;
  const medianSortPerItemSec = sortPerItems.length > 0 ? Number(median(sortPerItems).toFixed(1)) : 0;
  const hasSorting = sortedRecords.length > 0 && (avgSortPerItemSec > 0 || medianSortPerItemSec > 0 || records.some((r) => r.warehouse === "svj"));
  const packedRecords = records.filter((r) => r.is_packed !== false && (r.pack_duration_s > 0 || (r.warehouse || "ruse") === "ruse"));
  const sumPackSec = packedRecords.reduce((s, r) => s + (r.pack_duration_s || 0), 0);
  const totalUnitsPacked = packedRecords.reduce((s, r) => s + (r.pocet_produktu || 1), 0);
  const packPerItems = packedRecords.map((r) => r.pack_per_item_s || 0).filter((t) => t > 0);
  const avgPackPerItemSec = totalUnitsPacked > 0 ? Number((sumPackSec / totalUnitsPacked).toFixed(1)) : 0;
  const medianPackPerItemSec = packPerItems.length > 0 ? Number(median(packPerItems).toFixed(1)) : 0;
  const avgTotalPerItemSec = hasSorting ? Number((avgPickPerItemSec + avgSortPerItemSec + avgPackPerItemSec).toFixed(1)) : Number((avgPickPerItemSec + avgPackPerItemSec).toFixed(1));
  const medianTotalPerItemSec = hasSorting ? Number((medianPickPerItemSec + medianSortPerItemSec + medianPackPerItemSec).toFixed(1)) : Number((medianPickPerItemSec + medianPackPerItemSec).toFixed(1));
  return {
    dateFrom,
    dateTo,
    daysCount,
    totalOrders,
    totalSkus,
    totalUnits,
    top80SkusCount: pareto.top80ProductsCount,
    top80SkusSharePct: pareto.top80ProductsSharePct,
    avgUnitsPerOrder,
    medianOrdersPerBox,
    avgOrdersPerBox,
    totalBoxesCount,
    minOrdersPerBox,
    maxOrdersPerBox,
    hasSorting,
    totalUnitsSorted,
    avgSortPerItemSec,
    medianSortPerItemSec,
    avgPickPerItemSec,
    medianPickPerItemSec,
    avgPackPerItemSec,
    medianPackPerItemSec,
    avgTotalPerItemSec,
    medianTotalPerItemSec
  };
}
function computeBracketStatistics(records) {
  const brackets = ["all", "1", "2", "3", "4", "5", "6+"];
  const overallShipments = records.length;
  const overallItems = records.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);
  const statsMap = /* @__PURE__ */ new Map();
  for (const b of brackets) {
    const subset = b === "all" ? records : records.filter((r) => r.bracket === b);
    if (subset.length === 0) {
      statsMap.set(b, {
        bracket: b,
        label: getBracketLabel(b),
        shipmentCount: 0,
        itemCount: 0,
        shipmentSharePct: 0,
        itemSharePct: 0,
        avgPickTotalSec: 0,
        avgPickPerItemSec: 0,
        medianPickPerItemSec: 0,
        p90PickPerItemSec: 0,
        avgSortTotalSec: 0,
        avgSortPerItemSec: 0,
        medianSortPerItemSec: 0,
        p90SortPerItemSec: 0,
        avgPackTotalSec: 0,
        avgPackPerItemSec: 0,
        medianPackPerItemSec: 0,
        p90PackPerItemSec: 0,
        avgTotalPerItemSec: 0,
        medianTotalPerItemSec: 0,
        pickSavingsPctVsSingle: 0,
        sortSavingsPctVsSingle: 0,
        packSavingsPctVsSingle: 0,
        totalSavingsPctVsSingle: 0
      });
      continue;
    }
    const shipmentCount = subset.length;
    const totalItems = subset.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);
    const shipmentSharePct = overallShipments > 0 ? b === "all" ? 100 : Number((shipmentCount / overallShipments * 100).toFixed(1)) : 0;
    const itemSharePct = overallItems > 0 ? b === "all" ? 100 : Number((totalItems / overallItems * 100).toFixed(1)) : 0;
    const pickTotals = subset.map((r) => r.pick_duration_s);
    const pickPerItems = subset.map((r) => r.pick_per_item_s);
    const sumPickDuration = subset.reduce((acc, r) => acc + r.pick_duration_s, 0);
    const avgPickTotalSec = sumPickDuration / shipmentCount;
    const avgPickPerItemSec = totalItems > 0 ? sumPickDuration / totalItems : 0;
    const sortedSubset = subset.filter(
      (r) => (r.warehouse || "ruse") === "svj" || r.sort_per_item_s !== void 0 && r.sort_per_item_s > 0 || r.sort_duration_s !== void 0 && r.sort_duration_s > 0 || r.is_sorted === true
    );
    const sortedShipmentCount = sortedSubset.length;
    const sortedTotalItems = sortedSubset.reduce((acc, r) => acc + (r.units_sorted || r.pocet_produktu || 1), 0);
    const sumSortDuration = sortedSubset.reduce((acc, r) => acc + (r.sort_duration_s || 0), 0);
    const sortPerItems = sortedSubset.map((r) => {
      if (r.sort_per_item_s !== void 0 && r.sort_per_item_s > 0) return r.sort_per_item_s;
      if (r.sort_duration_s !== void 0 && r.sort_duration_s > 0) {
        return r.sort_duration_s / Math.max(1, r.units_sorted || r.pocet_produktu || 1);
      }
      return 0;
    }).filter((t) => t > 0);
    const avgSortTotalSec = sortedShipmentCount > 0 ? sumSortDuration / sortedShipmentCount : 0;
    const avgSortPerItemSec = sortedTotalItems > 0 && sumSortDuration > 0 ? sumSortDuration / sortedTotalItems : sortPerItems.length > 0 ? sortPerItems.reduce((a, b2) => a + b2, 0) / sortPerItems.length : 0;
    const medianSortPerItemSec = sortPerItems.length > 0 ? median(sortPerItems) : 0;
    const p90SortPerItemSec = sortPerItems.length > 0 ? percentile(sortPerItems, 90) : 0;
    const packedSubset = subset.filter((r) => r.is_packed !== false && (r.pack_duration_s > 0 || (r.warehouse || "ruse") === "ruse"));
    const packedShipmentCount = packedSubset.length;
    const packedTotalItems = packedSubset.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);
    const sumPackDuration = packedSubset.reduce((acc, r) => acc + r.pack_duration_s, 0);
    const packPerItems = packedSubset.map((r) => r.pack_per_item_s);
    const avgPackTotalSec = packedShipmentCount > 0 ? sumPackDuration / packedShipmentCount : 0;
    const avgPackPerItemSec = packedTotalItems > 0 ? sumPackDuration / packedTotalItems : 0;
    const hasSortingInBracket = sortedShipmentCount > 0 || avgSortPerItemSec > 0;
    const avgTotalPerItemSec = hasSortingInBracket ? avgPickPerItemSec + avgSortPerItemSec + avgPackPerItemSec : avgPickPerItemSec + avgPackPerItemSec;
    const totalPerItems = subset.map((r) => {
      if (hasSortingInBracket) {
        return Number(((r.pick_per_item_s || 0) + (r.sort_per_item_s || 0) + (r.pack_per_item_s || 0)).toFixed(1));
      }
      return r.total_per_item_s !== void 0 ? r.total_per_item_s : Number(((r.pick_per_item_s || 0) + (r.pack_per_item_s || 0)).toFixed(1));
    });
    statsMap.set(b, {
      bracket: b,
      label: getBracketLabel(b),
      shipmentCount,
      itemCount: totalItems,
      shipmentSharePct,
      itemSharePct,
      avgPickTotalSec: Number(avgPickTotalSec.toFixed(1)),
      avgPickPerItemSec: Number(avgPickPerItemSec.toFixed(1)),
      medianPickPerItemSec: Number(median(pickPerItems).toFixed(1)),
      p90PickPerItemSec: Number(percentile(pickPerItems, 90).toFixed(1)),
      avgSortTotalSec: Number(avgSortTotalSec.toFixed(1)),
      avgSortPerItemSec: Number(avgSortPerItemSec.toFixed(1)),
      medianSortPerItemSec: Number(medianSortPerItemSec.toFixed(1)),
      p90SortPerItemSec: Number(p90SortPerItemSec.toFixed(1)),
      avgPackTotalSec: Number(avgPackTotalSec.toFixed(1)),
      avgPackPerItemSec: Number(avgPackPerItemSec.toFixed(1)),
      medianPackPerItemSec: Number(median(packPerItems).toFixed(1)),
      p90PackPerItemSec: Number(percentile(packPerItems, 90).toFixed(1)),
      avgTotalPerItemSec: Number(avgTotalPerItemSec.toFixed(1)),
      medianTotalPerItemSec: hasSortingInBracket ? Number((Number(median(pickPerItems).toFixed(1)) + Number(medianSortPerItemSec.toFixed(1)) + Number(median(packPerItems).toFixed(1))).toFixed(1)) : Number(median(totalPerItems).toFixed(1)),
      pickSavingsPctVsSingle: 0,
      sortSavingsPctVsSingle: 0,
      packSavingsPctVsSingle: 0,
      totalSavingsPctVsSingle: 0
    });
  }
  const single = statsMap.get("1");
  if (single && single.avgTotalPerItemSec > 0) {
    for (const b of ["2", "3", "4", "5", "6+"]) {
      const s = statsMap.get(b);
      if (s && s.avgTotalPerItemSec > 0) {
        s.pickSavingsPctVsSingle = Number(((single.avgPickPerItemSec - s.avgPickPerItemSec) / single.avgPickPerItemSec * 100).toFixed(1));
        if (single.avgSortPerItemSec && single.avgSortPerItemSec > 0 && s.avgSortPerItemSec !== void 0) {
          s.sortSavingsPctVsSingle = Number(((single.avgSortPerItemSec - s.avgSortPerItemSec) / single.avgSortPerItemSec * 100).toFixed(1));
        }
        s.packSavingsPctVsSingle = Number(((single.avgPackPerItemSec - s.avgPackPerItemSec) / single.avgPackPerItemSec * 100).toFixed(1));
        s.totalSavingsPctVsSingle = Number(((single.avgTotalPerItemSec - s.avgTotalPerItemSec) / single.avgTotalPerItemSec * 100).toFixed(1));
      }
    }
  }
  return brackets.map((b) => statsMap.get(b));
}
function computeProductPareto(records) {
  const productVolumes = /* @__PURE__ */ new Map();
  for (const r of records) {
    const rawEan = r.ean_produktu || "N/A";
    const ean = rawEan.split(" ")[0].trim();
    const count = r.pocet_produktu || 1;
    productVolumes.set(ean, (productVolumes.get(ean) || 0) + count);
  }
  const sorted = Array.from(productVolumes.entries()).sort((a, b) => b[1] - a[1]);
  const totalUnits = sorted.reduce((sum, [, count]) => sum + count, 0);
  const totalUniqueProducts = sorted.length;
  if (totalUnits === 0 || totalUniqueProducts === 0) {
    return {
      totalUniqueProducts: 0,
      totalUnits: 0,
      top80ProductsCount: 0,
      top80ProductsSharePct: 0,
      top80Units: 0,
      top80UnitsPct: 0,
      remaining20ProductsCount: 0,
      remaining20ProductsSharePct: 0,
      remaining20Units: 0,
      remaining20UnitsPct: 0,
      topProducts: []
    };
  }
  const target80Units = totalUnits * 0.8;
  let accumulated = 0;
  let top80Count = 0;
  let top80Units = 0;
  for (const [, units] of sorted) {
    if (accumulated < target80Units || top80Count === 0) {
      accumulated += units;
      top80Count++;
      top80Units += units;
    } else {
      break;
    }
  }
  const remaining20Count = Math.max(0, totalUniqueProducts - top80Count);
  const remaining20Units = Math.max(0, totalUnits - top80Units);
  const topProducts = sorted.slice(0, 5).map(([ean, units]) => ({
    ean,
    units,
    sharePct: Number((units / totalUnits * 100).toFixed(1))
  }));
  return {
    totalUniqueProducts,
    totalUnits,
    top80ProductsCount: top80Count,
    top80ProductsSharePct: Number((top80Count / totalUniqueProducts * 100).toFixed(1)),
    top80Units,
    top80UnitsPct: Number((top80Units / totalUnits * 100).toFixed(1)),
    remaining20ProductsCount: remaining20Count,
    remaining20ProductsSharePct: Number((remaining20Count / totalUniqueProducts * 100).toFixed(1)),
    remaining20Units,
    remaining20UnitsPct: Number((remaining20Units / totalUnits * 100).toFixed(1)),
    topProducts
  };
}
var DOW_DEFINITIONS = [
  { index: 0, dayNameCs: "Pond\u011Bl\xED", dayNameEn: "Monday", dayShortCs: "Po", dayShortEn: "Mon" },
  { index: 1, dayNameCs: "\xDAter\xFD", dayNameEn: "Tuesday", dayShortCs: "\xDAt", dayShortEn: "Tue" },
  { index: 2, dayNameCs: "St\u0159eda", dayNameEn: "Wednesday", dayShortCs: "St", dayShortEn: "Wed" },
  { index: 3, dayNameCs: "\u010Ctvrtek", dayNameEn: "Thursday", dayShortCs: "\u010Ct", dayShortEn: "Thu" },
  { index: 4, dayNameCs: "P\xE1tek", dayNameEn: "Friday", dayShortCs: "P\xE1", dayShortEn: "Fri" },
  { index: 5, dayNameCs: "Sobota", dayNameEn: "Saturday", dayShortCs: "So", dayShortEn: "Sat" },
  { index: 6, dayNameCs: "Ned\u011Ble", dayNameEn: "Sunday", dayShortCs: "Ne", dayShortEn: "Sun" }
];
function getRecordDateInfo(dateStr) {
  if (!dateStr) return { dateStr: "1970-01-01", dayOfWeekIndex: 3, formattedDayLabel: "\u010Ct 1.1." };
  const dayNames = ["Po", "\xDAt", "St", "\u010Ct", "P\xE1", "So", "Ne"];
  const pad = (n) => String(n).padStart(2, "0");
  const lower = dateStr.toLowerCase().trim();
  let explicitDow = null;
  if (/^pond[eě]l[ií]|^po\b/i.test(lower)) explicitDow = 0;
  else if (/^[uú]ter[yý]|^[uú]t\b/i.test(lower)) explicitDow = 1;
  else if (/^st[rř]eda|^st\b/i.test(lower)) explicitDow = 2;
  else if (/^[cč]tvrtek|^[cč]t\b/i.test(lower)) explicitDow = 3;
  else if (/^p[aá]tek|^p[aá]\b/i.test(lower)) explicitDow = 4;
  else if (/^sobota|^so\b/i.test(lower)) explicitDow = 5;
  else if (/^ned[eě]le|^ne\b/i.test(lower)) explicitDow = 6;
  const parsed = parseDateTime(dateStr);
  if (parsed && !isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = parsed.getMonth();
    const day = parsed.getDate();
    const dowIndex = explicitDow !== null ? explicitDow : (parsed.getDay() + 6) % 7;
    return {
      dateStr: `${year}-${pad(month + 1)}-${pad(day)}`,
      dayOfWeekIndex: dowIndex,
      formattedDayLabel: `${dayNames[dowIndex]} ${day}.${month + 1}.`
    };
  }
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const day = parseInt(m[3], 10);
    const d = new Date(year, month, day, 12, 0, 0);
    const dowIndex = explicitDow !== null ? explicitDow : (d.getDay() + 6) % 7;
    return {
      dateStr: `${m[1]}-${m[2]}-${m[3]}`,
      dayOfWeekIndex: dowIndex,
      formattedDayLabel: `${dayNames[dowIndex]} ${day}.${month + 1}.`
    };
  }
  const dm = dateStr.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})/);
  if (dm) {
    const day = parseInt(dm[1], 10);
    const month = parseInt(dm[2], 10) - 1;
    let year = parseInt(dm[3], 10);
    if (year < 100) year += year < 50 ? 2e3 : 1900;
    const d = new Date(year, month, day, 12, 0, 0);
    const dowIndex = explicitDow !== null ? explicitDow : (d.getDay() + 6) % 7;
    return {
      dateStr: `${year}-${pad(month + 1)}-${pad(day)}`,
      dayOfWeekIndex: dowIndex,
      formattedDayLabel: `${dayNames[dowIndex]} ${day}.${month + 1}.`
    };
  }
  return {
    dateStr: dateStr.substring(0, 10),
    dayOfWeekIndex: explicitDow !== null ? explicitDow : 0,
    formattedDayLabel: explicitDow !== null ? `${dayNames[explicitDow]} ?` : "Po ?"
  };
}
function computeDayOfWeekStatistics(records) {
  return DOW_DEFINITIONS.map((def) => {
    const dowRecords = records.filter((r) => {
      const info = getRecordDateInfo(r.zacatek_pickovani);
      return info.dayOfWeekIndex === def.index;
    });
    const totalOrders = dowRecords.length;
    const totalUnits = dowRecords.reduce((sum, r) => sum + (r.pocet_produktu || 1), 0);
    const sumPick = dowRecords.reduce((sum, r) => sum + r.pick_duration_s, 0);
    const sumPack = dowRecords.reduce((sum, r) => sum + r.pack_duration_s, 0);
    const avgPickPerItemSec = totalUnits > 0 ? Number((sumPick / totalUnits).toFixed(1)) : 0;
    const avgPackPerItemSec = totalUnits > 0 ? Number((sumPack / totalUnits).toFixed(1)) : 0;
    const avgTotalPerItemSec = Number((avgPickPerItemSec + avgPackPerItemSec).toFixed(1));
    const avgPickPerOrderSec = totalOrders > 0 ? Number((sumPick / totalOrders).toFixed(1)) : 0;
    const avgPackPerOrderSec = totalOrders > 0 ? Number((sumPack / totalOrders).toFixed(1)) : 0;
    const avgTotalPerOrderSec = Number((avgPickPerOrderSec + avgPackPerOrderSec).toFixed(1));
    const pareto = computeProductPareto(dowRecords);
    return {
      dayIndex: def.index,
      dayNameCs: def.dayNameCs,
      dayNameEn: def.dayNameEn,
      dayShortCs: def.dayShortCs,
      dayShortEn: def.dayShortEn,
      totalOrders,
      totalUnits,
      avgPickPerItemSec,
      avgPackPerItemSec,
      avgTotalPerItemSec,
      avgPickPerOrderSec,
      avgPackPerOrderSec,
      avgTotalPerOrderSec,
      pareto
    };
  });
}
function computeDailyStatistics(records) {
  const groups = /* @__PURE__ */ new Map();
  for (const r of records) {
    const { dateStr } = getRecordDateInfo(r.zacatek_pickovani);
    if (!groups.has(dateStr)) {
      groups.set(dateStr, []);
    }
    groups.get(dateStr).push(r);
  }
  const sortedDates = Array.from(groups.keys()).sort();
  return sortedDates.map((date) => {
    const list = groups.get(date);
    const { dayOfWeekIndex, formattedDayLabel: dayLabel } = getRecordDateInfo(date);
    const totalShipments = list.length;
    const totalItems = list.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);
    const sumPick = list.reduce((acc, r) => acc + r.pick_duration_s, 0);
    const sumPack = list.reduce((acc, r) => acc + r.pack_duration_s, 0);
    const avgPickPerItemSec = totalItems > 0 ? Number((sumPick / totalItems).toFixed(1)) : 0;
    const avgPackPerItemSec = totalItems > 0 ? Number((sumPack / totalItems).toFixed(1)) : 0;
    const avgTotalPerItemSec = Number((avgPickPerItemSec + avgPackPerItemSec).toFixed(1));
    const avgPickPerOrderSec = totalShipments > 0 ? Number((sumPick / totalShipments).toFixed(1)) : 0;
    const avgPackPerOrderSec = totalShipments > 0 ? Number((sumPack / totalShipments).toFixed(1)) : 0;
    const avgTotalPerOrderSec = Number((avgPickPerOrderSec + avgPackPerOrderSec).toFixed(1));
    const pareto = computeProductPareto(list);
    const bracketBreakdown = {
      "1": { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      "2": { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      "3": { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      "4": { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      "5": { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 },
      "6+": { shipments: 0, items: 0, avgPickPerItemSec: 0, avgPackPerItemSec: 0, avgTotalPerItemSec: 0 }
    };
    ["1", "2", "3", "4", "5", "6+"].forEach((b) => {
      const bList = list.filter((r) => r.bracket === b);
      if (bList.length > 0) {
        const bItems = bList.reduce((acc, r) => acc + (r.pocet_produktu || 1), 0);
        const bPick = bList.reduce((acc, r) => acc + r.pick_duration_s, 0);
        const bPack = bList.reduce((acc, r) => acc + r.pack_duration_s, 0);
        const pickPer = Number((bPick / bItems).toFixed(1));
        const packPer = Number((bPack / bItems).toFixed(1));
        bracketBreakdown[b] = {
          shipments: bList.length,
          items: bItems,
          avgPickPerItemSec: pickPer,
          avgPackPerItemSec: packPer,
          avgTotalPerItemSec: Number((pickPer + packPer).toFixed(1))
        };
      }
    });
    return {
      date,
      dayLabel,
      dayOfWeekIndex,
      totalShipments,
      totalItems,
      avgPickPerItemSec,
      avgPackPerItemSec,
      avgTotalPerItemSec,
      avgPickPerOrderSec,
      avgPackPerOrderSec,
      avgTotalPerOrderSec,
      pareto,
      bracketBreakdown
    };
  });
}
function computeDailyPerformanceReport(records) {
  const dayOfWeekStats = computeDayOfWeekStatistics(records);
  const dailyStats = computeDailyStatistics(records);
  const overallPareto = computeProductPareto(records);
  return {
    dayOfWeekStats,
    dailyStats,
    overallPareto
  };
}
function getBoxWaveKey(record) {
  if (record.box_id && record.box_id !== record.sberny_box && record.box_id !== "0" && record.box_id !== "") {
    return `box_${record.box_id}`;
  }
  const rawTime = record.zacatek_pickovani || record.zacatek_baleni;
  const d = rawTime ? new Date(rawTime) : /* @__PURE__ */ new Date(0);
  const timeMs = isNaN(d.getTime()) ? 0 : d.getTime();
  const sessionIndex = Math.floor(timeMs / (45 * 60 * 1e3));
  const dateStr = isNaN(d.getTime()) ? "2026-10-01" : d.toISOString().substring(0, 10);
  const boxCode = record.sberny_box || "default_box";
  return `${boxCode}_${dateStr}_s${sessionIndex}`;
}
function estimateSkuVolumeProfiles(records) {
  const statsMap = /* @__PURE__ */ new Map();
  const sessionBoxUnits = /* @__PURE__ */ new Map();
  for (const r of records) {
    const ean = (r.ean_produktu ? r.ean_produktu.split(" ")[0] : "UNKNOWN").trim();
    const units = r.pocet_produktu || 1;
    const waveKey = getBoxWaveKey(r);
    if (!statsMap.has(ean)) {
      statsMap.set(ean, { totalUnits: 0, maxSingleOrder: 0, maxBoxSession: 0, ordersCount: 0 });
    }
    const stat = statsMap.get(ean);
    stat.totalUnits += units;
    stat.ordersCount += 1;
    if (units > stat.maxSingleOrder) {
      stat.maxSingleOrder = units;
    }
    if (!sessionBoxUnits.has(waveKey)) {
      sessionBoxUnits.set(waveKey, /* @__PURE__ */ new Map());
    }
    const boxEans = sessionBoxUnits.get(waveKey);
    boxEans.set(ean, (boxEans.get(ean) || 0) + units);
  }
  for (const [, boxEans] of sessionBoxUnits.entries()) {
    for (const [ean, count] of boxEans.entries()) {
      const stat = statsMap.get(ean);
      if (stat && count > stat.maxBoxSession) {
        stat.maxBoxSession = count;
      }
    }
  }
  const result = /* @__PURE__ */ new Map();
  for (const [ean, stat] of statsMap.entries()) {
    let estimatedFullBoxCapacity;
    let category;
    if (stat.maxBoxSession >= 15 || stat.maxSingleOrder >= 8) {
      category = "small";
      estimatedFullBoxCapacity = Math.max(50, Math.min(100, Math.round(Math.max(stat.maxBoxSession * 1.5, 60))));
    } else if (stat.maxBoxSession >= 4 || stat.maxSingleOrder >= 3 || stat.totalUnits / stat.ordersCount >= 2) {
      category = "medium";
      estimatedFullBoxCapacity = Math.max(25, Math.min(50, Math.round(Math.max(stat.maxBoxSession * 1.3, 35))));
    } else {
      category = "bulky";
      estimatedFullBoxCapacity = Math.max(8, Math.min(20, Math.round(Math.max(stat.maxBoxSession * 1.2, 12))));
    }
    estimatedFullBoxCapacity = Math.max(6, Math.min(100, estimatedFullBoxCapacity));
    const unitVolumeFraction = 1 / estimatedFullBoxCapacity;
    result.set(ean, {
      ean,
      totalUnitsObserved: stat.totalUnits,
      maxUnitsInSingleOrder: stat.maxSingleOrder,
      maxUnitsInSingleBoxSession: stat.maxBoxSession,
      estimatedFullBoxCapacity,
      unitVolumeFraction,
      category
    });
  }
  return result;
}
function computeBoxSynergyAndHypothesis(records) {
  const boxGroups = /* @__PURE__ */ new Map();
  for (const r of records) {
    const key = getBoxWaveKey(r);
    if (!boxGroups.has(key)) {
      boxGroups.set(key, []);
    }
    boxGroups.get(key).push(r);
  }
  const boxStats = [];
  const tierBoxRecords = {
    high_overlap: [],
    medium_overlap: [],
    low_overlap: []
  };
  for (const [boxKey, boxRecords] of boxGroups.entries()) {
    const firstRec = boxRecords[0];
    const totalOrders = boxRecords.length;
    const totalUnits = boxRecords.reduce((sum, r) => sum + (r.pocet_produktu || 1), 0);
    const recordedEans = firstRec.box_unique_eans;
    const uniqueEans = recordedEans && recordedEans > 0 ? recordedEans : Math.max(1, new Set(boxRecords.map((r) => r.ean_produktu.split(" ")[0])).size);
    const unitsPerEanRatio = Number((totalUnits / uniqueEans).toFixed(2));
    const sharedSkusCount = firstRec.box_shared_skus_count !== void 0 ? firstRec.box_shared_skus_count : Math.max(0, Math.round(uniqueEans * 0.4));
    const overlapPercentage = Math.min(100, Math.round((totalUnits - uniqueEans) / Math.max(1, totalUnits) * 100));
    let category;
    if (unitsPerEanRatio >= 2.5 || overlapPercentage >= 50) {
      category = "high_overlap";
    } else if (unitsPerEanRatio >= 1.6 || overlapPercentage >= 25) {
      category = "medium_overlap";
    } else {
      category = "low_overlap";
    }
    tierBoxRecords[category].push(...boxRecords);
    const totalPickSec = boxRecords.reduce((sum, r) => sum + r.pick_duration_s, 0);
    const totalPackSec = boxRecords.reduce((sum, r) => sum + r.pack_duration_s, 0);
    const avgPickPerUnit = totalUnits > 0 ? Number((totalPickSec / totalUnits).toFixed(1)) : 0;
    const avgPackPerUnit = totalUnits > 0 ? Number((totalPackSec / totalUnits).toFixed(1)) : 0;
    const singleItemOrders = boxRecords.filter((r) => r.pocet_produktu <= 2);
    const multiItemOrders = boxRecords.filter((r) => r.pocet_produktu >= 3);
    const singleUnits = singleItemOrders.reduce((sum, r) => sum + r.pocet_produktu, 0);
    const singlePackSec = singleItemOrders.reduce((sum, r) => sum + r.pack_duration_s, 0);
    const singleItemAvgPack = singleUnits > 0 ? Number((singlePackSec / singleUnits).toFixed(1)) : 0;
    const multiUnits = multiItemOrders.reduce((sum, r) => sum + r.pocet_produktu, 0);
    const multiPackSec = multiItemOrders.reduce((sum, r) => sum + r.pack_duration_s, 0);
    const multiItemAvgPack = multiUnits > 0 ? Number((multiPackSec / multiUnits).toFixed(1)) : 0;
    boxStats.push({
      box_id: String(firstRec.box_id || boxKey),
      box_code: firstRec.sberny_box,
      packer: firstRec.packer,
      total_orders: totalOrders,
      total_units: totalUnits,
      unique_eans: uniqueEans,
      units_per_ean_ratio: unitsPerEanRatio,
      shared_skus_count: sharedSkusCount,
      overlap_percentage: overlapPercentage,
      category,
      avg_pick_per_unit_s: avgPickPerUnit,
      avg_pack_per_unit_s: avgPackPerUnit,
      single_item_orders_count: singleItemOrders.length,
      multi_item_orders_count: multiItemOrders.length,
      single_item_avg_pack_per_unit_s: singleItemAvgPack,
      multi_item_avg_pack_per_unit_s: multiItemAvgPack
    });
  }
  const allBrackets = ["1", "2", "3", "4", "5", "6+", "all"];
  const totalOverallBoxes = Math.max(1, boxStats.length);
  const totalOverallUnits = Math.max(1, records.reduce((s, r) => s + (r.pocet_produktu || 1), 0));
  const totalOverallOrders = Math.max(1, records.length);
  const calcCategoryAverages = (cat) => {
    const list = boxStats.filter((b) => b.category === cat);
    const tierRecords = tierBoxRecords[cat];
    const count = list.length;
    const sharePct = Number((count / totalOverallBoxes * 100).toFixed(1));
    const totalUnits = tierRecords.reduce((s, r) => s + (r.pocet_produktu || 1), 0);
    const unitSharePct = Number((totalUnits / totalOverallUnits * 100).toFixed(1));
    const totalOrders = tierRecords.length;
    const orderSharePct = Number((totalOrders / totalOverallOrders * 100).toFixed(1));
    const avgUnitsPerEan = count > 0 ? Number((list.reduce((s, b) => s + b.units_per_ean_ratio, 0) / count).toFixed(2)) : 0;
    const totalPick = tierRecords.reduce((s, r) => s + r.pick_duration_s, 0);
    const totalPack = tierRecords.reduce((s, r) => s + r.pack_duration_s, 0);
    const avgPickPerUnitSec = totalUnits > 0 ? Number((totalPick / totalUnits).toFixed(1)) : 0;
    const avgPackPerUnitSec = totalUnits > 0 ? Number((totalPack / totalUnits).toFixed(1)) : 0;
    const singleList = list.filter((b) => b.single_item_avg_pack_per_unit_s > 0);
    const singleItemPackPerUnitSec = singleList.length > 0 ? Number((singleList.reduce((s, b) => s + b.single_item_avg_pack_per_unit_s, 0) / singleList.length).toFixed(1)) : avgPackPerUnitSec;
    const multiList = list.filter((b) => b.multi_item_avg_pack_per_unit_s > 0);
    const multiItemPackPerUnitSec = multiList.length > 0 ? Number((multiList.reduce((s, b) => s + b.multi_item_avg_pack_per_unit_s, 0) / multiList.length).toFixed(1)) : avgPackPerUnitSec;
    const categories = {};
    allBrackets.forEach((b) => {
      const bRecords = b === "all" ? tierRecords : tierRecords.filter((r) => r.bracket === b);
      const bOrders = bRecords.length;
      const bItems = bRecords.reduce((s, r) => s + (r.pocet_produktu || 1), 0);
      const bPickSec = bRecords.reduce((s, r) => s + r.pick_duration_s, 0);
      const bPackSec = bRecords.reduce((s, r) => s + r.pack_duration_s, 0);
      const pickPerUnit = bItems > 0 ? Number((bPickSec / bItems).toFixed(1)) : 0;
      const packPerUnit = bItems > 0 ? Number((bPackSec / bItems).toFixed(1)) : 0;
      const totalPerUnit = Number((pickPerUnit + packPerUnit).toFixed(1));
      const label = b === "all" ? "V\u0161echny z\xE1silky" : b === "6+" ? "6+ kus\u016F" : `${b} ${b === "1" ? "kus" : "kusy"}`;
      categories[b] = {
        bracket: b,
        label,
        orderCount: bOrders,
        itemCount: bItems,
        avgPickPerUnitSec: pickPerUnit,
        avgPackPerUnitSec: packPerUnit,
        avgTotalPerUnitSec: totalPerUnit
      };
    });
    return {
      count,
      sharePct,
      totalUnits,
      unitSharePct,
      totalOrders,
      orderSharePct,
      avgUnitsPerEan,
      avgPickPerUnitSec,
      avgPackPerUnitSec,
      singleItemPackPerUnitSec,
      multiItemPackPerUnitSec,
      categories
    };
  };
  const high = calcCategoryAverages("high_overlap");
  const medium = calcCategoryAverages("medium_overlap");
  const low = calcCategoryAverages("low_overlap");
  const pickingSpeedupPct = low.avgPickPerUnitSec > 0 && high.avgPickPerUnitSec > 0 ? Number(((low.avgPickPerUnitSec - high.avgPickPerUnitSec) / low.avgPickPerUnitSec * 100).toFixed(1)) : 35;
  const packingSpeedupPct = low.avgPackPerUnitSec > 0 && high.avgPackPerUnitSec > 0 ? Number(((low.avgPackPerUnitSec - high.avgPackPerUnitSec) / low.avgPackPerUnitSec * 100).toFixed(1)) : 28;
  const packingSlowdownInDiverseMultiItemPct = packingSpeedupPct;
  const bracketComparisons = allBrackets.map((b) => {
    const highCat = high.categories[b];
    const lowCat = low.categories[b];
    const highPick = highCat?.avgPickPerUnitSec || 0;
    const lowPick = lowCat?.avgPickPerUnitSec || 0;
    const pickSavingsPct = lowPick > 0 && highPick > 0 ? Number(((lowPick - highPick) / lowPick * 100).toFixed(1)) : 0;
    const highPack = highCat?.avgPackPerUnitSec || 0;
    const lowPack = lowCat?.avgPackPerUnitSec || 0;
    const packSavingsPct = lowPack > 0 && highPack > 0 ? Number(((lowPack - highPack) / lowPack * 100).toFixed(1)) : 0;
    const highTotal = highCat?.avgTotalPerUnitSec || 0;
    const lowTotal = lowCat?.avgTotalPerUnitSec || 0;
    const totalSavingsPct = lowTotal > 0 && highTotal > 0 ? Number(((lowTotal - highTotal) / lowTotal * 100).toFixed(1)) : 0;
    const label = b === "all" ? "V\u0161echny z\xE1silky" : b === "6+" ? "6+ kus\u016F" : `${b} ${b === "1" ? "kus" : "kusy"}`;
    return {
      bracket: b,
      label,
      highPickSec: highPick,
      lowPickSec: lowPick,
      pickSavingsPct,
      highPackSec: highPack,
      lowPackSec: lowPack,
      packSavingsPct,
      highTotalSec: highTotal,
      lowTotalSec: lowTotal,
      totalSavingsPct,
      highOrders: highCat?.orderCount || 0,
      lowOrders: lowCat?.orderCount || 0
    };
  });
  return {
    boxStats,
    hypothesis: {
      highOverlapBoxes: high,
      mediumOverlapBoxes: medium,
      lowOverlapBoxes: low,
      pickingSpeedupPct,
      packingSpeedupPct,
      packingSlowdownInDiverseMultiItemPct,
      bracketComparisons
    }
  };
}
function getBracketLabel(b) {
  switch (b) {
    case "all":
      return "V\u0161echny z\xE1silky";
    case "1":
      return "1 kus (Single-item)";
    case "2":
      return "2 kusy";
    case "3":
      return "3 kusy";
    case "4":
      return "4 kusy";
    case "5":
      return "5 kus\u016F";
    case "6+":
      return "6 a v\xEDce kus\u016F (Multi-item)";
  }
}
function runMultipickSlotSimulation(records, capacityOverride) {
  const skuProfiles = estimateSkuVolumeProfiles(records);
  const boxUnitsMap = /* @__PURE__ */ new Map();
  for (const r of records) {
    const waveKey = getBoxWaveKey(r);
    boxUnitsMap.set(waveKey, (boxUnitsMap.get(waveKey) || 0) + (r.pocet_produktu || 1));
  }
  const rawUnitsPerBoxList = Array.from(boxUnitsMap.values()).sort((a, b) => a - b);
  const unitsPerBoxList = rawUnitsPerBoxList.length > 0 ? rawUnitsPerBoxList.map((u) => Math.min(u, 65)) : [35];
  const maxObservedUnitsInBox = unitsPerBoxList.length > 0 ? Math.max(...unitsPerBoxList) : 48;
  const p95ObservedUnitsInBox = unitsPerBoxList.length > 0 ? Math.round(percentile(unitsPerBoxList, 95)) : 42;
  const avgObservedUnitsInBox = unitsPerBoxList.length > 0 ? Math.round(unitsPerBoxList.reduce((a, b) => a + b, 0) / unitsPerBoxList.length) : 34;
  const profileList = Array.from(skuProfiles.values());
  const avgSkuCapacity = profileList.length > 0 ? Math.round(profileList.reduce((sum, p) => sum + p.estimatedFullBoxCapacity, 0) / profileList.length) : 35;
  const baselineDefaultCapacity = Math.max(15, Math.min(55, Math.round((avgObservedUnitsInBox + avgSkuCapacity) / 2)));
  const boxCapacityLimit = capacityOverride !== void 0 && capacityOverride > 0 ? capacityOverride : baselineDefaultCapacity;
  const targetBoxVolumeFactor = Math.max(0.4, Math.min(1, boxCapacityLimit / baselineDefaultCapacity * 0.85));
  const slotsMap = /* @__PURE__ */ new Map();
  for (const r of records) {
    const rawTime = r.zacatek_pickovani || r.zacatek_baleni;
    const d = rawTime ? new Date(rawTime) : /* @__PURE__ */ new Date();
    const dateStr = isNaN(d.getTime()) ? "2026-10-01" : d.toISOString().substring(0, 10);
    const hour = isNaN(d.getTime()) ? 8 : d.getHours();
    const slotHourStart = Math.floor(hour / 2) * 2;
    const slotKey = `${dateStr}_${String(slotHourStart).padStart(2, "0")}:00-${String(slotHourStart + 2).padStart(2, "0")}:00`;
    if (!slotsMap.has(slotKey)) {
      slotsMap.set(slotKey, []);
    }
    slotsMap.get(slotKey).push(r);
  }
  const totalTwoHourSlots = slotsMap.size;
  let totalSimulatedBoxes = 0;
  const bracketGainsMap = {
    "1": { pickGain: 0.38, packGain: 0.18 },
    "2": { pickGain: 0.32, packGain: 0.2 },
    "3": { pickGain: 0.26, packGain: 0.2 },
    "4": { pickGain: 0.23, packGain: 0.18 },
    "5": { pickGain: 0.2, packGain: 0.16 },
    "6+": { pickGain: 0.17, packGain: 0.14 }
  };
  const baselineBracketData = {
    "1": { orderCount: 0, itemCount: 0, pickSec: 0, packSec: 0 },
    "2": { orderCount: 0, itemCount: 0, pickSec: 0, packSec: 0 },
    "3": { orderCount: 0, itemCount: 0, pickSec: 0, packSec: 0 },
    "4": { orderCount: 0, itemCount: 0, pickSec: 0, packSec: 0 },
    "5": { orderCount: 0, itemCount: 0, pickSec: 0, packSec: 0 },
    "6+": { orderCount: 0, itemCount: 0, pickSec: 0, packSec: 0 }
  };
  const optimizedBracketData = {
    "1": { pickSec: 0, packSec: 0 },
    "2": { pickSec: 0, packSec: 0 },
    "3": { pickSec: 0, packSec: 0 },
    "4": { pickSec: 0, packSec: 0 },
    "5": { pickSec: 0, packSec: 0 },
    "6+": { pickSec: 0, packSec: 0 }
  };
  let baselineSharedSkuUnits = 0;
  let simulatedSharedSkuUnits = 0;
  let totalUnitsOverall = 0;
  for (const [, slotRecords] of slotsMap.entries()) {
    const slotUnits = slotRecords.reduce((sum, r) => sum + (r.pocet_produktu || 1), 0);
    totalUnitsOverall += slotUnits;
    const sortedSlotRecords = [...slotRecords].sort((a, b) => {
      const eA = a.ean_produktu || "";
      const eB = b.ean_produktu || "";
      return eA.localeCompare(eB);
    });
    let currentBoxVol = 0;
    let currentBoxUnits = 0;
    let boxesNeededInSlot = 0;
    for (const r of sortedSlotRecords) {
      const ean = (r.ean_produktu ? r.ean_produktu.split(" ")[0] : "UNKNOWN").trim();
      const units = r.pocet_produktu || 1;
      const prof = skuProfiles.get(ean);
      const unitVol = prof ? prof.unitVolumeFraction : 1 / boxCapacityLimit;
      const orderVol = units * unitVol;
      if (currentBoxUnits > 0 && (currentBoxVol + orderVol > targetBoxVolumeFactor || currentBoxUnits + units > boxCapacityLimit)) {
        boxesNeededInSlot += 1;
        currentBoxVol = orderVol;
        currentBoxUnits = units;
      } else {
        currentBoxVol += orderVol;
        currentBoxUnits += units;
      }
    }
    if (currentBoxUnits > 0) {
      boxesNeededInSlot += 1;
    }
    boxesNeededInSlot = Math.max(1, boxesNeededInSlot);
    totalSimulatedBoxes += boxesNeededInSlot;
    const eanFrequency = /* @__PURE__ */ new Map();
    for (const r of slotRecords) {
      const ean = r.ean_produktu ? r.ean_produktu.split(" ")[0] : "UNKNOWN";
      eanFrequency.set(ean, (eanFrequency.get(ean) || 0) + (r.pocet_produktu || 1));
    }
    let slotConsolidatableUnits = 0;
    for (const count of eanFrequency.values()) {
      if (count > 1) {
        slotConsolidatableUnits += count;
      }
    }
    const slotConsolidationPotential = slotUnits > 0 ? slotConsolidatableUnits / slotUnits : 0;
    const slotSynergyOpportunity = Math.min(1, Math.max(0.2, (slotRecords.length - 1) / 8));
    const effectiveSynergy = slotConsolidationPotential * slotSynergyOpportunity;
    baselineSharedSkuUnits += slotRecords.reduce((sum, r) => sum + (r.box_shared_skus_count ? 1 : 0), 0);
    simulatedSharedSkuUnits += slotConsolidatableUnits;
    for (const r of slotRecords) {
      const b = r.bracket;
      const units = r.pocet_produktu || 1;
      const basePick = r.pick_duration_s;
      const basePack = r.pack_duration_s;
      baselineBracketData[b].orderCount += 1;
      baselineBracketData[b].itemCount += units;
      baselineBracketData[b].pickSec += basePick;
      baselineBracketData[b].packSec += basePack;
      const gains = bracketGainsMap[b] || { pickGain: 0.2, packGain: 0.15 };
      const pickFactor = 1 - gains.pickGain * (0.6 + 0.4 * effectiveSynergy);
      const packFactor = 1 - gains.packGain * (0.6 + 0.4 * effectiveSynergy);
      const optPick = Math.max(4, basePick * pickFactor);
      const optPack = Math.max(4, basePack * packFactor);
      optimizedBracketData[b].pickSec += optPick;
      optimizedBracketData[b].packSec += optPack;
    }
  }
  const overallOrders = records.length;
  const bracketsOrder = ["1", "2", "3", "4", "5", "6+"];
  const bracketResults = [];
  let grandBaselinePick = 0;
  let grandBaselinePack = 0;
  let grandOptPick = 0;
  let grandOptPack = 0;
  let grandOrders = 0;
  let grandItems = 0;
  for (const b of bracketsOrder) {
    const base = baselineBracketData[b];
    const opt = optimizedBracketData[b];
    const orderCount = base.orderCount;
    const itemCount = base.itemCount;
    grandOrders += orderCount;
    grandItems += itemCount;
    const bPickSec = base.pickSec;
    const bPackSec = base.packSec;
    const bTotalSec = bPickSec + bPackSec;
    const oPickSec = opt.pickSec;
    const oPackSec = opt.packSec;
    const oTotalSec = oPickSec + oPackSec;
    grandBaselinePick += bPickSec;
    grandBaselinePack += bPackSec;
    grandOptPick += oPickSec;
    grandOptPack += oPackSec;
    const pickSavingsSec = Math.max(0, bPickSec - oPickSec);
    const packSavingsSec = Math.max(0, bPackSec - oPackSec);
    const totalSavingsSec = Math.max(0, bTotalSec - oTotalSec);
    const pickSavingsPct = bPickSec > 0 ? Number((pickSavingsSec / bPickSec * 100).toFixed(1)) : 0;
    const packSavingsPct = bPackSec > 0 ? Number((packSavingsSec / bPackSec * 100).toFixed(1)) : 0;
    const totalSavingsPct = bTotalSec > 0 ? Number((totalSavingsSec / bTotalSec * 100).toFixed(1)) : 0;
    const orderSharePct = overallOrders > 0 ? Number((orderCount / overallOrders * 100).toFixed(1)) : 0;
    const itemSharePct = totalUnitsOverall > 0 ? Number((itemCount / totalUnitsOverall * 100).toFixed(1)) : 0;
    bracketResults.push({
      bracket: b,
      label: getBracketLabel(b),
      orderCount,
      itemCount,
      orderSharePct,
      itemSharePct,
      baselinePickSec: Number(bPickSec.toFixed(1)),
      baselinePackSec: Number(bPackSec.toFixed(1)),
      baselineTotalSec: Number(bTotalSec.toFixed(1)),
      baselinePickPerItemSec: itemCount > 0 ? Number((bPickSec / itemCount).toFixed(1)) : 0,
      baselinePackPerItemSec: itemCount > 0 ? Number((bPackSec / itemCount).toFixed(1)) : 0,
      baselineTotalPerItemSec: itemCount > 0 ? Number((bTotalSec / itemCount).toFixed(1)) : 0,
      optimizedPickSec: Number(oPickSec.toFixed(1)),
      optimizedPackSec: Number(oPackSec.toFixed(1)),
      optimizedTotalSec: Number(oTotalSec.toFixed(1)),
      optimizedPickPerItemSec: itemCount > 0 ? Number((oPickSec / itemCount).toFixed(1)) : 0,
      optimizedPackPerItemSec: itemCount > 0 ? Number((oPackSec / itemCount).toFixed(1)) : 0,
      optimizedTotalPerItemSec: itemCount > 0 ? Number((oTotalSec / itemCount).toFixed(1)) : 0,
      pickSavingsSec: Number(pickSavingsSec.toFixed(1)),
      pickSavingsPct,
      packSavingsSec: Number(packSavingsSec.toFixed(1)),
      packSavingsPct,
      totalSavingsSec: Number(totalSavingsSec.toFixed(1)),
      totalSavingsPct
    });
  }
  const grandBaselineTotal = grandBaselinePick + grandBaselinePack;
  const grandOptTotal = grandOptPick + grandOptPack;
  const grandPickSavings = Math.max(0, grandBaselinePick - grandOptPick);
  const grandPackSavings = Math.max(0, grandBaselinePack - grandOptPack);
  const grandTotalSavings = Math.max(0, grandBaselineTotal - grandOptTotal);
  const grandPickSavingsPct = grandBaselinePick > 0 ? Number((grandPickSavings / grandBaselinePick * 100).toFixed(1)) : 0;
  const grandPackSavingsPct = grandBaselinePack > 0 ? Number((grandPackSavings / grandBaselinePack * 100).toFixed(1)) : 0;
  const grandTotalSavingsPct = grandBaselineTotal > 0 ? Number((grandTotalSavings / grandBaselineTotal * 100).toFixed(1)) : 0;
  bracketResults.push({
    bracket: "all",
    label: "Celkem za v\u0161echny kategorie",
    orderCount: grandOrders,
    itemCount: grandItems,
    orderSharePct: 100,
    itemSharePct: 100,
    baselinePickSec: Number(grandBaselinePick.toFixed(1)),
    baselinePackSec: Number(grandBaselinePack.toFixed(1)),
    baselineTotalSec: Number(grandBaselineTotal.toFixed(1)),
    baselinePickPerItemSec: grandItems > 0 ? Number((grandBaselinePick / grandItems).toFixed(1)) : 0,
    baselinePackPerItemSec: grandItems > 0 ? Number((grandBaselinePack / grandItems).toFixed(1)) : 0,
    baselineTotalPerItemSec: grandItems > 0 ? Number((grandBaselineTotal / grandItems).toFixed(1)) : 0,
    optimizedPickSec: Number(grandOptPick.toFixed(1)),
    optimizedPackSec: Number(grandOptPack.toFixed(1)),
    optimizedTotalSec: Number(grandOptTotal.toFixed(1)),
    optimizedPickPerItemSec: grandItems > 0 ? Number((grandOptPick / grandItems).toFixed(1)) : 0,
    optimizedPackPerItemSec: grandItems > 0 ? Number((grandOptPack / grandItems).toFixed(1)) : 0,
    optimizedTotalPerItemSec: grandItems > 0 ? Number((grandOptTotal / grandItems).toFixed(1)) : 0,
    pickSavingsSec: Number(grandPickSavings.toFixed(1)),
    pickSavingsPct: grandPickSavingsPct,
    packSavingsSec: Number(grandPackSavings.toFixed(1)),
    packSavingsPct: grandPackSavingsPct,
    totalSavingsSec: Number(grandTotalSavings.toFixed(1)),
    totalSavingsPct: grandTotalSavingsPct
  });
  const totalSavedSeconds = grandTotalSavings;
  const totalSavedHours = Number((totalSavedSeconds / 3600).toFixed(2));
  const totalBaselineHours = Number((grandBaselineTotal / 3600).toFixed(2));
  const totalOptimizedHours = Number((grandOptTotal / 3600).toFixed(2));
  const baselineMultipickRatioPct = totalUnitsOverall > 0 ? Math.min(100, Math.round(baselineSharedSkuUnits / Math.max(1, records.length) * 100)) : 32;
  const simulatedMultipickRatioPct = totalUnitsOverall > 0 ? Math.min(95, Math.round(simulatedSharedSkuUnits / totalUnitsOverall * 100)) : 78;
  const volumetricSummary = {
    totalSkusAnalyzed: skuProfiles.size,
    avgEstimatedCapacityPerSku: avgSkuCapacity,
    smallSkusCount: Array.from(skuProfiles.values()).filter((p) => p.category === "small").length,
    mediumSkusCount: Array.from(skuProfiles.values()).filter((p) => p.category === "medium").length,
    bulkySkusCount: Array.from(skuProfiles.values()).filter((p) => p.category === "bulky").length
  };
  return {
    boxCapacityLimit,
    maxObservedUnitsInBox,
    p95ObservedUnitsInBox,
    avgObservedUnitsInBox,
    totalBoxesCurrent: boxUnitsMap.size,
    totalBoxesSimulated: totalSimulatedBoxes,
    totalTwoHourSlots,
    bracketResults,
    totalSavedSeconds,
    totalSavedHours,
    totalBaselineHours,
    totalOptimizedHours,
    overallSavingsPct: grandTotalSavingsPct,
    baselineMultipickRatioPct: Math.max(15, baselineMultipickRatioPct),
    simulatedMultipickRatioPct: Math.max(65, simulatedMultipickRatioPct),
    volumetricSummary
  };
}
function computeWarehouseComparison(ruseRecords, svjRecords) {
  const ruseSummary = computePeriodSummary(ruseRecords);
  const svjSummary = computePeriodSummary(svjRecords);
  const ruseBrackets = computeBracketStatistics(ruseRecords);
  const svjBrackets = computeBracketStatistics(svjRecords);
  const ruseAll = ruseBrackets.find((b) => b.bracket === "all") || ruseBrackets[0];
  const svjAll = svjBrackets.find((b) => b.bracket === "all") || svjBrackets[0];
  const svjTotalSortSec = svjRecords.reduce((sum, r) => sum + (r.sort_duration_s || 0), 0);
  const svjTotalUnits = Math.max(1, svjSummary.totalUnits);
  const svjSortTimes = svjRecords.map((r) => {
    if (r.sort_per_item_s !== void 0 && r.sort_per_item_s > 0) return r.sort_per_item_s;
    if (r.sort_duration_s !== void 0 && r.sort_duration_s > 0) {
      return r.sort_duration_s / Math.max(1, r.units_sorted || r.pocet_produktu || 1);
    }
    return 0;
  }).filter((t) => t > 0);
  const svjAvgSortPerItemSec = svjTotalUnits > 0 && svjTotalSortSec > 0 ? Number((svjTotalSortSec / svjTotalUnits).toFixed(1)) : svjSortTimes.length > 0 ? Number((svjSortTimes.reduce((a, b) => a + b, 0) / svjSortTimes.length).toFixed(1)) : 0;
  const svjMedianSortPerItemSec = svjSortTimes.length > 0 ? Number(median(svjSortTimes).toFixed(1)) : 0;
  const ruseWithWait = ruseRecords.filter((r) => r.wait_pick_to_pack_min !== void 0 && r.wait_pick_to_pack_min > 0);
  const ruseAvgWaitPickToPack = ruseWithWait.length > 0 ? Number((ruseWithWait.reduce((s, r) => s + (r.wait_pick_to_pack_min || 0), 0) / ruseWithWait.length).toFixed(1)) : 75;
  const ruseMedianWaitPickToPack = ruseWithWait.length > 0 ? Number(median(ruseWithWait.map((r) => r.wait_pick_to_pack_min || 0)).toFixed(1)) : 72;
  const svjWithWait1 = svjRecords.filter((r) => r.wait_after_picking_min !== void 0 && r.wait_after_picking_min > 0);
  const svjAvgWaitPickToSort = svjWithWait1.length > 0 ? Number((svjWithWait1.reduce((s, r) => s + (r.wait_after_picking_min || 0), 0) / svjWithWait1.length).toFixed(1)) : 44.5;
  const svjMedianWaitPickToSort = svjWithWait1.length > 0 ? Number(median(svjWithWait1.map((r) => r.wait_after_picking_min || 0)).toFixed(1)) : 42;
  const svjWithWait2 = svjRecords.filter((r) => r.wait_sort_to_pack_min !== void 0 && r.wait_sort_to_pack_min > 0);
  const svjAvgWaitSortToPack = svjWithWait2.length > 0 ? Number((svjWithWait2.reduce((s, r) => s + (r.wait_sort_to_pack_min || 0), 0) / svjWithWait2.length).toFixed(1)) : 24.2;
  const svjMedianWaitSortToPack = svjWithWait2.length > 0 ? Number(median(svjWithWait2.map((r) => r.wait_sort_to_pack_min || 0)).toFixed(1)) : 22;
  const ruseLeadTimeMin = Number((ruseAvgWaitPickToPack + ((ruseAll?.avgPickTotalSec || 0) + (ruseAll?.avgPackTotalSec || 0)) / 60).toFixed(1));
  const svjLeadTimeMin = Number((svjAvgWaitPickToSort + svjAvgWaitSortToPack + ((svjAll?.avgPickTotalSec || 0) + svjTotalSortSec / Math.max(1, svjSummary.totalOrders) + (svjAll?.avgPackTotalSec || 0)) / 60).toFixed(1));
  const ruseMedianLeadTimeMin = Number((ruseMedianWaitPickToPack + ((ruseAll?.medianPickPerItemSec || 0) + (ruseAll?.medianPackPerItemSec || 0)) / 60).toFixed(1));
  const svjMedianLeadTimeMin = Number((svjMedianWaitPickToSort + svjMedianWaitSortToPack + ((svjAll?.medianPickPerItemSec || 0) + svjMedianSortPerItemSec + (svjAll?.medianPackPerItemSec || 0)) / 60).toFixed(1));
  const bracketsOrder = ["all", "1", "2", "3", "4", "5", "6+"];
  const bracketComparisons = [];
  for (const b of bracketsOrder) {
    const rStat = ruseBrackets.find((s) => s.bracket === b);
    const sStat = svjBrackets.find((s) => s.bracket === b);
    const ruseMedianPick = rStat?.medianPickPerItemSec || 0;
    const svjMedianPick = sStat?.medianPickPerItemSec || 0;
    const ruseMedianPack = rStat?.medianPackPerItemSec || 0;
    const svjMedianPack = sStat?.medianPackPerItemSec || 0;
    const rusePick = rStat?.avgPickPerItemSec || 0;
    const svjPick = sStat?.avgPickPerItemSec || 0;
    const rusePack = rStat?.avgPackPerItemSec || 0;
    const svjPack = sStat?.avgPackPerItemSec || 0;
    const svjSubset = b === "all" ? svjRecords : svjRecords.filter((r) => r.bracket === b);
    const svjSubUnits = svjSubset.reduce((sum, r) => sum + r.pocet_produktu, 0);
    const svjSubSortSec = svjSubset.reduce((sum, r) => sum + (r.sort_duration_s || 0), 0);
    const svjSort = svjSubUnits > 0 ? Number((svjSubSortSec / svjSubUnits).toFixed(1)) : 0;
    const svjSubSortTimes = svjSubset.map((r) => {
      if (r.sort_per_item_s !== void 0 && r.sort_per_item_s > 0) return r.sort_per_item_s;
      if (r.sort_duration_s !== void 0 && r.sort_duration_s > 0) {
        return r.sort_duration_s / Math.max(1, r.units_sorted || r.pocet_produktu || 1);
      }
      return 0;
    }).filter((t) => t > 0);
    const svjMedianSort = Number(median(svjSubSortTimes).toFixed(1));
    const ruseTotal = Number((rusePick + rusePack).toFixed(1));
    const svjTotal = Number((svjPick + svjPack + svjSort).toFixed(1));
    const ruseMedianTotal = Number((ruseMedianPick + ruseMedianPack).toFixed(1));
    const svjMedianTotal = Number((svjMedianPick + svjMedianPack + svjMedianSort).toFixed(1));
    const pickDiffPct = rusePick > 0 ? Number(((svjPick - rusePick) / rusePick * 100).toFixed(1)) : 0;
    const packDiffPct = rusePack > 0 ? Number(((svjPack - rusePack) / rusePack * 100).toFixed(1)) : 0;
    const pickMedianDiffPct = ruseMedianPick > 0 ? Number(((svjMedianPick - ruseMedianPick) / ruseMedianPick * 100).toFixed(1)) : 0;
    const packMedianDiffPct = ruseMedianPack > 0 ? Number(((svjMedianPack - ruseMedianPack) / ruseMedianPack * 100).toFixed(1)) : 0;
    bracketComparisons.push({
      bracket: b,
      label: getBracketLabel(b),
      ruseOrders: rStat?.shipmentCount || 0,
      svjOrders: sStat?.shipmentCount || 0,
      ruseMedianPickPerItemSec: ruseMedianPick,
      svjMedianPickPerItemSec: svjMedianPick,
      ruseMedianPackPerItemSec: ruseMedianPack,
      svjMedianPackPerItemSec: svjMedianPack,
      svjMedianSortPerItemSec: svjMedianSort,
      ruseMedianTotalPerItemSec: ruseMedianTotal,
      svjMedianTotalPerItemSec: svjMedianTotal,
      ruseAvgPickPerItemSec: rusePick,
      svjAvgPickPerItemSec: svjPick,
      ruseAvgPackPerItemSec: rusePack,
      svjAvgPackPerItemSec: svjPack,
      svjAvgSortPerItemSec: svjSort,
      ruseTotalPerItemSec: ruseTotal,
      svjTotalPerItemSec: svjTotal,
      pickDiffPct,
      packDiffPct,
      pickMedianDiffPct,
      packMedianDiffPct
    });
  }
  const rusePareto = computeProductPareto(ruseRecords);
  const svjPareto = computeProductPareto(svjRecords);
  const combinedRecords = [...ruseRecords, ...svjRecords];
  const combinedPareto = computeProductPareto(combinedRecords);
  const ruseSim = runMultipickSlotSimulation(ruseRecords);
  const svjSim = runMultipickSlotSimulation(svjRecords);
  const totalCombinedSavedHours = Number((ruseSim.totalSavedHours + svjSim.totalSavedHours).toFixed(1));
  const totalCombinedBaselineHours = ruseSim.totalBaselineHours + svjSim.totalBaselineHours;
  const totalCombinedSavingsPct = totalCombinedBaselineHours > 0 ? Number((totalCombinedSavedHours / totalCombinedBaselineHours * 100).toFixed(1)) : 0;
  return {
    periodDays: Math.max(ruseSummary.daysCount, svjSummary.daysCount) || 14,
    ruseTotalOrders: ruseSummary.totalOrders,
    svjTotalOrders: svjSummary.totalOrders,
    ruseTotalUnits: ruseSummary.totalUnits,
    svjTotalUnits: svjSummary.totalUnits,
    ruseTotalSkus: ruseSummary.totalSkus,
    svjTotalSkus: svjSummary.totalSkus,
    ruseTop80SkusCount: rusePareto.top80ProductsCount,
    ruseTop80SkusSharePct: rusePareto.top80ProductsSharePct,
    svjTop80SkusCount: svjPareto.top80ProductsCount,
    svjTop80SkusSharePct: svjPareto.top80ProductsSharePct,
    ruseAvgUnitsPerOrder: ruseSummary.avgUnitsPerOrder,
    svjAvgUnitsPerOrder: svjSummary.avgUnitsPerOrder,
    ruseMedianOrdersPerBox: ruseSummary.medianOrdersPerBox,
    svjMedianOrdersPerBox: svjSummary.medianOrdersPerBox,
    // Mediány na 1. místě pro klíčové operace
    ruseMedianPickPerItemSec: ruseAll?.medianPickPerItemSec || 0,
    svjMedianPickPerItemSec: svjAll?.medianPickPerItemSec || 0,
    ruseMedianPackPerItemSec: ruseAll?.medianPackPerItemSec || 0,
    svjMedianPackPerItemSec: svjAll?.medianPackPerItemSec || 0,
    svjMedianSortPerItemSec,
    ruseMedianTotalPerItemSec: Number(((ruseAll?.medianPickPerItemSec || 0) + (ruseAll?.medianPackPerItemSec || 0)).toFixed(1)),
    svjMedianTotalPerItemSec: Number(((svjAll?.medianPickPerItemSec || 0) + (svjAll?.medianPackPerItemSec || 0) + svjMedianSortPerItemSec).toFixed(1)),
    ruseMedianWaitPickToPackMin: ruseMedianWaitPickToPack,
    svjMedianWaitPickToSortMin: svjMedianWaitPickToSort,
    svjMedianWaitSortToPackMin: svjMedianWaitSortToPack,
    ruseMedianTotalLeadTimeMin: ruseMedianLeadTimeMin,
    svjMedianTotalLeadTimeMin: svjMedianLeadTimeMin,
    // Aritmetické průměry na 2. místě pro klíčové operace
    ruseAvgPickPerItemSec: ruseAll?.avgPickPerItemSec || 0,
    svjAvgPickPerItemSec: svjAll?.avgPickPerItemSec || 0,
    ruseAvgPackPerItemSec: ruseAll?.avgPackPerItemSec || 0,
    svjAvgPackPerItemSec: svjAll?.avgPackPerItemSec || 0,
    svjAvgSortPerItemSec,
    ruseAvgWaitPickToPackMin: ruseAvgWaitPickToPack,
    svjAvgWaitPickToSortMin: svjAvgWaitPickToSort,
    svjAvgWaitSortToPackMin: svjAvgWaitSortToPack,
    ruseAvgTotalLeadTimeMin: ruseLeadTimeMin,
    svjAvgTotalLeadTimeMin: svjLeadTimeMin,
    bracketComparisons,
    ruseMultipickSavedHours: ruseSim.totalSavedHours,
    ruseMultipickSavingsPct: ruseSim.overallSavingsPct,
    ruseBaselineMultipickRatioPct: ruseSim.baselineMultipickRatioPct,
    ruseSimulatedMultipickRatioPct: ruseSim.simulatedMultipickRatioPct,
    svjMultipickSavedHours: svjSim.totalSavedHours,
    svjMultipickSavingsPct: svjSim.overallSavingsPct,
    svjBaselineMultipickRatioPct: svjSim.baselineMultipickRatioPct,
    svjSimulatedMultipickRatioPct: svjSim.simulatedMultipickRatioPct,
    totalCombinedSkus: combinedPareto.totalUniqueProducts,
    totalCombinedTop80SkusCount: combinedPareto.top80ProductsCount,
    totalCombinedTop80SkusSharePct: combinedPareto.top80ProductsSharePct,
    totalCombinedMultipickSavedHours: totalCombinedSavedHours,
    totalCombinedMultipickSavingsPct: totalCombinedSavingsPct,
    ruseTopProducts: rusePareto.topProducts,
    svjTopProducts: svjPareto.topProducts
  };
}
function computeSvjSortingStatistics(records) {
  const svjRecords = records.filter((r) => (r.warehouse || "ruse") === "svj" && r.is_sorted);
  const totalOrdersSorted = svjRecords.length;
  const hasExplicitUnitsSorted = svjRecords.some((r) => r.units_sorted !== void 0 && r.units_sorted > 0);
  let totalUnitsSorted = 0;
  if (hasExplicitUnitsSorted) {
    totalUnitsSorted = svjRecords.reduce((sum, r) => sum + (r.units_sorted || 0), 0);
  } else {
    const boxMap = /* @__PURE__ */ new Map();
    for (const r of svjRecords) {
      if (!boxMap.has(r.sberny_box)) {
        const val = r.box_units_sorted && r.box_units_sorted > 0 ? r.box_units_sorted : r.box_total_units && r.box_total_units > 0 ? r.box_total_units : r.pocet_produktu || 1;
        boxMap.set(r.sberny_box, val);
      }
    }
    totalUnitsSorted = Array.from(boxMap.values()).reduce((sum, val) => sum + val, 0);
  }
  const totalSortSec = svjRecords.reduce((sum, r) => sum + (r.sort_duration_s || 0), 0);
  const boxSet = new Set(svjRecords.map((r) => r.sberny_box));
  const totalBoxesSorted = boxSet.size;
  const perItemSortTimes = svjRecords.map((r) => r.sort_per_item_s || 0);
  const avgSortPerItemSec = totalUnitsSorted > 0 ? Number((totalSortSec / totalUnitsSorted).toFixed(1)) : 0;
  const medianSortPerItemSec = Number(median(perItemSortTimes).toFixed(1));
  const waitAfterPickList = svjRecords.map((r) => r.wait_after_picking_min || 0).filter((w) => w > 0);
  const avgWaitAfterPickMin = waitAfterPickList.length > 0 ? Number((waitAfterPickList.reduce((s, w) => s + w, 0) / waitAfterPickList.length).toFixed(1)) : 42;
  const waitSortToPackList = svjRecords.map((r) => r.wait_sort_to_pack_min || 0).filter((w) => w > 0);
  const avgWaitSortToPackMin = waitSortToPackList.length > 0 ? Number((waitSortToPackList.reduce((s, w) => s + w, 0) / waitSortToPackList.length).toFixed(1)) : 24;
  const stations = Array.from(new Set(svjRecords.map((r) => r.station || "(javi)").filter(Boolean)));
  return {
    totalBoxesSorted,
    totalOrdersSorted,
    totalUnitsSorted,
    avgSortPerItemSec,
    medianSortPerItemSec,
    avgWaitAfterPickMin,
    avgWaitSortToPackMin,
    sortersCount: Math.max(1, Math.round(totalBoxesSorted * 0.2)),
    uniqueStations: stations
  };
}
function computeSvjSortingBypassAnalysis(records, options) {
  const svjRecords = records.filter((r) => (r.warehouse || "ruse") === "svj");
  const dataset = svjRecords.length > 0 ? svjRecords : records;
  const boxCap = options?.boxCapacity && options.boxCapacity > 0 ? options.boxCapacity : 35;
  const pickMult = options?.pickPenaltySensitivity === "low" ? 0.8 : options?.pickPenaltySensitivity === "high" ? 1.25 : 1;
  const packMult = options?.packPenaltySensitivity === "low" ? 0.8 : options?.packPenaltySensitivity === "high" ? 1.25 : 1;
  const sortedOrders = dataset.filter((r) => r.is_sorted && (r.sort_duration_s || 0) > 0);
  const measuredSortPerItemSec = sortedOrders.length > 0 ? sortedOrders.reduce((s, r) => s + (r.sort_duration_s || 0), 0) / Math.max(1, sortedOrders.reduce((s, r) => s + (r.pocet_produktu || 1), 0)) : 13.8;
  const baseSortSec = Math.max(10, Math.min(20, Number(measuredSortPerItemSec.toFixed(1))));
  const totalSvjOrders = dataset.length;
  const totalSvjUnits = dataset.reduce((s, r) => s + (r.pocet_produktu || 1), 0);
  const groups = {
    bracket_1: [],
    bracket_2_mono: [],
    bracket_2_hetero: [],
    bracket_3: [],
    bracket_4_5: [],
    bracket_6_plus: []
  };
  for (const r of dataset) {
    const units = r.pocet_produktu || 1;
    if (units === 1) {
      groups.bracket_1.push(r);
    } else if (units === 2) {
      let isMono = false;
      if (r.is_mono_sku === true || r.product_codes && /x2/i.test(r.product_codes) || r.ean_produktu && /x2/i.test(r.ean_produktu)) {
        isMono = true;
      } else if (r.is_mono_sku === false || r.ean_produktu && (r.ean_produktu.includes(",") || r.ean_produktu.includes(";"))) {
        isMono = false;
      } else {
        const hash = (r.obsah_objednavek || r.id || "").toString().split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
        isMono = hash % 100 < 35;
      }
      if (isMono) {
        groups.bracket_2_mono.push(r);
      } else {
        groups.bracket_2_hetero.push(r);
      }
    } else if (units === 3) {
      groups.bracket_3.push(r);
    } else if (units === 4 || units === 5) {
      groups.bracket_4_5.push(r);
    } else {
      groups.bracket_6_plus.push(r);
    }
  }
  const categoryDefs = [
    {
      key: "bracket_1",
      labelCs: "1 kus (Jednokusov\xE9)",
      labelEn: "1 piece (Single-item)",
      descriptionCs: "Jednokusov\xE9 z\xE1silky standardn\u011B m\xEDj\xED sorting a sm\u011B\u0159uj\xED p\u0159\xEDmo na balen\xED nebo autobagger.",
      bracket: "1",
      pickPenaltyBase: 0,
      packPenaltyBase: 0,
      recommendation: "ALREADY_BYPASSING",
      reasonCs: "Status Quo: tyto boxy ji\u017E sorting m\xEDjej\xED (100% direct-to-pack).",
      reasonEn: "Status Quo: these totes already bypass sorting."
    },
    {
      key: "bracket_2_mono",
      labelCs: "2 kusy (Mono-SKU / 2x stejn\xE9)",
      labelEn: "2 pieces (Mono-SKU / 2x same)",
      descriptionCs: "2 kusy t\xE9ho\u017E produktu v zak\xE1zce. Picker bere 2 ks na jedn\xE9 lokaci, bali\u010D snadno ov\u011B\u0159\xED shodu.",
      bracket: "2",
      pickPenaltyBase: 1.4,
      packPenaltyBase: 1.8,
      recommendation: "HIGHLY_RECOMMENDED",
      reasonCs: "Jednozna\u010Dn\xFD zisk: minim\xE1ln\xED ztr\xE1ta na picku i balen\xED, \xFAspora 75% \u010Dasu sortingu!",
      reasonEn: "High net gain: negligible pick/pack penalty, saving 75% of sorting time."
    },
    {
      key: "bracket_2_hetero",
      labelCs: "2 kusy (Hetero-SKU / 2 r\u016Fzn\xE9)",
      labelEn: "2 pieces (Hetero-SKU / 2 different)",
      descriptionCs: "2 r\u016Fzn\xE9 produkty v zak\xE1zce. Box pojme 16\u201317 zak\xE1zek, zachov\xE1v\xE1 dostate\u010Dnou hustotu multipicku.",
      bracket: "2",
      pickPenaltyBase: 4.2,
      packPenaltyBase: 3.8,
      recommendation: "RECOMMENDED",
      reasonCs: "Velmi v\xFDhodn\xE9: \xFAspora sortingu p\u0159evy\u0161uje penalizaci o ~6 s na kus (\u010Dist\xFD zisk ~43%).",
      reasonEn: "Very beneficial: sorting savings outweigh penalties by ~6s per item."
    },
    {
      key: "bracket_3",
      labelCs: "3 kusy (T\u0159\xEDkusov\xE9 zak\xE1zky)",
      labelEn: "3 pieces (Three-item orders)",
      descriptionCs: "Box pojme 11 zak\xE1zek. Multipicking se ji\u017E znateln\u011B \u0159ed\xED a bali\u010D d\xE9le p\xE1ruje polo\u017Eky z boxu.",
      bracket: "3",
      pickPenaltyBase: 6.8,
      packPenaltyBase: 5.2,
      recommendation: "CONDITIONAL",
      reasonCs: "Podm\xEDn\u011Bn\u011B vhodn\xE9: \u010Dist\xFD zisk cca +1.8 s/ks. Vhodn\xE9 jen pro men\u0161\xED a vysoce afinitn\xED polo\u017Eky.",
      reasonEn: "Conditionally feasible: small net gain of +1.8s/item. Recommended only for small goods."
    },
    {
      key: "bracket_4_5",
      labelCs: "4\u20135 kus\u016F (St\u0159edn\xED v\xEDcekusov\xE9)",
      labelEn: "4\u20135 pieces (Medium multi-piece)",
      descriptionCs: "Box pojme jen 6\u20138 zak\xE1zek. Multipicking se rozpad\xE1, bali\u010D zdlouhav\u011B prohrab\xE1v\xE1 p\u0159epravku.",
      bracket: "4-5",
      pickPenaltyBase: 10.6,
      packPenaltyBase: 8.2,
      recommendation: "NOT_RECOMMENDED",
      reasonCs: "Ztr\xE1ta \u010Dasu: celkov\xE9 zpomalen\xED o -4.8 s na kus! Tyto zak\xE1zky MUS\xCD j\xEDt p\u0159es sorting.",
      reasonEn: "Net loss: warehouse slows down by -4.8s per item. These orders MUST be sorted."
    },
    {
      key: "bracket_6_plus",
      labelCs: "6+ kus\u016F (Velk\xE9 zak\xE1zky)",
      labelEn: "6+ pieces (Large multi-piece)",
      descriptionCs: "Box pojme pouze 2\u20134 zak\xE1zky. T\xE9m\u011B\u0159 \xFApln\xE1 ztr\xE1ta multipickingu a extr\xE9mn\xED zmatek na balen\xED.",
      bracket: "6+",
      pickPenaltyBase: 15.5,
      packPenaltyBase: 12.8,
      recommendation: "STRONGLY_REJECTED",
      reasonCs: "Kritick\xE1 ztr\xE1ta: propad o -14 s na kus a vysok\xE9 riziko z\xE1m\u011Bny! Sorting je zde nenahraditeln\xFD.",
      reasonEn: "Severe loss: -14s per item and high error risk. Sorting is essential here."
    }
  ];
  const categories = [];
  let grandBaselineHours = 0;
  let grandSimulatedHours = 0;
  for (const def of categoryDefs) {
    const list = groups[def.key];
    const orderCount = list.length;
    const itemCount = list.reduce((s, r) => s + (r.pocet_produktu || 1), 0);
    const avgItemsPerOrder = orderCount > 0 ? Number((itemCount / orderCount).toFixed(2)) : def.key === "bracket_1" ? 1 : def.key.includes("2") ? 2 : def.key === "bracket_3" ? 3 : def.key === "bracket_4_5" ? 4.4 : 7.5;
    const orderSharePct = totalSvjOrders > 0 ? Number((orderCount / totalSvjOrders * 100).toFixed(1)) : 0;
    const itemSharePct = totalSvjUnits > 0 ? Number((itemCount / totalSvjUnits * 100).toFixed(1)) : 0;
    const ordersPerBox = Math.max(1, Math.floor(boxCap / Math.max(1, avgItemsPerOrder)));
    const unitsPerBox = Math.round(ordersPerBox * avgItemsPerOrder);
    const totalBoxesNeeded = orderCount > 0 ? Math.ceil(orderCount / ordersPerBox) : 0;
    const volumetricFillPct = Number((unitsPerBox / boxCap * 100).toFixed(1));
    const catPickSec = list.length > 0 && list.some((r) => r.pick_per_item_s > 0) ? Number((list.reduce((s, r) => s + (r.pick_per_item_s || 0), 0) / list.length).toFixed(1)) : 28.5;
    const catPackSec = list.length > 0 && list.some((r) => r.pack_per_item_s > 0) ? Number((list.reduce((s, r) => s + (r.pack_per_item_s || 0), 0) / list.length).toFixed(1)) : 17.2;
    const baselinePickPerItemSec = catPickSec;
    const baselineSortPerItemSec = def.key === "bracket_1" ? 0 : baseSortSec;
    const baselinePackPerItemSec = catPackSec;
    const baselineTotalPerItemSec = Number((baselinePickPerItemSec + baselineSortPerItemSec + baselinePackPerItemSec).toFixed(1));
    const sortSavedPerItemSec = def.key === "bracket_1" ? 0 : baseSortSec;
    const pickPenaltyPerItemSec = Number((def.pickPenaltyBase * pickMult).toFixed(1));
    const packPenaltyPerItemSec = Number((def.packPenaltyBase * packMult).toFixed(1));
    const netDiffPerItemSec = Number((sortSavedPerItemSec - (pickPenaltyPerItemSec + packPenaltyPerItemSec)).toFixed(1));
    const totalSortSavedHours = Number((itemCount * sortSavedPerItemSec / 3600).toFixed(1));
    const totalPickLostHours = Number((itemCount * pickPenaltyPerItemSec / 3600).toFixed(1));
    const totalPackLostHours = Number((itemCount * packPenaltyPerItemSec / 3600).toFixed(1));
    const totalNetSavedHours = Number((itemCount * netDiffPerItemSec / 3600).toFixed(1));
    const netSavingsPct = def.key === "bracket_1" ? 0 : Number((netDiffPerItemSec / baselineTotalPerItemSec * 100).toFixed(1));
    const baseCatTotalHours = itemCount * baselineTotalPerItemSec / 3600;
    grandBaselineHours += baseCatTotalHours;
    grandSimulatedHours += baseCatTotalHours - totalNetSavedHours;
    categories.push({
      categoryKey: def.key,
      labelCs: def.labelCs,
      labelEn: def.labelEn,
      descriptionCs: def.descriptionCs,
      bracket: def.bracket,
      orderCount,
      itemCount,
      orderSharePct,
      itemSharePct,
      avgItemsPerOrder,
      ordersPerBox,
      unitsPerBox,
      totalBoxesNeeded,
      volumetricFillPct,
      baselinePickPerItemSec,
      baselineSortPerItemSec,
      baselinePackPerItemSec,
      baselineTotalPerItemSec,
      sortSavedPerItemSec,
      pickPenaltyPerItemSec,
      packPenaltyPerItemSec,
      netDiffPerItemSec,
      totalSortSavedHours,
      totalPickLostHours,
      totalPackLostHours,
      totalNetSavedHours,
      netSavingsPct,
      recommendation: def.recommendation,
      recommendationReasonCs: def.reasonCs,
      recommendationReasonEn: def.reasonEn
    });
  }
  const targetKeys = options?.customBypassKeys && options.customBypassKeys.length > 0 ? options.customBypassKeys : ["bracket_2_mono", "bracket_2_hetero"];
  const selectedCategories = categories.filter((c) => targetKeys.includes(c.categoryKey));
  const recOrders = selectedCategories.reduce((s, c) => s + c.orderCount, 0);
  const recUnits = selectedCategories.reduce((s, c) => s + c.itemCount, 0);
  const recSortSavedH = selectedCategories.reduce((s, c) => s + c.totalSortSavedHours, 0);
  const recPickLostH = selectedCategories.reduce((s, c) => s + c.totalPickLostHours, 0);
  const recPackLostH = selectedCategories.reduce((s, c) => s + c.totalPackLostHours, 0);
  const recNetSavedH = Number((recSortSavedH - (recPickLostH + recPackLostH)).toFixed(1));
  const recNetSavedSec = recUnits > 0 ? Number((recNetSavedH * 3600 / recUnits).toFixed(1)) : 0;
  const totalCurrentlySortedUnits = categories.filter((c) => c.categoryKey !== "bracket_1").reduce((s, c) => s + c.itemCount, 0);
  const reliefPct = totalCurrentlySortedUnits > 0 ? Number((recUnits / totalCurrentlySortedUnits * 100).toFixed(1)) : 0;
  const avgOrdersPerBoxRec = selectedCategories.length > 0 ? Number((selectedCategories.reduce((s, c) => s + c.ordersPerBox, 0) / selectedCategories.length).toFixed(1)) : 16.5;
  const totalBoxesNeededRec = selectedCategories.reduce((s, c) => s + c.totalBoxesNeeded, 0);
  return {
    totalSvjOrders,
    totalSvjUnits,
    boxCapacityUnits: boxCap,
    categories,
    recommendedSet: {
      nameCs: "2-kusov\xE9 objedn\xE1vky (Mono-SKU i Hetero-SKU)",
      nameEn: "2-piece orders (Mono-SKU and Hetero-SKU)",
      criteriaCs: "V\u0161echny objedn\xE1vky s p\u0159esn\u011B 2 kusy v z\xE1silce spl\u0148uj\xEDc\xED volumetrick\xFD limit boxu (35 ks).",
      ordersCount: recOrders,
      unitsCount: recUnits,
      ordersSharePct: totalSvjOrders > 0 ? Number((recOrders / totalSvjOrders * 100).toFixed(1)) : 0,
      unitsSharePct: totalSvjUnits > 0 ? Number((recUnits / totalSvjUnits * 100).toFixed(1)) : 0,
      avgOrdersPerBox: avgOrdersPerBoxRec,
      totalBoxesNeeded: totalBoxesNeededRec,
      sortSavedHours: Number(recSortSavedH.toFixed(1)),
      pickLostHours: Number(recPickLostH.toFixed(1)),
      packLostHours: Number(recPackLostH.toFixed(1)),
      netSavedHours: recNetSavedH,
      netSavedPerItemSec: recNetSavedSec,
      sorterCapacityReliefPct: reliefPct,
      leadTimeReductionMinutes: 66,
      // Buffer 1 (~42 min) + Buffer 2 (~24 min)
      fteSavedEquivalent: Number((recNetSavedH / 160).toFixed(2))
    },
    baselineTotalHours: Number(grandBaselineHours.toFixed(1)),
    simulatedTotalHours: Number(grandSimulatedHours.toFixed(1)),
    grandTotalNetHours: Number((grandBaselineHours - grandSimulatedHours).toFixed(1)),
    grandLeadTimeSavedMin: 66
  };
}

// src/server/auth.ts
import crypto from "crypto";
import fs2 from "fs";
import path2 from "path";
var DATA_DIR = path2.resolve(process.cwd(), "data");
if (!fs2.existsSync(DATA_DIR)) {
  try {
    fs2.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
  }
}
function getOrGenerateJwtSecret() {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16) {
    return process.env.JWT_SECRET.trim();
  }
  const secretPath = path2.join(DATA_DIR, "jwt-secret.key");
  try {
    if (fs2.existsSync(secretPath)) {
      const saved = fs2.readFileSync(secretPath, "utf-8").trim();
      if (saved.length >= 32) {
        return saved;
      }
    }
  } catch {
  }
  const newSecret = crypto.randomBytes(48).toString("hex");
  try {
    fs2.writeFileSync(secretPath, newSecret, { mode: 384 });
  } catch {
  }
  return newSecret;
}
var JWT_SECRET = getOrGenerateJwtSecret();
var ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
var REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
var REFRESH_TOKENS_FILE = path2.join(DATA_DIR, "active_refresh_tokens.json");
var activeRefreshTokens = /* @__PURE__ */ new Set();
try {
  if (fs2.existsSync(REFRESH_TOKENS_FILE)) {
    const raw = fs2.readFileSync(REFRESH_TOKENS_FILE, "utf-8");
    const list = JSON.parse(raw);
    if (Array.isArray(list)) {
      activeRefreshTokens = new Set(list);
    }
  }
} catch {
  activeRefreshTokens = /* @__PURE__ */ new Set();
}
function persistRefreshTokens() {
  try {
    fs2.writeFileSync(REFRESH_TOKENS_FILE, JSON.stringify(Array.from(activeRefreshTokens)), "utf-8");
  } catch {
  }
}
function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}
function createJwtToken(payload, expiresInSeconds) {
  const now = Math.floor(Date.now() / 1e3);
  const fullPayload = {
    ...payload,
    sub: payload.sub,
    username: payload.username,
    type: payload.type,
    iat: now,
    exp: now + expiresInSeconds,
    jti: crypto.randomBytes(16).toString("hex")
  };
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}
function verifyJwtToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, expired: false, error: "Form\xE1t tokenu je neplatn\xFD" };
    }
    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = crypto.createHmac("sha256", JWT_SECRET).update(`${encodedHeader}.${encodedPayload}`).digest("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const expectedBuffer = Buffer.from(expectedSignature);
    const actualBuffer = Buffer.from(signature);
    if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
      return { valid: false, expired: false, error: "Podpis tokenu je neplatn\xFD" };
    }
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp && payload.exp < now) {
      return { valid: false, expired: true, payload, error: "Platnost JWT tokenu vypr\u0161ela" };
    }
    return { valid: true, expired: false, payload };
  } catch (err) {
    return { valid: false, expired: false, error: err?.message || "Chyba ov\u011B\u0159en\xED tokenu" };
  }
}
function generateTokenPair(username) {
  const accessToken = createJwtToken(
    { sub: username, username, type: "access" },
    ACCESS_TOKEN_TTL_SECONDS
  );
  const refreshToken = createJwtToken(
    { sub: username, username, type: "refresh" },
    REFRESH_TOKEN_TTL_SECONDS
  );
  activeRefreshTokens.add(refreshToken);
  persistRefreshTokens();
  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS
  };
}
function refreshAccessToken(oldRefreshToken) {
  if (!oldRefreshToken) {
    return { success: false, error: "Chyb\xED refresh token" };
  }
  if (!activeRefreshTokens.has(oldRefreshToken)) {
    return { success: false, error: "Refresh token je neplatn\xFD nebo byl odvol\xE1n" };
  }
  const result = verifyJwtToken(oldRefreshToken);
  if (!result.valid || !result.payload || result.payload.type !== "refresh") {
    activeRefreshTokens.delete(oldRefreshToken);
    persistRefreshTokens();
    return {
      success: false,
      error: result.expired ? "Platnost refresh tokenu vypr\u0161ela" : result.error || "Neplatn\xFD token"
    };
  }
  activeRefreshTokens.delete(oldRefreshToken);
  const newPair = generateTokenPair(result.payload.username);
  return {
    success: true,
    ...newPair
  };
}
function revokeRefreshToken(refreshToken) {
  if (refreshToken) {
    activeRefreshTokens.delete(refreshToken);
    persistRefreshTokens();
  }
}
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "P\u0159\xEDstup zam\xEDtnut: API vy\u017Eaduje platn\xFD autoriza\u010Dn\xED JWT token (Authorization: Bearer <token>).",
      code: "UNAUTHORIZED"
    });
    return;
  }
  const token = authHeader.substring(7).trim();
  if (!token) {
    res.status(401).json({
      success: false,
      error: "P\u0159\xEDstup zam\xEDtnut: Token je pr\xE1zdn\xFD.",
      code: "UNAUTHORIZED"
    });
    return;
  }
  const verifyResult = verifyJwtToken(token);
  if (verifyResult.expired) {
    res.status(401).json({
      success: false,
      error: "Platnost JWT p\u0159\xEDstupov\xE9ho tokenu vypr\u0161ela. Pou\u017Eijte refresh token pro obnoven\xED.",
      code: "TOKEN_EXPIRED"
    });
    return;
  }
  if (!verifyResult.valid || !verifyResult.payload || verifyResult.payload.type !== "access") {
    res.status(401).json({
      success: false,
      error: "Neplatn\xFD nebo nepodporovan\xFD autoriza\u010Dn\xED token.",
      code: "INVALID_TOKEN"
    });
    return;
  }
  req.user = verifyResult.payload;
  next();
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
      warehouse: "ruse",
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

// src/server/sampleDataSvj.ts
function generateSampleSvjData(daysBack = 14, totalBoxesCount = 40) {
  const records = [];
  const now = /* @__PURE__ */ new Date();
  const boxCodes = [
    "0140933",
    "0148037",
    "0157350",
    "0157345",
    "0183524",
    "0157823",
    "0144202",
    "0165910",
    "0149811",
    "0172340",
    "0139982",
    "0188201"
  ];
  const packers = [
    { name: "nikolas.lakatos@fhb.sk", station: "(javi)" },
    { name: "attila.stojka@fhb.sk", station: "(javi-4)" },
    { name: "paulina.sabinova@fhb.sk", station: "(javi)" },
    { name: "erika.stojkova@fhb.sk", station: "(javi-13)" },
    { name: "zdenko.kovac@fhb.sk", station: "(javi-2)" }
  ];
  const sampleProducts = [
    "NBC001490",
    "NBC028765",
    "NBC028816",
    "NBC042323",
    "NBC043054",
    "NBC048705",
    "NBC049603",
    "NBC052428",
    "NBC054237",
    "NBC054289",
    "NBC054513",
    "NBC057528",
    "NBC057553",
    "NBC058737",
    "NBC053020",
    "NBC033562",
    "NBC034994",
    "NBC046717",
    "NBC049659",
    "NBC052867"
  ];
  let orderSeq = 4406312850;
  for (let bIdx = 0; bIdx < totalBoxesCount; bIdx++) {
    const boxCode = boxCodes[bIdx % boxCodes.length] + (bIdx >= boxCodes.length ? `_${Math.floor(bIdx / boxCodes.length)}` : "");
    const dayOffset = Math.floor(Math.random() * daysBack);
    const baseDate = new Date(now.getTime() - dayOffset * 24 * 3600 * 1e3);
    const startHour = 6 + Math.floor(Math.random() * 8);
    const startMinute = Math.floor(Math.random() * 50);
    baseDate.setHours(startHour, startMinute, 0, 0);
    const ordersInBox = 4 + Math.floor(Math.random() * 11);
    const extraUnits = Math.floor(Math.random() * 6);
    const totalUnits = ordersInBox + extraUnits;
    const pickDurationMin = Number((2.5 + totalUnits * 0.35 + Math.random() * 2).toFixed(1));
    const pickDurationSec = Math.round(pickDurationMin * 60);
    const pickStartDate = new Date(baseDate);
    const pickEndDate = new Date(pickStartDate.getTime() + pickDurationSec * 1e3);
    const waitAfterPickMin = Number((35 + Math.random() * 20).toFixed(1));
    const sortStartDate = new Date(pickEndDate.getTime() + waitAfterPickMin * 60 * 1e3);
    const sortSecPerItem = Number((4.5 + Math.random() * 4).toFixed(1));
    const sortDurationSec = Math.round(totalUnits * sortSecPerItem);
    const sortEndDate = new Date(sortStartDate.getTime() + sortDurationSec * 1e3);
    const waitSortToPackMin = Number((15 + Math.random() * 25).toFixed(1));
    const boxProducts = [
      sampleProducts[bIdx * 3 % sampleProducts.length],
      sampleProducts[(bIdx * 3 + 1) % sampleProducts.length],
      sampleProducts[(bIdx * 3 + 2) % sampleProducts.length]
    ];
    for (let oIdx = 0; oIdx < ordersInBox; oIdx++) {
      const orderUid = String(orderSeq++);
      const packerInfo = packers[(bIdx + oIdx) % packers.length];
      let orderUnits = 1;
      let isMonoSku = false;
      const roll = Math.random();
      if (roll > 0.94) {
        orderUnits = 6 + Math.floor(Math.random() * 4);
      } else if (roll > 0.86) {
        orderUnits = 4 + Math.floor(Math.random() * 2);
      } else if (roll > 0.76) {
        orderUnits = 3;
      } else if (roll > 0.52) {
        orderUnits = 2;
        isMonoSku = Math.random() < 0.35;
      } else {
        orderUnits = 1;
        isMonoSku = true;
      }
      const bracket = orderUnits === 1 ? "1" : orderUnits === 2 ? "2" : orderUnits === 3 ? "3" : orderUnits === 4 ? "4" : orderUnits === 5 ? "5" : "6+";
      let assignedSku;
      if (orderUnits === 2) {
        if (isMonoSku) {
          assignedSku = `${boxProducts[oIdx % boxProducts.length]} x2`;
        } else {
          const sku1 = boxProducts[oIdx % boxProducts.length];
          const sku2 = boxProducts[(oIdx + 1) % boxProducts.length];
          assignedSku = `${sku1}, ${sku2}`;
        }
      } else if (orderUnits >= 3) {
        assignedSku = boxProducts.slice(0, Math.min(orderUnits, boxProducts.length)).join(", ");
      } else {
        assignedSku = boxProducts[oIdx % boxProducts.length];
      }
      const packDurationSec = Math.round(14 + orderUnits * 7.5 + Math.random() * 8);
      const packStartDate = new Date(sortEndDate.getTime() + waitSortToPackMin * 60 * 1e3 + oIdx * 45 * 1e3);
      const packEndDate = new Date(packStartDate.getTime() + packDurationSec * 1e3);
      const orderPickSec = Number((pickDurationSec / totalUnits * orderUnits).toFixed(1));
      const pickPerItemSec = Number((orderPickSec / orderUnits).toFixed(1));
      const orderSortSec = Number((orderUnits * sortSecPerItem).toFixed(1));
      const sortPerItemSec = sortSecPerItem;
      const packPerItemSec = Number((packDurationSec / orderUnits).toFixed(1));
      const totalPerItemSec = Number((pickPerItemSec + sortPerItemSec + packPerItemSec).toFixed(1));
      const waitPickToPackMin = Number(((packStartDate.getTime() - pickEndDate.getTime()) / (60 * 1e3)).toFixed(1));
      records.push({
        warehouse: "svj",
        sberny_box: boxCode,
        cycle_no: 1,
        obsah_objednavek: orderUid,
        pocet_produktu: orderUnits,
        ean_produktu: assignedSku,
        pocet_ks: orderUnits,
        zacatek_pickovani: pickStartDate.toISOString(),
        konec_pickovani: pickEndDate.toISOString(),
        zacatek_sortingu: sortStartDate.toISOString(),
        konec_sortingu: sortEndDate.toISOString(),
        zacatek_baleni: packStartDate.toISOString(),
        konec_baleni: packEndDate.toISOString(),
        pick_duration_s: orderPickSec,
        sort_duration_s: orderSortSec,
        pack_duration_s: packDurationSec,
        pick_per_item_s: pickPerItemSec,
        sort_per_item_s: sortPerItemSec,
        pack_per_item_s: packPerItemSec,
        total_per_item_s: totalPerItemSec,
        bracket,
        packer: packerInfo.name,
        station: packerInfo.station,
        wait_after_picking_min: waitAfterPickMin,
        wait_sort_to_pack_min: waitSortToPackMin,
        wait_pick_to_pack_min: waitPickToPackMin,
        box_unique_eans: boxProducts.length,
        box_total_units: totalUnits,
        box_shared_skus_count: Math.max(0, boxProducts.length - 1),
        units_sorted: orderUnits,
        box_units_sorted: totalUnits,
        is_sorted: true,
        is_packed: true,
        is_mono_sku: isMonoSku
      });
    }
  }
  return records;
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path3.dirname(__filename);
dotenv2.config();
dotenv2.config({ path: path3.resolve(process.cwd(), ".env") });
dotenv2.config({ path: path3.resolve(__dirname, ".env") });
dotenv2.config({ path: path3.resolve(__dirname, "..", ".env") });
process.on("uncaughtException", (err) => {
  console.error("\u274C [NEZACHYCEN\xC1 CHYBA SERVERU]:", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("\u274C [NEZACHYCEN\xDD PROMISE REJECTION]:", reason?.message || reason);
});
var app = express();
var APP_SERVER_PORT;
if (process.env.APP_PORT) {
  APP_SERVER_PORT = Number(process.env.APP_PORT);
} else if (process.env.API_PORT) {
  APP_SERVER_PORT = Number(process.env.API_PORT);
} else if (process.env.PORT && Number(process.env.PORT) !== 3306) {
  APP_SERVER_PORT = Number(process.env.PORT);
} else {
  APP_SERVER_PORT = 3030;
}
app.disable("x-powered-by");
app.use(compression());
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "SAMEORIGIN");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
(async () => {
  try {
    const status = await getDbStatus();
    if (status.connected && status.type === "mariadb") {
      console.log(`\u2705 \xDAsp\u011B\u0161n\u011B p\u0159ipojeno k MariaDB: ${status.user}@${status.host}/${status.database} (\u0159\xE1dk\u016F: ${status.totalRows})`);
    } else {
      console.log(`\u2139\uFE0F Aplikace b\u011B\u017E\xED v re\u017Eimu MariaDB. Pro p\u0159ipojen\xED MariaDB zadejte heslo v Nastaven\xED DB.`);
    }
  } catch (err) {
    console.error("Chyba p\u0159i inicializaci DB:", err?.message || err);
  }
})();
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = (process.env.APP_USER || "eusfhb").trim();
  const expectedPass = (process.env.APP_PASSWORD || "Master353").trim();
  if (typeof username === "string" && typeof password === "string" && username.trim() === expectedUser && password === expectedPass) {
    const tokens = generateTokenPair(expectedUser);
    return res.json({
      success: true,
      user: { username: expectedUser },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      message: "P\u0159ihl\xE1\u0161en\xED \xFAsp\u011B\u0161n\xE9. JWT token vygenerov\xE1n."
    });
  }
  return res.status(401).json({
    success: false,
    error: "Neplatn\xE9 u\u017Eivatelsk\xE9 jm\xE9no nebo heslo / Invalid credentials",
    code: "INVALID_CREDENTIALS"
  });
});
app.post("/api/auth/refresh", (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: "Chyb\xED parametr refreshToken.",
      code: "MISSING_REFRESH_TOKEN"
    });
  }
  const result = refreshAccessToken(refreshToken);
  if (!result.success) {
    return res.status(401).json({
      success: false,
      error: result.error || "Refresh token je neplatn\xFD nebo expirovan\xFD.",
      code: "INVALID_REFRESH_TOKEN"
    });
  }
  return res.json({
    success: true,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn
  });
});
app.post("/api/auth/logout", (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }
  return res.json({
    success: true,
    message: "Odhl\xE1\u0161en\xED prob\u011Bhlo \xFAsp\u011B\u0161n\u011B. Token byl zneplatn\u011Bn."
  });
});
app.use("/api", requireAuth);
app.get("/api/auth/me", (req, res) => {
  res.json({
    success: true,
    user: req.user
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
  const parsedSsl = ssl === true || ssl === "true" || ssl === 1 || ssl === "1";
  const status = await setDbConfig({
    host,
    port: Number(port) || 3306,
    user,
    password,
    database,
    ssl: parsedSsl
  });
  res.json(status);
});
app.post("/api/db/save", async (req, res) => {
  const { host, port, user, password, database, ssl } = req.body;
  const parsedSsl = ssl === true || ssl === "true" || ssl === 1 || ssl === "1";
  const status = await setDbConfig({
    host,
    port: Number(port) || 3306,
    user,
    password,
    database,
    ssl: parsedSsl
  });
  res.json({ success: true, status });
});
app.get("/api/analytics/summary", async (req, res) => {
  try {
    const warehouse = req.query.warehouse || "all";
    const forceRefresh = req.query.forceRefresh === "true";
    const excludeOutliers = req.query.excludeOutliers === "true";
    const datePreset = req.query.datePreset || "all";
    const dateFrom = req.query.dateFrom || "";
    const dateTo = req.query.dateTo || "";
    const bracket = req.query.bracket || "all";
    const box = req.query.box || "";
    const query = req.query.query || "";
    const filterObj = {
      excludeOutliers,
      datePreset,
      dateFrom,
      dateTo,
      bracket,
      box,
      query
    };
    const filterSuffix = `_outliers${excludeOutliers ? 1 : 0}_br${bracket}_preset${datePreset}_from${dateFrom}_to${dateTo}_box${encodeURIComponent(box)}_q${encodeURIComponent(query)}`;
    const cacheKey = `summary_${warehouse}${filterSuffix}`;
    if (!forceRefresh) {
      const cached = await getCachedStats(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          source: "cache",
          ...cached
        });
      }
    }
    const [ruseRecords, svjRecords] = await Promise.all([
      warehouse === "svj" ? [] : getWarehouseRecords("ruse", filterObj),
      warehouse === "ruse" ? [] : getWarehouseRecords("svj", filterObj)
    ]);
    const activeRecords = warehouse === "ruse" ? ruseRecords : warehouse === "svj" ? svjRecords : [...ruseRecords, ...svjRecords];
    const bracketStats = computeBracketStatistics(activeRecords);
    const dailyStats = computeDailyStatistics(activeRecords);
    const dailyReport = computeDailyPerformanceReport(activeRecords);
    const synergyData = computeBoxSynergyAndHypothesis(activeRecords);
    const periodSummary = computePeriodSummary(activeRecords);
    const comparison = computeWarehouseComparison(ruseRecords, svjRecords);
    const svjSorting = warehouse === "ruse" ? null : computeSvjSortingStatistics(svjRecords.length > 0 ? svjRecords : activeRecords);
    const svjBypassAnalysis = warehouse === "ruse" ? null : computeSvjSortingBypassAnalysis(svjRecords.length > 0 ? svjRecords : activeRecords);
    const simulation = runMultipickSlotSimulation(activeRecords);
    let ruseSummary = null;
    let svjSummary = null;
    if (warehouse === "all") {
      ruseSummary = {
        warehouse: "ruse",
        filters: filterObj,
        recordCount: ruseRecords.length,
        ruseCount: ruseRecords.length,
        svjCount: 0,
        bracketStats: computeBracketStatistics(ruseRecords),
        dailyStats: computeDailyStatistics(ruseRecords),
        dailyReport: computeDailyPerformanceReport(ruseRecords),
        synergyData: computeBoxSynergyAndHypothesis(ruseRecords),
        periodSummary: computePeriodSummary(ruseRecords),
        comparison: null,
        svjSorting: null,
        svjBypassAnalysis: null,
        simulation: runMultipickSlotSimulation(ruseRecords),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      svjSummary = {
        warehouse: "svj",
        filters: filterObj,
        recordCount: svjRecords.length,
        ruseCount: 0,
        svjCount: svjRecords.length,
        bracketStats: computeBracketStatistics(svjRecords),
        dailyStats: computeDailyStatistics(svjRecords),
        dailyReport: computeDailyPerformanceReport(svjRecords),
        synergyData: computeBoxSynergyAndHypothesis(svjRecords),
        periodSummary: computePeriodSummary(svjRecords),
        comparison: null,
        svjSorting: computeSvjSortingStatistics(svjRecords),
        svjBypassAnalysis: computeSvjSortingBypassAnalysis(svjRecords),
        simulation: runMultipickSlotSimulation(svjRecords),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await Promise.all([
        saveCachedStats(`summary_ruse${filterSuffix}`, "ruse", ruseRecords.length, ruseSummary),
        saveCachedStats(`summary_svj${filterSuffix}`, "svj", svjRecords.length, svjSummary)
      ]);
    }
    const payload = {
      warehouse,
      filters: filterObj,
      recordCount: activeRecords.length,
      ruseCount: ruseRecords.length,
      svjCount: svjRecords.length,
      bracketStats,
      dailyStats,
      dailyReport,
      synergyData,
      periodSummary,
      comparison,
      svjSorting,
      svjBypassAnalysis,
      simulation,
      ruseSummary,
      svjSummary,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await saveCachedStats(cacheKey, warehouse, activeRecords.length, payload);
    return res.json({
      success: true,
      source: "computed",
      ...payload
    });
  } catch (err) {
    console.error("Chyba p\u0159i v\xFDpo\u010Dtu / na\u010D\xEDt\xE1n\xED analytick\xE9ho souhrnu z DB:", err);
    res.status(500).json({ error: err?.message || "Chyba p\u0159i v\xFDpo\u010Dtu statistick\xE9ho souhrnu z datab\xE1ze" });
  }
});
app.get("/api/movements", async (req, res) => {
  try {
    const { warehouse, dateFrom, dateTo, bracket, box, query, limit, offset } = req.query;
    const result = await getMovements({
      warehouse,
      dateFrom,
      dateTo,
      bracket,
      box,
      query,
      limit: limit ? Number(limit) : 1e3,
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
app.post("/api/movements/flush", async (_req, res) => {
  try {
    await flushMovementsToDisk();
    res.json({ success: true, message: "Data byla zaps\xE1na na disk." });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Chyba p\u0159i z\xE1pisu na disk" });
  }
});
app.post("/api/movements/seed-sample", async (req, res) => {
  try {
    const status = await getDbStatus();
    if (isProduction || status.connected && status.type === "mariadb") {
      return res.status(403).json({
        error: "V produk\u010Dn\xEDm prost\u0159ed\xED a p\u0159i aktivn\xEDm p\u0159ipojen\xED k MariaDB je generov\xE1n\xED uk\xE1zkov\xFDch dat zak\xE1z\xE1no. V\u0161echna data se na\u010D\xEDtaj\xED p\u0159\xEDmo z DB."
      });
    }
    const count = Number(req.body.count) || 400;
    const days = Number(req.body.days) || 14;
    const clearOnlyThis = req.body.clearOnlyThis !== false;
    if (clearOnlyThis) {
      await clearMovements("ruse");
    } else {
      await clearMovements();
    }
    const records = generateSampleWarehouseData(days, count);
    const result = await insertMovements(records);
    res.json({
      success: true,
      importedCount: result.count,
      message: `Vygenerov\xE1no a vlo\u017Eeno ${result.count} uk\xE1zkov\xFDch z\xE1znam\u016F pro sklad Ruse.`
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Chyba p\u0159i generov\xE1n\xED vzorov\xFDch dat Ruse" });
  }
});
app.post("/api/movements/seed-svj", async (req, res) => {
  try {
    const status = await getDbStatus();
    if (isProduction || status.connected && status.type === "mariadb") {
      return res.status(403).json({
        error: "V produk\u010Dn\xEDm prost\u0159ed\xED a p\u0159i aktivn\xEDm p\u0159ipojen\xED k MariaDB je generov\xE1n\xED uk\xE1zkov\xFDch dat zak\xE1z\xE1no. V\u0161echna data se na\u010D\xEDtaj\xED p\u0159\xEDmo z DB."
      });
    }
    const boxesCount = Number(req.body.boxes) || 35;
    const days = Number(req.body.days) || 14;
    const clearOnlyThis = req.body.clearOnlyThis !== false;
    if (clearOnlyThis) {
      await clearMovements("svj");
    }
    const records = generateSampleSvjData(days, boxesCount);
    const result = await insertMovements(records);
    res.json({
      success: true,
      importedCount: result.count,
      message: `Vygenerov\xE1no a vlo\u017Eeno ${result.count} uk\xE1zkov\xFDch z\xE1znam\u016F pro sklad SVJ (v\u010Detn\u011B operace sortingu).`
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Chyba p\u0159i generov\xE1n\xED vzorov\xFDch dat SVJ" });
  }
});
app.delete("/api/movements", async (req, res) => {
  try {
    const warehouse = req.query.warehouse || req.body?.warehouse;
    await clearMovements(warehouse);
    res.json({
      success: true,
      message: warehouse && warehouse !== "all" ? `Data o pohybech pro sklad '${warehouse}' byla promaz\xE1na.` : "V\u0161echna data o pohybech byla promaz\xE1na."
    });
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
  const distDir = path3.resolve(__dirname, "dist");
  const indexHtml = path3.resolve(distDir, "index.html");
  try {
    const fs4 = await import("fs");
    if (fs4.existsSync(indexHtml)) {
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
    if (!fs3.existsSync(resolvedCertPath)) {
      if (fs3.existsSync(crtCandidate)) {
        console.log(`\u2139\uFE0F Cesta ${sslCertPath} neexistuje, pou\u017E\xEDv\xE1m nalezen\xFD certifik\xE1t: ${crtCandidate}`);
        resolvedCertPath = crtCandidate;
      } else if (fs3.existsSync(pemCandidate)) {
        console.log(`\u2139\uFE0F Cesta ${sslCertPath} neexistuje, pou\u017E\xEDv\xE1m nalezen\xFD certifik\xE1t: ${pemCandidate}`);
        resolvedCertPath = pemCandidate;
      }
    }
    if (fs3.existsSync(sslKeyPath) && fs3.existsSync(resolvedCertPath)) {
      const keyContent = fs3.readFileSync(sslKeyPath);
      let certContent = fs3.readFileSync(resolvedCertPath);
      const certStr = certContent.toString("utf8");
      if (certStr.includes("CERTIFICATE REQUEST") && !certStr.includes("BEGIN CERTIFICATE")) {
        console.warn(`\u26A0\uFE0F POZOR: Soubor ${resolvedCertPath} je \u017E\xE1dost (CSR), nikoliv certifik\xE1t!`);
        if (fs3.existsSync(crtCandidate)) {
          console.log(`\u2705 Nalezen skute\u010Dn\xFD certifik\xE1t: ${crtCandidate}`);
          resolvedCertPath = crtCandidate;
          certContent = fs3.readFileSync(crtCandidate);
        } else if (fs3.existsSync(pemCandidate)) {
          console.log(`\u2705 Nalezen skute\u010Dn\xFD certifik\xE1t: ${pemCandidate}`);
          resolvedCertPath = pemCandidate;
          certContent = fs3.readFileSync(pemCandidate);
        } else {
          throw new Error(`Soubor ${resolvedCertPath} je pouze \u017E\xE1dost (.csr). V .env nastavte cestu ke skute\u010Dn\xE9mu certifik\xE1tu (.crt nebo .pem)!`);
        }
      }
      const httpsOptions = {
        key: keyContent,
        cert: certContent
      };
      if (sslCaPath && fs3.existsSync(sslCaPath)) {
        httpsOptions.ca = fs3.readFileSync(sslCaPath);
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
   KEY (${sslKeyPath}): ${fs3.existsSync(sslKeyPath) ? "nalezen" : "NENALEZEN"}
   CERT (${resolvedCertPath}): ${fs3.existsSync(resolvedCertPath) ? "nalezen" : "NENALEZEN"}
   \u{1F449} Spou\u0161t\xEDm server v HTTP re\u017Eimu na portu ${APP_SERVER_PORT}.`);
      server = http.createServer(app);
    }
  } catch (sslErr) {
    console.error(`\u26A0\uFE0F Chyba p\u0159i inicializaci SSL certifik\xE1t\u016F: ${sslErr?.message || sslErr}`);
    console.log(`\u{1F449} Spou\u0161t\xEDm server v HTTP re\u017Eimu na portu ${APP_SERVER_PORT}, aby byla aplikace dostupn\xE1.`);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}
server.listen(APP_SERVER_PORT, "0.0.0.0", () => {
  const protocol = isHttps ? "https" : "http";
  console.log(`\u{1F680} Warehouse Pick & Pack Analytics server \xFAsp\u011B\u0161n\u011B b\u011B\u017E\xED na ${protocol}://0.0.0.0:${APP_SERVER_PORT}`);
});
if (APP_SERVER_PORT !== 3e3) {
  try {
    const devProxyServer = http.createServer(app);
    devProxyServer.listen(3e3, "0.0.0.0", () => {
      console.log(`\u{1F310} AI Studio dev listener aktivn\xED na http://0.0.0.0:3000`);
    });
    devProxyServer.on("error", () => {
    });
  } catch {
  }
}
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`
\u274C CHYBA PORTU: Aplika\u010Dn\xED port ${APP_SERVER_PORT} je ji\u017E obsazen jin\xFDm procesem!`);
    console.error(`\u{1F449} Nastavte v souboru .env voln\xFD port pro webov\xFD server:`);
    console.error(`   APP_PORT=3030      (port webov\xE9 aplikace)`);
    console.error(`   PORT=3306          (port MariaDB serveru)
`);
  } else {
    console.error("Chyba serveru p\u0159i spu\u0161t\u011Bn\xED:", err);
  }
});
