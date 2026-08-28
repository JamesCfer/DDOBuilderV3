import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useCharacter } from '../../context/CharacterContext'
import {
  favorFeatTrainedCount, canTrainFavorFeat, canRevokeFavorFeat,
} from '../../lib/specialFeats'
import type { Feat, Patron, Quest } from '../../types/ddo'
import styles from './FavorPanel.module.css'

// V2 Feat::MaxTimesAcquire defaults to 1 when the feat file omits it.
const ACQUIRE_MAX_DEFAULT = 1

/** Patrons.xml's pseudo-patron covering favor earned across every patron. */
const TOTAL_FAVOR_PATRON = 'Total Favor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFavorTiers(raw: unknown): number[] {
  if (raw == null) return []
  if (typeof raw === 'string') return raw.split(' ').map(Number).filter(n => !isNaN(n))
  if (typeof raw === 'number') return [raw]
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>
    const text = obj['#text']
    if (typeof text === 'string') return text.split(' ').map(Number).filter(n => !isNaN(n))
    if (typeof text === 'number') return [text]
  }
  return []
}

function questFavor(q: Quest): number {
  return typeof q.Favor === 'number' ? q.Favor : 0
}

/**
 * V2 `CDDOBuilderApp::LoadQuests` (`DDOBuilder.cpp:1136-1144`) excludes
 * `IgnoreForTotalFavor`-flagged entries from the per-patron and grand max-
 * favor tallies, so a quest appearing more than once for different level
 * brackets (`Quests.xml`'s "Devil Assault (Normal)"/"(Hard)", each flagged,
 * vs. the unflagged "Devil Assault (Elite)") isn't double-counted.
 */
function favorMaxTotal(quests: Quest[]): number {
  return quests.reduce((sum, q) => sum + (q.IgnoreForTotalFavor ? 0 : questFavor(q)), 0)
}

// ---------------------------------------------------------------------------
// PatronRow sub-component
// ---------------------------------------------------------------------------

interface PatronRowProps {
  patron: Patron
  quests: Quest[]
  completedQuests: Record<string, boolean>
  onToggle: (questName: string) => void
  /** The patron's reward feat (Patrons.xml <AssociatedFavorFeat>), if any. */
  favorFeat?: Feat
  /** Reward ranks currently claimed (V2 Build::m_FavorFeats occurrences). */
  claimedRanks: number
  onClaim: () => void
  onUnclaim: () => void
  canClaim: boolean
  canUnclaim: boolean
  /**
   * Patrons.xml's last entry is the pseudo-patron "Total Favor" — its tiers
   * are cleared by favor earned EVERYWHERE, and it owns no quests of its own.
   * Supplying totals here drives its tiers and reward ranks off the build's
   * whole favor sum instead of an empty quest list.
   */
  favorTotals?: { current: number; available: number }
}

function PatronRow({
  patron, quests, completedQuests, onToggle,
  favorFeat, claimedRanks, onClaim, onUnclaim, canClaim, canUnclaim, favorTotals,
}: PatronRowProps) {
  const [collapsed, setCollapsed] = useState(true)

  const tiers = parseFavorTiers(patron.FavorTiers)
  const totalAvailable = favorTotals
    ? favorTotals.available
    : favorMaxTotal(quests)
  const currentFavor = favorTotals
    ? favorTotals.current
    : quests
      .filter(q => completedQuests[q.Name])
      .reduce((sum, q) => sum + questFavor(q), 0)

  // Find which tier is currently achieved (highest tier <= currentFavor)
  const achievedTierIdx = tiers.reduce((best, tier, idx) => (currentFavor >= tier ? idx : best), -1)
  // Tiers cleared = reward ranks the ticked quests have earned.
  const earnedRanks = achievedTierIdx + 1
  // Next tier to achieve
  const nextTierIdx = achievedTierIdx + 1 < tiers.length ? achievedTierIdx + 1 : -1

  const completedCount = quests.filter(q => completedQuests[q.Name]).length

  return (
    <div className={styles.patronCard}>
      <div
        className={styles.patronHeader}
        onClick={favorTotals ? undefined : () => setCollapsed(v => !v)}
      >
        <div className={styles.patronLeft}>
          {!favorTotals && (
            <span className={styles.patronCollapse}>{collapsed ? '▶' : '▼'}</span>
          )}
          <span className={styles.patronName}>{patron.Name}</span>
          {patron.AssociatedFavorFeat && (
            <span className={styles.patronFeat}>{patron.AssociatedFavorFeat}</span>
          )}
        </div>
        <div className={styles.patronRight}>
          {!favorTotals && (
            <span className={styles.patronProgress}>
              {completedCount}/{quests.length} quests
            </span>
          )}
          <span className={styles.patronFavorVal}>
            {currentFavor} / {totalAvailable} favor
          </span>
        </div>
      </div>

      {/* Tier progress bar */}
      {tiers.length > 0 && (
        <div className={styles.tierRow}>
          {tiers.map((tier, idx) => {
            const achieved = idx <= achievedTierIdx
            const isNext = idx === nextTierIdx
            return (
              <span
                key={idx}
                className={`${styles.tier} ${achieved ? styles.tierAchieved : ''} ${isNext ? styles.tierNext : ''}`}
                title={`Tier ${idx + 1}: ${tier} favor`}
              >
                {tier}
              </span>
            )
          })}
        </div>
      )}

      {/* Favor reward ranks — V2 trains these as repeat copies of the
          patron's <AssociatedFavorFeat> (SpecialFeatsPane "Favor" group).
          The ticked quests only ADVISE how many ranks are earned: V2 lets a
          build claim a rank regardless, so neither button is gated on favor. */}
      {favorFeat && (
        <div className={styles.rewardRow}>
          <span className={styles.rewardLabel} title={favorFeat.Description ?? favorFeat.Name}>
            Reward ranks
          </span>
          <div className={styles.rewardControls}>
            <button
              className={styles.rewardBtn}
              onClick={onUnclaim}
              disabled={!canUnclaim}
              aria-label={`Remove a ${patron.Name} favor reward rank`}
            >−</button>
            <span className={styles.rewardCount} data-nonzero={claimedRanks > 0}>
              {claimedRanks}/{favorFeat.MaxTimesAcquire ?? ACQUIRE_MAX_DEFAULT}
            </span>
            <button
              className={styles.rewardBtn}
              onClick={onClaim}
              disabled={!canClaim}
              aria-label={`Claim a ${patron.Name} favor reward rank`}
            >+</button>
          </div>
          <span className={styles.rewardEarned}>
            {earnedRanks} earned by favor
          </span>
        </div>
      )}

      {/* Quest list */}
      {!collapsed && !favorTotals && (
        <div className={styles.questList}>
          {quests.length === 0 ? (
            <p className={styles.noQuests}>No quests for this patron.</p>
          ) : (
            quests
              .slice()
              .sort((a, b) => a.Name.localeCompare(b.Name))
              .map(quest => (
                <label key={quest.Name} className={styles.questRow}>
                  <input
                    type="checkbox"
                    className={styles.questCheck}
                    checked={!!completedQuests[quest.Name]}
                    onChange={() => onToggle(quest.Name)}
                  />
                  <span className={`${styles.questName} ${completedQuests[quest.Name] ? styles.questDone : ''}`}>
                    {quest.Name}
                  </span>
                  {quest.AdventurePack && (
                    <span className={styles.questPack}>{quest.AdventurePack}</span>
                  )}
                  <span className={styles.questFavor}>{questFavor(quest)} favor</span>
                </label>
              ))
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// FavorPanel
// ---------------------------------------------------------------------------

export default function FavorPanel() {
  const { build, dispatch } = useCharacter()
  const [patrons, setPatrons] = useState<Patron[]>([])
  const [quests, setQuests] = useState<Quest[]>([])
  // V2 SpecialFeatsPane "Favor" group (FeatAcquisition_Favor): the patron
  // reward feats. They used to be edited on the Past Lives panel, three tabs
  // away from the favor that earns them — they live here now.
  const [favorFeats, setFavorFeats] = useState<Feat[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // V2 Update 79 added Challenges.xml. Treat them as quests for the favor
    // panel: each challenge becomes a Quest record so they appear under their
    // patron alongside regular quests.
    Promise.all([
      api.patrons(),
      api.quests(),
      api.challenges().catch(() => []),
      api.feats({ acquire: 'Favor' }).catch(() => [] as Feat[]),
    ])
      .then(([p, q, ch, ff]) => {
        setPatrons(Array.isArray(p) ? p : [])
        setFavorFeats(Array.isArray(ff) ? ff : [])
        const baseQuests = Array.isArray(q) ? q.filter(quest => !quest.DoNotShow) : []
        const challengeQuests: Quest[] = (Array.isArray(ch) ? ch : []).map((c) => ({
          Name: c.Name,
          Patron: c.Patron,
          AdventurePack: c.AdventurePack,
          // Challenges in V2 don't carry per-tier favor in the XML so we use
          // 0 for the moment; the user can still tick them complete.
          Favor: 0,
          Levels: c.LevelRange,
        }))
        setQuests([...baseQuests, ...challengeQuests])
      })
      .catch(() => {
        setPatrons([])
        setQuests([])
        setFavorFeats([])
      })
      .finally(() => setLoading(false))
  }, [])

  function handleToggle(questName: string) {
    dispatch({ type: 'TOGGLE_QUEST', questName })
  }

  function claim(featName: string) {
    dispatch({ type: 'TRAIN_FAVOR_FEAT', featName })
  }

  function unclaim(featName: string) {
    dispatch({ type: 'REVOKE_FAVOR_FEAT', featName })
  }

  const favorFeatByName = new Map(favorFeats.map(f => [f.Name, f]))
  // Reward feats no patron claims (Patrons.xml has no AssociatedFavorFeat for
  // them) still need somewhere to be edited.
  const patronFeatNames = new Set(
    patrons.map(p => p.AssociatedFavorFeat).filter((n): n is string => !!n),
  )
  const unpatronedFeats = favorFeats.filter(f => !patronFeatNames.has(f.Name))

  // Group quests by patron name
  const questsByPatron = new Map<string, Quest[]>()
  for (const quest of quests) {
    const patronName = quest.Patron ?? 'None'
    if (!questsByPatron.has(patronName)) questsByPatron.set(patronName, [])
    questsByPatron.get(patronName)!.push(quest)
  }

  // Total favor across all completed quests
  const totalFavor = quests
    .filter(q => build.completedQuests[q.Name])
    .reduce((sum, q) => sum + questFavor(q), 0)

  const totalAvailable = favorMaxTotal(quests)

  return (
    <div className="panel">
      <div className="panel-header">Favor</div>
      <div className="panel-body">
        {loading ? (
          <p className={styles.empty}>Loading favor data&hellip;</p>
        ) : (
          <>
            <div className={styles.totalRow}>
              <span className={styles.totalLabel}>Total Favor</span>
              <span className={styles.totalValue}>{totalFavor} / {totalAvailable}</span>
            </div>
            <div className={styles.patronList}>
              {patrons.map(patron => {
                const patronQuests = questsByPatron.get(patron.Name) ?? []
                const feat = patron.AssociatedFavorFeat
                  ? favorFeatByName.get(patron.AssociatedFavorFeat)
                  : undefined
                const max = feat?.MaxTimesAcquire ?? ACQUIRE_MAX_DEFAULT
                return (
                  <PatronRow
                    key={patron.Name}
                    patron={patron}
                    quests={patronQuests}
                    completedQuests={build.completedQuests}
                    onToggle={handleToggle}
                    favorFeat={feat}
                    claimedRanks={feat ? favorFeatTrainedCount(build, feat.Name) : 0}
                    onClaim={() => feat && claim(feat.Name)}
                    onUnclaim={() => feat && unclaim(feat.Name)}
                    canClaim={!!feat && canTrainFavorFeat(build, feat.Name, max)}
                    canUnclaim={!!feat && canRevokeFavorFeat(build, feat.Name)}
                    favorTotals={patron.Name === TOTAL_FAVOR_PATRON
                      ? { current: totalFavor, available: totalAvailable }
                      : undefined}
                  />
                )
              })}
            </div>

            {unpatronedFeats.length > 0 && (
              <div className={styles.otherRewards}>
                <div className={styles.otherTitle}>Other favor rewards</div>
                {unpatronedFeats.map(feat => {
                  const max = feat.MaxTimesAcquire ?? ACQUIRE_MAX_DEFAULT
                  const claimed = favorFeatTrainedCount(build, feat.Name)
                  return (
                    <div key={feat.Name} className={styles.rewardRow}>
                      <span className={styles.rewardLabel} title={feat.Description ?? feat.Name}>
                        {feat.Name}
                      </span>
                      <div className={styles.rewardControls}>
                        <button
                          className={styles.rewardBtn}
                          onClick={() => unclaim(feat.Name)}
                          disabled={!canRevokeFavorFeat(build, feat.Name)}
                          aria-label={`Remove a ${feat.Name} rank`}
                        >−</button>
                        <span className={styles.rewardCount} data-nonzero={claimed > 0}>
                          {claimed}/{max}
                        </span>
                        <button
                          className={styles.rewardBtn}
                          onClick={() => claim(feat.Name)}
                          disabled={!canTrainFavorFeat(build, feat.Name, max)}
                          aria-label={`Claim a ${feat.Name} rank`}
                        >+</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
