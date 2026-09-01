// Account + My Builds: sign in / register, save the current character to your
// account, and ⭐ Star a saved build to publish it to the community.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import styles from './Community.module.css'
import { useAuth } from '../../context/AuthContext'
import { communityApi } from '../../lib/community/api'
import type { MyBuildSummary } from '../../lib/community/api'
import { useCharacter } from '../../context/CharacterContext'
import { useDocument } from '../../context/DocumentContext'
import { migrateDocument } from '../../hooks/usePersistence'
import { isCharacterDocument, syncBuildIntoDocument, repairCharacterNames } from '../../lib/multiLife'
import type { CharacterDocument } from '../../types/ddo'

// ---------------------------------------------------------------------------
// Google sign-in (rendered only when the server has GOOGLE_CLIENT_ID set)
// ---------------------------------------------------------------------------

// Minimal typing for the Google Identity Services script.
interface GoogleIdApi {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (response: { credential: string }) => void
      }) => void
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void
    }
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client'

/** Loads the GIS script once and resolves with the `google` global. */
function loadGoogleIdApi(): Promise<GoogleIdApi> {
  const w = window as unknown as { google?: GoogleIdApi; __gsiLoading?: Promise<GoogleIdApi> }
  if (w.google?.accounts?.id) return Promise.resolve(w.google)
  if (w.__gsiLoading) return w.__gsiLoading
  w.__gsiLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GSI_SRC
    script.async = true
    script.onload = () => {
      if (w.google?.accounts?.id) resolve(w.google)
      else reject(new Error('Google Identity Services failed to initialize'))
    }
    script.onerror = () => reject(new Error('Could not load Google Identity Services'))
    document.head.appendChild(script)
  })
  return w.__gsiLoading
}

function GoogleSignIn({ clientId, onError }: { clientId: string; onError: (message: string) => void }) {
  const { loginWithGoogle } = useAuth()
  const buttonRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!clientId || !buttonRef.current) return
    let cancelled = false
    loadGoogleIdApi()
      .then(google => {
        if (cancelled || !buttonRef.current) return
        google.accounts.id.initialize({
          client_id: clientId,
          callback: response => {
            loginWithGoogle(response.credential)
              .catch(err => onError(err instanceof Error ? err.message : 'Google sign-in failed'))
          },
        })
        google.accounts.id.renderButton(buttonRef.current, {
          theme: 'filled_black', size: 'large', width: 240,
        })
      })
      .catch(err => onError(err instanceof Error ? err.message : 'Google sign-in unavailable'))
    return () => { cancelled = true }
  }, [clientId, loginWithGoogle, onError])

  return <div ref={buttonRef} className={styles.googleBtn} />
}

function AuthForms() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // undefined = config still loading; null = Google not configured (dev).
  const [clientId, setClientId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    communityApi.googleConfig()
      .then(({ clientId: id }) => { if (!cancelled) setClientId(id) })
      .catch(() => { if (!cancelled) setClientId(null) })
    return () => { cancelled = true }
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'login') await login(username, password)
      else await register(username, email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  // Google configured → Google-only sign-in (the server rejects password auth).
  if (clientId === undefined) return <div className={styles.authBox}>…</div>
  if (clientId) {
    return (
      <div className={styles.authBox}>
        <h3>Sign in</h3>
        <p>Sign in with your Google account to save builds and join the community.</p>
        {error && <span className={styles.error}>{error}</span>}
        <GoogleSignIn clientId={clientId} onError={setError} />
      </div>
    )
  }

  return (
    <form className={styles.authBox} onSubmit={submit}>
      <h3>{mode === 'login' ? 'Sign in' : 'Create your account'}</h3>
      <input
        placeholder="Username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        autoComplete="username"
      />
      {mode === 'register' && (
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          autoComplete="email"
        />
      )}
      <input
        placeholder={mode === 'register' ? 'Password (min 8 characters)' : 'Password'}
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
      />
      {error && <span className={styles.error}>{error}</span>}
      <button type="submit" disabled={busy}>
        {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
      <span className={styles.authSwitch}>
        {mode === 'login' ? (
          <>New here? <button type="button" onClick={() => { setMode('register'); setError(null) }}>Create an account</button></>
        ) : (
          <>Already have an account? <button type="button" onClick={() => { setMode('login'); setError(null) }}>Sign in</button></>
        )}
      </span>
    </form>
  )
}

interface AccountPanelProps {
  onLoad: (doc: CharacterDocument) => void
}

export default function AccountPanel({ onLoad }: AccountPanelProps) {
  const { user, checking, logout } = useAuth()
  const { build } = useCharacter()
  const { doc, setDoc } = useDocument()
  const [builds, setBuilds] = useState<MyBuildSummary[]>([])
  const [saveName, setSaveName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!user) return
    communityApi.myBuilds()
      .then(setBuilds)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load your builds'))
  }, [user])

  useEffect(() => { refresh() }, [refresh])

  if (checking) return <div className={styles.notice}>Checking your session…</div>
  if (!user) return <AuthForms />

  /** Current document with live edits synced in. */
  function currentDoc(): CharacterDocument {
    const synced = syncBuildIntoDocument(doc, build)
    if (synced !== doc) setDoc(synced)
    return synced
  }

  async function handleSaveCurrent(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const name = (saveName || build.name || 'Unnamed build').trim()
    try {
      // Save under the same name the character is known by, so re-opening
      // the build shows that name rather than a placeholder.
      await communityApi.saveBuild({ name, document: repairCharacterNames(currentDoc(), name) })
      setSaveName('')
      setNotice(`Saved "${name}" to your account.`)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  async function handleStarToggle(b: MyBuildSummary) {
    setError(null)
    setNotice(null)
    try {
      if (b.published) {
        await communityApi.unstar(b.id)
        setNotice(`"${b.name}" removed from the community.`)
      } else {
        await communityApi.star(b.id)
        setNotice(`⭐ "${b.name}" is now shared with the community!`)
      }
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Publish failed')
    }
  }

  async function handleOpen(b: MyBuildSummary) {
    setError(null)
    try {
      const rec = await communityApi.getMyBuild(b.id)
      if (!isCharacterDocument(rec.document)) throw new Error('Saved build is not a valid character document')
      // The name the build is saved under is the character's name: a document
      // saved before builds were named from their file carries "Life 1" in
      // every build, which is what the Character page would otherwise show.
      onLoad(migrateDocument(rec.document, rec.name || b.name))
      setNotice(`Loaded "${b.name}" — it is now your working character.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed')
    }
  }

  async function handleDelete(b: MyBuildSummary) {
    if (!window.confirm(`Delete "${b.name}" from your account${b.published ? ' (it is shared with the community)' : ''}?`)) return
    try {
      await communityApi.deleteBuild(b.id)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <span>Signed in as <b>{user.username}</b></span>
        <button type="button" onClick={logout}>Sign out</button>
      </div>

      <form className={styles.saveRow} onSubmit={handleSaveCurrent}>
        <span className={styles.sectionTitle}>Save current character</span>
        <input
          placeholder={build.name || 'Build name'}
          value={saveName}
          onChange={e => setSaveName(e.target.value)}
        />
        <button type="submit">Save to my account</button>
      </form>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}

      <span className={styles.sectionTitle}>My builds</span>
      <div className={styles.myBuilds}>
        {builds.length === 0 && (
          <div className={styles.notice}>No saved builds yet — save your current character above.</div>
        )}
        {builds.map(b => (
          <div key={b.id} className={styles.myBuildRow}>
            <span className={styles.myBuildName}>{b.name}</span>
            <span className={styles.myBuildMeta}>
              updated {new Date(b.updatedAt).toLocaleString()}
              {b.published && <> — shared, score {b.score}</>}
            </span>
            <button
              type="button"
              className={`${styles.starBtn} ${b.published ? styles.starred : ''}`}
              title={b.published ? 'Unshare from the community' : 'Share with the community'}
              onClick={() => handleStarToggle(b)}
            >
              {b.published ? '★ Shared' : '☆ Star'}
            </button>
            <button type="button" onClick={() => handleOpen(b)}>Open</button>
            <button type="button" onClick={() => handleDelete(b)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}
