// v2calc/shim/GlobalDataLinux.cpp
//
// Linux replacement for the global game-data accessors that DDOBuilder's calc
// core reaches through. In the Windows build these live in
// GlobalSupportFunctions.cpp and proxy to the MFC application object
// (theApp.Races(), theApp.Classes(), ...). That app object drags in the entire
// UI, so instead we hold the loaded data in file-scope globals here and load it
// directly from the V2 data files through V2's own SAX readers (RaceFile,
// ClassFile, FeatsFile).
//
// FindFeat / FindRace / FindClass are copied verbatim from
// GlobalSupportFunctions.cpp (they only depend on the accessors below).
// SeparateFeats mirrors CDDOBuilderApp::SeparateFeats.
#include "stdafx.h" // v2calc: windows+afxwin shims + DDOBuilder game constants

#include <dirent.h>
#include <string>
#include <list>
#include <map>
#include <algorithm>

#include "Race.h"
#include "Class.h"
#include "Feat.h"
#include "RaceFile.h"
#include "ClassFile.h"
#include "FeatsFile.h"
#include "EnhancementTree.h"
#include "EnhancementTreeItem.h"
#include "LogPane.h"
#include "Requirement.h"
#include "Requirements.h"
#include "RequiresOneOf.h"

// data objects + their file readers (wired in by v2calc so gear/enhancement/
// spell/set/augment/filigree effects apply, matching CDDOBuilderApp::LoadData)
#include "Bonus.h"
#include "Spell.h"
#include "Item.h"
#include "ItemAugment.h"
#include "Augment.h"
#include "Filigree.h"
#include "SetBonus.h"
#include "Stance.h"
#include "WeaponGroup.h"
#include "Buff.h"
#include "OptionalBuff.h"
#include "GuildBuff.h"
#include "Quest.h"
#include "Challenge.h"
#include "Build.h"

// single-file SAX readers (their .Read() bodies - which use XmlLib::SaxReader -
// live in the matching *File.cpp compiled into the Makefile, so including the
// header here does NOT pull SaxReader.h and its CriticalSection.h).
#include "BonusTypesFile.h"
#include "SpellsFile.h"
#include "SetBonusFile.h"
#include "StancesFile.h"
#include "WeaponGroupFile.h"
#include "BuffFile.h"
#include "OptionalBuffFile.h"

#include <sstream>
#include <vector>

// Multi-file object loaders (EnhancementTrees / Augments / Filigrees / Items):
// implemented in shim/MultiFileLoaderLinux.cpp, which is the only TU that may
// include XmlLib/SaxReader.h (see the note there re: the duplicate
// CriticalSection.h). We reach them through these extern entry points.
extern void V2CalcLoadEnhancementTreesDir(const std::string& dir, std::list<EnhancementTree>& out);
extern void V2CalcLoadAugmentsDir(const std::string& dir, std::list<Augment>& out);
extern void V2CalcLoadFiligreesDir(const std::string& dir, std::list<Filigree>& out);
extern void V2CalcLoadFiligreeSetBonusesDir(const std::string& dir, std::list<SetBonus>& out);
extern void V2CalcLoadItemsDir(const std::string& dir, std::list<Item>& out);

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------
namespace
{
    std::list<Race>                 g_races;
    std::list<Class>                g_classes;
    std::map<std::string, Feat>     g_allFeats;
    std::list<Feat>                 g_heroicPastLifeFeats;
    std::list<Feat>                 g_racialPastLifeFeats;
    std::list<Feat>                 g_iconicPastLifeFeats;
    std::list<Feat>                 g_epicPastLifeFeats;
    std::list<Feat>                 g_specialFeats;
    std::list<Feat>                 g_universalTreeFeats;
    std::list<Feat>                 g_destinyTreeFeats;
    std::list<Feat>                 g_favorFeats;
    std::list<EnhancementTree>      g_enhancementTrees;

    // gear / enhancement / spell / set / augment / filigree data
    std::list<Bonus>                g_bonusTypes;
    std::list<Spell>                g_spells;
    std::list<Augment>              g_augments;
    std::list<SetBonus>             g_setBonuses;
    std::list<Filigree>             g_filigrees;
    std::list<Stance>               g_stances;
    std::list<WeaponGroup>          g_weaponGroups;
    std::list<Buff>                 g_itemBuffs;
    std::list<Spell>                g_itemClickies;
    std::list<OptionalBuff>         g_optionalBuffs;
    std::list<Item>                 g_items;
    // Not populated by v2calc (no gear/enhancement/spell/set/augment/filigree
    // effect depends on them for the builds we validate); kept as empty backing
    // stores so the Find*/accessor calls that reference them still resolve.
    std::list<GuildBuff>            g_guildBuffs;
    std::list<Quest>                g_quests;
    std::list<Challenge>            g_challenges;

    // Port of the completionist requirement-injection from
    // CDDOBuilderApp::LoadFeats. The Feats.xml "Completionist" / "Racial
    // Completionist" feats ship with only a static Level automatic-acquisition
    // requirement (Level>=3 / >=1); the Windows app dynamically rewrites their
    // RequirementsToTrain to demand every class / racial past life feat, so they
    // only apply when the character actually has all past lives. Without this,
    // every character auto-acquires them (spurious +2 to all abilities/skills
    // from each). We replicate that rewrite here against the loaded g_allFeats.
    void UpdateCompletionistRequirements()
    {
        auto fit = g_allFeats.find("Completionist");
        if (fit != g_allFeats.end())
        {
            Feat* completionist = &fit->second;
            Requirements req;
            std::vector<bool> bDone;
            bDone.resize(g_classes.size(), false);
            size_t ci = 0;
            for (auto&& cit : g_classes)
            {
                size_t architypeCount = 1;
                if (!cit.HasNotHeroic()
                        && cit.GetBaseClass() != Class_Unknown
                        && !bDone[ci])
                {
                    bDone[ci] = true;
                    std::string baseClass = cit.GetBaseClass();
                    RequiresOneOf roo;
                    std::stringstream ss;
                    ss << "Past Life: " << cit.Name();
                    Requirement classRequirement(Requirement_Feat, ss.str(), 1);
                    roo.AddRequirement(classRequirement);
                    size_t aci = 0;
                    for (auto&& acit : g_classes)
                    {
                        if (!acit.HasNotHeroic()
                                && !bDone[aci]
                                && acit.GetBaseClass() == baseClass)
                        {
                            std::stringstream ass;
                            ass << "Past Life: " << acit.BaseClass() << " - " << acit.Name();
                            Requirement architypeClassRequirement(Requirement_Feat, ass.str(), 1);
                            roo.AddRequirement(architypeClassRequirement);
                            ++architypeCount;
                            bDone[aci] = true;
                        }
                        ++aci;
                    }
                    if (architypeCount == 1)
                    {
                        req.AddRequirement(classRequirement);
                    }
                    else
                    {
                        req.AddRequiresOneOf(roo);
                    }
                }
                bDone[ci] = true;
                ++ci;
            }
            completionist->SetRequirements(req);
        }
        fit = g_allFeats.find("Racial Completionist");
        if (fit != g_allFeats.end())
        {
            Feat* racialCompletionist = &fit->second;
            Requirements req;
            for (auto&& rit : g_races)
            {
                if (!rit.IsIconic()
                        && !rit.HasNoPastLife())
                {
                    std::stringstream ss;
                    ss << "Past Life: " << rit.Name();
                    Requirement raceRequirement(Requirement_Feat, ss.str(), 3);
                    req.AddRequirement(raceRequirement);
                }
            }
            racialCompletionist->SetRequirements(req);
        }
    }

    // Port of the per-class / per-race feat injection from
    // CDDOBuilderApp::LoadFeats (DDOBuilder.cpp ~460-488). The Windows app,
    // after loading Feats.xml, folds three extra feat sources into m_allFeats
    // (then clears them off the Class/Race objects so they are not applied
    // twice). The headless calc core reads only StandardFeats()/FindFeat(), so
    // without this injection these feats' effects never apply and v2calc
    // under-counts. The three sources:
    //
    //   1. Class::ImprovedHeroicDurabilityFeats() - per heroic (non-NotHeroic)
    //      class, 3 synthesized copies of the base "Improved Heroic Durability"
    //      feat (+5 max HP) auto-acquired at class-level 5/10/15. Exist in no
    //      XML. (FindFeat("Improved Heroic Durability") reads g_allFeats, so
    //      this must run after g_allFeats is populated from Feats.xml.)
    //   2. Class::ClassFeats() - class-specific feats defined inline in the
    //      .class.xml files rather than in Feats.xml.
    //   3. Race::RacialFeats() - race-specific feats defined inline in the
    //      .race.xml files rather than in Feats.xml.
    //
    // insert() (not operator[]) matches the Windows behaviour: an existing
    // Feats.xml entry of the same name wins.
    void InjectClassAndRaceFeats()
    {
        for (auto&& cit : g_classes)
        {
            std::list<Feat> ihdfs = cit.ImprovedHeroicDurabilityFeats();
            for (auto&& it : ihdfs)
            {
                g_allFeats.insert(std::pair<std::string, Feat>(it.Name(), it));
            }
            for (auto&& cfit : cit.ClassFeats())
            {
                g_allFeats.insert(std::pair<std::string, Feat>(cfit.Name(), cfit));
            }
        }
        for (auto&& rit : g_races)
        {
            for (auto&& rfit : rit.RacialFeats())
            {
                g_allFeats.insert(std::pair<std::string, Feat>(rfit.Name(), rfit));
            }
        }
    }

    void SeparateFeats()
    {
        for (auto& e : g_allFeats)
        {
            switch (e.second.Acquire())
            {
                case FeatAcquisition_EpicPastLife:    g_epicPastLifeFeats.push_back(e.second);   break;
                case FeatAcquisition_HeroicPastLife:  g_heroicPastLifeFeats.push_back(e.second); break;
                case FeatAcquisition_RacialPastLife:  g_racialPastLifeFeats.push_back(e.second); break;
                case FeatAcquisition_IconicPastLife:  g_iconicPastLifeFeats.push_back(e.second); break;
                case FeatAcquisition_Special:         g_specialFeats.push_back(e.second);        break;
                case FeatAcquisition_UniversalTree:   g_universalTreeFeats.push_back(e.second);  break;
                case FeatAcquisition_EpicDestinyTree: g_destinyTreeFeats.push_back(e.second);    break;
                case FeatAcquisition_Favor:           g_favorFeats.push_back(e.second);          break;
                default: break; // ordinary feat, stays only in the map
            }
        }
    }

    // Load every "*.<ext>.xml" in <dir> through a single-file SAX reader whose
    // root element matches (each per-object file wraps one object in the same
    // root tag the multi-object list file uses, e.g. <Races><Race>...).
    template <class FileT, class ListT>
    void LoadDir(const std::string& dir, const std::string& ext, ListT& out)
    {
        DIR* d = opendir(dir.c_str());
        if (d == nullptr) return;
        std::list<std::string> files;
        for (struct dirent* e = readdir(d); e != nullptr; e = readdir(d))
        {
            std::string name(e->d_name);
            // case-insensitive suffix match (Windows FindFirstFile filters are
            // case-insensitive; the data files mix case, e.g. ".Augments.xml").
            if (name.size() > ext.size())
            {
                std::string tail = name.substr(name.size() - ext.size());
                std::string extLower = ext;
                std::transform(tail.begin(), tail.end(), tail.begin(), ::tolower);
                std::transform(extLower.begin(), extLower.end(), extLower.begin(), ::tolower);
                if (tail == extLower)
                {
                    files.push_back(dir + "/" + name);
                }
            }
        }
        closedir(d);
        files.sort();
        for (const auto& path : files)
        {
            FileT f(path);
            f.Read();
            for (const auto& obj : f.Objects())
            {
                out.push_back(obj);
            }
        }
    }
}

// Thin adapters so LoadDir can pull the loaded list uniformly.
namespace
{
    struct RaceFileAdapter : public RaceFile
    {
        RaceFileAdapter(const std::string& p) : RaceFile(p) {}
        const std::list<Race>& Objects() const { return Races(); }
    };
    struct ClassFileAdapter : public ClassFile
    {
        ClassFileAdapter(const std::string& p) : ClassFile(p) {}
        const std::list<Class>& Objects() const { return Classes(); }
    };

}

// ---------------------------------------------------------------------------
// public loader (called from main before any build is loaded)
// ---------------------------------------------------------------------------
void V2CalcLoadGameData(const std::string& dataFilesDir)
{
    // Order mirrors CDDOBuilderApp::LoadData(): BonusTypes first (drives the
    // stacking registry FindBonus/RemoveNonStacking consult), then Enhancements,
    // Spells (before Classes), Races, Classes, Feats, then the gear-effect data.
    {
        BonusTypesFile file(dataFilesDir + "/BonusTypes.xml");
        file.Read();
        g_bonusTypes = file.BonusTypes();
    }
    V2CalcLoadEnhancementTreesDir(dataFilesDir + "/EnhancementTrees", g_enhancementTrees);
    g_enhancementTrees.sort();
    {
        SpellsFile file(dataFilesDir + "/Spells.xml");
        file.Read();
        g_spells = file.Spells();
    }
    LoadDir<RaceFileAdapter>(dataFilesDir + "/Races", ".race.xml", g_races);
    LoadDir<ClassFileAdapter>(dataFilesDir + "/Classes", ".class.xml", g_classes);
    g_classes.sort();
    // Restore Index() == position in the sorted list (normally done by the
    // UI-only Class::CreateClassImageLists). ClassLevels()/ClassFromIndex() and
    // the caster-level breakdowns index classes by Index(), so this must match.
    {
        size_t idx = 0;
        for (const auto& c : g_classes) { c.V2CalcReindex(idx); ++idx; }
    }

    FeatsFile feats(dataFilesDir + "/Feats.xml");
    feats.Read();
    g_allFeats = feats.Feats();
    InjectClassAndRaceFeats();
    UpdateCompletionistRequirements();
    SeparateFeats();

    // Augments
    V2CalcLoadAugmentsDir(dataFilesDir + "/Augments", g_augments);
    // Gear set bonuses
    {
        SetBonusFile file(dataFilesDir + "/SetBonuses.xml");
        file.Read();
        g_setBonuses = file.SetBonuses();
    }
    // Filigrees (objects) and the set bonuses they define (appended to g_setBonuses)
    V2CalcLoadFiligreesDir(dataFilesDir + "/FiligreeSets", g_filigrees);
    g_filigrees.sort();
    V2CalcLoadFiligreeSetBonusesDir(dataFilesDir + "/FiligreeSets", g_setBonuses);
    // Stances
    {
        StancesFile file(dataFilesDir + "/Stances.xml");
        file.Read();
        g_stances = file.Stances();
    }
    // Weapon groups
    {
        WeaponGroupFile file(dataFilesDir + "/WeaponGroupings.xml");
        file.Read();
        g_weaponGroups = file.WeaponGroups();
    }
    // Item buffs
    {
        BuffFile file(dataFilesDir + "/ItemBuffs.xml");
        file.Read();
        g_itemBuffs = file.ItemBuffs();
    }
    // Item clickies (read via SpellsFile, per the app)
    {
        SpellsFile file(dataFilesDir + "/ItemClickies.xml");
        file.Read();
        g_itemClickies = file.Spells();
    }
    // Self and party (optional) buffs
    {
        OptionalBuffFile file(dataFilesDir + "/SelfAndPartyBuffs.xml");
        file.Read();
        g_optionalBuffs = file.OptionalBuffs();
    }
    // Items last (largest collection: thousands of *.item files)
    V2CalcLoadItemsDir(dataFilesDir + "/Items", g_items);
}

// ---------------------------------------------------------------------------
// accessors (signatures per GlobalSupportFunctions.h)
// ---------------------------------------------------------------------------
const std::list<Race>&  Races()                 { return g_races; }
const std::list<Class>& Classes()               { return g_classes; }
const std::map<std::string, Feat>& StandardFeats() { return g_allFeats; }
const std::list<Feat>&  HeroicPastLifeFeats()   { return g_heroicPastLifeFeats; }
const std::list<Feat>&  RacialPastLifeFeats()   { return g_racialPastLifeFeats; }
const std::list<Feat>&  IconicPastLifeFeats()   { return g_iconicPastLifeFeats; }
const std::list<Feat>&  EpicPastLifeFeats()     { return g_epicPastLifeFeats; }
const std::list<Feat>&  SpecialFeats()          { return g_specialFeats; }
const std::list<Feat>&  UniversalTreeFeats()    { return g_universalTreeFeats; }
const std::list<Feat>&  DestinyTreeFeats()      { return g_destinyTreeFeats; }
const std::list<Feat>&  FavorFeats()            { return g_favorFeats; }
const std::list<EnhancementTree>& EnhancementTrees() { return g_enhancementTrees; }

const std::list<Bonus>&       BonusTypes()     { return g_bonusTypes; }
const std::list<Spell>&       Spells()         { return g_spells; }
const std::list<Augment>&     Augments()       { return g_augments; }
const std::list<SetBonus>&    SetBonuses()     { return g_setBonuses; }
const std::list<Filigree>&    Filigrees()      { return g_filigrees; }
const std::list<Stance>&      Stances()        { return g_stances; }
const std::list<WeaponGroup>& WeaponGroups()   { return g_weaponGroups; }
const std::list<Buff>&        ItemBuffs()      { return g_itemBuffs; }
const std::list<Spell>&       ItemClickies()   { return g_itemClickies; }
const std::list<OptionalBuff>& OptionalBuffs() { return g_optionalBuffs; }
const std::list<GuildBuff>&   GuildBuffs()     { return g_guildBuffs; }
const std::list<Quest>&       Quests()         { return g_quests; }
const std::list<Challenge>&   Challenges()     { return g_challenges; }
const std::list<Item>&        Items()          { return g_items; }

// ---------------------------------------------------------------------------
// Find* (verbatim from GlobalSupportFunctions.cpp)
// ---------------------------------------------------------------------------
const Feat& FindFeat(const std::string& featName)
{
    static Feat featNotFound("Feat not found", "No description", "Unknown");
    const std::map<std::string, Feat>& standardFeats = StandardFeats();
    auto ff = standardFeats.find(featName);
    if (ff != standardFeats.end())
    {
        return ff->second;
    }
    for (auto&& it : HeroicPastLifeFeats()) { if (it.Name() == featName) return it; }
    for (auto&& it : RacialPastLifeFeats()) { if (it.Name() == featName) return it; }
    for (auto&& it : IconicPastLifeFeats()) { if (it.Name() == featName) return it; }
    for (auto&& it : EpicPastLifeFeats())   { if (it.Name() == featName) return it; }
    for (auto&& it : SpecialFeats())        { if (it.Name() == featName) return it; }
    for (auto&& it : UniversalTreeFeats())  { if (it.Name() == featName) return it; }
    for (auto&& it : FavorFeats())          { if (it.Name() == featName) return it; }
    return featNotFound;
}

const Race& FindRace(const std::string& raceName)
{
    static Race badRace;
    for (const auto& r : Races())
    {
        if (r.Name() == raceName) return r;
    }
    return badRace;
}

const Class& FindClass(const std::string& className)
{
    static Class badClass;
    for (const auto& c : Classes())
    {
        if (c.Name() == className) return c;
    }
    return badClass;
}

// ---------------------------------------------------------------------------
// Data-driven Find* / helpers (copied verbatim from GlobalSupportFunctions.cpp;
// they only depend on the collection accessors above). These replace the
// not-found singleton stubs that used to live in shim/UIStub.cpp, so gear,
// enhancement, spell, set-bonus, augment and filigree effects now resolve.
// ---------------------------------------------------------------------------
const Bonus& FindBonus(const std::string& bonus)
{
    static Bonus bonusNotFound;
    const std::list<Bonus>& allBonus = BonusTypes();
    auto it = allBonus.begin();
    while (it != allBonus.end())
    {
        if ((*it).Name() == bonus)
        {
            return (*it);
        }
        ++it;
    }
    return bonusNotFound;
}

const Item& FindItem(const std::string& itemName)
{
    static Item badItem;
    const std::list<Item>& items = Items();
    std::list<Item>::const_iterator it = items.begin();
    while (it != items.end())
    {
        if ((*it).Name() == itemName)
        {
            return (*it);
        }
        ++it;
    }
    return badItem;
}

const Buff& FindBuff(const std::string& buffName)
{
    const std::list<Buff>& buffs = ItemBuffs();
    for (auto&& it : buffs)
    {
        if (it.Type() == buffName)
        {
            return it;
        }
    }
    return FindBuff("BuffNotFound");
}

const Quest& FindQuest(const std::string& questName)
{
    const std::list<Quest>& quests = Quests();
    for (auto&& it : quests)
    {
        const std::string& name = it.Name();
        if (name == questName)
        {
            return it;
        }
        if (it.HasEpicName()
                && it.EpicName() == questName)
        {
            return it;
        }
    }
    static Quest badQuest(std::string("Bad Quest"));
    return badQuest;
}

const Challenge& FindChallenge(const std::string& challengeName)
{
    const std::list<Challenge>& challenges = Challenges();
    for (auto&& it : challenges)
    {
        const std::string& name = it.Name();
        if (name == challengeName)
        {
            return it;
        }
    }
    static Challenge badChallenge(std::string("Bad Challenge"));
    return badChallenge;
}

const OptionalBuff& FindOptionalBuff(const std::string& name)
{
    const std::list<OptionalBuff>& opBuffs = OptionalBuffs();
    for (auto&& it : opBuffs)
    {
        if (name == it.Name())
        {
            return it;
        }
    }
    static OptionalBuff badBuff;
    return badBuff;
}

const EnhancementTreeItem* FindEnhancement(
        const std::string& internalName,
        std::string* treeName) // can be NULL
{
    const EnhancementTreeItem* item = NULL;
    const std::list<EnhancementTree>& trees = EnhancementTrees();
    bool found = false;
    std::list<EnhancementTree>::const_iterator tit = trees.begin();
    while (!found && tit != trees.end())
    {
        item = (*tit).FindEnhancementItem(internalName);
        found = (item != NULL);
        if (found && treeName != NULL)
        {
            *treeName = (*tit).Name();
        }
        ++tit;
    }
    return item;
}

const EnhancementTreeItem* FindEnhancement(
        const std::string& internalName)
{
    const EnhancementTreeItem* item = NULL;
    const std::list<EnhancementTree>& trees = EnhancementTrees();
    auto tit = trees.begin();
    while (item == NULL && tit != trees.end())
    {
        item = (*tit).FindEnhancementItem(internalName);
        ++tit;
    }
    return item;
}

const EnhancementTreeItem* FindEnhancement(
        const std::string& treeName,
        const std::string& internalName)
{
    const EnhancementTree& tree = EnhancementTree::GetTree(treeName);
    const EnhancementTreeItem* item = tree.FindEnhancementItem(internalName);
    return item;
}

const EnhancementTree& GetEnhancementTree(const std::string& treeName)
{
    static EnhancementTree emptyTree;
    const std::list<EnhancementTree>& allTrees = EnhancementTrees();
    std::list<EnhancementTree>::const_iterator it = allTrees.begin();
    while (it != allTrees.end())
    {
        if ((*it).Name() == treeName)
        {
            return (*it);
        }
        ++it;
    }
    return emptyTree;
}

Spell FindClassSpellByName(const Build* pBuild, const std::string& ct, const std::string& name)
{
    const ::Class& c = FindClass(ct);
    Spell spell = c.FindSpell(name);
    if (spell.Name() != name)
    {
        spell = pBuild->AdditionalClassSpell(ct, name);
    }
    return spell;
}

Spell FindSpellByName(const std::string& name, bool bSuppressError)
{
    (void)bSuppressError;
    Spell spell;
    const std::list<Spell>& spells = Spells();
    std::list<Spell>::const_iterator si = spells.begin();
    while (si != spells.end())
    {
        if ((*si).Name() == name)
        {
            spell = (*si);
            break;
        }
        ++si;
    }
    if (spell.Name() == "")
    {
        const std::list<Spell>& clickies = ItemClickies();
        si = clickies.begin();
        while (si != clickies.end())
        {
            if ((*si).Name() == name)
            {
                spell = (*si);
                break;
            }
            ++si;
        }
    }
    return spell;
}

Spell FindItemClickieByName(const std::string& ct, bool bSuppressError)
{
    (void)bSuppressError;
    Spell spell;
    const std::list<Spell>& spells = ItemClickies();
    std::list<Spell>::const_iterator si = spells.begin();
    while (si != spells.end())
    {
        if ((*si).Name() == ct)
        {
            spell = (*si);
            break;
        }
        ++si;
    }
    return spell;
}

const Augment& FindAugmentByName(const std::string& name, const Item* pItem)
{
    static Augment badAugment;
    bool bFound = false;
    if (pItem != NULL)
    {
        const std::vector<ItemAugment>& itemAugments = pItem->Augments();
        for (size_t i = 0; !bFound && i < itemAugments.size(); ++i)
        {
            const std::list<Augment>& augments = itemAugments[i].ItemSpecificAugments();
            for (auto&& it : augments)
            {
                if (it.Name() == name)
                {
                    bFound = true;
                    return it;
                }
            }
        }
    }
    const std::list<Augment>& augments = Augments();
    std::list<Augment>::const_iterator it = augments.begin();
    while (it != augments.end())
    {
        if ((*it).Name() == name)
        {
            return (*it);
        }
        ++it;
    }
    return badAugment;
}

const Filigree& FindFiligreeByName(const std::string& name)
{
    static Filigree badFiligree;
    const std::list<Filigree>& filigrees = Filigrees();
    std::list<Filigree>::const_iterator it = filigrees.begin();
    while (it != filigrees.end())
    {
        if ((*it).Name() == name)
        {
            return (*it);
        }
        ++it;
    }
    return badFiligree;
}

const SetBonus& FindSetBonus(const std::string& name)
{
    static SetBonus badSetBonus;
    const std::list<SetBonus>& sets = SetBonuses();
    std::list<SetBonus>::const_iterator it = sets.begin();
    while (it != sets.end())
    {
        if ((*it).Type() == name)
        {
            return (*it);
        }
        ++it;
    }
    return badSetBonus;
}

bool CanEquipTo2ndWeapon(Build* pBuild, const Item& item)
{
    bool bAllowRuneArm = false;
    if (pBuild != NULL
        && (pBuild->IsFeatTrained("Artificer Rune Arm Use")
            || pBuild->IsGrantedFeat("Artificer Rune Arm Use")))
    {
        bAllowRuneArm = true;
    }
    bool canEquip = true;
    switch (item.Weapon())
    {
    case Weapon_Falchion:
    case Weapon_GreatAxe:
    case Weapon_GreatClub:
    case Weapon_GreatSword:
    case Weapon_Handwraps:
    case Weapon_Longbow:
    case Weapon_Maul:
    case Weapon_Quarterstaff:
    case Weapon_Shortbow:
        canEquip = false;
        break;
    case Weapon_GreatCrossbow:
    case Weapon_HeavyCrossbow:
    case Weapon_LightCrossbow:
    case Weapon_RepeatingHeavyCrossbow:
    case Weapon_RepeatingLightCrossbow:
        canEquip = bAllowRuneArm;
        break;
    default:
        break;
    }
    return canEquip;
}

void AddAugment(
    std::vector<ItemAugment>* augments,
    const std::string& name,
    bool atEnd)
{
    bool found = false;
    for (size_t i = 0; i < augments->size(); ++i)
    {
        if ((*augments)[i].Type() == name)
        {
            found = true;
            break;
        }
    }
    if (!found)
    {
        ItemAugment newAugment;
        newAugment.SetType(name);
        bool foundMythic = false;
        size_t i;
        for (i = 0; i < augments->size(); ++i)
        {
            if ((*augments)[i].Type() == "Mythic")
            {
                foundMythic = true;
                break;
            }
        }
        if (!atEnd && foundMythic)
        {
            std::vector<ItemAugment>::iterator it = augments->begin();
            std::advance(it, i);
            augments->insert(it, newAugment);
        }
        else
        {
            augments->push_back(newAugment);
        }
    }
}

void AddSpecialSlots(InventorySlotType slot, Item& item)
{
    if (item.MinLevel() >= 1)
    {
        std::vector<ItemAugment> currentAugments = item.Augments();
        AddAugment(&currentAugments, "Mythic", true);
        std::string reaperSlot;
        switch (slot)
        {
            case Inventory_Arrows:  break;
            case Inventory_Armor:   reaperSlot = "Reaper Armor"; break;
            case Inventory_Belt:    reaperSlot = "Reaper Belt"; break;
            case Inventory_Boots:   reaperSlot = "Reaper Boot"; break;
            case Inventory_Bracers: reaperSlot = "Reaper Bracers"; break;
            case Inventory_Cloak:   reaperSlot = "Reaper Cloak"; break;
            case Inventory_Gloves:  reaperSlot = "Reaper Gloves"; break;
            case Inventory_Goggles: reaperSlot = "Reaper Goggles"; break;
            case Inventory_Helmet:  reaperSlot = "Reaper Helmet"; break;
            case Inventory_Necklace:reaperSlot = "Reaper Necklace"; break;
            case Inventory_Quiver:  break;
            case Inventory_Ring1:
            case Inventory_Ring2:   reaperSlot = "Reaper Ring"; break;
            case Inventory_Trinket: reaperSlot = "Reaper Trinket"; break;
            case Inventory_Weapon1:
            case Inventory_Weapon2: if (item.Weapon() == Weapon_ShieldBuckler
                || item.Weapon() == Weapon_ShieldSmall
                || item.Weapon() == Weapon_ShieldLarge
                || item.Weapon() == Weapon_ShieldTower)
            {
                reaperSlot = "Reaper Shield";
            }
            else
            {
                reaperSlot = "Reaper Weapon";
            }
            break;
            default: break;
        }
        if (reaperSlot != "")
        {
            AddAugment(&currentAugments, reaperSlot, true);
        }
        if (item.CanEquipToSlot(Inventory_Ring1))
        {
            AddAugment(&currentAugments, "Reaper Ring", true);
        }
        if (slot != Inventory_Quiver)
        {
            AddAugment(&currentAugments, "Deck Curse", true);
        }
        item.SetAugments(currentAugments);
    }
    else
    {
        std::vector<ItemAugment> currentAugments = item.Augments();
        if (slot != Inventory_Quiver)
        {
            AddAugment(&currentAugments, "Deck Curse", true);
        }
        item.SetAugments(currentAugments);
    }
}

// ---------------------------------------------------------------------------
// GetLog() - the log pane is UI; return an inert instance. The two methods the
// calc core calls are defined here as no-ops that never touch the object, so
// the returned reference is never actually dereferenced.
// ---------------------------------------------------------------------------
CLogPane& GetLog()
{
    alignas(CLogPane) static unsigned char s_buf[sizeof(CLogPane)];
    return *reinterpret_cast<CLogPane*>(s_buf);
}

void CLogPane::AddLogEntry(const CString&) {}
void CLogPane::UpdateLastLogEntry(const CString&) {}
