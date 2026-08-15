import {
  useEffect,
  useState,
  type SyntheticEvent,
} from 'react'

import type {
  AuthMode,
  AuthResponse,
} from '../types/auth'

import './AuthModal.css'


type AuthModalProps = {
  isOpen: boolean
  initialMode: AuthMode
  onClose: () => void
  onAuthenticated: (authentication: AuthResponse) => void
}

const API_BASE_URL = 'http://127.0.0.1:8000'


async function readErrorMessage(
  response: Response,
): Promise<string> {
  try {
    const data = await response.json()

    if (typeof data.detail === 'string') {
      return data.detail
    }

    if (Array.isArray(data.detail)) {
      return data.detail
        .map((issue: { msg?: string }) => issue.msg)
        .filter(Boolean)
        .join(' ')
    }
  } catch {
    // Use the fallback message below.
  }

  return 'Something went wrong. Please try again.'
}


export function AuthModal({
  isOpen,
  initialMode,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] =
    useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    setMode(initialMode)
    setEmail('')
    setDisplayName('')
    setPassword('')
    setPasswordConfirmation('')
    setError('')
    setSubmitting(false)

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [initialMode, isOpen, onClose])

  if (!isOpen) {
    return null
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setPassword('')
    setPasswordConfirmation('')
    setError('')
  }

  async function login(): Promise<AuthResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    })

    if (!response.ok) {
      throw new Error(await readErrorMessage(response))
    }

    return response.json()
  }

  async function handleSubmit(
    event: SyntheticEvent<HTMLFormElement>,
  ) {
    event.preventDefault()
    setError('')

    if (
      mode === 'register' &&
      password !== passwordConfirmation
    ) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)

    try {
      if (mode === 'register') {
        const registrationResponse = await fetch(
          `${API_BASE_URL}/auth/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              email,
              display_name: displayName,
              password,
            }),
          },
        )

        if (!registrationResponse.ok) {
          throw new Error(
            await readErrorMessage(registrationResponse),
          )
        }
      }

      const authentication = await login()
      onAuthenticated(authentication)
      onClose()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Could not connect to FragFriend.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="auth-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-heading"
      >
        <button
          type="button"
          className="auth-close"
          aria-label="Close account window"
          onClick={onClose}
        >
          ×
        </button>

        <p className="auth-eyebrow">FragFriend account</p>

        <h2 id="auth-heading">
          {mode === 'login'
            ? 'Welcome back'
            : 'Create your account'}
        </h2>

        <p className="auth-introduction">
          {mode === 'login'
            ? 'Sign in to access your saved fragrances.'
            : 'Save fragrances and build your personal collection.'}
        </p>

        <div className="auth-mode-switch">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            aria-pressed={mode === 'login'}
            onClick={() => changeMode('login')}
          >
            Sign in
          </button>

          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            aria-pressed={mode === 'register'}
            onClick={() => changeMode('register')}
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                minLength={1}
                maxLength={80}
                autoComplete="name"
                required
                onChange={(event) =>
                  setDisplayName(event.target.value)
                }
              />
            </label>
          )}

          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              autoComplete="email"
              required
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              minLength={mode === 'register' ? 8 : 1}
              maxLength={128}
              autoComplete={
                mode === 'login'
                  ? 'current-password'
                  : 'new-password'
              }
              required
              onChange={(event) =>
                setPassword(event.target.value)
              }
            />
          </label>

          {mode === 'register' && (
            <label>
              <span>Confirm password</span>
              <input
                type="password"
                value={passwordConfirmation}
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
                onChange={(event) =>
                  setPasswordConfirmation(event.target.value)
                }
              />
            </label>
          )}

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={submitting}
          >
            {submitting
              ? 'Please wait...'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>
      </section>
    </div>
  )
}