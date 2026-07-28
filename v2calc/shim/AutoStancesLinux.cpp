// v2calc/shim/AutoStancesLinux.cpp
//
// Headless replication of CStancesPane's stance evaluation.
//
// In the Windows build, V2's displayed stats depend on Build::m_Stances (via
// Build::IsStanceActive), and that set is maintained by the stances pane:
//   - CStancesPane::CreateStanceWindows() creates a CStanceButton for every
//     stance in Stances.xml, PLUS dynamically-generated "Auto" stances for
//     each weapon type ("You are wielding a <type>": ItemTypeInSlot
//     Weapon1/Weapon2) and each race ("You are a <race>": Race requirement),
//     plus the five Legendary Greensteel dominance stances.
//   - CStanceButton::Evaluate() checks each stance's ActiveRequirements
//     against the build; "Auto"-group stances are activated/deactivated
//     automatically, other groups are disabled (revoked) when their
//     requirements fail. Build::ActivateStance/DeactivateStance/DisableStance
//     mutate m_Stances and notify observers.
//   - CStancesPane::UpdateStanceStates() re-runs Evaluate on every button
//     (Auto group first) after build/gear/feat changes, converging to a
//     fixpoint through the notification cascade.
//   - CStancesPane::UpdateGreensteelStances() drives the five dominance
//     stances from equipped Greensteel item counts + SetBonusCount.
//
// A V2-authored .DDOBuild persists <ActiveStances>, so builds saved by the
// real app already carry the auto stances ("Cloth Armor", race, weapon
// stances, ...) and the oracle previously leaned on that. Builds NOT saved by
// the real app (e.g. the fuzz corpus, which writes an empty <ActiveStances/>)
// were computed without any auto stance - unlike real V2, which re-evaluates
// them on load. This file closes that gap with V2's own decision logic
// (verbatim Evaluate semantics, real Build::ActivateStance & Requirements::Met
// code) minus the MFC button windows.
#include "stdafx.h"

#include <list>
#include <map>
#include <string>
#include <vector>

#include "Build.h"
#include "Character.h"
#include "EquippedGear.h"
#include "GlobalSupportFunctions.h"
#include "Item.h"
#include "Race.h"
#include "Requirement.h"
#include "Requirements.h"
#include "Stance.h"
#include "StanceGroup.h"
#include "WeaponTypes.h"

// ---------------------------------------------------------------------------
// StanceGroup: Build::ActivateStance takes a StanceGroup* and consults only
// IsSingleSelection() (and, for single-selection groups, calls
// DeactivateOtherStancesExcept). The real StanceGroup.cpp drags the
// CStanceButton UI, so provide just the members the compute path links
// against. DeactivateOtherStancesExcept is only reachable for single-selection
// groups when a stance TRANSITIONS to active; headless, non-auto stances never
// newly self-activate (Evaluate only auto-activates "Auto"-group stances, and
// the "Auto"/"User" groups are created NOT single-selection - see
// CStancesPane::CreateStanceWindows), so an inert body is correct.
// ---------------------------------------------------------------------------
CFont StanceGroup::sm_smallFont;

StanceGroup::StanceGroup(const std::string& groupName, bool bSingleSelection) :
    m_groupName(groupName),
    m_bSingleSelection(bSingleSelection)
{
    if (groupName == "Metamagics")
    {
        m_bSingleSelection = false;
    }
}

StanceGroup::~StanceGroup()
{
}

bool StanceGroup::IsSingleSelection() const
{
    return m_bSingleSelection;
}

void StanceGroup::DeactivateOtherStancesExcept(const std::string&, Build*)
{
    // never reached headless (see file comment); the real implementation
    // deselects the group's other CStanceButtons.
}

namespace
{
    // GlobalSupportFunctions.cpp is not compiled headless (UI-heavy TU);
    // IsOffHandWeapon is copied verbatim from it (GlobalSupportFunctions.cpp).
    bool HeadlessIsOffHandWeapon(WeaponType wt)
    {
        bool bOffHandItem = false;
        switch (wt)
        {
            case Weapon_ShieldBuckler:
            case Weapon_ShieldSmall:
            case Weapon_ShieldLarge:
            case Weapon_ShieldTower:
            case Weapon_Orb:
            case Weapon_RuneArm:
                bOffHandItem = true;
                break;
            default:
                break;
        }
        return bOffHandItem;
    }

    // Headless stand-in for one CStanceButton: the stance plus the button's
    // selected/disabled flags (CStanceButton::m_bSelected/m_bDisabled).
    struct HeadlessStanceButton
    {
        Stance stance;
        std::string group;      // stance group name ("Auto", "User", ...)
        bool bSelected = false;
        bool bDisabled = false;
    };

    std::list<HeadlessStanceButton> g_buttons;
    std::map<std::string, StanceGroup*> g_groups;
    bool g_staticsCreated = false;

    StanceGroup* GetGroup(const std::string& name)
    {
        auto it = g_groups.find(name);
        if (it == g_groups.end())
        {
            // CStancesPane::AddStance: CreateStanceGroup(group, group != "User");
            // "User" and "Auto" are pre-created NOT single-selection.
            bool bSingle = (name != "User" && name != "Auto");
            StanceGroup* pSG = new StanceGroup(name, bSingle);
            it = g_groups.insert(std::make_pair(name, pSG)).first;
        }
        return it->second;
    }

    bool HaveButton(const std::string& stanceName)
    {
        for (auto&& b : g_buttons)
        {
            if (b.stance.Name() == stanceName) return true;
        }
        return false;
    }

    // CStanceButton::Evaluate, verbatim semantics, minus the window repaint.
    // Returns true if the button state changed (drove a Build stance call).
    bool EvaluateButton(HeadlessStanceButton& btn, Character* pCharacter)
    {
        bool bChanged = false;
        Build* pBuild = pCharacter->ActiveBuild();
        if (pBuild != NULL)
        {
            if (btn.stance.HasActiveRequirements())
            {
                bool bOldState = btn.bSelected;
                bool bOldDisabled = btn.bDisabled;
                WeaponType wtMainHand = pBuild->MainHandWeapon();
                WeaponType wtOffHand = pBuild->OffhandWeapon();
                size_t level = pBuild->Level() > 0 ? pBuild->Level() - 1 : 0;
                bool bState = btn.stance.ActiveRequirements().Met(
                        *pBuild, level, false, Inventory_Unknown, wtMainHand, wtOffHand);
                if (btn.stance.HasGroup()
                    && btn.stance.Group() == "Auto")
                {
                    btn.bSelected = bState;
                    btn.bDisabled = false;
                }
                else
                {
                    btn.bDisabled = !bState;
                    if (btn.bDisabled)
                    {
                        btn.bSelected = false;
                    }
                }
                bChanged = (bOldState != btn.bSelected)
                        || (bOldDisabled != btn.bDisabled);
                if (bChanged)
                {
                    if (getenv("V2CALC_STANCE_DEBUG") != nullptr)
                    {
                        fprintf(stderr, "[stance] %s '%s' (group %s)\n",
                                btn.bSelected ? "activate" : (btn.bDisabled ? "disable" : "deactivate"),
                                btn.stance.Name().c_str(), btn.group.c_str());
                    }
                    StanceGroup* pSG = GetGroup(btn.group);
                    if (btn.bSelected)
                        pBuild->ActivateStance(btn.stance, pSG);
                    else if (btn.bDisabled)
                        pBuild->DisableStance(btn.stance);
                    else
                        pBuild->DeactivateStance(btn.stance);
                }
            }
        }
        return bChanged;
    }

    // StanceGroup::AddStance's tail: after the button ctor (which runs
    // Evaluate), the button's selected flag is synced to the build's
    // persisted active-stance state without a Build call.
    void AddButton(Character* pCharacter, const Stance& stance)
    {
        std::string group = "User";     // CStancesPane::AddStance default
        if (stance.HasGroup())
        {
            group = stance.Group();
        }
        // dedupe by name like the pane (duplicate adds just stack)
        if (HaveButton(stance.Name())) return;
        g_buttons.push_back(HeadlessStanceButton());
        HeadlessStanceButton& btn = g_buttons.back();
        btn.stance = stance;
        btn.group = group;
        // CStanceButton ctor: Evaluate if the stance has requirements
        if (stance.HasActiveRequirements())
        {
            EvaluateButton(btn, pCharacter);
        }
        // StanceGroup::AddStance: SetSelected(pBuild->IsStanceActive(name))
        Build* pBuild = pCharacter->ActiveBuild();
        if (pBuild != NULL)
        {
            btn.bSelected = pBuild->IsStanceActive(stance.Name());
        }
    }

    // CStancesPane::UpdateStanceStates: evaluate the Auto group first, then
    // every other group; the pane converges through repeated notifications,
    // replicated here by iterating to a fixpoint (bounded).
    void UpdateStanceStates(Character* pCharacter)
    {
        bool bChanged = true;
        size_t guard = 0;
        while (bChanged && ++guard <= 10)
        {
            bChanged = false;
            for (auto&& b : g_buttons)
            {
                if (b.group == "Auto") bChanged |= EvaluateButton(b, pCharacter);
            }
            for (auto&& b : g_buttons)
            {
                if (b.group != "Auto") bChanged |= EvaluateButton(b, pCharacter);
            }
        }
    }

    // CStancesPane::CreateStanceWindows: Stances.xml stances + dynamic
    // per-weapon-type and per-race Auto stances. (The five Greensteel
    // dominance stances have no ActiveRequirements and are driven separately
    // - see UpdateGreensteelStances below.)
    void CreateStaticButtons(Character* pCharacter)
    {
        const std::list<Stance>& stances = Stances();
        for (auto&& sit : stances)
        {
            AddButton(pCharacter, sit);
        }
        // auto controlled stances for each weapon type
        for (size_t wt = Weapon_BastardSword; wt < Weapon_Count; ++wt)
        {
            if (wt < Weapon_ShieldBuckler || wt > Weapon_ShieldTower)
            {
                CString name = (LPCTSTR)EnumEntryText(static_cast<WeaponType>(wt), weaponTypeMap);
                Stance weapon(
                        (LPCTSTR)name,
                        (LPCTSTR)name,
                        std::string("You are wielding a ") + (LPCTSTR)name,
                        "Auto",
                        true);
                if (HeadlessIsOffHandWeapon(static_cast<WeaponType>(wt)))
                {
                    Requirement r(Requirement_ItemTypeInSlot, "Weapon2", (LPCTSTR)name);
                    weapon.AddRequirement(r);
                }
                else
                {
                    Requirement r(Requirement_ItemTypeInSlot, "Weapon1", (LPCTSTR)name);
                    weapon.AddRequirement(r);
                }
                AddButton(pCharacter, weapon);
            }
        }
        // auto controlled stances for each race
        const std::list<Race>& races = Races();
        for (auto&& rit : races)
        {
            Stance race(
                    rit.Name(),
                    rit.Name(),
                    std::string("You are a ") + rit.Name(),
                    "Auto",
                    true);
            Requirement r(Requirement_Race, rit.Name());
            race.AddRequirement(r);
            AddButton(pCharacter, race);
        }
    }

    // CStancesPane::UpdateGreensteelStances, verbatim decision logic.
    void UpdateGreensteelStances(Character* pCharacter)
    {
        Stance dominion("Dominion", "Dominion", "Dominion", "Auto", true);
        Stance escalation("Escalation", "Escalation", "Escalation", "Auto", true);
        Stance opposition("Opposition", "Opposition", "Opposition", "Auto", true);
        Stance ethereal("Ethereal", "Ethereal", "Ethereal", "Auto", true);
        Stance material("Material", "Material", "Material", "Auto", true);
        Build* pBuild = pCharacter->ActiveBuild();
        if (pBuild != NULL)
        {
            StanceGroup* asg = GetGroup("Auto");
            // Must have at least 2 Greensteel items equipped
            EquippedGear gear = pBuild->ActiveGearSet();
            size_t greensteelItemCount = 0;
            for (size_t i = Inventory_Unknown + 1; i < Inventory_Count; ++i)
            {
                // only equipment items count towards Greensteel set bonuses
                if (gear.HasItemInSlot((InventorySlotType)i)
                   && i != Inventory_Weapon1
                   && i != Inventory_Weapon2)
                {
                    Item item = gear.ItemInSlot((InventorySlotType)i);
                    if (item.HasIsGreensteel())
                    {
                        ++greensteelItemCount;
                    }
                }
            }
            if (greensteelItemCount >= 2)
            {
                // Must have a dominant stance to be enabled
                size_t dominionCount = pBuild->SetBonusCount("Dominion");
                size_t escalationCount = pBuild->SetBonusCount("Escalation");
                size_t oppositionCount = pBuild->SetBonusCount("Opposition");
                size_t etherealCount = pBuild->SetBonusCount("Ethereal");
                size_t materialCount = pBuild->SetBonusCount("Material");
                if (dominionCount > max(escalationCount, oppositionCount))
                {
                    pBuild->ActivateStance(dominion, asg);
                }
                else
                {
                    pBuild->DeactivateStance(dominion);
                }
                if (escalationCount > max(dominionCount, oppositionCount))
                {
                    pBuild->ActivateStance(escalation, asg);
                }
                else
                {
                    pBuild->DeactivateStance(escalation);
                }
                if (oppositionCount > max(dominionCount, escalationCount))
                {
                    if (dominionCount == escalationCount)
                    {
                        pBuild->ActivateStance(opposition, asg);
                    }
                    else
                    {
                        // Opposition dominance only occurs when ALL augments are
                        // "Opposition"; any other type present and the bonus
                        // does not apply
                        pBuild->DeactivateStance(opposition);
                    }
                }
                else
                {
                    pBuild->DeactivateStance(opposition);
                }
                // requires 4 or more items for material/ethereal dominance
                if (greensteelItemCount >= 4)
                {
                    if (etherealCount > 0 && etherealCount > materialCount)
                    {
                        pBuild->ActivateStance(ethereal, asg);
                    }
                    else
                    {
                        pBuild->DeactivateStance(ethereal);
                    }
                    if (materialCount > 0 && materialCount > etherealCount)
                    {
                        pBuild->ActivateStance(material, asg);
                    }
                    else
                    {
                        pBuild->DeactivateStance(material);
                    }
                }
                else
                {
                    pBuild->DeactivateStance(ethereal);
                    pBuild->DeactivateStance(material);
                }
            }
            else
            {
                // one or less items equipped, Greensteel set bonuses disabled
                pBuild->DeactivateStance(dominion);
                pBuild->DeactivateStance(escalation);
                pBuild->DeactivateStance(opposition);
                pBuild->DeactivateStance(ethereal);
                pBuild->DeactivateStance(material);
            }
        }
    }
}

namespace v2calc
{
    // Phase 1 (mirrors CStancesPane::UpdateActiveBuildChanged before effects
    // are applied): create the static stance "buttons" and settle their
    // states. Runs before Build::BuildNowActive, like the real pane, so
    // anything evaluated during effect application (e.g. automatic feats
    // with stance requirements) sees the correct active-stance set.
    void StancesOnBuildActive(Character* pCharacter, Build*)
    {
        if (!g_staticsCreated)
        {
            CreateStaticButtons(pCharacter);
            g_staticsCreated = true;
        }
        UpdateStanceStates(pCharacter);
    }

    // Mirrors CStancesPane::UpdateNewStance -> AddStance for stances granted
    // during effect application (feat/enhancement stances).
    void StanceGranted(Character* pCharacter, const Stance& stance)
    {
        AddButton(pCharacter, stance);
    }

    // Phase 2 (mirrors the UpdateStanceStates/UpdateGreensteelStances passes
    // the pane runs off the gear/feat notifications BuildNowActive fires):
    // settle every stance state now that all effects are applied.
    void StancesSettle(Character* pCharacter, Build*)
    {
        UpdateGreensteelStances(pCharacter);
        UpdateStanceStates(pCharacter);
    }
}
