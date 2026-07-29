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
class Stance;

namespace v2calc
{
    // Headless stance evaluation (AutoStancesLinux.cpp): replicates
    // CStancesPane's auto/user stance state machine so Build::m_Stances is
    // correct even for .DDOBuild files without persisted <ActiveStances>
    // (e.g. fuzz builds). Called by ComputeBreakdowns around BuildNowActive.
    void StancesOnBuildActive(Character* pCharacter, Build* pBuild);
    void StanceGranted(Character* pCharacter, const Stance& stance);
    void StancesSettle(Character* pCharacter, Build* pBuild);

    // Build every supported breakdown, wire the effect graph, and drive the
    // effect-application path on pBuild so the breakdowns receive real effects.
    // Must be called after the build is parsed and its class cache rebuilt.
    void ComputeBreakdowns(Character* pCharacter, Build* pBuild);

    // Query a breakdown's fed value. HasBreakdown() reports whether that
    // breakdown was constructed (i.e. is "live").
    bool   HasBreakdown(BreakdownType bt);
    double Total(BreakdownType bt);         // BreakdownItem::Total()
    double Capped(BreakdownType bt);        // BreakdownItem::CappedTotal()

    // Parity debugging: print the breakdown's per-effect pools to stderr
    // (BreakdownItem::V2CalcDumpEffects). No-op for unknown types.
    void   DumpEffects(BreakdownType bt, const char* label);
}
