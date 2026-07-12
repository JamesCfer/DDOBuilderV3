// v2calc/src/main.cpp
//
// Parity oracle driver.
//
// STATUS: loads all of DDOBuilder V2's game data (races, classes, feats)
// through V2's own SAX readers and reports counts + a FindRace/FindClass spot
// check. The next milestone - constructing a Build from a .DDOBuild and
// emitting its stats - is blocked on the Build-construction closure (see
// v2calc/README.md "Next blocker"): Build::Build() eagerly calls
// UpdateFeats()/EquippedGear()/SetupDefaultWeaponGroups(), which drags in the
// entire item/spell/enhancement/gear subsystem plus several UI panes. The
// build-driver body is preserved in v2calc/src/main_build_driver.cpp.
//
#include "stdafx.h" // v2calc: windows+afxwin shims + DDOBuilder game constants

#include <cstdio>
#include <string>
#include <list>
#include <map>

#include "Race.h"
#include "Class.h"
#include "Feat.h"

// provided by shim/GlobalDataLinux.cpp
void V2CalcLoadGameData(const std::string& dataFilesDir);
const std::list<Race>&  Races();
const std::list<Class>& Classes();
const std::map<std::string, Feat>& StandardFeats();
const Race&  FindRace(const std::string& raceName);
const Class& FindClass(const std::string& className);

int main(int argc, char** argv)
{
    std::string dataDir = "Output/DataFiles";
    if (argc > 1) dataDir = argv[1];

    V2CalcLoadGameData(dataDir);

    const Race&  human = FindRace("Human");
    const Class& monk  = FindClass("Monk");

    printf("{\n");
    printf("  \"dataDir\": \"%s\",\n", dataDir.c_str());
    printf("  \"raceCount\": %zu,\n", Races().size());
    printf("  \"classCount\": %zu,\n", Classes().size());
    printf("  \"featCount\": %zu,\n", StandardFeats().size());
    printf("  \"spotCheck\": {\n");
    printf("    \"Human.found\": %s,\n", (human.Name() == "Human") ? "true" : "false");
    printf("    \"Human.conModifier\": %d,\n", human.RacialModifier(Ability_Constitution));
    printf("    \"Monk.found\": %s\n", (monk.Name() == "Monk") ? "true" : "false");
    printf("  }\n");
    printf("}\n");

    return (Races().empty() || Classes().empty() || StandardFeats().empty()) ? 1 : 0;
}
