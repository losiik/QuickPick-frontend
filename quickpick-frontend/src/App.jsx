import { useEffect, useRef, useState } from 'react'
import micIcon from './assets/ButtonMedium.svg'
import sendIcon from './assets/Search.svg'
import './App.css'

const API_BASE = 'https://api.quick-pick.explaingpt.ru'
const ACCESS_KEY = 'qp_access_token'
const REFRESH_KEY = 'qp_refresh_token'

function App() {
  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [user, setUser] = useState(null)
  const [showProfile, setShowProfile] = useState(false)
  const [chatMode, setChatMode] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [chatMessages, setChatMessages] = useState([])
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [items, setItems] = useState([])
  const [attachmentFile, setAttachmentFile] = useState(null)
  const [attachmentError, setAttachmentError] = useState('')
  const [attachPromptItemId, setAttachPromptItemId] = useState(null)
  const [showAttachPicker, setShowAttachPicker] = useState(false)
  const [attachmentName, setAttachmentName] = useState('')
  const [micError, setMicError] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const recordStartRef = useRef(null)
  const lastRecordSecondsRef = useRef(0)
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const recordingModeRef = useRef(null)
  const audioContextRef = useRef(null)
  const audioNodeRef = useRef(null)
  const audioStreamRef = useRef(null)
  const pcmChunksRef = useRef([])

  const needsName = (user) =>
    user?.name === null || user?.name === undefined || user?.name === ''

  useEffect(() => {
    if (!getAccessToken()) {
      return
    }

    setLoading(true)
    fetchSelf()
      .then((user) => {
        setUser(user)
        if (needsName(user)) {
          setStep('name')
        } else {
          setStep('main')
          setName(user.name)
        }
      })
      .catch(() => {
        clearTokens()
        setStep('email')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!recording) {
      setRecordSeconds(0)
      recordStartRef.current = null
      return
    }

    recordStartRef.current = Date.now()
    const timer = setInterval(() => {
      if (!recordStartRef.current) return
      const diff = Math.floor((Date.now() - recordStartRef.current) / 1000)
      setRecordSeconds(diff)
    }, 500)

    return () => clearInterval(timer)
  }, [recording])

  const getAccessToken = () => localStorage.getItem(ACCESS_KEY)
  const getRefreshToken = () => localStorage.getItem(REFRESH_KEY)

  const clearTokens = () => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  }

  const saveTokens = (payload) => {
    localStorage.setItem(ACCESS_KEY, payload.access_token)
    localStorage.setItem(REFRESH_KEY, payload.refresh_token)
  }

  const parseError = (data, status) => {
    if (data?.detail?.[0]?.msg) return data.detail[0].msg
    if (data?.message) return data.message
    return `Ошибка ${status}`
  }

  const fetchJson = async (path, { method = 'GET', body, token, isForm } = {}) => {
    const headers = {}
    if (!isForm) {
      headers['Content-Type'] = 'application/json'
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body
        ? isForm
          ? body
          : JSON.stringify(body)
        : undefined,
    })

    const text = await response.text()
    let data = null
    if (text) {
      try {
        data = JSON.parse(text)
      } catch {
        data = null
      }
    }

    return { response, data, status: response.status, ok: response.ok }
  }

  const apiRequest = async (path, options) => {
    const { data, status, ok } = await fetchJson(path, options)
    if (!ok) {
      throw new Error(parseError(data, status))
    }
    return data
  }

  const refreshAccessToken = async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearTokens()
      throw new Error('Нужно войти в аккаунт')
    }
    const { data, status, ok } = await fetchJson('/api/auth/token/refresh', {
      method: 'POST',
      token: refreshToken,
    })
    if (!ok) {
      clearTokens()
      throw new Error(parseError(data, status))
    }
    saveTokens(data)
    return data.access_token
  }

  const apiRequestAuth = async (path, options = {}) => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      throw new Error('Нужно войти в аккаунт')
    }
    let result = await fetchJson(path, { ...options, token: accessToken })
    if (result.status === 401) {
      const newAccess = await refreshAccessToken()
      result = await fetchJson(path, { ...options, token: newAccess })
    }
    if (!result.ok) {
      throw new Error(parseError(result.data, result.status))
    }
    return result.data
  }

  const fetchSelf = () => apiRequestAuth('/api/users/self')

  const handleRequestCode = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')

    if (!email) {
      setError('Введите email')
      return
    }

    setLoading(true)
    try {
      await apiRequest('/api/auth/request-code', {
        method: 'POST',
        body: { email },
      })
      setStep('code')
      setInfo('Код отправлен на почту. Проверьте папку «Спам», если не пришло.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')

    if (!code) {
      setError('Введите код из письма')
      return
    }

    setLoading(true)
    try {
      const data = await apiRequest('/api/auth/verify-code', {
        method: 'POST',
        body: { email, code },
      })
      saveTokens(data)
      const user = await fetchSelf()
      setUser(user)
      if (needsName(user)) {
        setStep('name')
      } else {
        setStep('main')
        setName(user.name)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveName = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')

    if (!name.trim()) {
      setError('Введите имя')
      return
    }

    setLoading(true)
    try {
      await apiRequestAuth('/api/users/', {
        method: 'PATCH',
        body: { name: name.trim() },
      })
      const updated = await fetchSelf()
      setUser(updated)
      setStep('main')
      setInfo('Имя сохранено')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    clearTokens()
    setEmail('')
    setCode('')
    setName('')
    setUser(null)
    setShowProfile(false)
    setChatMode(null)
    setChatInput('')
    setChatMessages([])
    setItems([])
    setRecording(false)
    setMicError('')
    setAttachmentFile(null)
    setAttachmentError('')
    setAttachmentName('')
    setAttachPromptItemId(null)
    setShowAttachPicker(false)
    setStep('email')
  }

  const openChat = (mode) => {
    setChatMode(mode)
    setChatInput('')
    setChatMessages([])
    setError('')
    setInfo('')
    setMicError('')
    setAttachmentFile(null)
    setAttachmentError('')
    setAttachmentName('')
    setAttachPromptItemId(null)
    setShowAttachPicker(false)
    setStep('chat')
  }

  const closeChat = () => {
    setChatMode(null)
    setChatInput('')
    setChatMessages([])
    setRecording(false)
    setMicError('')
    setAttachmentFile(null)
    setAttachmentError('')
    setAttachmentName('')
    setAttachPromptItemId(null)
    setShowAttachPicker(false)
    setStep('main')
  }

  const openItems = async () => {
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const data = await apiRequestAuth('/api/items/self')
      const unique = new Map()
      ;(data || []).forEach((item) => {
        const name = item?.item_name?.trim()
        if (!name) return
        const key = name.toLowerCase()
        if (!unique.has(key)) {
          unique.set(key, name)
        }
      })
      setItems(Array.from(unique.values()))
      setStep('items')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const closeItems = () => {
    setStep('main')
  }

  const appendMessage = (role, text) => {
    setChatMessages((prev) => [...prev, { role, type: 'text', text }])
  }

  const appendImage = (src, alt = 'Изображение') => {
    setChatMessages((prev) => [
      ...prev,
      { role: 'assistant', type: 'image', src, alt },
    ])
  }

  const extractAttachmentUrls = (attachments) => {
    if (!Array.isArray(attachments)) return []
    return attachments
      .map((item) => item?.url)
      .filter((url) => typeof url === 'string' && url.length > 0)
  }

  const fetchAttachmentUrls = async (itemId) => {
    if (!itemId) return null
    const data = await apiRequestAuth(`/api/attachments/item/${itemId}`)
    return extractAttachmentUrls(data)
  }

  const fetchImageAsObjectUrl = async (url) => {
    if (!url) return null
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      })
      if (!response.ok) return null
      const blob = await response.blob()
      return URL.createObjectURL(blob)
    } catch {
      return null
    }
  }

  const maybeShowAttachmentForSearch = async (items) => {
    const first = Array.isArray(items) ? items.find((item) => item?.id) : null
    if (!first?.id) return
    try {
      const urls = await fetchAttachmentUrls(first.id)
      if (!urls || urls.length === 0) return
      for (const url of urls) {
        const objectUrl = await fetchImageAsObjectUrl(url)
        appendImage(objectUrl || url)
      }
    } catch {
      // ignore attachment errors
    }
  }

  const handleSendMessage = async (event) => {
    event.preventDefault()
    setError('')
    setInfo('')

    const text = chatInput.trim()
    if (!text) {
      setError('Введите текст')
      return
    }

    appendMessage('user', text)
    setChatInput('')
    setLoading(true)

    try {
      if (chatMode === 'add') {
        const data = await apiRequestAuth('/api/items/', {
          method: 'POST',
          body: { text },
        })
        appendMessage(
          'assistant',
          data?.message || 'Предмет сохранен. Хотите добавить еще?'
        )
        if (data?.item?.id) {
          setAttachPromptItemId(data.item.id)
          setShowAttachPicker(false)
        }
      } else {
        const data = await apiRequestAuth('/api/items/search', {
          method: 'POST',
          body: { query: text },
        })
        appendMessage(
          'assistant',
          data?.answer || 'Пока не удалось найти предмет.'
        )
        await maybeShowAttachmentForSearch(data?.items)
      }
    } catch (err) {
      appendMessage('assistant', `Ошибка: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const sendVoice = async (blob, durationSeconds = 0) => {
    appendMessage(
      'user',
      `Голосовое сообщение${durationSeconds ? ` (${formatSeconds(durationSeconds)})` : ''}`
    )
    setLoading(true)
    setError('')
    setInfo('')

    try {
      const formData = new FormData()
      const fileName = getAudioFileName(blob.type)
      formData.append('audio', blob, fileName)
      const data = await apiRequestAuth(
        chatMode === 'add' ? '/api/voice/add-item' : '/api/voice/search',
        {
          method: 'POST',
          body: formData,
          isForm: true,
        }
      )

      if (chatMode === 'add') {
        appendMessage(
          'assistant',
          data?.message || 'Предмет сохранен. Хотите добавить еще?'
        )
        if (data?.item?.id) {
          setAttachPromptItemId(data.item.id)
          setShowAttachPicker(false)
        }
      } else {
        appendMessage(
          'assistant',
          data?.answer || 'Пока не удалось найти предмет.'
        )
        await maybeShowAttachmentForSearch(data?.items)
      }
    } catch (err) {
      appendMessage('assistant', `Ошибка: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const startRecording = async () => {
    setMicError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Браузер не поддерживает запись звука.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      if (supportsWebmRecorder()) {
        recordingModeRef.current = 'media'
        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
        })
        chunksRef.current = []
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunksRef.current.push(event.data)
          }
        }
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
          stream.getTracks().forEach((track) => track.stop())
          sendVoice(blob, lastRecordSecondsRef.current)
        }
        recorderRef.current = recorder
        recorder.start()
      } else {
        if (!supportsAudioWorklet()) {
          stream.getTracks().forEach((track) => track.stop())
          setMicError('Запись на этом устройстве не поддерживается.')
          return
        }
        recordingModeRef.current = 'wav'
        audioStreamRef.current = stream
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)()
        audioContextRef.current = audioContext
        if (audioContext.state === 'suspended') {
          await audioContext.resume()
        }
        const source = audioContext.createMediaStreamSource(stream)
        await audioContext.audioWorklet.addModule(
          new URL('./audioWorklet.js', import.meta.url)
        )
        const node = new AudioWorkletNode(audioContext, 'pcm-capture')
        pcmChunksRef.current = []
        node.port.onmessage = (event) => {
          if (event.data?.type === 'pcm' && event.data?.buffer) {
            pcmChunksRef.current.push(new Float32Array(event.data.buffer))
          }
        }
        source.connect(node)
        node.connect(audioContext.destination)
        audioNodeRef.current = node
      }

      setRecording(true)
    } catch {
      setMicError('Нужен доступ к микрофону.')
    }
  }

  const stopRecording = () => {
    lastRecordSecondsRef.current = recordSeconds
    if (recordingModeRef.current === 'media') {
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop()
      }
    } else if (recordingModeRef.current === 'wav') {
      const stream = audioStreamRef.current
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
      }
      const node = audioNodeRef.current
      if (node) {
        node.disconnect()
      }
      const audioContext = audioContextRef.current
      if (audioContext) {
        audioContext.close()
      }
      const wavBlob = encodeWav(pcmChunksRef.current)
      sendVoice(wavBlob, lastRecordSecondsRef.current)
      audioStreamRef.current = null
      audioNodeRef.current = null
      audioContextRef.current = null
      pcmChunksRef.current = []
    }
    setRecording(false)
  }

  const formatSeconds = (value) => {
    const minutes = String(Math.floor(value / 60)).padStart(2, '0')
    const seconds = String(value % 60).padStart(2, '0')
    return `${minutes}:${seconds}`
  }

  const getProfileInitial = () => {
    if (user?.name && user.name.trim()) return user.name.trim()[0].toUpperCase()
    if (user?.email && user.email.trim())
      return user.email.trim()[0].toUpperCase()
    return '?'
  }

  const isChat = step === 'chat'
  const canAttach = chatMode === 'add'
  const supportsWebmRecorder = () =>
    typeof MediaRecorder !== 'undefined' &&
    MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
  const supportsAudioWorklet = () =>
    typeof AudioWorkletNode !== 'undefined' &&
    (window.AudioContext || window.webkitAudioContext)?.prototype?.audioWorklet

  const getAudioFileName = (mimeType) => {
    if (mimeType.includes('webm')) return 'voice.webm'
    if (mimeType.includes('wav')) return 'voice.wav'
    if (mimeType.includes('mp4') || mimeType.includes('m4a'))
      return 'voice.m4a'
    return 'voice.wav'
  }

  const encodeWav = (chunks) => {
    const sampleRate = audioContextRef.current?.sampleRate || 44100
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const buffer = new ArrayBuffer(44 + length * 2)
    const view = new DataView(buffer)

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i += 1) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }

    writeString(0, 'RIFF')
    view.setUint32(4, 36 + length * 2, true)
    writeString(8, 'WAVE')
    writeString(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    writeString(36, 'data')
    view.setUint32(40, length * 2, true)

    let offset = 44
    chunks.forEach((chunk) => {
      for (let i = 0; i < chunk.length; i += 1) {
        const s = Math.max(-1, Math.min(1, chunk[i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
        offset += 2
      }
    })

    return new Blob([view], { type: 'audio/wav' })
  }

  const handlePickFile = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  const handlePickCamera = () => {
    if (cameraInputRef.current) {
      cameraInputRef.current.click()
    }
  }

  const shortenFileName = (name) => {
    if (!name) return ''
    if (name.length <= 24) return name
    const dot = name.lastIndexOf('.')
    const ext = dot > 0 ? name.slice(dot) : ''
    const base = dot > 0 ? name.slice(0, dot) : name
    const trimmed = base.slice(0, 16)
    return `${trimmed}...${ext || ''}`
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAttachmentError('Можно прикреплять только изображения.')
      setAttachmentFile(null)
      return
    }
    setAttachmentError('')
    setAttachmentFile(file)
    setAttachmentName(shortenFileName(file.name))
  }

  const clearAttachment = () => {
    setAttachmentFile(null)
    setAttachmentError('')
    setAttachmentName('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ''
    }
  }

  const uploadAttachment = async () => {
    if (!attachmentFile || !attachPromptItemId) {
      return
    }
    try {
      const formData = new FormData()
      formData.append('file', attachmentFile)
      await apiRequestAuth(`/api/attachments/upload/${attachPromptItemId}`, {
        method: 'POST',
        body: formData,
        isForm: true,
      })
      appendMessage('assistant', 'Изображение прикреплено.')
      clearAttachment()
      setAttachPromptItemId(null)
      setShowAttachPicker(false)
    } catch (err) {
      appendMessage('assistant', `Ошибка прикрепления: ${err.message}`)
    }
  }

  return (
    <div className={`app ${isChat ? 'app-chat' : ''}`}>
      {!isChat && (
        <header className="app-header">
          <div className="header-row">
            <div>
              <div className="brand">QuickPick</div>
              <div className="brand-subtitle">
                Помогаем помнить, где лежат вещи
              </div>
            </div>
            {step === 'main' && (
              <div className="profile-area">
                <button
                  className="profile-avatar"
                  type="button"
                  onClick={() => setShowProfile((current) => !current)}
                  aria-label="Профиль"
                >
                  {getProfileInitial()}
                </button>
                {showProfile && user && (
                  <section className="profile-popover">
                    <h2>Профиль</h2>
                    <div className="profile-row">
                      <span>Имя</span>
                      <strong>{user.name || '—'}</strong>
                    </div>
                    <div className="profile-row">
                      <span>Email</span>
                      <strong>{user.email || '—'}</strong>
                    </div>
                    <div className="profile-row">
                      <span>Google таблица</span>
                      {user.sheet_url ? (
                        <a
                          className="profile-link"
                          href={user.sheet_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Открыть таблицу
                        </a>
                      ) : (
                        <strong>—</strong>
                      )}
                    </div>
                    <button
                      className="danger"
                      type="button"
                      onClick={handleLogout}
                    >
                      Выйти
                    </button>
                  </section>
                )}
              </div>
            )}
          </div>
        </header>
      )}

      <main className={`panel ${isChat ? 'panel-full' : ''}`}>
        {step === 'email' && (
          <form className="stack" onSubmit={handleRequestCode}>
            <h1 className="title">Введите email</h1>
            <p className="subtitle">
              Мы отправим код на почту. Он нужен, чтобы войти в приложение.
            </p>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Отправляем...' : 'Получить код'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form className="stack" onSubmit={handleVerifyCode}>
            <h1 className="title">Введите код</h1>
            <p className="subtitle">
              Мы отправили код на {email || 'вашу почту'}.
            </p>
            <label className="field">
              <span>Код из письма</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                className="ghost"
                type="button"
                onClick={() => setStep('email')}
                disabled={loading}
              >
                Изменить email
              </button>
              <button className="primary" type="submit" disabled={loading}>
                {loading ? 'Проверяем...' : 'Войти'}
              </button>
            </div>
          </form>
        )}

        {step === 'name' && (
          <form className="stack" onSubmit={handleSaveName}>
            <h1 className="title">Как к вам обращаться?</h1>
            <p className="subtitle">
              Это поможет сделать подсказки более дружелюбными.
            </p>
            <label className="field">
              <span>Имя</span>
              <input
                type="text"
                placeholder="Например, Анна"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </form>
        )}

        {step === 'main' && (
          <div className="stack main-actions">
            <div className="actions">
              <button
                className="primary"
                type="button"
                onClick={() => openChat('search')}
              >
                Найти предмет
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => openChat('add')}
              >
                Добавить предмет
              </button>
              <button className="ghost" type="button" onClick={openItems}>
                Мои предметы
              </button>
            </div>
          </div>
        )}

        {step === 'items' && (
          <div className="stack">
            <button className="back-button" type="button" onClick={closeItems}>
              <span aria-hidden="true">←</span> На главный экран
            </button>
            <h1 className="title">Мои предметы</h1>
            <p className="subtitle">
              Здесь показаны уникальные предметы, которые вы добавляли.
            </p>
            <div className="items-list">
              {items.length === 0 ? (
                <div className="chat-empty">Пока нет добавленных предметов.</div>
              ) : (
                items.map((item) => (
                  <div key={item} className="item-pill">
                    {item}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {step === 'chat' && (
          <div className="stack chat-screen">
            <button className="back-button" type="button" onClick={closeChat}>
              <span aria-hidden="true">←</span> На главный экран
            </button>
            <h1 className="title">
              {chatMode === 'add' ? 'Добавить предмет' : 'Найти предмет'}
            </h1>
            <p className="subtitle">
              {chatMode === 'add'
                ? 'Опишите, где лежит предмет. Например: "очки в тумбочке".'
                : 'Спросите, где предмет. Например: "где очки?".'}
            </p>
            <div className="chat-box chat-box-full">
              {chatMessages.length === 0 ? (
                <div className="chat-empty">Сообщений пока нет.</div>
              ) : (
                chatMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`chat-message ${message.role} ${message.type}`}
                  >
                    {message.type === 'image' ? (
                      <img
                        src={message.src}
                        alt={message.alt || 'Изображение'}
                        className="chat-image"
                      />
                    ) : (
                      message.text
                    )}
                  </div>
                ))
              )}
            </div>
            <form className="chat-form chat-form-fixed" onSubmit={handleSendMessage}>
              {recording && (
                <div className="recording-bar" aria-live="polite">
                  <div className="recording-dot" aria-hidden="true" />
                  <div className="recording-wave" aria-hidden="true">
                    {Array.from({ length: 20 }).map((_, index) => (
                      <span key={index} style={{ animationDelay: `${index * 0.06}s` }} />
                    ))}
                  </div>
                  <div className="recording-time">{formatSeconds(recordSeconds)}</div>
                </div>
              )}
              <div className="chat-input-wrap">
                <input
                  type="text"
                  placeholder="Введите сообщение..."
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                />
                <button
                  className={`mic-button ${recording ? 'recording' : ''}`}
                  type="button"
                  onClick={recording ? stopRecording : startRecording}
                  disabled={loading}
                  aria-label={recording ? 'Остановить запись' : 'Записать голосом'}
                >
                  <img src={micIcon} alt="" className="mic-icon" />
                </button>
                <button
                  className="send-button"
                  type="submit"
                  disabled={loading}
                  aria-label="Отправить"
                >
                  <img src={sendIcon} alt="" className="send-icon" />
                </button>
              </div>
            </form>
            {canAttach && attachPromptItemId && (
              <div className="attach-prompt">
                <div className="attach-text">Хотите добавить изображение?</div>
                {!showAttachPicker ? (
                  <div className="attach-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => setShowAttachPicker(true)}
                    >
                      Да, добавить
                    </button>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => setAttachPromptItemId(null)}
                    >
                      Нет, спасибо
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="attach-actions">
                      <button
                        className="secondary"
                        type="button"
                        onClick={handlePickFile}
                      >
                        Из галереи
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={handlePickCamera}
                      >
                        Сделать фото
                      </button>
                      <button
                        className="ghost"
                        type="button"
                        onClick={() => {
                          clearAttachment()
                          setShowAttachPicker(false)
                        }}
                      >
                        Отмена
                      </button>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="file-input"
                      onChange={handleFileChange}
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="file-input"
                      onChange={handleFileChange}
                    />
                    {attachmentFile && (
                      <div className="attachment-chip">
                        <span>{attachmentName || attachmentFile.name}</span>
                        <button type="button" onClick={clearAttachment}>
                          ✕
                        </button>
                        <button
                          className="primary"
                          type="button"
                          onClick={uploadAttachment}
                        >
                          Загрузить
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {micError && <div className="alert error">{micError}</div>}
            {attachmentError && <div className="alert error">{attachmentError}</div>}
          </div>
        )}

        {loading && step !== 'email' && (
          <div className="status">Идет загрузка...</div>
        )}

        {error && <div className="alert error">{error}</div>}
        {info && <div className="alert info">{info}</div>}
      </main>

      {!isChat && (
        <footer className="app-footer">
          <div className="hint">
            Приложение хранит данные безопасно. Вы всегда можете обратиться за
            помощью.
          </div>
        </footer>
      )}
    </div>
  )
}

export default App
