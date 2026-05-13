import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type RoomState = {
  text: string;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  isDarkMode: boolean;
  updatedAt: string;
};

type Room = {
  roomId: string;
  pairCode: string;
  controlTokenHash: string;
  state: RoomState;
  createdAt: string;
  pairCodeExpiresAt: string;
  roomExpiresAt: string;
  displayLastSeenAt: string;
  controllerLastSeenAt?: string;
};

const rooms = new Map<string, Room>();
const pairCodeToRoomId = new Map<string, string>();
const pairCodeLifetimeMs = 10 * 60 * 1000;
const roomLifetimeMs = 2 * 60 * 60 * 1000;
const defaultRoomState: RoomState = {
  text: '',
  fontSize: 120,
  fontFamily: 'Noto Sans SC',
  textColor: '#111827',
  isDarkMode: false,
  updatedAt: new Date(0).toISOString(),
};

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let data = '';

    req.on('data', (chunk: Buffer) => {
      data += chunk.toString('utf8');

      if (data.length > 64_000) {
        reject(new Error('Request body is too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (data.trim().length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function createPairCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000));

    if (!pairCodeToRoomId.has(code)) {
      return code;
    }
  }

  throw new Error('Unable to allocate pair code');
}

function cleanupExpiredRooms() {
  const now = Date.now();

  for (const [roomId, room] of rooms.entries()) {
    if (Date.parse(room.roomExpiresAt) <= now) {
      rooms.delete(roomId);
      pairCodeToRoomId.delete(room.pairCode);
    } else if (Date.parse(room.pairCodeExpiresAt) <= now) {
      pairCodeToRoomId.delete(room.pairCode);
    }
  }
}

function createRoom() {
  const now = Date.now();
  const roomId = randomUUID();
  const pairCode = createPairCode();
  const controlToken = randomBytes(24).toString('base64url');
  const room: Room = {
    roomId,
    pairCode,
    controlTokenHash: hashToken(controlToken),
    state: {
      ...defaultRoomState,
      updatedAt: new Date(now).toISOString(),
    },
    createdAt: new Date(now).toISOString(),
    pairCodeExpiresAt: new Date(now + pairCodeLifetimeMs).toISOString(),
    roomExpiresAt: new Date(now + roomLifetimeMs).toISOString(),
    displayLastSeenAt: new Date(now).toISOString(),
  };

  rooms.set(roomId, room);
  pairCodeToRoomId.set(pairCode, roomId);

  return { room, controlToken };
}

function getControllerConnected(room: Room) {
  if (!room.controllerLastSeenAt) return false;

  return Date.now() - Date.parse(room.controllerLastSeenAt) < 15_000;
}

function getBearerToken(req: IncomingMessage) {
  const customToken = req.headers['x-showme-control-token'];

  if (typeof customToken === 'string') return customToken.trim();

  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) return '';

  return header.slice('Bearer '.length).trim();
}

function sanitizeStatePatch(payload: unknown): Partial<RoomState> {
  if (!payload || typeof payload !== 'object') return {};

  const state = 'state' in payload ? (payload as { state?: unknown }).state : payload;

  if (!state || typeof state !== 'object') return {};

  const source = state as Partial<RoomState>;
  const patch: Partial<RoomState> = {};

  if (typeof source.text === 'string') patch.text = source.text.slice(0, 5000);
  if (typeof source.fontSize === 'number') patch.fontSize = Math.min(220, Math.max(40, source.fontSize));
  if (typeof source.fontFamily === 'string') patch.fontFamily = source.fontFamily.slice(0, 80);
  if (typeof source.textColor === 'string') patch.textColor = source.textColor.slice(0, 32);
  if (typeof source.isDarkMode === 'boolean') patch.isDarkMode = source.isDarkMode;

  return patch;
}

async function handleRoomsApi(req: IncomingMessage, res: ServerResponse, next: () => void) {
  if (!req.url?.startsWith('/api/rooms')) {
    next();
    return;
  }

  cleanupExpiredRooms();

  const url = new URL(req.url, 'http://localhost');
  const pathParts = url.pathname.split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  try {
    if (method === 'POST' && url.pathname === '/api/rooms') {
      const { room, controlToken } = createRoom();

      sendJson(res, 201, {
        roomId: room.roomId,
        controlToken,
        pairCode: room.pairCode,
        pairCodeExpiresAt: room.pairCodeExpiresAt,
        roomExpiresAt: room.roomExpiresAt,
        state: room.state,
      });
      return;
    }

    if (method === 'POST' && url.pathname === '/api/rooms/pair') {
      const body = await readBody(req);
      const pairCode = String((body as { pairCode?: unknown }).pairCode ?? '').replace(/\D/g, '');
      const roomId = pairCodeToRoomId.get(pairCode);
      const room = roomId ? rooms.get(roomId) : undefined;

      if (!room || Date.parse(room.pairCodeExpiresAt) <= Date.now()) {
        sendJson(res, 404, { error: 'PAIR_CODE_NOT_FOUND' });
        return;
      }

      const controlToken = randomBytes(24).toString('base64url');
      room.controlTokenHash = hashToken(controlToken);
      room.controllerLastSeenAt = new Date().toISOString();

      sendJson(res, 200, {
        roomId: room.roomId,
        controlToken,
        state: room.state,
        roomExpiresAt: room.roomExpiresAt,
      });
      return;
    }

    const roomId = pathParts[2];
    const room = roomId ? rooms.get(roomId) : undefined;

    if (!room) {
      sendJson(res, 404, { error: 'ROOM_NOT_FOUND' });
      return;
    }

    if (method === 'GET' && pathParts.length === 3) {
      room.displayLastSeenAt = new Date().toISOString();

      sendJson(res, 200, {
        state: room.state,
        roomExpiresAt: room.roomExpiresAt,
        pairCodeExpiresAt: room.pairCodeExpiresAt,
        controllerConnected: getControllerConnected(room),
      });
      return;
    }

    if (method === 'PATCH' && pathParts.length === 3) {
      const token = getBearerToken(req);

      if (!token || hashToken(token) !== room.controlTokenHash) {
        sendJson(res, 401, { error: 'UNAUTHORIZED' });
        return;
      }

      const patch = sanitizeStatePatch(await readBody(req));
      const updatedAt = new Date().toISOString();
      room.state = {
        ...room.state,
        ...patch,
        updatedAt,
      };
      room.controllerLastSeenAt = updatedAt;

      sendJson(res, 200, {
        state: room.state,
        updatedAt,
      });
      return;
    }

    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' });
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'showme-rooms-api',
      configureServer(server) {
        server.middlewares.use(handleRoomsApi);
      },
      configurePreviewServer(server) {
        server.middlewares.use(handleRoomsApi);
      },
    },
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    }
  },
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
    },
  },
});
