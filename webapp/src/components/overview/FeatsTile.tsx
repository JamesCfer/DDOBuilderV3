// Overview › Feats: every feat slot in level order with what is trained in
// it. Read at a glance; the Feats tab is where they are picked.

import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useCharacter } from '../../context/CharacterContext'
import DdoIcon from '../DdoIcon'
import { buildSlots } from '../../lib/levelTraining'
import styles from './Overview.module.css'

export default function FeatsTile() {
  const { build } = useCharacter()
  const { allClasses, allRaces, allFeats } = useStaticBundle()
  const slots = allClasses.length > 0 ? buildSlots(build, allClasses, allRaces) : []
  const byName = new Map(allFeats.map(f => [f.Name, f]))
  const filled = slots.filter(s => build.featChoices[s.key]).length

  return (
    <div className="panel">
      <div className={`panel-body ${styles.body}`}>
        <div className={styles.meta}>{filled} / {slots.length} chosen</div>
        {slots.length === 0 ? (
          <span className={styles.empty}>Pick a race and a class to see feat slots.</span>
        ) : (
          <div>
            {slots.map(slot => {
              const chosen = build.featChoices[slot.key] ?? ''
              const feat = chosen ? byName.get(chosen) : undefined
              const type = slot.featType.replace(' Feat', '')
              return (
                <div key={slot.key} className={styles.featRow} title={feat?.Description ?? `${type} slot at level ${slot.level}`}>
                  <span className={styles.featLevel}>Lv {slot.level}</span>
                  <span className={styles.iconBox} style={{ width: 22, height: 22 }}>
                    {chosen && <DdoIcon category="FeatImages" name={feat?.Icon ?? chosen} size={18} />}
                  </span>
                  <span className={styles.featName}>
                    {chosen ? chosen : <span className={styles.gearEmpty}>Open slot</span>}
                    <span className={styles.featType}>
                      {type}{slot.className !== 'Universal' && slot.className !== 'Epic' && slot.className !== 'Legendary' ? ` · ${slot.className}` : ''}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
