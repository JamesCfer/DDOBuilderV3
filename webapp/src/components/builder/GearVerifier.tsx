// V2 Build::VerifyGear (Build.cpp:2648-2690): after a race, class or level
// edit, every equipped item whose MinLevel exceeds the character level or
// whose <Requirements> the edited build no longer meets is unequipped (V2
// logs "Item in slot X removed as requirements no longer met."). V2 never
// runs it when a build is loaded, so saved gear survives a load untouched;
// this component only acts when an edit bumps the provider's tick.

import { useEffect, useMemo, useRef } from 'react'
import { useCharacter } from '../../context/CharacterContext'
import { useStaticBundle } from '../../hooks/useStaticBundle'
import { useGearItems } from '../../hooks/useGearItems'
import { useBuildStats } from '../../hooks/useBuildStats'
import { gearSlotsFailingRequirements } from '../../lib/buildStats'

export default function GearVerifier() {
  const { build, dispatch, gearVerifyTick = 0 } = useCharacter()
  const bundle = useStaticBundle()
  const gearItems = useGearItems(build.gear)
  const statsInput = useMemo(() => ({ ...bundle, gearItems }), [bundle, gearItems])
  const stats = useBuildStats(statsInput)
  const handledTick = useRef(gearVerifyTick)

  useEffect(() => {
    if (gearVerifyTick === handledTick.current) return
    // Without the catalogues every class/race requirement reads as failed;
    // wait for them rather than strip gear on an incomplete picture.
    if (!bundle.loaded) return
    // Likewise wait until every equipped item has resolved.
    if (Object.entries(build.gear).some(([slot, name]) => name && !gearItems[slot])) return
    handledTick.current = gearVerifyTick
    for (const slot of gearSlotsFailingRequirements(stats.keys())) {
      if (build.gear[slot]) dispatch({ type: 'CLEAR_GEAR', slot })
    }
  }, [gearVerifyTick, bundle.loaded, stats, build.gear, gearItems, dispatch])

  return null
}
