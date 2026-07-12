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
#include <string>

#include "DDOBuilderDoc.h"
#include "Character.h"
#include "Life.h"
#include "Build.h"
#include "AbilityTypes.h"

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
    pCharacter->LoadComplete();

    // 3. reach the active build (indices are parsed from the file)
    pCharacter->SetActiveBuild(pCharacter->ActiveLifeIndex(),
                               pCharacter->ActiveBuildIndex(),
                               true);
    Build* pBuild = pCharacter->ActiveBuild();
    if (pBuild == nullptr)
    {
        fprintf(stderr, "no active build in %s\n", buildPath.c_str());
        return 3;
    }

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
    printf("  \"baseAttackBonus\": %zu\n", pBuild->BaseAttackBonus(level));
    printf("}\n");
    return 0;
}
