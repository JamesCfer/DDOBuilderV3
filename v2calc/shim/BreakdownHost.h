// v2calc/shim/BreakdownHost.h
//
// Public API for the headless breakdown host (BreakdownHostLinux.cpp). It
// constructs V2's own BreakdownItem subclasses (mirroring the relevant parts of
// CBreakdownsPane::CreateBreakdowns), wires them into an effect-forwarding
// observer graph, drives Build::BuildNowActive() so feat/enhancement/gear/stance
// effects reach them, and exposes each breakdown's fed Total()/CappedTotal().
#pragma once

#include "BreakdownTypes.h"

class Character;
class Build;

namespace v2calc
{
    // Build every supported breakdown, wire the effect graph, and drive the
    // effect-application path on pBuild so the breakdowns receive real effects.
    // Must be called after the build is parsed and its class cache rebuilt.
    void ComputeBreakdowns(Character* pCharacter, Build* pBuild);

    // Query a breakdown's fed value. HasBreakdown() reports whether that
    // breakdown was constructed (i.e. is "live").
    bool   HasBreakdown(BreakdownType bt);
    double Total(BreakdownType bt);         // BreakdownItem::Total()
    double Capped(BreakdownType bt);        // BreakdownItem::CappedTotal()
}
