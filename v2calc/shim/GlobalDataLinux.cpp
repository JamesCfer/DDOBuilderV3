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
