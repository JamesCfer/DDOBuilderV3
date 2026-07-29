// v2calc/src/main.cpp
//
// Parity oracle driver. Loads DDOBuilder V2's game data through V2's own SAX
// readers, parses a V2-authored .DDOBuild through the real CDDOBuilderDoc /
// Character / Life / Build stack, and emits selected stat values as JSON so V3
// (the webapp) can be diffed against V2's own numbers.
//
// COMPUTE-PATH NOTE (see v2calc/README.md): V2's final displayed stats come
// from the BreakdownItem observer graph, which is constructed and fed effects
// by the UI's CBreakdownsPane. That graph is not yet wired here. The values
// below are computed by calling Build's own public accessors, which yield the
// real V2 *base* ability scores (point buy + racial + level-ups + tomes) and
// the real V2 base attack bonus - no feat/enhancement/item effects yet.
//
#include "stdafx.h" // v2calc: windows+afxwin shims + DDOBuilder game constants

#include <cstdio>
#include <cstring>
#include <string>

#include "DDOBuilderDoc.h"
#include "Character.h"
#include "Life.h"
#include "Build.h"
#include "Class.h"
#include "AbilityTypes.h"
#include "BreakdownTypes.h"
#include "BreakdownHost.h"
#include "GlobalSupportFunctions.h"

// provided by shim/GlobalDataLinux.cpp
void V2CalcLoadGameData(const std::string& dataFilesDir);
// provided by shim/SaxReaderLinux.cpp (keeps XmlLib\SaxReader.h out of this TU,
// see the helper's comment - avoids the duplicate CriticalSection definition)
namespace XmlLib { class SaxContentElement; }
bool V2CalcParseFile(XmlLib::SaxContentElement* root, const std::string& path, std::string* errorOut);

int main(int argc, char** argv)
{
    std::string dataDir = "Output/DataFiles";
    std::string buildPath = "Output/Example Builds/YingsMonk.DDOBuild";
    if (argc > 1) buildPath = argv[1];
    if (argc > 2) dataDir = argv[2];

    // 1. load the game data the calc path reaches through (races/classes/feats)
    V2CalcLoadGameData(dataDir);

    // 2. parse the .DDOBuild through the real V2 doc/character/life/build stack
    CDDOBuilderDoc doc;
    Character* pCharacter = doc.GetCharacter();
    pCharacter->AboutToLoad();
    std::string parseError;
    bool ok = V2CalcParseFile(&doc, buildPath, &parseError);
    if (!ok)
    {
        fprintf(stderr, "failed to parse %s: %s\n",
                buildPath.c_str(), parseError.c_str());
        return 2;
    }
    // NOTE: we deliberately do NOT call Character::LoadComplete() or
    // SetActiveBuild()/BuildNowActive(). Those drive the effect-application and
    // UI-notification path (CBreakdownsPane/CStancesPane/CMainFrame etc.), which
    // is not yet ported. The parsed data is already sufficient for base ability
    // scores. We reach the build through the const accessors so the linker's
    // --gc-sections can drop the pane-dependent Build methods.

    // 3. reach the active build (indices are parsed from the file)
    const Life& life = pCharacter->GetLife(pCharacter->ActiveLifeIndex());
    const Build* pBuild = life.GetBuildPointer(pCharacter->ActiveBuildIndex());
    if (pBuild == nullptr)
    {
        fprintf(stderr, "no active build in %s\n", buildPath.c_str());
        return 3;
    }

    // rebuild the class-level cache post-parse (headless, pane-free) so BAB and
    // ClassLevels are correct - the constructor built it before parse.
    const_cast<Build*>(pBuild)->V2CalcRebuildClassCache();

    size_t level = pBuild->Level();          // 1-based total level
    size_t zLevel = (level > 0) ? level - 1 : 0; // 0-based for AbilityAtLevel

    // 4. emit JSON
    static const struct { AbilityType at; const char* key; } abilities[] = {
        { Ability_Strength,     "STR" },
        { Ability_Dexterity,    "DEX" },
        { Ability_Constitution, "CON" },
        { Ability_Intelligence, "INT" },
        { Ability_Wisdom,       "WIS" },
        { Ability_Charisma,     "CHA" },
    };

    printf("{\n");
    printf("  \"build\": \"%s\",\n", buildPath.c_str());
    printf("  \"name\": \"%s\",\n", pBuild->Name().c_str());
    printf("  \"race\": \"%s\",\n", pBuild->Race().c_str());
    printf("  \"level\": %zu,\n", level);
    printf("  \"classes\": [\"%s\", \"%s\", \"%s\"],\n",
            pBuild->Class(0).c_str(), pBuild->Class(1).c_str(), pBuild->Class(2).c_str());
    printf("  \"abilityBase\": {");
    for (size_t i = 0; i < 6; ++i)
    {
        printf("%s\"%s\": %zu", (i ? ", " : " "),
                abilities[i].key,
                pBuild->AbilityAtLevel(abilities[i].at, zLevel, true));
    }
    printf(" },\n");
    printf("  \"baseAttackBonus\": %zu,\n", pBuild->BaseAttackBonus(level));

    // 5. build V2's own BreakdownItem graph headless, drive the effect path, and
    //    emit the fed totals (base + feat/enhancement/gear/stance/spell effects).
    // Point the runtime active indices (default "none") at the parsed values so
    // Character::ActiveLife()/ActiveBuild() resolve on the compute path.
    pCharacter->V2CalcSetActiveIndices(
            pCharacter->ActiveLifeIndex(), pCharacter->ActiveBuildIndex());
    v2calc::ComputeBreakdowns(pCharacter, const_cast<Build*>(pBuild));

    // Parity debugging: V2CALC_DUMP_EFFECTS=<key>[,<key>...] prints the named
    // breakdowns' per-effect pools to stderr (keys match the JSON keys below,
    // e.g. "hitpoints", "saveWill", "prr", "STR").
    const char* dumpKeys = getenv("V2CALC_DUMP_EFFECTS");

    static const struct { BreakdownType bt; const char* key; } abilityTotals[] = {
        { Breakdown_Strength,     "STR" },
        { Breakdown_Dexterity,    "DEX" },
        { Breakdown_Constitution, "CON" },
        { Breakdown_Intelligence, "INT" },
        { Breakdown_Wisdom,       "WIS" },
        { Breakdown_Charisma,     "CHA" },
    };
    printf("  \"abilityTotal\": {");
    for (size_t i = 0; i < 6; ++i)
    {
        printf("%s\"%s\": %d", (i ? ", " : " "),
                abilityTotals[i].key, (int)v2calc::Total(abilityTotals[i].bt));
        if (dumpKeys != nullptr && strstr(dumpKeys, abilityTotals[i].key) != nullptr)
        {
            v2calc::DumpEffects(abilityTotals[i].bt, abilityTotals[i].key);
        }
    }
    printf(" },\n");

    // scalar defensive/offensive breakdown totals
    static const struct { BreakdownType bt; const char* key; bool capped; } scalars[] = {
        { Breakdown_Hitpoints,       "hitpoints",       false },
        { Breakdown_FalseLife,       "falseLife",       false },
        { Breakdown_SaveFortitude,   "saveFortitude",   false },
        { Breakdown_SaveReflex,      "saveReflex",      false },
        { Breakdown_SaveWill,        "saveWill",        false },
        { Breakdown_SavePoison,      "savePoison",      false },
        { Breakdown_SaveDisease,     "saveDisease",     false },
        { Breakdown_SaveTraps,       "saveTraps",       false },
        { Breakdown_SaveSpell,       "saveSpell",       false },
        { Breakdown_SaveMagic,       "saveMagic",       false },
        { Breakdown_SaveEnchantment, "saveEnchantment", false },
        { Breakdown_SaveIllusion,    "saveIllusion",    false },
        { Breakdown_SaveFear,        "saveFear",        false },
        { Breakdown_SaveCurse,       "saveCurse",       false },
        { Breakdown_PRR,             "prr",             false },
        { Breakdown_MRR,             "mrr",             true  },
        { Breakdown_MRRCap,          "mrrCap",          false },
        { Breakdown_Dodge,           "dodge",           true  },
        { Breakdown_DodgeCap,        "dodgeCap",        false },
        { Breakdown_Fortification,   "fortification",   false },
        { Breakdown_DR,              "dr",              false },
        { Breakdown_MaxDexBonus,     "maxDexBonus",     false },
        { Breakdown_BAB,             "bab",             true  },
        { Breakdown_MeleePower,      "meleePower",      false },
        { Breakdown_RangedPower,     "rangedPower",     false },
    };
    printf("  \"breakdowns\": {\n");
    size_t n = sizeof(scalars) / sizeof(scalars[0]);
    for (size_t i = 0; i < n; ++i)
    {
        double v = scalars[i].capped
                 ? v2calc::Capped(scalars[i].bt)
                 : v2calc::Total(scalars[i].bt);
        printf("    \"%s\": %d%s\n", scalars[i].key, (int)v, (i + 1 < n) ? "," : "");
        if (dumpKeys != nullptr && strstr(dumpKeys, scalars[i].key) != nullptr)
        {
            v2calc::DumpEffects(scalars[i].bt, scalars[i].key);
        }
    }
    printf("  },\n");

    // spell DCs per school
    static const struct { BreakdownType bt; const char* key; } spellDCs[] = {
        { Breakdown_SpellSchoolAbjuration,    "abjuration"    },
        { Breakdown_SpellSchoolConjuration,   "conjuration"   },
        { Breakdown_SpellSchoolDivination,    "divination"    },
        { Breakdown_SpellSchoolEnchantment,   "enchantment"   },
        { Breakdown_SpellSchoolEvocation,     "evocation"     },
        { Breakdown_SpellSchoolIllusion,      "illusion"      },
        { Breakdown_SpellSchoolNecromancy,    "necromancy"    },
        { Breakdown_SpellSchoolTransmutation, "transmutation" },
        { Breakdown_SpellSchoolFear,          "fear"          },
        { Breakdown_SpellSchoolGlobalDC,      "globalDC"      },
        { Breakdown_SpellSchoolRuneArm,       "runeArm"       },
    };
    printf("  \"spellDC\": {");
    size_t ndc = sizeof(spellDCs) / sizeof(spellDCs[0]);
    for (size_t i = 0; i < ndc; ++i)
    {
        printf("%s\"%s\": %d", (i ? ", " : " "),
                spellDCs[i].key, (int)v2calc::Total(spellDCs[i].bt));
    }
    printf(" },\n");

    // caster levels per caster class (only classes with spell points are live)
    printf("  \"casterLevel\": {");
    bool firstCl = true;
    for (auto&& c : Classes())
    {
        BreakdownType bt = (BreakdownType)(Breakdown_CasterLevel_First + c.Index());
        if (v2calc::HasBreakdown(bt))
        {
            printf("%s\"%s\": %d", (firstCl ? " " : ", "),
                    c.Name().c_str(), (int)v2calc::Total(bt));
            firstCl = false;
        }
    }
    printf(" }\n");
    printf("}\n");
    return 0;
}
