import { FormEvent, ReactNode, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { LockKeyhole, Mail, UserRound } from 'lucide-react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return

    setLoading(true)
    setMessage('')

    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: name.trim() || undefined },
          },
        })

    if (result.error) {
      setMessage(result.error.message)
    } else if (mode === 'signup' && !result.data.session) {
      setMessage('Регистрация создана, но вход пока недоступен. Проверьте настройку Confirm email в Supabase.')
    }

    setLoading(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">M</div>
          <div>
            <strong>MoneyCRM</strong>
            <span>управляй деньгами как системой</span>
          </div>
        </div>

        <div className="auth-heading">
          <h1>{mode === 'login' ? 'С возвращением' : 'Создать аккаунт'}</h1>
          <p>{mode === 'login' ? 'Войдите в своё финансовое пространство.' : 'Имя, email и пароль — и можно начинать.'}</p>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === 'signup' && (
            <label className="auth-field">
              <span>Имя</span>
              <div><UserRound size={17} /><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Ваше имя" required /></div>
            </label>
          )}

          <label className="auth-field">
            <span>Email</span>
            <div><Mail size={17} /><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" required /></div>
          </label>

          <label className="auth-field">
            <span>Пароль</span>
            <div><LockKeyhole size={17} /><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required /></div>
          </label>

          {message && <div className="auth-message">{message}</div>}
          <button className="auth-primary" disabled={loading}>{loading ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button>
        </form>

        <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage('') }}>
          {mode === 'login' ? 'Нет аккаунта? Создать' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    if (!supabase) return

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return <>{children}</>
  if (loading) return <div className="auth-loading">MoneyCRM</div>
  if (!session) return <AuthScreen />
  return <>{children}</>
}
