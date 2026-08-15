// Hover card for a spell: the icon, the full description, and the structured
// bits the row only has room to abbreviate — damage dice at this build's
// caster level, the save it allows, what it grants, and the metamagics it
// accepts. The row used to carry the description in a native `title=`, which
// showed no icon and no structure.

import type { Spell } from '../../types/ddo'
import DdoIcon from '../DdoIcon'
import { HoverHeader, HoverBody, HoverSection, hoverStyles as h } from '../common/HoverCard'
import { spellDamageLines, spellSaveLines, spellEffectLines } from '../../lib/spells/spellDisplay'
import { availableMetamagics } from '../../lib/spells/spellMath'
import styles from './SpellsPanel.module.css'

export interface SpellCardStats {
  spellLevel: number
  casterLevel: number
  maxCasterLevel: number
  cost: number
  /** Highest DC across the spell's SpellDC entries, when it has any. */
  dc?: number
}

export function SpellCardContent({ spell, className, stats }: {
  spell: Spell
  className: string
  stats: SpellCardStats
}) {
  const school = Array.isArray(spell.School) ? spell.School.join('/') : spell.School
  const damage = spellDamageLines(spell, stats.casterLevel)
  const saves = spellSaveLines(spell)
  const effects = spellEffectLines(spell, stats.casterLevel)
  const metamagics = availableMetamagics(spell)

  return (
    <>
      <HoverHeader
        icon={<DdoIcon category="SpellImages" name={spell.Icon ?? spell.Name} size={28} />}
        title={spell.Name}
        subtitle={`${className} level ${stats.spellLevel}${school ? ` · ${school}` : ''}`}
      />
      <HoverBody>
        {spell.Description && (
          <div className={h.description}>{spell.Description}</div>
        )}

        <div className={styles.cardStats}>
          <span className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Caster level</span>
            {stats.casterLevel}
            {Number.isFinite(stats.maxCasterLevel) && ` / ${stats.maxCasterLevel} max`}
          </span>
          <span className={styles.cardStat}>
            <span className={styles.cardStatLabel}>Spell points</span>
            {stats.cost}
          </span>
          {stats.dc !== undefined && (
            <span className={styles.cardStat}>
              <span className={styles.cardStatLabel}>DC</span>
              {stats.dc}
            </span>
          )}
          {spell.Cooldown != null && (
            <span className={styles.cardStat}>
              <span className={styles.cardStatLabel}>Cooldown</span>
              {spell.Cooldown}s
            </span>
          )}
        </div>

        {damage.length > 0 && (
          <HoverSection title="Damage">
            <div className={h.effects}>
              {damage.map((d, i) => (
                <div className={h.effectRow} key={i}>
                  <span className={h.effectValue}>{d.atCasterLevel ?? d.dice}</span>
                  <span className={h.effectName}>
                    {d.damage ?? 'damage'}
                    {d.scaling && (
                      <span className={styles.cardScaling}>
                        {d.atCasterLevel ? ` (${d.dice} ${d.scaling})` : ` — ${d.dice} ${d.scaling}`}
                      </span>
                    )}
                  </span>
                  {d.spellPower && <span className={h.chip}>{d.spellPower} power</span>}
                </div>
              ))}
            </div>
          </HoverSection>
        )}

        {saves.length > 0 && (
          <HoverSection title="Saving throw">
            <div className={h.effects}>
              {saves.map((s, i) => (
                <div className={h.effectRow} key={i}>
                  <span className={h.effectName}>
                    {s.versus}{s.effect ? ` — ${s.effect}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </HoverSection>
        )}

        {effects.length > 0 && (
          <HoverSection title="Effects">
            <div className={h.effects}>
              {effects.map((e, i) => (
                <div className={h.effectRow} key={i}>
                  <span className={h.effectValue}>{e.value ?? ''}</span>
                  <span className={h.effectName}>
                    {e.label}
                    {e.targets && <span className={styles.cardScaling}> ({e.targets})</span>}
                  </span>
                  {e.bonusType && <span className={h.chip}>{e.bonusType}</span>}
                </div>
              ))}
            </div>
          </HoverSection>
        )}

        {metamagics.length > 0 && (
          <HoverSection title="Metamagic">
            <div className={styles.cardMetamagics}>
              {metamagics.map(mm => <span className={h.chip} key={mm}>{mm}</span>)}
            </div>
          </HoverSection>
        )}
      </HoverBody>
    </>
  )
}
