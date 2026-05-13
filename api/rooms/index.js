const { createHash, randomBytes, randomUUID } = require('node:crypto')

const rooms = new Map()
const pairCodeToRoomId = new Map()
const pairCodeLifetimeMs = 10 * 60 * 1000
const roomLifetimeMs = 2 * 60 * 60 * 1000
const defaultRoomState = {
  text: '',
  fontSize: 120,
  fontFamily: 'Noto Sans SC',
  textColor: '#111827',
  isDarkMode: false,
  updatedAt: new Date(0).toISOString(),
}

function json(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body,
  }
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function createPairCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000))

    if (!pairCodeToRoomId.has(code)) return code
  }

  throw new Error('Unable to allocate pair code')
}

function cleanupExpiredRooms() {
  const now = Date.now()

  for (const [roomId, room] of rooms.entries()) {
    if (Date.parse(room.roomExpiresAt) <= now) {
      rooms.delete(roomId)
      pairCodeToRoomId.delete(room.pairCode)
    } else if (Date.parse(room.pairCodeExpiresAt) <= now) {
      pairCodeToRoomId.delete(room.pairCode)
    }
  }
}

function createRoom() {
  const now = Date.now()
  const roomId = randomUUID()
  const pairCode = createPairCode()
  const controlToken = randomBytes(24).toString('base64url')
  const room = {
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
  }

  rooms.set(roomId, room)
  pairCodeToRoomId.set(pairCode, roomId)

  return room
}

function controllerConnected(room) {
  if (!room.controllerLastSeenAt) return false

  return Date.now() - Date.parse(room.controllerLastSeenAt) < 15_000
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization

  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return ''

  return header.slice('Bearer '.length).trim()
}

function sanitizeStatePatch(payload) {
  if (!payload || typeof payload !== 'object') return {}

  const state = Object.hasOwn(payload, 'state') ? payload.state : payload

  if (!state || typeof state !== 'object') return {}

  const patch = {}

  if (typeof state.text === 'string') patch.text = state.text.slice(0, 5000)
  if (typeof state.fontSize === 'number') patch.fontSize = Math.min(220, Math.max(40, state.fontSize))
  if (typeof state.fontFamily === 'string') patch.fontFamily = state.fontFamily.slice(0, 80)
  if (typeof state.textColor === 'string') patch.textColor = state.textColor.slice(0, 32)
  if (typeof state.isDarkMode === 'boolean') patch.isDarkMode = state.isDarkMode

  return patch
}

function normalizeSegments(req) {
  const segments = req.params.segments

  if (!segments) return []

  return String(segments).split('/').filter(Boolean)
}

module.exports = async function roomsApi(context, req) {
  cleanupExpiredRooms()

  const method = req.method.toUpperCase()
  const segments = normalizeSegments(req)

  try {
    if (method === 'POST' && segments.length === 0) {
      const room = createRoom()

      context.res = json(201, {
        roomId: room.roomId,
        pairCode: room.pairCode,
        pairCodeExpiresAt: room.pairCodeExpiresAt,
        roomExpiresAt: room.roomExpiresAt,
        state: room.state,
      })
      return
    }

    if (method === 'POST' && segments.length === 1 && segments[0] === 'pair') {
      const pairCode = String(req.body?.pairCode ?? '').replace(/\D/g, '')
      const roomId = pairCodeToRoomId.get(pairCode)
      const room = roomId ? rooms.get(roomId) : undefined

      if (!room || Date.parse(room.pairCodeExpiresAt) <= Date.now()) {
        context.res = json(404, { error: 'PAIR_CODE_NOT_FOUND' })
        return
      }

      const controlToken = randomBytes(24).toString('base64url')
      room.controlTokenHash = hashToken(controlToken)
      room.controllerLastSeenAt = new Date().toISOString()

      context.res = json(200, {
        roomId: room.roomId,
        controlToken,
        state: room.state,
        roomExpiresAt: room.roomExpiresAt,
      })
      return
    }

    const roomId = segments[0]
    const room = roomId ? rooms.get(roomId) : undefined

    if (!room) {
      context.res = json(404, { error: 'ROOM_NOT_FOUND' })
      return
    }

    if (method === 'GET' && segments.length === 1) {
      room.displayLastSeenAt = new Date().toISOString()

      context.res = json(200, {
        state: room.state,
        roomExpiresAt: room.roomExpiresAt,
        pairCodeExpiresAt: room.pairCodeExpiresAt,
        controllerConnected: controllerConnected(room),
      })
      return
    }

    if (method === 'PATCH' && segments.length === 1) {
      const token = getBearerToken(req)

      if (!token || hashToken(token) !== room.controlTokenHash) {
        context.res = json(401, { error: 'UNAUTHORIZED' })
        return
      }

      const patch = sanitizeStatePatch(req.body)
      const updatedAt = new Date().toISOString()
      room.state = {
        ...room.state,
        ...patch,
        updatedAt,
      }
      room.controllerLastSeenAt = updatedAt

      context.res = json(200, {
        state: room.state,
        updatedAt,
      })
      return
    }

    context.res = json(405, { error: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    context.res = json(500, { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' })
  }
}
