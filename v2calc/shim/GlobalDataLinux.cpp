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
#include "LogPane.h"
#include "Requirement.h"
#include "Requirements.h"
#include "RequiresOneOf.h"

#include <sstream>
#include <vector>

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
    std::list<EnhancementTree>      g_enhancementTrees;   // empty for now

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
            if (name.size() > ext.size() &&
                name.compare(name.size() - ext.size(), ext.size(), ext) == 0)
            {
                files.push_back(dir + "/" + name);
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
