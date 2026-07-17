import { useMemo } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { buildAutomaticFeatGroups } from '../../lib/automaticFeats'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import styles from './AutomaticFeats.module.css'

export default function AutomaticFeats() {
  const { build } = useCharacter()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const { allClasses, allRaces } = bundle

  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])

  const stats = useBuildStats(statsInput)

  const groups = buildAutomaticFeatGroups(build, allClasses, allRaces)
  const grantedFeats = stats.grantedFeatsList
  const hasSelection = build.race || build.classes.some(c => c.name && c.levels > 0)

  return (
    <div className="panel">
      <div className="panel-header">Automatic Feats</div>
      <div className="panel-body">
        {!hasSelection ? (
          <p className={styles.empty}>Select a race and classes to see automatic feats.</p>
        ) : groups.length === 0 && grantedFeats.length === 0 ? (
          <p className={styles.empty}>No automatic feats granted at current levels.</p>
        ) : (
          <div className={styles.groups}>
            {groups.length > 0 && (
              <>
                {groups.map(group => (
                  <div key={group.source} className={styles.group}>
                    <div className={styles.groupHeader}>{group.source}</div>
                    <ul className={styles.featList}>
                      {group.feats.map(feat => (
                        <li key={feat} className={styles.featRow}>
                          <span className={styles.featName}>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
            {grantedFeats.length > 0 && (
              <div className={styles.group}>
                <div className={styles.groupHeader}>Granted Feats</div>
                <ul className={styles.featList}>
                  {grantedFeats.map(feat => (
                    <li key={feat} className={styles.featRow}>
                      <span className={styles.featName}>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
