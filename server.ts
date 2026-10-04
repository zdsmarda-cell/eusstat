import express from 'express';
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  getDbConfig,
  setDbConfig,
  getDbStatus,
  testConnection,
  insertMovements,
  getMovements,
  clearMovements,
} from './src/server/db.js';
import { generateSampleWarehouseData } from './src/server/sampleData.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.API_PORT || process.env.APP_PORT || process.env.PORT) || 3000;

// CORS middleware allowing cross-origin requests (e.g. from port 443 to port 3030)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initial database connection check and schema verification
(async () => {
  try {
    const status = await getDbStatus();
    if (status.connected && status.type === 'mariadb') {
      console.log(`✅ Úspěšně připojeno k MariaDB: ${status.user}@${status.host}/${status.database} (řádků: ${status.totalRows})`);
    } else {
      console.log(`ℹ️ Aplikace běží v lokálním režimu (paměť). Pro připojení MariaDB nastavte DB_HOST, DB_USER, DB_PASSWORD, DB_NAME v .env.`);
    }

    if (process.env.NODE_ENV !== 'production' && !process.env.DB_HOST && !process.env.MARIADB_HOST && status.totalRows === 0) {
      console.log('Generuji ukázková data skladu pro vývojové prostředí...');
      const samples = generateSampleWarehouseData(14, 380);
      await insertMovements(samples);
    }
  } catch (err: any) {
    console.error('Chyba při inicializaci DB:', err?.message || err);
  }
})();

// Authentication Endpoint (Hardcoded credentials requirement: eusfhb / Master353)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'eusfhb' && password === 'Master353') {
    return res.json({
      success: true,
      user: { username: 'eusfhb' },
      token: 'authenticated_eusfhb_353',
    });
  }
  return res.status(401).json({
    success: false,
    error: 'Neplatné přihlašovací údaje / Invalid credentials',
  });
});

// DB Settings Endpoints
app.get('/api/db/config', (req, res) => {
  res.json(getDbConfig());
});

app.get('/api/db/status', async (req, res) => {
  const status = await getDbStatus();
  res.json(status);
});

app.post('/api/db/test', async (req, res) => {
  const { host, port, user, password, database, ssl } = req.body;
  const status = await setDbConfig({
    host,
    port: Number(port) || 3306,
    user,
    password,
    database,
    ssl: Boolean(ssl),
  });
  res.json(status);
});

app.post('/api/db/save', async (req, res) => {
  const { host, port, user, password, database, ssl } = req.body;
  const status = await setDbConfig({
    host,
    port: Number(port) || 3306,
    user,
    password,
    database,
    ssl: Boolean(ssl),
  });
  res.json({ success: true, status });
});

// Movements Endpoints
app.get('/api/movements', async (req, res) => {
  try {
    const { dateFrom, dateTo, bracket, box, query, limit, offset } = req.query;
    const result = await getMovements({
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      bracket: bracket as string,
      box: box as string,
      query: query as string,
      limit: limit ? Number(limit) : 500000,
      offset: offset ? Number(offset) : 0,
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Chyba při načítání dat' });
  }
});

app.post('/api/movements/import', async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'Nebyly poskytnuty žádné záznamy k importu.' });
    }

    const result = await insertMovements(records);
    res.json({
      success: true,
      importedCount: result.count,
      destination: result.destination,
      message: `Úspěšně importováno ${result.count} záznamů (${result.destination === 'mariadb' ? 'MariaDB databáze' : 'lokální paměť'}).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Chyba při ukládání záznamů' });
  }
});

app.post('/api/movements/seed-sample', async (req, res) => {
  try {
    const count = Number(req.body.count) || 400;
    const days = Number(req.body.days) || 14;
    await clearMovements();
    const records = generateSampleWarehouseData(days, count);
    const result = await insertMovements(records);
    res.json({
      success: true,
      importedCount: result.count,
      message: `Vygenerováno a vloženo ${result.count} ukázkových záznamů za ${days} dní.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Chyba při generování vzorových dat' });
  }
});

app.delete('/api/movements', async (req, res) => {
  try {
    await clearMovements();
    res.json({ success: true, message: 'Všechna data o pohybech byla promazána.' });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Chyba při mazání dat' });
  }
});

// Guard: API routes must NEVER fall through to Vite HTML middleware
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint '${req.method} ${req.originalUrl}' nenalezen.` });
});

// Global API error handler
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({ error: err?.message || 'Interní chyba serveru' });
});

// Vite or Static file serving
const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
  const { createServer } = await import('vite');
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);
} else {
  const distDir = path.resolve(__dirname, 'dist');
  const indexHtml = path.resolve(distDir, 'index.html');
  
  // If frontend dist files are present, serve them
  try {
    const fs = await import('fs');
    if (fs.existsSync(indexHtml)) {
      app.use(express.static(distDir));
      app.get('*', (req, res) => {
        res.sendFile(indexHtml);
      });
    } else {
      // Standalone backend mode (e.g. when frontend is served directly by Nginx)
      app.get('/', (req, res) => {
        res.json({
          status: 'ok',
          service: 'Warehouse Pick & Pack Analytics Backend API',
          version: '1.0.0',
        });
      });
    }
  } catch {
    // Fallback if fs check fails
    app.get('/', (req, res) => {
      res.json({ status: 'ok', service: 'Warehouse Analytics API' });
    });
  }
}

// HTTPS / SSL configuration from .env
const sslKeyPath = process.env.SSL_KEY_PATH;
let sslCertPath = process.env.SSL_CERT_PATH || process.env.SSL_CRT_PATH;
const sslCaPath = process.env.SSL_CA_PATH || process.env.SSL_CHAIN_PATH;

let server: http.Server | https.Server;
let isHttps = false;

if (sslKeyPath && sslCertPath) {
  try {
    // Check if .csr was specified but a .crt file exists alongside it
    if (!fs.existsSync(sslCertPath) && sslCertPath.endsWith('.csr')) {
      const crtCandidate = sslCertPath.replace(/\.csr$/, '.crt');
      if (fs.existsSync(crtCandidate)) {
        console.log(`ℹ️ Používám nalezený certifikát: ${crtCandidate}`);
        sslCertPath = crtCandidate;
      }
    }

    if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
      const keyContent = fs.readFileSync(sslKeyPath);
      const certContent = fs.readFileSync(sslCertPath);

      const httpsOptions: https.ServerOptions = {
        key: keyContent,
        cert: certContent,
      };

      if (sslCaPath && fs.existsSync(sslCaPath)) {
        httpsOptions.ca = fs.readFileSync(sslCaPath);
      }

      server = https.createServer(httpsOptions, app);
      isHttps = true;
      console.log(`🔒 SSL certifikáty aktivovány:\n   KEY:  ${sslKeyPath}\n   CERT: ${sslCertPath}`);
    } else {
      console.warn(`⚠️ SSL soubory nenalezeny:\n   KEY (${sslKeyPath}): ${fs.existsSync(sslKeyPath) ? 'nalezen' : 'NENALEZEN'}\n   CERT (${sslCertPath}): ${fs.existsSync(sslCertPath) ? 'nalezen' : 'NENALEZEN'}\n   Spouštím v HTTP režimu.`);
      server = http.createServer(app);
    }
  } catch (sslErr: any) {
    console.error(`⚠️ Chyba při inicializaci SSL certifikátů (${sslErr?.message || sslErr}). Spouštím v HTTP režimu.`);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

server.listen(PORT, '0.0.0.0', () => {
  const protocol = isHttps ? 'https' : 'http';
  console.log(`🚀 Warehouse Pick & Pack Analytics server běží na ${protocol}://0.0.0.0:${PORT}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ CHYBA PORTU: Port ${PORT} je již obsazen jiným procesem (např. lokálním MySQL/MariaDB serverem nebo jinou aplikací)!`);
    console.error(`👉 Řešení pro produkci v souboru .env:`);
    console.error(`   PORT=3000          (port webové aplikace pro Nginx proxy_pass)`);
    console.error(`   DB_PORT=3306       (port vzdálené MariaDB/MySQL databáze)`);
    console.error(`   DB_HOST=db.mobilgroup.cz\n`);
  } else {
    console.error('Chyba serveru při spuštění:', err);
  }
});
