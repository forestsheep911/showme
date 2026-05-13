import { useEffect, useRef, useState } from 'react'
import '@/App.css'

type FontSizeLevel = {
  label: string
  size: number
}

type FontOption = {
  label: string
  value: string
}

type ColorOption = {
  label: string
  value: string
}

type RoomState = {
  text: string
  fontSize: number
  fontFamily: string
  textColor: string
  isDarkMode: boolean
  updatedAt: string
}

type Route =
  | { view: 'local' }
  | { view: 'display' }
  | { view: 'controlPair' }
  | { view: 'controlRoom'; roomId: string }

const fontSizeLevels: FontSizeLevel[] = [
  { label: '特大', size: 200 },
  { label: '大', size: 160 },
  { label: '中', size: 120 },
  { label: '小', size: 80 },
  { label: '特小', size: 48 },
]

const fontFamilyOptions: FontOption[] = [
  { label: '思源黑体', value: 'Noto Sans SC' },
  { label: '思源宋体', value: 'Noto Serif SC' },
  { label: '日文字体', value: 'Noto Sans JP' },
  { label: '韩文字体', value: 'Noto Sans KR' },
  { label: '繁体中文', value: 'Noto Sans TC' },
]

const lightModeColors: ColorOption[] = [
  { label: '黑色', value: '#111827' },
  { label: '深蓝', value: '#1d4ed8' },
  { label: '玫红', value: '#be123c' },
  { label: '翠绿', value: '#047857' },
  { label: '紫色', value: '#6d28d9' },
  { label: '橙色', value: '#c2410c' },
  { label: '天蓝', value: '#0369a1' },
  { label: '玫瑰', value: '#be185d' },
]

const darkModeColors: ColorOption[] = [
  { label: '白色', value: '#f8fafc' },
  { label: '浅蓝', value: '#93c5fd' },
  { label: '粉红', value: '#fda4af' },
  { label: '薄荷', value: '#6ee7b7' },
  { label: '淡紫', value: '#c4b5fd' },
  { label: '杏色', value: '#fdba74' },
  { label: '天青', value: '#7dd3fc' },
  { label: '浅玫瑰', value: '#fecdd3' },
]

const placeholderText = '输入要给孩子看的字、词或短文'
const defaultState: RoomState = {
  text: '',
  fontSize: 120,
  fontFamily: 'Noto Sans SC',
  textColor: '#111827',
  isDarkMode: false,
  updatedAt: new Date(0).toISOString(),
}

function parseRoute(): Route {
  const params = new URLSearchParams(window.location.search)
  const controlRoomId = params.get('control')

  if (controlRoomId) return { view: 'controlRoom', roomId: controlRoomId }
  if (params.get('mode') === 'display') return { view: 'display' }
  if (params.get('mode') === 'control') return { view: 'controlPair' }

  return { view: 'local' }
}

function navigateTo(search: string) {
  window.history.pushState(null, '', `${window.location.pathname}${search}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function getDisplayMode(text: string) {
  const contentLength = text.replace(/\s/g, '').length

  if (contentLength <= 1) return 'single'
  if (contentLength <= 12 && !text.includes('\n')) return 'phrase'
  return 'passage'
}

function formatPairCode(pairCode: string) {
  const normalized = pairCode.replace(/\D/g, '').slice(0, 6)

  if (normalized.length <= 3) return normalized

  return `${normalized.slice(0, 3)} ${normalized.slice(3)}`
}

async function apiRequest<T>(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP_${response.status}`)
  }

  return response.json() as Promise<T>
}

function DisplayStage({
  text,
  fontSize,
  fontFamily,
  textColor,
  isDarkMode,
}: {
  text: string
  fontSize: number
  fontFamily: string
  textColor: string
  isDarkMode: boolean
}) {
  const displayText = text.trim().length > 0 ? text : placeholderText
  const displayMode = getDisplayMode(text)
  const displayFontSize =
    text.trim().length === 0
      ? 'clamp(2rem, 7vw, 88px)'
      : displayMode === 'passage'
        ? `clamp(1.75rem, ${Math.max(fontSize / 18, 4.5)}vw, ${Math.min(fontSize, 96)}px)`
        : `clamp(2rem, ${fontSize / 10}vw, ${fontSize}px)`

  return (
    <main className="display-stage" aria-label="抄写展示区">
      <div
        className={`display-text ${displayMode} ${text.trim().length === 0 ? 'placeholder' : ''}`}
        style={{
          color: text.trim().length > 0 ? textColor : isDarkMode ? '#94a3b8' : '#9ca3af',
          fontFamily,
          fontSize: displayFontSize,
        }}
      >
        {displayText}
      </div>
    </main>
  )
}

function EditorPanel({
  text,
  onTextChange,
}: {
  text: string
  onTextChange: (value: string) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  return (
    <section className="editor-panel" aria-label="编辑文字">
      <textarea
        ref={textareaRef}
        className="editor-textarea"
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={placeholderText}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        inputMode="text"
        enterKeyHint="done"
        name="showme-copy-text"
        rows={4}
      />
    </section>
  )
}

function Toolbar({
  isEditing,
  hasText,
  showSettings,
  onEdit,
  onDone,
  onClear,
  onToggleSettings,
}: {
  isEditing: boolean
  hasText: boolean
  showSettings: boolean
  onEdit: () => void
  onDone: () => void
  onClear: () => void
  onToggleSettings: () => void
}) {
  return (
    <nav className="toolbar" aria-label="操作栏">
      <button className="tool-button primary" type="button" onClick={isEditing ? onDone : onEdit}>
        {isEditing ? '完成' : '编辑'}
      </button>
      <button className="tool-button" type="button" onClick={onClear} disabled={!hasText}>
        清空
      </button>
      <button
        className={`tool-button ${showSettings ? 'active' : ''}`}
        type="button"
        onClick={onToggleSettings}
      >
        设置
      </button>
    </nav>
  )
}

function SettingsSheet({
  fontSize,
  fontFamily,
  textColor,
  isDarkMode,
  onFontSizeChange,
  onFontFamilyChange,
  onTextColorChange,
  onThemeChange,
}: {
  fontSize: number
  fontFamily: string
  textColor: string
  isDarkMode: boolean
  onFontSizeChange: (size: number) => void
  onFontFamilyChange: (fontFamily: string) => void
  onTextColorChange: (color: string) => void
  onThemeChange: (isDark: boolean) => void
}) {
  const colorOptions = isDarkMode ? darkModeColors : lightModeColors

  return (
    <section className="settings-sheet" aria-label="显示设置">
      <div className="settings-section compact">
        <h2>主题</h2>
        <div className="segmented-control">
          <button type="button" className={!isDarkMode ? 'selected' : ''} onClick={() => onThemeChange(false)}>
            浅色
          </button>
          <button type="button" className={isDarkMode ? 'selected' : ''} onClick={() => onThemeChange(true)}>
            深色
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h2>字号</h2>
        <div className="button-row">
          {fontSizeLevels.map((level) => (
            <button
              key={level.size}
              type="button"
              className={fontSize === level.size ? 'selected' : ''}
              onClick={() => onFontSizeChange(level.size)}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h2>字体</h2>
        <div className="button-row">
          {fontFamilyOptions.map((font) => (
            <button
              key={font.value}
              type="button"
              className={fontFamily === font.value ? 'selected' : ''}
              style={{ fontFamily: font.value }}
              onClick={() => onFontFamilyChange(font.value)}
            >
              {font.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h2>颜色</h2>
        <div className="color-row">
          {colorOptions.map((color) => (
            <button
              key={color.value}
              type="button"
              className={`color-swatch ${textColor === color.value ? 'selected' : ''}`}
              style={{ backgroundColor: color.value }}
              aria-label={color.label}
              title={color.label}
              onClick={() => onTextColorChange(color.value)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ModeLauncher() {
  return (
    <div className="mode-launcher" aria-label="模式入口">
      <button type="button" onClick={() => navigateTo('?mode=display')}>
        新建展示房间
      </button>
      <button type="button" onClick={() => navigateTo('?mode=control')}>
        连接展示屏
      </button>
    </div>
  )
}

function LocalMode() {
  const [state, setState] = useState<RoomState>(defaultState)
  const [showSettings, setShowSettings] = useState(false)
  const [isEditing, setIsEditing] = useState(false)

  useBodyTheme(state.isDarkMode)

  return (
    <div className={`app-container ${state.isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <ModeLauncher />
      <DisplayStage
        text={state.text}
        fontSize={state.fontSize}
        fontFamily={state.fontFamily}
        textColor={state.textColor}
        isDarkMode={state.isDarkMode}
      />

      <div className="control-surface">
        {isEditing && (
          <EditorPanel
            text={state.text}
            onTextChange={(text) => setState((current) => ({ ...current, text }))}
          />
        )}

        {showSettings && (
          <SettingsSheet
            fontSize={state.fontSize}
            fontFamily={state.fontFamily}
            textColor={state.textColor}
            isDarkMode={state.isDarkMode}
            onFontSizeChange={(fontSize) => setState((current) => ({ ...current, fontSize }))}
            onFontFamilyChange={(fontFamily) => setState((current) => ({ ...current, fontFamily }))}
            onTextColorChange={(textColor) => setState((current) => ({ ...current, textColor }))}
            onThemeChange={(isDarkMode) =>
              setState((current) => ({
                ...current,
                isDarkMode,
                textColor: isDarkMode ? '#f8fafc' : '#111827',
              }))
            }
          />
        )}

        <Toolbar
          isEditing={isEditing}
          hasText={state.text.trim().length > 0}
          showSettings={showSettings}
          onEdit={() => {
            setShowSettings(false)
            setIsEditing(true)
          }}
          onDone={() => setIsEditing(false)}
          onClear={() => {
            setState((current) => ({ ...current, text: '' }))
            setShowSettings(false)
            setIsEditing(true)
          }}
          onToggleSettings={() => {
            setIsEditing(false)
            setShowSettings((current) => !current)
          }}
        />
      </div>
    </div>
  )
}

function DisplayRoomMode() {
  const [roomId, setRoomId] = useState('')
  const [pairCode, setPairCode] = useState('')
  const [pairCodeExpiresAt, setPairCodeExpiresAt] = useState('')
  const [controllerConnected, setControllerConnected] = useState(false)
  const [state, setState] = useState<RoomState>(defaultState)
  const [status, setStatus] = useState('正在创建展示房间...')

  useBodyTheme(state.isDarkMode)

  useEffect(() => {
    let cancelled = false

    async function createRoom() {
      try {
        const response = await apiRequest<{
          roomId: string
          pairCode: string
          pairCodeExpiresAt: string
          state: RoomState
        }>('/api/rooms', { method: 'POST' })

        if (cancelled) return

        setRoomId(response.roomId)
        setPairCode(response.pairCode)
        setPairCodeExpiresAt(response.pairCodeExpiresAt)
        setState(response.state)
        setStatus('等待手机连接')
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : '房间创建失败')
      }
    }

    createRoom()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!roomId) return undefined

    let cancelled = false

    async function pollRoom() {
      try {
        const response = await apiRequest<{
          state: RoomState
          controllerConnected: boolean
        }>(`/api/rooms/${roomId}`)

        if (cancelled) return

        setState(response.state)
        setControllerConnected(response.controllerConnected)
        setStatus(response.controllerConnected ? '手机已连接' : '等待手机连接')
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : '同步失败')
      }
    }

    pollRoom()
    const timer = window.setInterval(pollRoom, 900)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [roomId])

  return (
    <div className={`app-container ${state.isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <button className="back-button" type="button" onClick={() => navigateTo('')}>
        返回本机模式
      </button>
      <DisplayStage
        text={state.text}
        fontSize={state.fontSize}
        fontFamily={state.fontFamily}
        textColor={state.textColor}
        isDarkMode={state.isDarkMode}
      />

      {!controllerConnected && (
        <section className="pairing-card" aria-label="展示房间配对码">
          <p className="eyebrow">手机打开 ShowMe，选择连接展示屏</p>
          <div className="pair-code">{pairCode ? formatPairCode(pairCode) : '...'}</div>
          <p>{status}</p>
          {pairCodeExpiresAt && <p className="muted">配对码 10 分钟内有效</p>}
        </section>
      )}

      {controllerConnected && <div className="sync-badge">手机已连接</div>}
    </div>
  )
}

function ControlPairMode() {
  const [pairCode, setPairCode] = useState('')
  const [status, setStatus] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useBodyTheme(false)

  async function pairRoom() {
    const normalized = pairCode.replace(/\D/g, '')

    if (normalized.length !== 6) {
      setStatus('请输入 6 位配对码')
      return
    }

    setIsSubmitting(true)
    setStatus('正在连接...')

    try {
      const response = await apiRequest<{
        roomId: string
        controlToken: string
      }>('/api/rooms/pair', {
        method: 'POST',
        body: JSON.stringify({ pairCode: normalized }),
      })

      sessionStorage.setItem(`showme-control-${response.roomId}`, response.controlToken)
      navigateTo(`?control=${encodeURIComponent(response.roomId)}`)
    } catch {
      setStatus('配对码无效或已过期')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="app-container light-mode">
      <button className="back-button" type="button" onClick={() => navigateTo('')}>
        返回本机模式
      </button>
      <main className="pair-control-page">
        <section className="pair-control-card" aria-label="连接展示屏">
          <p className="eyebrow">连接展示屏</p>
          <h1>输入大屏上的 6 位配对码</h1>
          <input
            className="pair-input"
            value={formatPairCode(pairCode)}
            onChange={(event) => setPairCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="482 913"
            aria-label="配对码"
          />
          <button className="primary-action wide" type="button" onClick={pairRoom} disabled={isSubmitting}>
            {isSubmitting ? '连接中' : '连接'}
          </button>
          {status && <p className="status-text">{status}</p>}
        </section>
      </main>
    </div>
  )
}

function ControlRoomMode({ roomId }: { roomId: string }) {
  const token = sessionStorage.getItem(`showme-control-${roomId}`) ?? ''
  const [state, setState] = useState<RoomState>(defaultState)
  const [showSettings, setShowSettings] = useState(false)
  const [status, setStatus] = useState(token ? '已连接' : '缺少控制权限，请重新配对')
  const dirtyRef = useRef(false)

  useBodyTheme(state.isDarkMode)

  useEffect(() => {
    let cancelled = false

    async function loadRoom() {
      try {
        const response = await apiRequest<{ state: RoomState }>(`/api/rooms/${roomId}`)

        if (!cancelled) setState(response.state)
      } catch {
        if (!cancelled) setStatus('房间不存在或已过期')
      }
    }

    loadRoom()

    return () => {
      cancelled = true
    }
  }, [roomId])

  useEffect(() => {
    if (!token || !dirtyRef.current) return undefined

    const timer = window.setTimeout(async () => {
      try {
        const response = await apiRequest<{ state: RoomState }>(`/api/rooms/${roomId}`, {
          method: 'PATCH',
          headers: {
            'x-showme-control-token': token,
          },
          body: JSON.stringify({ state }),
        })

        dirtyRef.current = false
        setState(response.state)
        setStatus('已同步')
      } catch {
        setStatus('未同步，请检查配对或网络')
      }
    }, 320)

    return () => window.clearTimeout(timer)
  }, [roomId, state, token])

  function updateState(patch: Partial<RoomState>) {
    dirtyRef.current = true
    setState((current) => ({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    }))
    setStatus('同步中...')
  }

  return (
    <div className={`app-container control-mode ${state.isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <button className="back-button" type="button" onClick={() => navigateTo('?mode=control')}>
        重新配对
      </button>
      <main className="control-page">
        <section className="controller-card" aria-label="手机控制器">
          <p className="eyebrow">手机控制器</p>
          <h1>输入给孩子看的内容</h1>
          <EditorPanel text={state.text} onTextChange={(text) => updateState({ text })} />
          <div className="controller-actions">
            <button className="tool-button" type="button" onClick={() => updateState({ text: '' })}>
              清空
            </button>
            <button className="tool-button" type="button" onClick={() => setShowSettings((current) => !current)}>
              {showSettings ? '收起设置' : '显示设置'}
            </button>
          </div>
          {showSettings && (
            <SettingsSheet
              fontSize={state.fontSize}
              fontFamily={state.fontFamily}
              textColor={state.textColor}
              isDarkMode={state.isDarkMode}
              onFontSizeChange={(fontSize) => updateState({ fontSize })}
              onFontFamilyChange={(fontFamily) => updateState({ fontFamily })}
              onTextColorChange={(textColor) => updateState({ textColor })}
              onThemeChange={(isDarkMode) =>
                updateState({
                  isDarkMode,
                  textColor: isDarkMode ? '#f8fafc' : '#111827',
                })
              }
            />
          )}
          <p className="status-text">{status}</p>
        </section>
      </main>
    </div>
  )
}

function useBodyTheme(isDarkMode: boolean) {
  useEffect(() => {
    document.body.classList.toggle('dark-mode', isDarkMode)

    return () => {
      document.body.classList.remove('dark-mode')
    }
  }, [isDarkMode])
}

function useFontPreload() {
  useEffect(() => {
    fontFamilyOptions.forEach((font) => {
      const id = `font-${font.value.replace(/\s/g, '-')}`

      if (document.getElementById(id)) return

      const link = document.createElement('link')
      link.id = id
      link.href = `https://fonts.googleapis.com/css2?family=${font.value.replace(/\s/g, '+')}:wght@400;500;600&display=swap`
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    })
  }, [])
}

function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute())

  useFontPreload()

  useEffect(() => {
    const handleRouteChange = () => setRoute(parseRoute())

    window.addEventListener('popstate', handleRouteChange)
    return () => window.removeEventListener('popstate', handleRouteChange)
  }, [])

  if (route.view === 'display') return <DisplayRoomMode />
  if (route.view === 'controlPair') return <ControlPairMode />
  if (route.view === 'controlRoom') return <ControlRoomMode roomId={route.roomId} />

  return <LocalMode />
}

export default App
