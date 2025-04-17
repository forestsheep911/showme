import { useState, useEffect, useRef } from 'react'
import './App.css'

function App() {
  const [fontSize, setFontSize] = useState(120)
  const [fontFamily, setFontFamily] = useState('Noto Sans SC')
  const [textColor, setTextColor] = useState('#000000')
  const [showSettings, setShowSettings] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const settingsButtonRef = useRef<HTMLDivElement>(null)

  // 字体大小档位
  const fontSizeLevels = [
    { label: '特大', size: 200 },
    { label: '大', size: 160 },
    { label: '中', size: 120 },
    { label: '小', size: 80 },
    { label: '特小', size: 40 }
  ]

  // 字体选项
  const fontFamilyOptions = [
    { label: '思源黑体', value: 'Noto Sans SC' },
    { label: '思源宋体', value: 'Noto Serif SC' },
    { label: '日文字体', value: 'Noto Sans JP' },
    { label: '韩文字体', value: 'Noto Sans KR' },
    { label: '繁体中文', value: 'Noto Sans TC' }
  ]

  // 亮色主题颜色选项
  const lightModeColors = [
    { label: '黑色', value: '#000000' },
    { label: '深蓝', value: '#1e40af' },
    { label: '玫红', value: '#e11d48' },
    { label: '翠绿', value: '#059669' },
    { label: '紫色', value: '#7c3aed' },
    { label: '橙色', value: '#ea580c' },
    { label: '天蓝', value: '#0284c7' },
    { label: '玫瑰', value: '#be185d' }
  ]

  // 暗色主题颜色选项
  const darkModeColors = [
    { label: '白色', value: '#ffffff' },
    { label: '浅蓝', value: '#93c5fd' },
    { label: '粉红', value: '#fda4af' },
    { label: '薄荷', value: '#6ee7b7' },
    { label: '淡紫', value: '#c4b5fd' },
    { label: '杏色', value: '#fdba74' },
    { label: '天青', value: '#7dd3fc' },
    { label: '浅玫瑰', value: '#fecdd3' }
  ]

  // 根据当前主题获取颜色选项
  const colorOptions = isDarkMode ? darkModeColors : lightModeColors

  // 处理点击外部关闭设置面板
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showSettings &&
          settingsPanelRef.current &&
          settingsButtonRef.current &&
          !settingsPanelRef.current.contains(event.target as Node) &&
          !settingsButtonRef.current.contains(event.target as Node)) {
        setShowSettings(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSettings])

  useEffect(() => {
    // 加载字体
    fontFamilyOptions.forEach(font => {
      const link = document.createElement('link')
      link.href = `https://fonts.googleapis.com/css2?family=${font.value.replace(' ', '+')}:wght@400&display=swap`
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    })

    // 自动聚焦输入区域
    if (textareaRef.current) {
      textareaRef.current.focus()
    }

    // 处理窗口大小变化
    const handleResize = () => {
      if (!textareaRef.current || !containerRef.current) return
      const container = containerRef.current
      const textarea = textareaRef.current
      const containerWidth = container.clientWidth
      
      // 只检查是否超出容器宽度
      const maxWidth = containerWidth * 0.9
      const textWidth = textarea.scrollWidth
      
      if (textWidth > maxWidth) {
        const scaleFactor = maxWidth / textWidth
        const adjustedSize = Math.floor(fontSize * scaleFactor)
        textarea.style.fontSize = `${adjustedSize}px`
      } else {
        textarea.style.fontSize = `${fontSize}px`
      }
    }

    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [fontSize])

  // 切换主题时重置文字颜色
  useEffect(() => {
    setTextColor(isDarkMode ? '#ffffff' : '#000000')
  }, [isDarkMode])

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : 'light-mode'}`}>
      <div 
        className="settings-button" 
        ref={settingsButtonRef}
        onClick={() => setShowSettings(!showSettings)}
      >
        ⚙️
      </div>
      
      {showSettings && (
        <div className="settings-panel" ref={settingsPanelRef}>
          <div className="settings-section">
            <h3>主题切换</h3>
            <div className="button-group">
              <button
                onClick={() => setIsDarkMode(false)}
                className={!isDarkMode ? 'active' : ''}
              >
                浅色
              </button>
              <button
                onClick={() => setIsDarkMode(true)}
                className={isDarkMode ? 'active' : ''}
              >
                深色
              </button>
            </div>
          </div>

          <div className="settings-section">
            <h3>字体大小</h3>
            <div className="button-group">
              {fontSizeLevels.map((level) => (
                <button
                  key={level.size}
                  onClick={() => setFontSize(level.size)}
                  className={fontSize === level.size ? 'active' : ''}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="settings-section">
            <h3>字体选择</h3>
            <div className="button-group">
              {fontFamilyOptions.map((font) => (
                <button
                  key={font.value}
                  onClick={() => setFontFamily(font.value)}
                  className={fontFamily === font.value ? 'active' : ''}
                  style={{ fontFamily: font.value }}
                >
                  {font.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="settings-section">
            <h3>字体颜色</h3>
            <div className="color-group">
              {colorOptions.map((color) => (
                <div
                  key={color.value}
                  onClick={() => setTextColor(color.value)}
                  className={`color-option ${textColor === color.value ? 'active' : ''}`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="display-container" ref={containerRef}>
        <textarea
          ref={textareaRef}
          className="text-display"
          style={{ 
            fontSize: `${fontSize}px`,
            fontFamily,
            color: textColor,
          }}
          onFocus={() => setShowSettings(false)}  // 输入框获得焦点时关闭设置面板
        />
      </div>
    </div>
  )
}

export default App 