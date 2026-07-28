// v2calc/shim/BreakdownHostLinux.cpp
//
// Headless host for V2's BreakdownItem observer graph. See BreakdownHost.h.
//
// In the Windows build, CBreakdownsPane (a CFormView) constructs ~200
// BreakdownItem subclasses, registers each for the effect types it cares about
// (RegisterBuildCallbackEffect), and forwards every Build effect notification to
// the registered breakdowns. Build::BuildNowActive() applies all feat /
// enhancement / gear / stance / spell effects and notifies its BuildObservers
// (the pane), which fan the effects out to the breakdowns; each breakdown sums
// its m_effects/m_itemEffects in Total()/CappedTotal().
//
// This file reproduces that machinery without any MFC/UI:
//   - a minimal CBreakdownsPane whose only member, RegisterBuildCallbackEffect,
//     records (EffectType -> breakdown) into a file-scope registry. The mangled
//     symbol matches the real member, so the compiled BreakdownItem*.cpp ctors
//     (which call pPane->RegisterBuildCallbackEffect) link against this.
//   - a global ::FindBreakdown() backed by a (BreakdownType -> breakdown) map so
//     sibling breakdowns resolve each other (MRR<->MRRCap, HP<->Con, ...).
//   - HeadlessBreakdownHost, a BuildObserver/LifeObserver that forwards effect
//     notifications to the registered breakdowns exactly like the pane does.
// The breakdown ctors/Total() null-guard the (absent) tree control, so no UI is
// touched on the compute path.
#include "stdafx.h"

#include <map>
#include <list>
#include <vector>

#include "Character.h"
#include "Life.h"
#include "Build.h"
#include "Class.h"
#include "Effect.h"
#include "GlobalSupportFunctions.h"

#include "BreakdownItem.h"
#include "BreakdownItemAbility.h"
#include "BreakdownItemSave.h"
#include "BreakdownItemSimple.h"
#include "BreakdownItemHitpoints.h"
#include "BreakdownItemMDB.h"
#include "BreakdownItemDR.h"
#include "BreakdownItemPRR.h"
#include "BreakdownItemMRR.h"
#include "BreakdownItemMRRCap.h"
#include "BreakdownItemDodge.h"
#include "BreakdownItemBAB.h"
#include "BreakdownItemDestinyAps.h"
#include "BreakdownItemSpellSchool.h"
#include "BreakdownItemCasterLevel.h"
#include "BreakdownItemSchoolCasterLevel.h"
#include "SpellSchoolTypes.h"

#include "BreakdownHost.h"

// ---------------------------------------------------------------------------
// Minimal CBreakdownsPane: supplies the RegisterBuildCallbackEffect symbol the
// compiled breakdown ctors call. Name mangling depends only on the class name +
// signature, so this resolves the real ctors' calls; the body ignores `this`
// and records into the file-scope registry below. (We never include the real
// BreakdownsPane.h in this TU, so there is no conflicting definition here.)
// ---------------------------------------------------------------------------
class CBreakdownsPane
{
    public:
        void RegisterBuildCallbackEffect(EffectType type, EffectCallbackItem* pItem);
};

namespace
{
    std::map<EffectType, std::list<EffectCallbackItem*> > g_callbacks;
    std::map<BreakdownType, BreakdownItem*>               g_breakdowns;
    std::vector<BreakdownItem*>                           g_allItems;
    CBreakdownsPane                                       g_paneStub;
    Character*                                            g_pActiveCharacter = nullptr;
}

void CBreakdownsPane::RegisterBuildCallbackEffect(EffectType type, EffectCallbackItem* pItem)
{
    g_callbacks[type].push_back(pItem);
}

// ---------------------------------------------------------------------------
// Global support functions the compiled BreakdownItem*.cpp need. FindBreakdown
// replaces the not-found stub in UIStub.cpp (removed there). StatToBreakdown is
// copied verbatim from GlobalSupportFunctions.cpp.
// ---------------------------------------------------------------------------
BreakdownItem* FindBreakdown(BreakdownType type)
{
    auto it = g_breakdowns.find(type);
    return (it != g_breakdowns.end()) ? it->second : nullptr;
}

BreakdownType StatToBreakdown(AbilityType ability)
{
    switch (ability)
    {
        case Ability_Strength:     return Breakdown_Strength;
        case Ability_Dexterity:    return Breakdown_Dexterity;
        case Ability_Constitution: return Breakdown_Constitution;
        case Ability_Intelligence: return Breakdown_Intelligence;
        case Ability_Wisdom:       return Breakdown_Wisdom;
        case Ability_Charisma:     return Breakdown_Charisma;
        default:                   return Breakdown_Unknown;
    }
}

// ---------------------------------------------------------------------------
// HeadlessBreakdownHost - the pane's effect-forwarding role, UI-free.
// ---------------------------------------------------------------------------
namespace
{
    class HeadlessBreakdownHost :
        public BuildObserver,
        public LifeObserver
    {
        public:
            // Dispatch a single effect (split across its EffectType list) to the
            // breakdowns registered for each type. Mirrors the pane's per-type
            // fan-out. Member is the EffectCallbackItem method to invoke.
            template <class Fn>
            void Fan(const Effect& effect, Build* pBuild, Fn fn)
            {
                const std::list<EffectType>& types = effect.Type();
                Effect copy = effect;
                for (auto&& tit : types)
                {
                    copy.SetType(tit);
                    copy.SetWeapon1();
                    copy.SetWeapon2();
                    auto cb = g_callbacks.find(tit);
                    if (cb != g_callbacks.end())
                    {
                        for (auto&& cit : cb->second)
                        {
                            fn(cit, pBuild, copy);
                        }
                    }
                }
            }

            void FanWeapon(const Effect& effect, Build* pBuild, WeaponType wt, InventorySlotType ist,
                    void (EffectCallbackItem::*fn)(Build*, const Effect&, WeaponType))
            {
                const std::list<EffectType>& types = effect.Type();
                Effect copy = effect;
                for (auto&& tit : types)
                {
                    copy.SetType(tit);
                    switch (ist)
                    {
                        case Inventory_Weapon1: copy.SetWeapon1(); break;
                        case Inventory_Weapon2: copy.SetWeapon2(); break;
                        default: copy.SetWeapon1(); copy.SetWeapon2(); break;
                    }
                    auto cb = g_callbacks.find(tit);
                    if (cb != g_callbacks.end())
                    {
                        for (auto&& cit : cb->second)
                        {
                            (cit->*fn)(pBuild, copy, wt);
                        }
                    }
                }
            }

            // BuildObserver effect overrides
            void UpdateFeatEffectApplied(Build* b, const Effect& e) override
            { Fan(e, b, [](EffectCallbackItem* c, Build* bb, const Effect& ee){ c->FeatEffectApplied(bb, ee); }); }
            void UpdateFeatEffectRevoked(Build* b, const Effect& e) override
            { Fan(e, b, [](EffectCallbackItem* c, Build* bb, const Effect& ee){ c->FeatEffectRevoked(bb, ee); }); }
            void UpdateItemEffectApplied(Build* b, const Effect& e) override
            { Fan(e, b, [](EffectCallbackItem* c, Build* bb, const Effect& ee){ c->ItemEffectApplied(bb, ee); }); }
            void UpdateItemEffectRevoked(Build* b, const Effect& e) override
            { Fan(e, b, [](EffectCallbackItem* c, Build* bb, const Effect& ee){ c->ItemEffectRevoked(bb, ee); }); }
            void UpdateEnhancementEffectApplied(Build* b, const Effect& e) override
            { Fan(e, b, [](EffectCallbackItem* c, Build* bb, const Effect& ee){ c->EnhancementEffectApplied(bb, ee); }); }
            void UpdateEnhancementEffectRevoked(Build* b, const Effect& e) override
            { Fan(e, b, [](EffectCallbackItem* c, Build* bb, const Effect& ee){ c->EnhancementEffectRevoked(bb, ee); }); }
            void UpdateItemWeaponEffectApplied(Build* b, const Effect& e, WeaponType wt, InventorySlotType ist) override
            { FanWeapon(e, b, wt, ist, &EffectCallbackItem::ItemEffectApplied); }
            void UpdateItemWeaponEffectRevoked(Build* b, const Effect& e, WeaponType wt, InventorySlotType ist) override
            { FanWeapon(e, b, wt, ist, &EffectCallbackItem::ItemEffectRevoked); }

            // notifications fanned to every registered breakdown
            void UpdateAbilityValueChanged(Build* b, AbilityType a) override
            { ForEach([&](EffectCallbackItem* c){ c->AbilityValueChanged(b, a); }); }
            void UpdateStanceActivated(Build* b, const std::string& n) override
            { ForEach([&](EffectCallbackItem* c){ c->StanceActivated(b, n); }); }
            void UpdateStanceDeactivated(Build* b, const std::string& n) override
            { ForEach([&](EffectCallbackItem* c){ c->StanceDeactivated(b, n); }); }
            void UpdateNewStance(Build*, const Stance& stance) override
            {
                // mirror CStancesPane::UpdateNewStance -> AddStance: granted
                // stances get a headless "button" so their requirements are
                // (re-)evaluated in the settle pass.
                if (g_pActiveCharacter != nullptr)      // set by ComputeBreakdowns
                {
                    v2calc::StanceGranted(g_pActiveCharacter, stance);
                }
            }
            void UpdateBuildLevelChanged(Build* b) override
            { ForItems([&](BreakdownItem* c){ c->BuildLevelChanged(b); }); }
            void UpdateSliderChanged(Build* b, const std::string& n, int v) override
            { ForItems([&](BreakdownItem* c){ c->SliderChanged(b, n, v); }); }
            void UpdateFeatTrained(Build* b, const std::string& featName) override
            {
                if (featName.find("Lore") != std::string::npos)
                {
                    ForItems([&](BreakdownItem* c){ c->FeatTrained(b, featName); });
                }
            }
            void UpdateGearChanged(Build* b, InventorySlotType slot) override
            {
                if (slot == Inventory_Weapon1 || slot == Inventory_Weapon2)
                {
                    WeaponType wtMain = b->ActiveGearSet().Weapon1();
                    WeaponType wtOffhand = b->ActiveGearSet().Weapon2();
                    ForItems([&](BreakdownItem* c){ c->SetWeaponTypes(wtMain, wtOffhand); });
                }
                ForItems([&](BreakdownItem* c){ c->GearChanged(b, slot); });
            }

        private:
            template <class Fn>
            void ForItems(Fn fn) { for (auto&& it : g_allItems) fn(it); }
            template <class Fn>
            void ForEach(Fn fn)
            {
                // one call per breakdown (dedupe: g_allItems holds each once)
                for (auto&& it : g_allItems) fn(it);
            }
    };

    HeadlessBreakdownHost g_host;

    // -----------------------------------------------------------------------
    // breakdown construction helpers
    // -----------------------------------------------------------------------
    void Reg(BreakdownType bt, BreakdownItem* pItem)
    {
        g_breakdowns[bt] = pItem;
        g_allItems.push_back(pItem);
    }
    BreakdownItem* Simple(BreakdownType bt, EffectType et, const char* title)
    {
        BreakdownItem* p = new BreakdownItemSimple(&g_paneStub, bt, et, title, nullptr, nullptr);
        Reg(bt, p);
        return p;
    }
    BreakdownItem* Ability(AbilityType at, BreakdownType bt)
    {
        BreakdownItem* p = new BreakdownItemAbility(&g_paneStub, at, bt, nullptr, nullptr);
        Reg(bt, p);
        return p;
    }
    BreakdownItemSave* Save(BreakdownType bt, SaveType st, AbilityType ability, BreakdownItemSave* base)
    {
        BreakdownItemSave* p = new BreakdownItemSave(&g_paneStub, bt, st, nullptr, nullptr, ability, base);
        Reg(bt, p);
        return p;
    }

    void CreateBreakdowns()
    {
        // Abilities (siblings needed by HP/AC/saves)
        Ability(Ability_Strength,     Breakdown_Strength);
        Ability(Ability_Dexterity,    Breakdown_Dexterity);
        BreakdownItem* pCon = Ability(Ability_Constitution, Breakdown_Constitution);
        Ability(Ability_Intelligence, Breakdown_Intelligence);
        Ability(Ability_Wisdom,       Breakdown_Wisdom);
        Ability(Ability_Charisma,     Breakdown_Charisma);

        // Simple helper breakdowns (must exist before dependents below)
        Simple(Breakdown_NegativeLevels,       Effect_NegativeLevel,          "Negative Levels");
        Simple(Breakdown_FatePoints,           Effect_FatePoint,              "Fate Points");
        Simple(Breakdown_StyleBonusFeats,      Effect_HitpointsStyleBonus,    "Style Bonus Feats");
        Simple(Breakdown_UnconsciousRange,     Effect_UnconsciousRange,       "Unconscious Range");
        Simple(Breakdown_FalseLife,            Effect_FalseLife,              "False Life");
        Simple(Breakdown_ReaperHitpoints,      Effect_HitpointsReaper,        "Reaper Hitpoints");
        Simple(Breakdown_NaturalArmor,         Effect_NaturalArmor,           "Natural Armor");
        Simple(Breakdown_BonusArmorAC,         Effect_ArmorACBonus,           "Armor % Bonus");
        Simple(Breakdown_BonusShieldAC,        Effect_ACBonusShield,          "Shield % Bonus");
        Simple(Breakdown_MaxDexBonusShields,   Effect_MaxDexBonusTowerShield, "Tower Shield MDB");
        Simple(Breakdown_DodgeCap,             Effect_DodgeCapBonus,          "Dodge Cap");
        Simple(Breakdown_OverrideBAB,          Effect_OverrideBAB,            "Override BAB");
        Simple(Breakdown_Fortification,        Effect_Fortification,          "Fortification");
        // Offensive (simple)
        Simple(Breakdown_MeleePower,           Effect_MeleePower,             "Melee Power");
        Simple(Breakdown_RangedPower,          Effect_RangedPower,            "Ranged Power");

        // Max Dex Bonus (needed by AC, Dodge)
        Reg(Breakdown_MaxDexBonus, new BreakdownItemMDB(&g_paneStub, Breakdown_MaxDexBonus, nullptr, nullptr));

        // Destiny APs (needs FatePoints)
        Reg(Breakdown_DestinyPoints, new BreakdownItemDestinyAps(&g_paneStub, nullptr, nullptr));

        // Hitpoints (needs Con + the simple siblings above)
        Reg(Breakdown_Hitpoints, new BreakdownItemHitpoints(&g_paneStub, nullptr, nullptr, pCon));

        // Saves: base saves, then sub-saves referencing their base
        BreakdownItemSave* pFort = Save(Breakdown_SaveFortitude, Save_Fortitude, Ability_Constitution, nullptr);
        Save(Breakdown_SavePoison,  Save_Poison,  Ability_Unknown, pFort);
        Save(Breakdown_SaveDisease, Save_Disease, Ability_Unknown, pFort);
        BreakdownItemSave* pReflex = Save(Breakdown_SaveReflex, Save_Reflex, Ability_Dexterity, nullptr);
        Save(Breakdown_SaveTraps, Save_Traps, Ability_Unknown, pReflex);
        Save(Breakdown_SaveSpell, Save_Spell, Ability_Unknown, pReflex);
        Save(Breakdown_SaveMagic, Save_Magic, Ability_Unknown, pReflex);
        BreakdownItemSave* pWill = Save(Breakdown_SaveWill, Save_Will, Ability_Wisdom, nullptr);
        Save(Breakdown_SaveEnchantment, Save_Enchantment, Ability_Unknown, pWill);
        Save(Breakdown_SaveIllusion,    Save_Illusion,    Ability_Unknown, pWill);
        Save(Breakdown_SaveFear,        Save_Fear,        Ability_Unknown, pWill);
        Save(Breakdown_SaveCurse,       Save_Curse,       Ability_Unknown, pWill);

        // AC deferred: BreakdownItemAC::LinkUp dynamic_casts to
        // BreakdownItemWeaponEffects, whose TU drags the weapon-breakdown +
        // ActiveEffect UI graph. See README "Next blocker".

        // DR
        Reg(Breakdown_DR, new BreakdownItemDR(&g_paneStub, Breakdown_DR, nullptr, nullptr));

        // BAB, then PRR (needs BAB)
        Reg(Breakdown_BAB, new BreakdownItemBAB(&g_paneStub, nullptr, nullptr));
        Reg(Breakdown_PRR, new BreakdownItemPRR(&g_paneStub, Breakdown_PRR, "PRR", nullptr, nullptr));

        // MRR cap, then MRR (needs cap)
        Reg(Breakdown_MRRCap, new BreakdownItemMRRCap(&g_paneStub, Breakdown_MRRCap, "MRR Cap", nullptr, nullptr));
        Reg(Breakdown_MRR, new BreakdownItemMRR(&g_paneStub, Breakdown_MRR, "MRR", nullptr, nullptr));

        // Dodge (needs DodgeCap, MDB, MaxDexBonusShields)
        Reg(Breakdown_Dodge, new BreakdownItemDodge(&g_paneStub, Breakdown_Dodge, "Dodge", nullptr, nullptr));

        // Spell DCs per school (BreakdownItemSpellSchool - no sibling deps)
        struct SchoolEntry { BreakdownType bt; SpellSchoolType st; const char* name; bool specificDCOnly; };
        static const SchoolEntry schools[] = {
            { Breakdown_SpellSchoolAbjuration,   SpellSchool_Abjuration,   "Abjuration DC",   false },
            { Breakdown_SpellSchoolConjuration,  SpellSchool_Conjuration,  "Conjuration DC",  false },
            { Breakdown_SpellSchoolDivination,   SpellSchool_Divination,   "Divination DC",   false },
            { Breakdown_SpellSchoolEnchantment,  SpellSchool_Enchantment,  "Enchantment DC",  false },
            { Breakdown_SpellSchoolEvocation,    SpellSchool_Evocation,    "Evocation DC",    false },
            { Breakdown_SpellSchoolIllusion,     SpellSchool_Illusion,     "Illusion DC",     false },
            { Breakdown_SpellSchoolNecromancy,   SpellSchool_Necromancy,   "Necromancy DC",   false },
            { Breakdown_SpellSchoolTransmutation,SpellSchool_Transmutation,"Transmutation DC",false },
            { Breakdown_SpellSchoolFear,         SpellSchool_Fear,         "Fear DC",         true  },
            { Breakdown_SpellSchoolGlobalDC,     SpellSchool_GlobalDC,     "Global DC Bonus", false },
            { Breakdown_SpellSchoolRuneArm,      SpellSchool_RuneArm,      "Rune Arm DC",     true  },
        };
        for (auto&& s : schools)
        {
            Reg(s.bt, new BreakdownItemSpellSchool(&g_paneStub, s.bt, Effect_SpellDC, s.st,
                    s.name, nullptr, nullptr, s.specificDCOnly));
        }

        // Caster levels per school (BreakdownItemSchoolCasterLevel)
        struct SchoolCL { BreakdownType cl; BreakdownType mcl; SpellSchoolType st; };
        static const SchoolCL schoolCLs[] = {
            { Breakdown_CasterLevel_School_Abjuration,   Breakdown_MaxCasterLevel_School_Abjuration,   SpellSchool_Abjuration },
            { Breakdown_CasterLevel_School_Conjuration,  Breakdown_MaxCasterLevel_School_Conjuration,  SpellSchool_Conjuration },
            { Breakdown_CasterLevel_School_Divination,   Breakdown_MaxCasterLevel_School_Divination,   SpellSchool_Divination },
            { Breakdown_CasterLevel_School_Enchantment,  Breakdown_MaxCasterLevel_School_Enchantment,  SpellSchool_Enchantment },
            { Breakdown_CasterLevel_School_Evocation,    Breakdown_MaxCasterLevel_School_Evocation,    SpellSchool_Evocation },
            { Breakdown_CasterLevel_School_Illusion,     Breakdown_MaxCasterLevel_School_Illusion,     SpellSchool_Illusion },
            { Breakdown_CasterLevel_School_Necromancy,   Breakdown_MaxCasterLevel_School_Necromancy,   SpellSchool_Necromancy },
            { Breakdown_CasterLevel_School_Transmutation,Breakdown_MaxCasterLevel_School_Transmutation,SpellSchool_Transmutation },
        };
        for (auto&& s : schoolCLs)
        {
            Reg(s.cl,  new BreakdownItemSchoolCasterLevel(&g_paneStub, Effect_CasterLevel,    s.st, s.cl,  nullptr, nullptr));
            Reg(s.mcl, new BreakdownItemSchoolCasterLevel(&g_paneStub, Effect_MaxCasterLevel, s.st, s.mcl, nullptr, nullptr));
        }

        // Caster levels per caster class (BreakdownItemClassCasterLevel)
        for (auto&& c : Classes())
        {
            if (c.SpellPointsAtLevel(MAX_CLASS_LEVEL - 1) > 0)
            {
                Reg(static_cast<BreakdownType>(Breakdown_CasterLevel_First + c.Index()),
                    new BreakdownItemClassCasterLevel(&g_paneStub, c.Name(),
                        static_cast<BreakdownType>(Breakdown_CasterLevel_First + c.Index()),
                        Effect_CasterLevel, nullptr, nullptr));
                Reg(static_cast<BreakdownType>(Breakdown_MaxCasterLevel_First + c.Index()),
                    new BreakdownItemClassCasterLevel(&g_paneStub, c.Name(),
                        static_cast<BreakdownType>(Breakdown_MaxCasterLevel_First + c.Index()),
                        Effect_MaxCasterLevel, nullptr, nullptr));
            }
        }
    }
}

namespace v2calc
{
    void ComputeBreakdowns(Character* pCharacter, Build* pBuild)
    {
        CreateBreakdowns();

        // Mirror CBreakdownsPane::BuildChanging(): tell each breakdown about the
        // character, then let each build its CreateOtherEffects() base list.
        for (auto&& it : g_allItems) it->BuildChanged(pCharacter);
        for (auto&& it : g_allItems) it->BuildChangeComplete();

        // Attach the host so Build's effect notifications reach the breakdowns.
        pBuild->AttachObserver(&g_host);
        Life* pLife = pCharacter->ActiveLife();
        if (pLife != nullptr) pLife->AttachObserver(&g_host);
        g_pActiveCharacter = pCharacter;

        // Mirror CStancesPane::UpdateActiveBuildChanged: evaluate the auto
        // stances (armor type, wielded weapon types, race, ...) BEFORE effect
        // application, so files without persisted <ActiveStances> (fuzz
        // builds) get the same active-stance set the real app derives on load.
        StancesOnBuildActive(pCharacter, pBuild);

        // Drive the real effect-application path: applies feat/enhancement/
        // gear/spell/stance effects and notifies observers (our host).
        pBuild->BuildNowActive();

        // Settle the stance states now that all effects (granted stances,
        // set-bonus stacks for Greensteel dominance) are in place - mirrors
        // the UpdateStanceStates/UpdateGreensteelStances passes the pane runs
        // off BuildNowActive's notifications.
        StancesSettle(pCharacter, pBuild);

        // Settle pass, replicating CBreakdownsPane::UpdateAllBreakdowns() which
        // the real UI runs from BreakdownItem::SetLockState(false) at the end of
        // BuildNowActive (that call is a UI no-op under V2CALC_LINUX). During
        // BuildNowActive the breakdowns are locked (s_bUpdatesLocked), so
        // Populate() is suppressed and each breakdown's m_dCachedTotal stays
        // stale. Once unlocked, Populate() on each breakdown detects the change
        // and fires NotifyTotalChanged(), which drives dependent breakdowns'
        // CreateOtherEffects() to re-read now-populated siblings. This is what
        // lets BreakdownItemHitpoints pick up the Combat Style bonus (25% per
        // fighting-style feat of class HP, via Breakdown_StyleBonusFeats), the
        // FalseLife/Reaper/FatePoints contributions, etc. CreateOtherEffects()
        // clears and rebuilds m_otherEffects, so this is idempotent.
        for (auto&& it : g_allItems)
        {
            it->Populate();
        }
    }

    bool HasBreakdown(BreakdownType bt)
    {
        return g_breakdowns.find(bt) != g_breakdowns.end();
    }
    double Total(BreakdownType bt)
    {
        auto it = g_breakdowns.find(bt);
        return (it != g_breakdowns.end()) ? it->second->Total() : 0.0;
    }
    double Capped(BreakdownType bt)
    {
        auto it = g_breakdowns.find(bt);
        return (it != g_breakdowns.end()) ? it->second->CappedTotal() : 0.0;
    }
}
