// The strip that appears while this browser is editing a build together with
// other people: who else is in it, whether the live channel is up, and the way
// out. Hidden entirely when no shared session is running, so the app looks
// exactly as it did for anyone not collaborating.

import { useCollab } from '../../context/CollabContext'
import styles from './CollabBar.module.css'

const STATUS_TEXT: Record<string, string> = {
  connecting: 'Connecting…',
  live: 'Live',
  offline: 'Reconnecting…',
  revoked: 'Sharing was turned off',
}

export default function CollabBar() {
  const { token, status, participants, buildName, owner, error, leave } = useCollab()
  if (!token) return null

  return (
    <div className={styles.bar} role="status">
      <span className={`${styles.dot} ${styles[status]}`} aria-hidden="true" />
      <span className={styles.status}>{STATUS_TEXT[status] ?? status}</span>
      <span className={styles.name}>
        Editing <b>{buildName}</b>
        {owner && <span className={styles.owner}> · {owner}’s build</span>}
      </span>

      <span className={styles.people}>
        {participants.map(p => (
          <span
            key={p.id}
            className={styles.person}
            style={{ borderColor: p.color, color: p.color }}
            title={p.isOwner ? `${p.name} (owner)` : p.name}
          >
            {p.name}
            {p.isOwner && <span className={styles.crown} aria-hidden="true"> ♦</span>}
          </span>
        ))}
        {participants.length === 0 && <span className={styles.alone}>Just you, for now</span>}
      </span>

      {error && <span className={styles.error}>{error}</span>}
      <button type="button" className={styles.leave} onClick={leave}>Leave session</button>
    </div>
  )
}
