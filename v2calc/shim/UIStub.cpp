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
// data-driven lookups - not-found singletons (effect path only, unvalidated)
// ---------------------------------------------------------------------------
const Item& FindItem(const std::string&)                    { static Item x; return x; }
const Buff& FindBuff(const std::string&)                    { static Buff x; return x; }
const Quest& FindQuest(const std::string&)                  { static Quest x; return x; }
const Challenge& FindChallenge(const std::string&)          { static Challenge x; return x; }
const OptionalBuff& FindOptionalBuff(const std::string&)    { static OptionalBuff x; return x; }
const SetBonus& FindSetBonus(const std::string&)            { static SetBonus x; return x; }
const Augment& FindAugmentByName(const std::string&, const Item*) { static Augment x; return x; }
const Filigree& FindFiligreeByName(const std::string&)      { static Filigree x; return x; }
const EnhancementTree& GetEnhancementTree(const std::string&) { static EnhancementTree x; return x; }
const EnhancementTreeItem* FindEnhancement(const std::string&) { return nullptr; }
const EnhancementTreeItem* FindEnhancement(const std::string&, const std::string&) { return nullptr; }
const EnhancementTreeItem* FindEnhancement(const std::string&, std::string*) { return nullptr; }
Spell FindSpellByName(const std::string&, bool)             { return Spell(); }
void AddSpecialSlots(InventorySlotType, Item&)              {}
void AddAugment(std::vector<ItemAugment>*, const std::string&, bool) {}
bool CanEquipTo2ndWeapon(Build*, const Item&)               { return false; }
// FindBreakdown is provided by shim/BreakdownHostLinux.cpp (headless registry).

const std::list<GuildBuff>&  GuildBuffs()  { static std::list<GuildBuff> x;  return x; }
const std::list<WeaponGroup>& WeaponGroups() { static std::list<WeaponGroup> x; return x; }

// FindBonus: BreakdownItem::RemoveNonStacking consults the bonus-type registry
// (which bonus types stack). The bonus type data file is not yet loaded, so
// return a not-found bonus (its default StacksCap allows stacking) - this only
// affects same-named non-stacking bonus dedup, not base/feat totals.
const Bonus& FindBonus(const std::string&)                  { static Bonus x; return x; }

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
