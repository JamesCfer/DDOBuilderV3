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
#include "BreakdownItemSkill.h"
#include "BreakdownItemTactical.h"
#include "BreakdownItemSpellPower.h"
#include "BreakdownItemUniversalSpellPower.h"
#include "BreakdownItemEnergyResistance.h"
#include "BreakdownItemEnergyAbsorption.h"
#include "BreakdownItemSpellPoints.h"
#include "BreakdownItemMaximumKi.h"
#include "BreakdownItemSneakAttackDice.h"
#include "BreakdownItemOffhandDoublestrike.h"
#include "BreakdownItemPactDice.h"
#include "BreakdownItemTurnUndeadLevel.h"
#include "BreakdownItemTurnUndeadHitDice.h"
#include "BreakdownItemAC.h"
#include "BreakdownItemImmunities.h"
#include "BreakdownItemDuration.h"
#include "BreakdownItemWeaponEffects.h"
#include "TreeListCtrl.h"
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
    MfcControls::CTreeListCtrl g_treeStub(false, false);
    BreakdownItemWeaponEffects* g_pWeaponEffects = nullptr;
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
                    // CBreakdownsPane::UpdateGearChanged: re-create the
                    // per-hand weapon breakdowns from the equipped items.
                    if (g_pWeaponEffects != nullptr)
                    {
                        g_pWeaponEffects->WeaponsChanged(b->ActiveGearSet());
                    }
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
        Simple(Breakdown_HitpointsPercent,     Effect_HitpointsPercent,       "Hitpoints % Bonus");
        Simple(Breakdown_UnconsciousRange,     Effect_UnconsciousRange,       "Unconscious Range");
        Simple(Breakdown_FalseLife,            Effect_FalseLife,              "False Life");
        Simple(Breakdown_ReaperHitpoints,      Effect_HitpointsReaper,        "Reaper Hitpoints");
        Simple(Breakdown_NaturalArmor,         Effect_NaturalArmor,           "Natural Armor");
        Simple(Breakdown_BonusArmorAC,         Effect_ArmorACBonus,           "Armor AC % Bonus");
        Simple(Breakdown_BonusShieldAC,        Effect_ACBonusShield,          "Shield % Bonus");
        Simple(Breakdown_TotalACPercent,       Effect_ACPercent,              "Total AC % Bonus");
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

        // ------------------------------------------------------------------
        // Full-analytics expansion: everything else CBreakdownsPane
        // constructs that compiles headless (skills, tacticals, spell
        // powers/crit, energy resistance/absorption, and the remaining
        // BreakdownItemSimple registrations, transcribed mechanically from
        // BreakdownsPane.cpp). Registration order only matters for ctor-time
        // sibling lookups; CreateOtherEffects lookups resolve at
        // BuildChangeComplete, by which time every breakdown exists.
        // ------------------------------------------------------------------

        // Skills (observe their keyed ability breakdown - the pane's
        // StatFromSkill switch)
        for (size_t si = Skill_Unknown + 1; si < Skill_Count; ++si)
        {
            AbilityType at = StatFromSkill(static_cast<SkillType>(si));
            BreakdownType abt = Breakdown_Unknown;
            switch (at)
            {
                case Ability_Strength:     abt = Breakdown_Strength; break;
                case Ability_Dexterity:    abt = Breakdown_Dexterity; break;
                case Ability_Constitution: abt = Breakdown_Constitution; break;
                case Ability_Intelligence: abt = Breakdown_Intelligence; break;
                case Ability_Wisdom:       abt = Breakdown_Wisdom; break;
                case Ability_Charisma:     abt = Breakdown_Charisma; break;
                default: break;
            }
            BreakdownItem* pAbility = (abt != Breakdown_Unknown) ? g_breakdowns[abt] : nullptr;
            BreakdownType bt = static_cast<BreakdownType>(Breakdown_SkillBalance + si - Skill_Unknown - 1);
            Reg(bt, new BreakdownItemSkill(&g_paneStub, static_cast<SkillType>(si), bt,
                    nullptr, nullptr, pAbility));
        }

        // Remaining BreakdownItemSimple registrations (pane-transcribed).
        // SimpleIfNew skips types already registered above.
        struct SimpleReg { BreakdownType bt; EffectType et; const char* title; };
        static const SimpleReg simples[] = {
            { Breakdown_MovementSpeed, Effect_MovementSpeed, "Movement Speed" },
            { Breakdown_ArmorCheckPenalty, Effect_ArmorCheckPenalty, "Armor Check penalty" },
            { Breakdown_ArmorCheckPenaltyShield, Effect_ArmorCheckPenaltyShield, "Armor Check penalty (Shield)" },
            { Breakdown_DodgeCapTowerShield, Effect_MaxDexBonusTowerShield, "Dodge Cap (Tower Shield)" },
            { Breakdown_MissileDeflection, Effect_MissileDeflection, "Missile Deflection" },
            { Breakdown_Incorporeality, Effect_Incorporeality, "Incorporeality" },
            { Breakdown_Displacement, Effect_Displacement, "Displacement" },
            { Breakdown_HelplessDamageReduction, Effect_HelplessDamageReduction, "Helpless Damage Reduction" },
            { Breakdown_HealingAmplification, Effect_HealingAmplification, "Healing Amplification (Positive)" },
            { Breakdown_NegativeHealingAmplification, Effect_NegativeHealingAmplification, "Healing Amplification (Negative)" },
            { Breakdown_RepairAmplification, Effect_RepairAmplification, "Repair Amplification" },
            { Breakdown_ThreatMelee, Effect_ThreatBonusMelee, "Melee Threat Generation" },
            { Breakdown_ThreatRanged, Effect_ThreatBonusRanged, "Ranged Threat Generation" },
            { Breakdown_ThreatSpell, Effect_ThreatBonusSpell, "Spell Threat Generation" },
            { Breakdown_OffHandAttackBonus, Effect_OffHandAttackBonus, "Off Hand Attack Chance" },
            { Breakdown_DoubleStrike, Effect_DoubleStrike, "Doublestrike" },
            { Breakdown_ImbueDice, Effect_ImbueDice, "Bonus Imbue Dice" },
            { Breakdown_SneakAttackDamage, Effect_SneakAttackDamage, "Sneak Attack Damage" },
            { Breakdown_SneakAttackAttack, Effect_SneakAttackAttack, "Sneak Attack Attack" },
            { Breakdown_SneakAttackRange, Effect_SneakAttackRange, "Sneak Attack Range" },
            { Breakdown_DoubleShot, Effect_DoubleShot, "Doubleshot" },
            { Breakdown_SecondaryShieldBash, Effect_SecondaryShieldBash, "Secondary Shield Bash" },
            { Breakdown_DodgeBypass, Effect_DodgeBypass, "Dodge Bypass" },
            { Breakdown_FortificationBypass, Effect_FortificationBypass, "Fortification Bypass" },
            { Breakdown_MissileDeflectionBypass, Effect_MissileDeflectionBypass, "Missile Deflection Bypass" },
            { Breakdown_Strikethrough, Effect_Strikethrough, "Strikethrough" },
            { Breakdown_DamageAbilityMultiplier, Effect_DamageAbilityMultiplier, "Main Hand Ability Multiplier" },
            { Breakdown_DamageAbilityMultiplierOffhand, Effect_DamageAbilityMultiplierOffhand, "Off Hand Ability Multiplier" },
            { Breakdown_HelplessDamage, Effect_HelplessDamage, "Helpless Damage Bonus" },
            { Breakdown_RuneArmChargeRate, Effect_RuneArmChargeRate, "Rune Arm Charge rate" },
            { Breakdown_RuneArmStableCharge, Effect_RuneArmStableCharge, "Rune Arm Stable Charge" },
            { Breakdown_Wildsurge, Effect_WildsurgeChance, "Wildsurge Chance" },
            { Breakdown_ArcaneSpellfailure, Effect_ArcaneSpellFailure, "Arcane Spell Failure (Armor)" },
            { Breakdown_ArcaneSpellfailureShields, Effect_ArcaneSpellFailureShields, "Arcane Spell Failure (Shields)" },
            { Breakdown_SpellResistance, Effect_SpellResistance, "Spell Resistance" },
            { Breakdown_SpellCostReduction, Effect_SpellPointCostPercent, "Spell Cost Reduction Percent" },
            { Breakdown_SpellPenetration, Effect_SpellPenetrationBonus, "Spell Penetration" },
            { Breakdown_ImplementInYourHands, Effect_ImplementInYourHands, "Implement in Your Hands" },
            { Breakdown_SpellCriticalChanceUniversal, Effect_UniversalSpellLore, "Universal Spell Critical Chance" },
            { Breakdown_SpellCriticalMultiplierUniversal, Effect_UniversalSpellCriticalDamage, "Universal Spell Critical Multiplier" },
            { Breakdown_SongCount, Effect_SongCount, "Song Count" },
            { Breakdown_SongACBonus, Effect_SongACBonus, "AC Bonus" },
            { Breakdown_SongAttackBonus, Effect_SongAttackBonus, "Attack Bonus" },
            { Breakdown_SongDamageBonus, Effect_SongDamageBonus, "Damage Bonus" },
            { Breakdown_SongDoublestrike, Effect_SongDoublestrike, "Doublestrike Bonus" },
            { Breakdown_SongDoubleshot, Effect_SongDoubleshot, "Doubleshot Bonus" },
            { Breakdown_SongUniversalSpellPower, Effect_SongUniversalSpellPower, "Universal Spell Power Bonus" },
            { Breakdown_SongSpellPenetration, Effect_SongSpellPenetration, "Spell Penetration Bonus" },
            { Breakdown_SongCasterLevel, Effect_SongCasterLevel, "Caster Level Bonus" },
            { Breakdown_SongSkillBonus, Effect_SongSkillBonus, "Skill Bonus" },
            { Breakdown_SongPRR, Effect_SongPRR, "PRR Bonus" },
            { Breakdown_SongMRR, Effect_SongMRR, "MRR Bonus" },
            { Breakdown_SongHealingAmp, Effect_SongHealingAmp, "Healing Amp Bonus" },
            { Breakdown_SongNegativeHealingAmp, Effect_SongNegativeHealingAmp, "Negative Healing Amp Bonus" },
            { Breakdown_SongRepairAmp, Effect_SongRepairAmp, "Repair Amp Bonus" },
            { Breakdown_KiPassive, Effect_KiPassive, "Ki Passive Regeneration" },
            { Breakdown_KiHit, Effect_KiHit, "Ki on Hit" },
            { Breakdown_KiCritical, Effect_KiCritical, "Ki on Critical Hit" },
            { Breakdown_HirelingAbilityBonus, Effect_HirelingAbilityBonus, "Hireling Abilities" },
            { Breakdown_HirelingHitpoints, Effect_HirelingHitpoints, "Hireling Hitpoints" },
            { Breakdown_HirelingFortification, Effect_HirelingFortification, "Hireling Fortification" },
            { Breakdown_HirelingPRR, Effect_HirelingPRR, "Hireling PRR" },
            { Breakdown_HirelingMRR, Effect_HirelingMRR, "Hireling MRR" },
            { Breakdown_HirelingDodge, Effect_HirelingDodge, "Hireling Dodge" },
            { Breakdown_HirelingMeleePower, Effect_HirelingMeleePower, "Hireling Melee Power" },
            { Breakdown_HirelingRangedPower, Effect_HirelingRangedPower, "Hireling Ranged Power" },
            { Breakdown_HirelingSpellPower, Effect_HirelingSpellPower, "Hireling Spell Power" },
            { Breakdown_HirelingConcealment, Effect_HirelingConcealment, "Hireling Concealment" },
            { Breakdown_LayOnHands, Effect_ExtraLayOnHands, "Lay On Hands Charges" },
            { Breakdown_LOHRegenerationRate, Effect_LOHRegenRate, "Regeneration Rate (Once every n Seconds)" },
            { Breakdown_Rages, Effect_ExtraRage, "Rage Charges" },
            { Breakdown_TumbleCharges, Effect_TumbleCharge, "Tumble Charges" },
            { Breakdown_Accelerate, Effect_MetamagicCostAccelerate, "Accelerate Spell" },
            { Breakdown_Eschewmaterials, Effect_MetamagicCostEschewMaterials, "Eschew Materials" },
            { Breakdown_Embolden, Effect_MetamagicCostEmbolden, "Embolden Spell" },
            { Breakdown_Empower, Effect_MetamagicCostEmpower, "Empower Spell" },
            { Breakdown_EmpowerHealing, Effect_MetamagicCostEmpowerHealing, "Empower Healing Spell" },
            { Breakdown_Enlarge, Effect_MetamagicCostEnlarge, "Enlarge Spell" },
            { Breakdown_Extend, Effect_MetamagicCostExtend, "Extend Spell" },
            { Breakdown_Heighten, Effect_MetamagicCostHeighten, "Heighten Spell" },
            { Breakdown_Intensify, Effect_MetamagicCostIntensify, "Intensify Spell" },
            { Breakdown_Maximize, Effect_MetamagicCostMaximize, "Maximize Spell" },
            { Breakdown_Quicken, Effect_MetamagicCostQuicken, "Quicken Spell" },
        };
        for (auto&& s : simples)
        {
            if (g_breakdowns.find(s.bt) == g_breakdowns.end())
            {
                Simple(s.bt, s.et, s.title);
            }
        }

        // Tactical DCs
        struct TactReg { BreakdownType bt; TacticalType tt; };
        static const TactReg tacticals[] = {
            { Breakdown_TacticalAssassinate,    Tactical_Assassinate },
            { Breakdown_TacticalStunning,       Tactical_Stun },
            { Breakdown_TacticalSunder,         Tactical_Sunder },
            { Breakdown_TacticalTrap,           Tactical_Trap },
            { Breakdown_TacticalTrip,           Tactical_Trip },
            { Breakdown_TacticalGeneral,        Tactical_General },
            { Breakdown_TacticalStunningShield, Tactical_StunningShield },
            { Breakdown_TacticalWands,          Tactical_Wands },
            { Breakdown_TacticalFear,           Tactical_Fear },
            { Breakdown_TacticalInnateAttack,   Tactical_InnateAttack },
            { Breakdown_TacticalBreathWeapon,   Tactical_BreathWeapon },
            { Breakdown_TacticalPoison,         Tactical_Poison },
            { Breakdown_TacticalRuneArm,        Tactical_RuneArm },
        };
        for (auto&& t : tacticals)
        {
            Reg(t.bt, new BreakdownItemTactical(&g_paneStub, t.bt, t.tt, nullptr, nullptr));
        }

        // Universal spell power first (per-type spell powers read it), then
        // the per-type spell powers / crit chances / crit multipliers.
        Reg(Breakdown_SpellPowerUniversal, new BreakdownItemUniversalSpellPower(
                &g_paneStub, Breakdown_SpellPowerUniversal, "Universal Spell power", nullptr, nullptr));
        struct SpReg { BreakdownType sp; BreakdownType crit; BreakdownType mult; SpellPowerType t; const char* name; };
        static const SpReg spellPowers[] = {
            { Breakdown_SpellPowerAcid,           Breakdown_SpellCriticalChanceAcid,           Breakdown_SpellCriticalMultiplierAcid,           SpellPower_Acid,           "Acid" },
            { Breakdown_SpellPowerLightAlignment, Breakdown_SpellCriticalChanceLightAlignment, Breakdown_SpellCriticalMultiplierLightAlignment, SpellPower_LightAlignment, "Light/Alignment" },
            { Breakdown_SpellPowerChaos,          Breakdown_SpellCriticalChanceChaos,          Breakdown_SpellCriticalMultiplierChaos,          SpellPower_Chaos,          "Chaos" },
            { Breakdown_SpellPowerCold,           Breakdown_SpellCriticalChanceCold,           Breakdown_SpellCriticalMultiplierCold,           SpellPower_Cold,           "Cold" },
            { Breakdown_SpellPowerElectric,       Breakdown_SpellCriticalChanceElectric,       Breakdown_SpellCriticalMultiplierElectric,       SpellPower_Electric,       "Electric" },
            { Breakdown_SpellPowerEvil,           Breakdown_SpellCriticalChanceEvil,           Breakdown_SpellCriticalMultiplierEvil,           SpellPower_Evil,           "Evil" },
            { Breakdown_SpellPowerFire,           Breakdown_SpellCriticalChanceFire,           Breakdown_SpellCriticalMultiplierFire,           SpellPower_Fire,           "Fire" },
            { Breakdown_SpellPowerForce,          Breakdown_SpellCriticalChanceForce,          Breakdown_SpellCriticalMultiplierForce,          SpellPower_Force,          "Force" },
            { Breakdown_SpellPowerLawful,         Breakdown_SpellCriticalChanceLawful,         Breakdown_SpellCriticalMultiplierLawful,         SpellPower_Lawful,         "Lawful" },
            { Breakdown_SpellPowerNegative,       Breakdown_SpellCriticalChanceNegative,       Breakdown_SpellCriticalMultiplierNegative,       SpellPower_Negative,       "Negative" },
            { Breakdown_SpellPowerPhysical,       Breakdown_SpellCriticalChancePhysical,       Breakdown_SpellCriticalMultiplierPhysical,       SpellPower_Physical,       "Physical" },
            { Breakdown_SpellPowerPoison,         Breakdown_SpellCriticalChancePoison,         Breakdown_SpellCriticalMultiplierPoison,         SpellPower_Poison,         "Poison" },
            { Breakdown_SpellPowerPositive,       Breakdown_SpellCriticalChancePositive,       Breakdown_SpellCriticalMultiplierPositive,       SpellPower_Positive,       "Positive" },
            { Breakdown_SpellPowerRepair,         Breakdown_SpellCriticalChanceRepair,         Breakdown_SpellCriticalMultiplierRepair,         SpellPower_Repair,         "Repair" },
            { Breakdown_SpellPowerRust,           Breakdown_SpellCriticalChanceRust,           Breakdown_SpellCriticalMultiplierRust,           SpellPower_Rust,           "Rust" },
            { Breakdown_SpellPowerSonic,          Breakdown_SpellCriticalChanceSonic,          Breakdown_SpellCriticalMultiplierSonic,          SpellPower_Sonic,          "Sonic" },
            { Breakdown_SpellPowerUntyped,        Breakdown_SpellCriticalChanceUntyped,        Breakdown_SpellCriticalMultiplierUntyped,        SpellPower_Untyped,        "Untyped" },
        };
        for (auto&& s : spellPowers)
        {
            Reg(s.sp,   new BreakdownItemSpellPower(&g_paneStub, s.sp,   Effect_SpellPower,          s.t, s.name, nullptr, nullptr));
            Reg(s.crit, new BreakdownItemSpellPower(&g_paneStub, s.crit, Effect_SpellLore,           s.t, s.name, nullptr, nullptr));
            Reg(s.mult, new BreakdownItemSpellPower(&g_paneStub, s.mult, Effect_SpellCriticalDamage, s.t, s.name, nullptr, nullptr));
        }

        // Energy resistance + absorption (pane list; Positive/Repair/Rust
        // are commented out in the pane too)
        struct EnergyReg { BreakdownType res; BreakdownType abs; EnergyType t; const char* name; };
        static const EnergyReg energies[] = {
            { Breakdown_EnergyResistanceAcid,     Breakdown_EnergyAbsorptionAcid,     Energy_Acid,     "Acid" },
            { Breakdown_EnergyResistanceChaos,    Breakdown_EnergyAbsorptionChaos,    Energy_Chaos,    "Chaos" },
            { Breakdown_EnergyResistanceCold,     Breakdown_EnergyAbsorptionCold,     Energy_Cold,     "Cold" },
            { Breakdown_EnergyResistanceElectric, Breakdown_EnergyAbsorptionElectric, Energy_Electric, "Electric" },
            { Breakdown_EnergyResistanceEvil,     Breakdown_EnergyAbsorptionEvil,     Energy_Evil,     "Evil" },
            { Breakdown_EnergyResistanceFire,     Breakdown_EnergyAbsorptionFire,     Energy_Fire,     "Fire" },
            { Breakdown_EnergyResistanceForce,    Breakdown_EnergyAbsorptionForce,    Energy_Force,    "Force" },
            { Breakdown_EnergyResistanceGood,     Breakdown_EnergyAbsorptionGood,     Energy_Good,     "Good" },
            { Breakdown_EnergyResistanceLawful,   Breakdown_EnergyAbsorptionLawful,   Energy_Lawful,   "Lawful" },
            { Breakdown_EnergyResistanceLight,    Breakdown_EnergyAbsorptionLight,    Energy_Light,    "Light" },
            { Breakdown_EnergyResistanceNegative, Breakdown_EnergyAbsorptionNegative, Energy_Negative, "Negative" },
            { Breakdown_EnergyResistancePoison,   Breakdown_EnergyAbsorptionPoison,   Energy_Poison,   "Poison" },
            { Breakdown_EnergyResistanceSonic,    Breakdown_EnergyAbsorptionSonic,    Energy_Sonic,    "Sonic" },
        };
        for (auto&& e : energies)
        {
            Reg(e.res, new BreakdownItemEnergyResistance(&g_paneStub, e.res, Effect_EnergyResistance, e.t, e.name, nullptr, nullptr));
            Reg(e.abs, new BreakdownItemEnergyAbsorption(&g_paneStub, e.abs, Effect_EnergyAbsorbance, e.t, e.name, nullptr, nullptr));
        }

        // The remaining specialised classes
        Reg(Breakdown_Spellpoints, new BreakdownItemSpellPoints(
                &g_paneStub, Breakdown_Spellpoints, Effect_SpellPoints, "Spell Points", nullptr, nullptr));
        Reg(Breakdown_KiMaximum, new BreakdownItemMaximumKi(&g_paneStub, nullptr, nullptr));
        Reg(Breakdown_SneakAttackDice, new BreakdownItemSneakAttackDice(
                &g_paneStub, Breakdown_SneakAttackDice, Effect_SneakAttackDice, "Sneak Attack Dice", nullptr, nullptr));
        Reg(Breakdown_DoublestrikeOffhand, new BreakdownItemOffhandDoublestrike(
                &g_paneStub, Breakdown_DoublestrikeOffhand, "Offhand Doublestrike", nullptr, nullptr));
        Reg(Breakdown_EldritchBlastD8, new BreakdownItemPactDice(
                &g_paneStub, Breakdown_EldritchBlastD8, Effect_EldritchBlastD8, "Eldritch Blast (D8's)", nullptr, nullptr, 8));
        Reg(Breakdown_EldritchBlastD6, new BreakdownItemPactDice(
                &g_paneStub, Breakdown_EldritchBlastD6, Effect_EldritchBlastD6, "Eldritch Blast (D6's)", nullptr, nullptr, 6));
        Reg(Breakdown_TurnUndeadLevel, new BreakdownItemTurnUndeadLevel(
                &g_paneStub, Breakdown_TurnUndeadLevel, nullptr, nullptr));
        Reg(Breakdown_TurnUndeadHitDice, new BreakdownItemTurnUndeadHitDice(
                &g_paneStub, Breakdown_TurnUndeadHitDice, nullptr, nullptr));

        // ── pass 134: AC + weapon graph + immunities + song duration ──────
        // The weapon-effects HOLDER (CBreakdownsPane::CreateWeaponBreakdowns):
        // buffers every weapon effect per weapon type and instantiates the
        // per-hand BreakdownItemWeapon graphs on WeaponsChanged(), replaying
        // the buffered effects into them. It needs a live (stub) tree ctrl -
        // WeaponsChanged calls DeleteSubItems/InsertItem/Expand on it.
        g_pWeaponEffects = new BreakdownItemWeaponEffects(
                &g_paneStub, &g_treeStub, nullptr);
        Reg(Breakdown_WeaponEffectHolder, g_pWeaponEffects);
        // AC (CBreakdownsPane::CreateACBreakdowns): Dex bonus capped by MDB /
        // tower-shield MDB, armor/shield %-bonuses, natural armor; shield
        // enchantment arrives via the weapon graph's off-hand LinkUp.
        Reg(Breakdown_AC, new BreakdownItemAC(
                &g_paneStub, Breakdown_AC, nullptr, nullptr));
        Reg(Breakdown_Immunities, new BreakdownItemImmunities(
                &g_paneStub, Breakdown_Immunities, nullptr, nullptr));
        Reg(Breakdown_SongDuration, new BreakdownItemDuration(
                &g_paneStub, Breakdown_SongDuration, Effect_SongDuration,
                "Song Duration", nullptr, nullptr));
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
    void DumpEffects(BreakdownType bt, const char* label)
    {
        auto it = g_breakdowns.find(bt);
        if (it != g_breakdowns.end()) it->second->V2CalcDumpEffects(label);
    }
    bool HasWeaponBreakdown(bool bMainhand)
    {
        if (g_pWeaponEffects == nullptr) return false;
        return g_pWeaponEffects->GetWeaponBreakdown(bMainhand, Breakdown_WeaponAttackBonus) != nullptr;
    }
    double WeaponTotal(bool bMainhand, BreakdownType bt)
    {
        if (g_pWeaponEffects == nullptr) return 0.0;
        BreakdownItem* p = g_pWeaponEffects->GetWeaponBreakdown(bMainhand, bt);
        return (p != nullptr) ? p->Total() : 0.0;
    }
    void DumpWeaponEffects(bool bMainhand, BreakdownType bt, const char* label)
    {
        if (g_pWeaponEffects == nullptr) return;
        BreakdownItem* p = g_pWeaponEffects->GetWeaponBreakdown(bMainhand, bt);
        if (p != nullptr) p->V2CalcDumpEffects(label);
    }
    const char* DisplayValue(BreakdownType bt)
    {
        static std::string s_value;
        auto it = g_breakdowns.find(bt);
        s_value = (it != g_breakdowns.end()) ? (LPCTSTR)it->second->Value() : "";
        return s_value.c_str();
    }
}
