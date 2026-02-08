import { useEffect, useState } from 'react'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const needsName = (user) =>
    user?.name === null || user?.name === undefined || user?.name === ''

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      return
    }

    setLoading(true)
    fetchSelf(token)
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

  const getAccessToken = () => localStorage.getItem(ACCESS_KEY)

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

  const apiRequest = async (path, { method = 'GET', body, token } = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
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

    if (!response.ok) {
      throw new Error(parseError(data, response.status))
    }

    return data
  }

  const fetchSelf = (token) => apiRequest('/api/users/self', { token })

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
      const user = await fetchSelf(data.access_token)
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
      await apiRequest('/api/users/', {
        method: 'PATCH',
        token: getAccessToken(),
        body: { name: name.trim() },
      })
      const updated = await fetchSelf(getAccessToken())
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
    setStep('email')
  }

  const openChat = (mode) => {
    setChatMode(mode)
    setChatInput('')
    setChatMessages([])
    setError('')
    setInfo('')
    setStep('chat')
  }

  const closeChat = () => {
    setChatMode(null)
    setChatInput('')
    setChatMessages([])
    setStep('main')
  }

  const appendMessage = (role, text) => {
    setChatMessages((prev) => [...prev, { role, text }])
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
        const data = await apiRequest('/api/items/', {
          method: 'POST',
          token: getAccessToken(),
          body: { text },
        })
        appendMessage(
          'assistant',
          data?.message || 'Предмет сохранен. Хотите добавить еще?'
        )
      } else {
        const data = await apiRequest('/api/items/search', {
          method: 'POST',
          token: getAccessToken(),
          body: { query: text },
        })
        appendMessage(
          'assistant',
          data?.answer || 'Пока не удалось найти предмет.'
        )
      }
    } catch (err) {
      appendMessage('assistant', `Ошибка: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const getProfileInitial = () => {
    if (user?.name && user.name.trim()) return user.name.trim()[0].toUpperCase()
    if (user?.email && user.email.trim())
      return user.email.trim()[0].toUpperCase()
    return '?'
  }

  const isChat = step === 'chat'

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
                    className={`chat-message ${message.role}`}
                  >
                    {message.text}
                  </div>
                ))
              )}
            </div>
            <form className="chat-form chat-form-fixed" onSubmit={handleSendMessage}>
              <div className="chat-input-wrap">
                <input
                  type="text"
                  placeholder="Введите сообщение..."
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                />
                <button
                  className="send-button"
                  type="submit"
                  disabled={loading}
                  aria-label="Отправить"
                >
                  <span aria-hidden="true">↑</span>
                </button>
              </div>
            </form>
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
