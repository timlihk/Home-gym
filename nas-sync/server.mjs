import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const PORT = Number(process.env.PORT || 4318);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_FILE = process.env.DATA_FILE || join(homedir(), 'gym-sync', 'state.json');
const STATIC_FILE = process.env.STATIC_FILE || join(dirname(DATA_FILE), 'index.html');
const BACKUP_FILE = `${DATA_FILE}.bak`;
const ALLOWED_ORIGINS = [
  /^https:\/\/gym\.mangrove-hk\.org$/,
  /^https:\/\/[a-z0-9-]+\.gym-dashboard-es4\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.pages\.dev$/,
];

async function ensureDir() {
  await mkdir(dirname(DATA_FILE), { recursive: true });
}

function originAllowed(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
}

function writeJson(res, status, body, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  };
  if (originAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Vary'] = 'Origin';
    headers['Access-Control-Allow-Methods'] = 'GET, PUT, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function writeStatic(res, status = 200) {
  const html = await readFile(STATIC_FILE, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=0, must-revalidate',
  });
  res.end(html);
}

async function readState() {
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function writeState(state) {
  await ensureDir();
  const next = {
    state,
    savedAt: new Date().toISOString(),
  };
  const tmpFile = `${DATA_FILE}.tmp`;
  await writeFile(tmpFile, JSON.stringify(next, null, 2), 'utf8');
  await rename(tmpFile, DATA_FILE);
  await copyFile(DATA_FILE, BACKUP_FILE);
  return next;
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || '';
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    if (!originAllowed(origin)) {
      writeJson(res, 403, { error: 'Origin not allowed' }, origin);
      return;
    }
    writeJson(res, 204, {}, origin);
    return;
  }

  if (url.pathname === '/health') {
    writeJson(res, 200, { ok: true }, origin);
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && (url.pathname === '/' || url.pathname === '/index.html')) {
    try {
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=0, must-revalidate',
        });
        res.end();
      } else {
        await writeStatic(res);
      }
    } catch (err) {
      writeJson(res, 500, { error: err.message || 'Static file unavailable' }, origin);
    }
    return;
  }

  if (url.pathname !== '/api/state') {
    writeJson(res, 404, { error: 'Not found' }, origin);
    return;
  }

  if (!originAllowed(origin)) {
    writeJson(res, 403, { error: 'Origin not allowed' }, origin);
    return;
  }

  try {
    if (req.method === 'GET') {
      const current = await readState();
      writeJson(res, 200, current || { state: null, savedAt: null }, origin);
      return;
    }

    if (req.method === 'PUT') {
      const raw = await collectBody(req);
      const payload = JSON.parse(raw || '{}');
      if (!payload || typeof payload !== 'object' || !payload.state || typeof payload.state !== 'object') {
        writeJson(res, 400, { error: 'Missing state payload' }, origin);
        return;
      }
      const saved = await writeState(payload.state);
      writeJson(res, 200, saved, origin);
      return;
    }

    writeJson(res, 405, { error: 'Method not allowed' }, origin);
  } catch (err) {
    writeJson(res, 500, { error: err.message || 'Server error' }, origin);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Gym sync listening on http://${HOST}:${PORT}`);
});
