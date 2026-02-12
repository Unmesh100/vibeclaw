import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { randomBytes } from 'crypto';

const PORT = process.env.PORT || 8080;
const sessions = new Map();
const genId = () => randomBytes(4).toString('hex');

const httpServer = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/relay' && req.method === 'POST') {
    const id = genId();
    const token = randomBytes(16).toString('hex');
    sessions.set(id, { browser: null, external: null, token, created: Date.now() });
    const host = req.headers.host || `localhost:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id,
      token,
      url: `${proto}://${host}/relay/${id}?token=${token}`,
      connectUrl: `${proto}://${host}/relay/${id}/connect?token=${token}`,
    }));
    return;
  }

  if (url.pathname === '/api/relay' && req.method === 'GET') {
    const list = [];
    for (const [id, s] of sessions) {
      list.push({ id, created: s.created, browser: !!s.browser, external: !!s.external });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessions: list }));
    return;
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sessions: sessions.size }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('🦀 vibeclaw relay');
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const m = url.pathname.match(/^\/relay\/(\w+)(\/connect)?$/);
  if (!m) { ws.close(4000, 'Invalid path'); return; }

  const id = m[1];
  const isExternal = !!m[2];
  const session = sessions.get(id);
  if (!session) { ws.close(4001, 'Session not found'); return; }

  // Validate token
  const params = new URL(req.url, 'http://x').searchParams;
  if (params.get('token') !== session.token) { ws.close(4003, 'Invalid token'); return; }

  const role = isExternal ? 'external' : 'browser';
  const peer = isExternal ? 'browser' : 'external';

  session[role] = ws;
  console.log(`[${id}] ${role} connected`);

  // Notify peer
  const other = session[peer];
  if (other?.readyState === 1) {
    other.send(JSON.stringify({ type: 'relay', event: 'peer_connected', peer: role }));
  }

  ws.on('message', (data) => {
    const other = session[peer];
    if (other?.readyState === 1) other.send(data);
  });

  ws.on('close', () => {
    console.log(`[${id}] ${role} disconnected`);
    session[role] = null;
    const other = session[peer];
    if (other?.readyState === 1) {
      other.send(JSON.stringify({ type: 'relay', event: 'peer_disconnected', peer: role }));
    }
    // Cleanup if both gone
    if (!session.browser && !session.external) {
      sessions.delete(id);
    }
  });

  ws.on('error', () => { session[role] = null; });
});

// Cleanup stale sessions every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (!s.browser && !s.external && now - s.created > 600000) {
      sessions.delete(id);
    }
  }
}, 60000);

httpServer.listen(PORT, () => {
  console.log(`🦀 vibeclaw relay on :${PORT}`);
});
