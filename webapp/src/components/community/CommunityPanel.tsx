// Community build browser — published builds with "by (name)" attribution,
// up/down votes, class/race filters and stat sorting (HeroForge-style).

import { useCallback, useEffect, useState } from 'react'
import styles from './Community.module.css'
import { useAuth } from '../../context/AuthContext'
import { communityApi } from '../../lib/community/api'
import type { CommunityListing, CommunitySort } from '../../lib/community/api'
import { api } from '../../api'
import { migrateDocument } from '../../hooks/usePersistence'
import { isCharacterDocument } from '../../lib/multiLife'
import type { CharacterDocument } from '../../types/ddo'

const SORTS: Array<{ key: CommunitySort; label: string }> = [
  { key: 'votes', label: 'Top voted' },
  { key: 'newest', label: 'Newest' },
  { key: 'meleePower', label: 'Melee Power' },
  { key: 'rangedPower', label: 'Ranged Power' },
  { key: 'hp', label: 'Hit Points' },
  { key: 'ac', label: 'Armor Class' },
  { key: 'prr', label: 'PRR' },
  { key: 'mrr', label: 'MRR' },
  { key: 'totalLevel', label: 'Level' },
]

interface CommunityPanelProps {
  onLoad: (doc: CharacterDocument) => void
}

export default function CommunityPanel({ onLoad }: CommunityPanelProps) {
  const { user } = useAuth()
  const [listings, setListings] = useState<CommunityListing[]>([])
  const [classNames, setClassNames] = useState<string[]>([])
  const [raceNames, setRaceNames] = useState<string[]>([])
  const [cls, setCls] = useState('')
  const [race, setRace] = useState('')
  const [sort, setSort] = useState<CommunitySort>('votes')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    api.classes().then(cs => setClassNames(cs.map(c => c.Name).sort())).catch(() => { /* filter stays empty */ })
    api.races().then(rs => setRaceNames(rs.map(r => r.Name).sort())).catch(() => { /* filter stays empty */ })
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    communityApi.list({ cls: cls || undefined, race: race || undefined, sort })
      .then(setListings)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load community builds'))
      .finally(() => setLoading(false))
  }, [cls, race, sort])

  useEffect(() => { refresh() }, [refresh])

  async function handleVote(l: CommunityListing, dir: 1 | -1) {
    if (!user) {
      setNotice('Sign in (My Builds tab) to vote on community builds.')
      return
    }
    setNotice(null)
    const value = l.myVote === dir ? 0 : dir  // clicking the same arrow again clears the vote
    try {
      const { score, myVote } = await communityApi.vote(l.id, value)
      setListings(ls => ls.map(x => (x.id === l.id ? { ...x, score, myVote } : x)))
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Vote failed')
    }
  }

  async function handleLoad(l: CommunityListing) {
    setNotice(null)
    try {
      const { document, name } = await communityApi.getPublished(l.id)
      if (!isCharacterDocument(document)) throw new Error('Build data is not a valid character document')
      // The listing name is the character's name for a document whose own
      // builds were never named (older saves carry their life's "Life 1").
      onLoad(migrateDocument(document, name || l.name))
      setNotice(`Loaded "${l.name}" by ${l.author} — it is now your working character.`)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Load failed')
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <label>
          Class
          <select value={cls} onChange={e => setCls(e.target.value)}>
            <option value="">Any</option>
            {classNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Race
          <select value={race} onChange={e => setRace(e.target.value)}>
            <option value="">Any</option>
            {raceNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label>
          Sort by
          <select value={sort} onChange={e => setSort(e.target.value as CommunitySort)}>
            {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={refresh}>↻ Refresh</button>
      </div>

      {notice && <div className={styles.notice}>{notice}</div>}
      {error && <div className={styles.error}>{error}</div>}
      {loading && <div className={styles.notice}>Loading community builds…</div>}
      {!loading && !error && listings.length === 0 && (
        <div className={styles.notice}>
          No community builds yet{cls || race ? ' matching these filters' : ''}.
          Star one of your own builds from the My Builds tab to share it!
        </div>
      )}

      <div className={styles.grid}>
        {listings.map(l => (
          <div key={l.id} className={styles.card}>
            <div className={styles.voteRail}>
              <button
                type="button"
                className={`${styles.voteBtn} ${l.myVote === 1 ? styles.voteUpActive : ''}`}
                title={user ? 'Upvote' : 'Sign in to vote'}
                onClick={() => handleVote(l, 1)}
              >
                ▲
              </button>
              <span className={styles.score}>{l.score}</span>
              <button
                type="button"
                className={`${styles.voteBtn} ${l.myVote === -1 ? styles.voteDownActive : ''}`}
                title={user ? 'Downvote' : 'Sign in to vote'}
                onClick={() => handleVote(l, -1)}
              >
                ▼
              </button>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.cardTitleRow}>
                <span className={styles.cardTitle}>{l.name}</span>
                <span className={styles.byline}>by <b>{l.author}</b></span>
              </div>
              {l.snapshot && (
                <>
                  <div className={styles.cardMeta}>
                    {l.snapshot.race} — {l.snapshot.classesLabel || l.snapshot.classes.join(' / ')} (L{l.snapshot.totalLevel})
                  </div>
                  <div className={styles.statChips}>
                    <span className={styles.chip}>HP <b>{l.snapshot.hp}</b></span>
                    <span className={styles.chip}>AC <b>{l.snapshot.ac}</b></span>
                    <span className={styles.chip}>PRR <b>{l.snapshot.prr}</b></span>
                    <span className={styles.chip}>MRR <b>{l.snapshot.mrr}</b></span>
                    <span className={styles.chip}>MP <b>{l.snapshot.meleePower}</b></span>
                    <span className={styles.chip}>RP <b>{l.snapshot.rangedPower}</b></span>
                  </div>
                </>
              )}
              <div className={styles.cardActions}>
                <button type="button" onClick={() => handleLoad(l)} title="Load this build into the builder">
                  Open in Builder
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
