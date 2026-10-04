import express from 'express';
import http from 'http';
import https from 'https';
import tls from 'tls';
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
import {
  requireAuth,
  generateTokenPair,
  refreshAccessToken,
  revokeRefreshToken,
} from './src/server/auth.js';
import { generateSampleWarehouseData } from './src/server/sampleData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Načtení .env ze všech možných umístění (kořen projektu, aktuální cwd, nadřazený adresář dist)
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// Globální zachycení chyb, aby server nikdy tiše nespadl
process.on('uncaughtException', (err: any) => {
  console.error('❌ [NEZACHYCENÁ CHYBA SERVERU]:', err?.message || err);
});
process.on('unhandledRejection', (reason: any) => {
  console.error('❌ [NEZACHYCENÝ PROMISE REJECTION]:', reason?.message || reason);
});

const app = express();
// Web application server port:
// APP_PORT is the server port for Express (e.g. 3030 in production).
// Note: PORT in .env points to MariaDB (port 3306). Never bind Express to port 3306!
let APP_SERVER_PORT: number;
if (process.env.APP_PORT) {
  APP_SERVER_PORT = Number(process.env.APP_PORT);
} else if (process.env.API_PORT) {
  APP_SERVER_PORT = Number(process.env.API_PORT);
} else if (process.env.PORT && Number(process.env.PORT) !== 3306) {
  APP_SERVER_PORT = Number(process.env.PORT);
} else {
  APP_SERVER_PORT = 3030;
}

app.disable('x-powered-by');

// Security & CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('X-Frame-Options', 'SAMEORIGIN');
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
      console.log(`ℹ️ Aplikace běží v lokálním diskovém režimu. Pro připojení MariaDB zadejte heslo v Nastavení DB.`);
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

// =========================================================================
// PUBLIC AUTH ENDPOINTS (Accessible without JWT)
// =========================================================================

// POST /api/auth/login: Authenticates credentials & issues JWT Access + Refresh token pair
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = (process.env.APP_USER || 'eusfhb').trim();
  const expectedPass = (process.env.APP_PASSWORD || 'Master353').trim();

  if (typeof username === 'string' && typeof password === 'string' &&
      username.trim() === expectedUser && password === expectedPass) {
    const tokens = generateTokenPair(expectedUser);
    return res.json({
      success: true,
      user: { username: expectedUser },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      message: 'Přihlášení úspěšné. JWT token vygenerován.',
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Neplatné uživatelské jméno nebo heslo / Invalid credentials',
    code: 'INVALID_CREDENTIALS',
  });
});

// POST /api/auth/refresh: Validates Refresh Token and issues a new Token Pair
app.post('/api/auth/refresh', (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'Chybí parametr refreshToken.',
      code: 'MISSING_REFRESH_TOKEN',
    });
  }

  const result = refreshAccessToken(refreshToken);
  if (!result.success) {
    return res.status(401).json({
      success: false,
      error: result.error || 'Refresh token je neplatný nebo expirovaný.',
      code: 'INVALID_REFRESH_TOKEN',
    });
  }

  return res.json({
    success: true,
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  });
});

// POST /api/auth/logout: Revokes the Refresh Token
app.post('/api/auth/logout', (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    revokeRefreshToken(refreshToken);
  }
  return res.json({
    success: true,
    message: 'Odhlášení proběhlo úspěšně. Token byl zneplatněn.',
  });
});

// =========================================================================
// STRICT SECURITY SHIELD: ALL SUBSEQUENT /api ROUTES REQUIRE VALID JWT
// Internet users without a valid JWT token cannot access or see any data
// =========================================================================
app.use('/api', requireAuth);

// GET /api/auth/me: Returns current authenticated user info
app.get('/api/auth/me', (req, res) => {
  res.json({
    success: true,
    user: (req as any).user,
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
    // 1. Kontrola existence souborů
    let resolvedCertPath = sslCertPath;

    // Pokud je zadána cesta .csr a soubor neexistuje, nebo pokud chceme preferovat skutečný certifikát .crt
    const crtCandidate = sslCertPath.replace(/\.csr$/, '.crt');
    const pemCandidate = sslCertPath.replace(/\.csr$/, '.pem');

    if (!fs.existsSync(resolvedCertPath)) {
      if (fs.existsSync(crtCandidate)) {
        console.log(`ℹ️ Cesta ${sslCertPath} neexistuje, používám nalezený certifikát: ${crtCandidate}`);
        resolvedCertPath = crtCandidate;
      } else if (fs.existsSync(pemCandidate)) {
        console.log(`ℹ️ Cesta ${sslCertPath} neexistuje, používám nalezený certifikát: ${pemCandidate}`);
        resolvedCertPath = pemCandidate;
      }
    }

    if (fs.existsSync(sslKeyPath) && fs.existsSync(resolvedCertPath)) {
      const keyContent = fs.readFileSync(sslKeyPath);
      let certContent = fs.readFileSync(resolvedCertPath);

      // 2. Kontrola, zda soubor není pouze CSR (žádost o podpis), která by shodila TLS stack
      const certStr = certContent.toString('utf8');
      if (certStr.includes('CERTIFICATE REQUEST') && !certStr.includes('BEGIN CERTIFICATE')) {
        console.warn(`⚠️ POZOR: Soubor ${resolvedCertPath} je žádost (CSR), nikoliv certifikát!`);
        if (fs.existsSync(crtCandidate)) {
          console.log(`✅ Nalezen skutečný certifikát: ${crtCandidate}`);
          resolvedCertPath = crtCandidate;
          certContent = fs.readFileSync(crtCandidate);
        } else if (fs.existsSync(pemCandidate)) {
          console.log(`✅ Nalezen skutečný certifikát: ${pemCandidate}`);
          resolvedCertPath = pemCandidate;
          certContent = fs.readFileSync(pemCandidate);
        } else {
          throw new Error(`Soubor ${resolvedCertPath} je pouze žádost (.csr). V .env nastavte cestu ke skutečnému certifikátu (.crt nebo .pem)!`);
        }
      }

      const httpsOptions: https.ServerOptions = {
        key: keyContent,
        cert: certContent,
      };

      if (sslCaPath && fs.existsSync(sslCaPath)) {
        httpsOptions.ca = fs.readFileSync(sslCaPath);
      }

      // 3. Validace TLS kontextu před spuštěním, aby server nikdy nespadl s uncaught výjimkou
      tls.createSecureContext({
        key: keyContent,
        cert: certContent,
        ca: httpsOptions.ca,
      });

      server = https.createServer(httpsOptions, app);
      isHttps = true;
      console.log(`🔒 SSL certifikáty aktivovány:\n   KEY:  ${sslKeyPath}\n   CERT: ${resolvedCertPath}`);
    } else {
      console.warn(`⚠️ SSL soubory nenalezeny:\n   KEY (${sslKeyPath}): ${fs.existsSync(sslKeyPath) ? 'nalezen' : 'NENALEZEN'}\n   CERT (${resolvedCertPath}): ${fs.existsSync(resolvedCertPath) ? 'nalezen' : 'NENALEZEN'}\n   👉 Spouštím server v HTTP režimu na portu ${APP_SERVER_PORT}.`);
      server = http.createServer(app);
    }
  } catch (sslErr: any) {
    console.error(`⚠️ Chyba při inicializaci SSL certifikátů: ${sslErr?.message || sslErr}`);
    console.log(`👉 Spouštím server v HTTP režimu na portu ${APP_SERVER_PORT}, aby byla aplikace dostupná.`);
    server = http.createServer(app);
  }
} else {
  server = http.createServer(app);
}

server.listen(APP_SERVER_PORT, '0.0.0.0', () => {
  const protocol = isHttps ? 'https' : 'http';
  console.log(`🚀 Warehouse Pick & Pack Analytics server úspěšně běží na ${protocol}://0.0.0.0:${APP_SERVER_PORT}`);
});

// Pokud je APP_SERVER_PORT jiný než 3000 (např. 3030 na produkci), spustíme též listener na portu 3000 pro AI Studio iframe náhled
if (APP_SERVER_PORT !== 3000) {
  try {
    const devProxyServer = http.createServer(app);
    devProxyServer.listen(3000, '0.0.0.0', () => {
      console.log(`🌐 AI Studio dev listener aktivní na http://0.0.0.0:3000`);
    });
    devProxyServer.on('error', () => {
      // Ignorovat, pokud je port 3000 obsazen nebo nedostupný
    });
  } catch {
    // ignore
  }
}

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ CHYBA PORTU: Aplikační port ${APP_SERVER_PORT} je již obsazen jiným procesem!`);
    console.error(`👉 Nastavte v souboru .env volný port pro webový server:`);
    console.error(`   APP_PORT=3030      (port webové aplikace)`);
    console.error(`   PORT=3306          (port MariaDB serveru)\n`);
  } else {
    console.error('Chyba serveru při spuštění:', err);
  }
});
