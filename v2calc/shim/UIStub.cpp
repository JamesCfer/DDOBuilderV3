// v2calc/shim/UIStub.cpp
//
// The remaining GlobalSupportFunctions.cpp free functions and UI-pane hooks
// referenced by the compiled calc-core objects. GlobalSupportFunctions.cpp
// itself is not compiled (it proxies to theApp / the MFC UI). Pure-logic
// helpers (BaseStatToBonus, ClassFromIndex, ReplaceAll, TrainedCount) are
// copied verbatim so they compute correctly; the data-driven Find*/list
// accessors return empty/not-found singletons - they are only exercised on the
// item/enhancement/buff *effect* application path, which v2calc does not yet
// validate (it emits base ability + BAB from Build's own accessors). The UI
// panes are stubbed inert; the app object is absent so LamanniaMode() is false.
#include "stdafx.h"

#include <string>
#include <list>
#include <vector>
#include <cmath>

#include "Class.h"
#include "Item.h"
#include "Buff.h"
#include "Quest.h"
#include "Challenge.h"
#include "OptionalBuff.h"
#include "EnhancementTree.h"
#include "EnhancementTreeItem.h"
#include "Spell.h"
#include "Augment.h"
#include "Filigree.h"
#include "SetBonus.h"
#include "GuildBuff.h"
#include "WeaponGroup.h"
#include "TrainedFeat.h"
#include "ItemAugment.h"
#include "BreakdownItem.h"
#include "Bonus.h"
#include "TreeListCtrl.h"

extern const std::list<Class>& Classes(); // from GlobalDataLinux.cpp

// ---------------------------------------------------------------------------
// pure-logic helpers (verbatim from GlobalSupportFunctions.cpp)
// ---------------------------------------------------------------------------
int BaseStatToBonus(double ability)
{
    ability -= 10;
    int bonus;
    if (ability < 0)
    {
        bonus = (int)ceil((ability - 1) / 2);
    }
    else
    {
        bonus = (int)floor(ability / 2);
    }
    return bonus;
}

const Class& ClassFromIndex(size_t index)
{
    const std::list<Class>& classes = Classes();
    std::list<Class>::const_iterator cit = classes.begin();
    std::advance(cit, index);
    return (*cit);
}

std::string ReplaceAll(std::string str, const std::string& from, const std::string& to)
{
    size_t start_pos = 0;
    while ((start_pos = str.find(from, start_pos)) != std::string::npos)
    {
        str.replace(start_pos, from.length(), to);
        start_pos += to.length();
    }
    return str;
}

// verbatim from GlobalSupportFunctions.cpp - needed by the skill and
// spell-power breakdowns.
int ArmorCheckPenalty_Multiplier(SkillType skill)
{
    int multiplier = 0; // default
    switch (skill)
    {
    case Skill_Balance:
    case Skill_Hide:
    case Skill_Jump:
    case Skill_MoveSilently:
    case Skill_Tumble:
        multiplier = 1;
        break;
    case Skill_Swim:
        // is subject to double the standard Armor check penalty 
        multiplier = 2;
        break;
    }
    return multiplier;
}

BreakdownType SpellPowerToBreakdown(SpellPowerType sp)
{
    BreakdownType bt = Breakdown_Unknown;
    switch (sp)
    {
    case SpellPower_Acid:           bt = Breakdown_SpellPowerAcid; break;
    case SpellPower_Chaos:          bt = Breakdown_SpellPowerChaos; break;
    case SpellPower_Cold:           bt = Breakdown_SpellPowerCold; break;
    case SpellPower_Electric:       bt = Breakdown_SpellPowerElectric; break;
    case SpellPower_Evil:           bt = Breakdown_SpellPowerEvil; break;
    case SpellPower_Fire:           bt = Breakdown_SpellPowerFire; break;
    case SpellPower_Force:          bt = Breakdown_SpellPowerForce; break;
    case SpellPower_Lawful:         bt = Breakdown_SpellPowerLawful; break;
    case SpellPower_LightAlignment: bt = Breakdown_SpellPowerLightAlignment; break;
    case SpellPower_Negative:       bt = Breakdown_SpellPowerNegative; break;
    case SpellPower_Physical:       bt = Breakdown_SpellPowerPhysical; break;
    case SpellPower_Poison:         bt = Breakdown_SpellPowerPoison; break;
    case SpellPower_Positive:       bt = Breakdown_SpellPowerPositive; break;
    case SpellPower_Repair:         bt = Breakdown_SpellPowerRepair; break;
    case SpellPower_Rust:           bt = Breakdown_SpellPowerRust; break;
    case SpellPower_Sonic:          bt = Breakdown_SpellPowerSonic; break;
    case SpellPower_Untyped:        bt = Breakdown_SpellPowerUntyped; break;
    }
    return bt;
}

BreakdownType SpellPowerToCriticalChanceBreakdown(SpellPowerType sp)
{
    BreakdownType bt = Breakdown_Unknown;
    switch (sp)
    {
    case SpellPower_Acid:           bt = Breakdown_SpellCriticalChanceAcid; break;
    case SpellPower_Chaos:          bt = Breakdown_SpellCriticalChanceChaos; break;
    case SpellPower_Cold:           bt = Breakdown_SpellCriticalChanceCold; break;
    case SpellPower_Electric:       bt = Breakdown_SpellCriticalChanceElectric; break;
    case SpellPower_Evil:           bt = Breakdown_SpellCriticalChanceEvil; break;
    case SpellPower_Fire:           bt = Breakdown_SpellCriticalChanceFire; break;
    case SpellPower_Force:          bt = Breakdown_SpellCriticalChanceForce; break;
    case SpellPower_Lawful:         bt = Breakdown_SpellCriticalChanceLawful; break;
    case SpellPower_LightAlignment: bt = Breakdown_SpellCriticalChanceLightAlignment; break;
    case SpellPower_Negative:       bt = Breakdown_SpellCriticalChanceNegative; break;
    case SpellPower_Physical:       bt = Breakdown_SpellCriticalChancePhysical; break;
    case SpellPower_Poison:         bt = Breakdown_SpellCriticalChancePoison; break;
    case SpellPower_Positive:       bt = Breakdown_SpellCriticalChancePositive; break;
    case SpellPower_Repair:         bt = Breakdown_SpellCriticalChanceRepair; break;
    case SpellPower_Rust:           bt = Breakdown_SpellCriticalChanceRust; break;
    case SpellPower_Sonic:          bt = Breakdown_SpellCriticalChanceSonic; break;
    case SpellPower_Untyped:        bt = Breakdown_SpellCriticalChanceUntyped; break;
    }
    return bt;
}

BreakdownType SpellPowerToCriticalMultiplierBreakdown(SpellPowerType sp)
{
    BreakdownType bt = Breakdown_Unknown;
    switch (sp)
    {
    case SpellPower_Acid:           bt = Breakdown_SpellCriticalMultiplierAcid; break;
    case SpellPower_Chaos:          bt = Breakdown_SpellCriticalMultiplierChaos; break;
    case SpellPower_Cold:           bt = Breakdown_SpellCriticalMultiplierCold; break;
    case SpellPower_Electric:       bt = Breakdown_SpellCriticalMultiplierElectric; break;
    case SpellPower_Evil:           bt = Breakdown_SpellCriticalMultiplierEvil; break;
    case SpellPower_Fire:           bt = Breakdown_SpellCriticalMultiplierFire; break;
    case SpellPower_Force:          bt = Breakdown_SpellCriticalMultiplierForce; break;
    case SpellPower_Lawful:         bt = Breakdown_SpellCriticalMultiplierLawful; break;
    case SpellPower_LightAlignment: bt = Breakdown_SpellCriticalMultiplierLightAlignment; break;
    case SpellPower_Negative:       bt = Breakdown_SpellCriticalMultiplierNegative; break;
    case SpellPower_Physical:       bt = Breakdown_SpellCriticalMultiplierPhysical; break;
    case SpellPower_Poison:         bt = Breakdown_SpellCriticalMultiplierPoison; break;
    case SpellPower_Positive:       bt = Breakdown_SpellCriticalMultiplierPositive; break;
    case SpellPower_Repair:         bt = Breakdown_SpellCriticalMultiplierRepair; break;
    case SpellPower_Rust:           bt = Breakdown_SpellCriticalMultiplierRust; break;
    case SpellPower_Sonic:          bt = Breakdown_SpellCriticalMultiplierSonic; break;
    case SpellPower_Untyped:        bt = Breakdown_SpellCriticalMultiplierUntyped; break;
    }
    return bt;
}


// verbatim from GlobalSupportFunctions.cpp (that TU is UI-heavy and not
// compiled headless) - needed by the skill breakdowns.
AbilityType StatFromSkill(SkillType skill)
{
    // return which ability provides the bonus to the skill type
    AbilityType at = Ability_Unknown;
    switch (skill)
    {
    case Skill_Bluff:
    case Skill_Diplomacy:
    case Skill_Haggle:
    case Skill_Intimidate:
    case Skill_Perform:
    case Skill_UMD:
        at = Ability_Charisma;
        break;

    case Skill_Concentration:
        at = Ability_Constitution;
        break;

    case Skill_Balance:
    case Skill_Hide:
    case Skill_MoveSilently:
    case Skill_OpenLock:
    case Skill_Tumble:
        at = Ability_Dexterity;
        break;

    case Skill_DisableDevice:
    case Skill_Repair:
    case Skill_Search:
    case Skill_SpellCraft:
        at = Ability_Intelligence;
        break;

    case Skill_Heal:
    case Skill_Listen:
    case Skill_Spot:
        at = Ability_Wisdom;
        break;

    case Skill_Jump:
    case Skill_Swim:
        at = Ability_Strength;
        break;

    default:
        break;
    }
    ASSERT(at != Ability_Unknown);  // should have been found
    return at;
}

size_t TrainedCount(const std::list<TrainedFeat>& currentFeats, const std::string& featName)
{
    size_t count = 0;
    for (const auto& tf : currentFeats)
    {
        if (tf.FeatName() == featName) ++count;
    }
    return count;
}

// ---------------------------------------------------------------------------
// The data-driven lookups (FindItem/FindBuff/FindQuest/FindChallenge/
// FindOptionalBuff/FindSetBonus/FindAugmentByName/FindFiligreeByName/
// GetEnhancementTree/FindEnhancement (all overloads)/FindSpellByName/FindBonus/
// AddSpecialSlots/AddAugment/CanEquipTo2ndWeapon) and the GuildBuffs()/
// WeaponGroups() accessors are now REAL: shim/GlobalDataLinux.cpp loads the
// backing data files and provides the verbatim GlobalSupportFunctions.cpp
// implementations. They were removed from here so every symbol has exactly one
// definition.
// FindBreakdown is provided by shim/BreakdownHostLinux.cpp (headless registry).

// MfcControls::CTreeListCtrl tree population - never called on the compute path
// (BreakdownItem::Populate null-guards m_pTreeList, which is null headless).
// Present only so BreakdownItem.o links.
namespace MfcControls
{
    BOOL CTreeListCtrl::SetItemText(HTREEITEM, int, LPCTSTR)        { return TRUE; }
    BOOL CTreeListCtrl::SetItemColor(HTREEITEM, COLORREF, BOOL)     { return TRUE; }
    HTREEITEM CTreeListCtrl::GetSelectedItem() const               { return nullptr; }
    BOOL CTreeListCtrl::SelectItem(HTREEITEM)                       { return TRUE; }
}

// BreakdownItem::SetLockState is now provided by the real (V2CALC_LINUX-guarded)
// BreakdownItem.cpp, compiled for the headless breakdown host.
