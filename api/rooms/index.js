const { createHash, randomBytes, randomUUID } = require('node:crypto')
const { TableClient } = require('@azure/data-tables')

const memoryRooms = new Map()
const memoryPairCodeToRoomId = new Map()
const pairCodeLifetimeMs = 10 * 60 * 1000
const roomLifetimeMs = 2 * 60 * 60 * 1000
const tableName = process.env.SHOWME_ROOM_TABLE_NAME || 'ShowMeRooms'
const tableConnectionString = process.env.SHOWME_ROOM_TABLE_CONNECTION || ''
const defaultRoomState = {
  text: '',
  fontSize: 120,
  fontFamily: 'Noto Sans SC',
  textColor: '#111827',
  isDarkMode: false,
  updatedAt: new Date(0).toISOString(),
}

let tableClientPromise

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

function roomToState(room) {
  return {
    text: room.text || '',
    fontSize: Number(room.fontSize || 120),
    fontFamily: room.fontFamily || 'Noto Sans SC',
    textColor: room.textColor || '#111827',
    isDarkMode: Boolean(room.isDarkMode),
    updatedAt: room.updatedAt || new Date(0).toISOString(),
  }
}

function stateToRoomFields(state) {
  return {
    text: state.text,
    fontSize: state.fontSize,
    fontFamily: state.fontFamily,
    textColor: state.textColor,
    isDarkMode: state.isDarkMode,
    updatedAt: state.updatedAt,
  }
}

function publicRoom(room) {
  return {
    roomId: room.roomId,
    pairCode: room.pairCode,
    pairCodeExpiresAt: room.pairCodeExpiresAt,
    roomExpiresAt: room.roomExpiresAt,
    state: roomToState(room),
  }
}

async function getTableClient() {
  if (!tableConnectionString) return undefined
  if (tableClientPromise) return tableClientPromise

  tableClientPromise = (async () => {
    const client = TableClient.fromConnectionString(tableConnectionString, tableName)

    try {
      await client.createTable()
    } catch (error) {
      if (error.statusCode !== 409) throw error
    }

    return client
  })()

  return tableClientPromise
}

function createPairCode(existingPairCode) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = String(Math.floor(100000 + Math.random() * 900000))

    if (!existingPairCode(code)) return code
  }

  throw new Error('Unable to allocate pair code')
}

function controllerConnected(room) {
  if (!room.controllerLastSeenAt) return false

  return Date.now() - Date.parse(room.controllerLastSeenAt) < 15_000
}

function getBearerToken(req) {
  const customToken = req.headers['x-showme-control-token'] || req.headers['X-ShowMe-Control-Token']

  if (typeof customToken === 'string') return customToken.trim()

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

async function createStorageRoom() {
  const client = await getTableClient()

  if (!client) return createMemoryRoom()

  const now = Date.now()
  const pairCode = createPairCode(() => false)
  const controlToken = randomBytes(24).toString('base64url')
  const state = {
    ...defaultRoomState,
    updatedAt: new Date(now).toISOString(),
  }
  const room = {
    partitionKey: 'room',
    rowKey: randomUUID(),
    roomId: '',
    pairCode,
    controlTokenHash: hashToken(controlToken),
    createdAt: new Date(now).toISOString(),
    pairCodeExpiresAt: new Date(now + pairCodeLifetimeMs).toISOString(),
    roomExpiresAt: new Date(now + roomLifetimeMs).toISOString(),
    displayLastSeenAt: new Date(now).toISOString(),
    ...stateToRoomFields(state),
  }
  room.roomId = room.rowKey

  await client.createEntity(room)

  return { room, controlToken }
}

async function getStorageRoom(roomId) {
  const client = await getTableClient()

  if (!client) return getMemoryRoom(roomId)

  try {
    const room = await client.getEntity('room', roomId)

    if (Date.parse(room.roomExpiresAt) <= Date.now()) {
      await client.deleteEntity('room', roomId).catch(() => {})
      return undefined
    }

    return room
  } catch (error) {
    if (error.statusCode === 404) return undefined
    throw error
  }
}

async function findStorageRoomByPairCode(pairCode) {
  const client = await getTableClient()

  if (!client) return findMemoryRoomByPairCode(pairCode)

  const filter = `PartitionKey eq 'room' and pairCode eq '${pairCode}'`

  for await (const room of client.listEntities({ queryOptions: { filter } })) {
    if (Date.parse(room.roomExpiresAt) <= Date.now()) {
      await client.deleteEntity('room', room.rowKey).catch(() => {})
      return undefined
    }

    if (Date.parse(room.pairCodeExpiresAt) <= Date.now()) return undefined

    return room
  }

  return undefined
}

async function saveStorageRoom(room) {
  const client = await getTableClient()

  if (!client) {
    saveMemoryRoom(room)
    return
  }

  await client.updateEntity(room, 'Replace')
}

function createMemoryRoom() {
  const now = Date.now()
  const roomId = randomUUID()
  const pairCode = createPairCode((code) => memoryPairCodeToRoomId.has(code))
  const controlToken = randomBytes(24).toString('base64url')
  const room = {
    roomId,
    rowKey: roomId,
    pairCode,
    controlTokenHash: hashToken(controlToken),
    createdAt: new Date(now).toISOString(),
    pairCodeExpiresAt: new Date(now + pairCodeLifetimeMs).toISOString(),
    roomExpiresAt: new Date(now + roomLifetimeMs).toISOString(),
    displayLastSeenAt: new Date(now).toISOString(),
    ...stateToRoomFields({
      ...defaultRoomState,
      updatedAt: new Date(now).toISOString(),
    }),
  }

  memoryRooms.set(roomId, room)
  memoryPairCodeToRoomId.set(pairCode, roomId)

  return { room, controlToken }
}

function getMemoryRoom(roomId) {
  const room = memoryRooms.get(roomId)

  if (!room) return undefined
  if (Date.parse(room.roomExpiresAt) <= Date.now()) {
    memoryRooms.delete(roomId)
    memoryPairCodeToRoomId.delete(room.pairCode)
    return undefined
  }

  return room
}

function findMemoryRoomByPairCode(pairCode) {
  const roomId = memoryPairCodeToRoomId.get(pairCode)
  const room = roomId ? getMemoryRoom(roomId) : undefined

  if (!room || Date.parse(room.pairCodeExpiresAt) <= Date.now()) return undefined

  return room
}

function saveMemoryRoom(room) {
  memoryRooms.set(room.roomId, room)
}

module.exports = async function roomsApi(context, req) {
  const method = req.method.toUpperCase()
  const segments = normalizeSegments(req)

  try {
    if (method === 'POST' && segments.length === 0) {
      const { room, controlToken } = await createStorageRoom()

      context.res = json(201, {
        ...publicRoom(room),
        controlToken,
      })
      return
    }

    if (method === 'POST' && segments.length === 1 && segments[0] === 'pair') {
      const pairCode = String(req.body?.pairCode ?? '').replace(/\D/g, '')
      const room = await findStorageRoomByPairCode(pairCode)

      if (!room) {
        context.res = json(404, { error: 'PAIR_CODE_NOT_FOUND' })
        return
      }

      const controlToken = randomBytes(24).toString('base64url')
      room.controlTokenHash = hashToken(controlToken)
      room.controllerLastSeenAt = new Date().toISOString()
      await saveStorageRoom(room)

      context.res = json(200, {
        roomId: room.roomId,
        controlToken,
        state: roomToState(room),
        roomExpiresAt: room.roomExpiresAt,
      })
      return
    }

    const roomId = segments[0]
    const room = roomId ? await getStorageRoom(roomId) : undefined

    if (!room) {
      context.res = json(404, { error: 'ROOM_NOT_FOUND' })
      return
    }

    if (method === 'GET' && segments.length === 1) {
      room.displayLastSeenAt = new Date().toISOString()
      await saveStorageRoom(room)

      context.res = json(200, {
        state: roomToState(room),
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
      Object.assign(room, stateToRoomFields({
        ...roomToState(room),
        ...patch,
        updatedAt,
      }))
      room.controllerLastSeenAt = updatedAt
      await saveStorageRoom(room)

      context.res = json(200, {
        state: roomToState(room),
        updatedAt,
      })
      return
    }

    context.res = json(405, { error: 'METHOD_NOT_ALLOWED' })
  } catch (error) {
    context.res = json(500, { error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' })
  }
}
