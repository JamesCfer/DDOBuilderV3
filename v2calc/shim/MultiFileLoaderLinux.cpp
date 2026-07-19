// v2calc/shim/MultiFileLoaderLinux.cpp
//
// Portable per-file loaders for the object collections that DDOBuilder V2 loads
// through MultiFileObjectLoader<T> (see DDOBuilder/MultiFileObjectLoader.h):
// EnhancementTrees, Augments, Filigrees (+ their SetBonuses) and Items. Unlike
// Race/Class there is no dedicated single-file reader class for these - the
// Windows app makes the MultiFileObjectLoader itself the SAX handler and
// enumerates the directory with FindFirstFile. That header does not parse under
// the Linux shim (its ReadFiles() body names WIN32_FIND_DATA / ::SendMessage as
// non-dependent types), so we reimplement only the portable per-file half:
//   * PerFileObjectReader<T> - a SaxContentElement whose StartElement() is
//     byte-for-byte MultiFileObjectLoader::StartElement (create a T, keep it if
//     SaxElementIsSelf), reading a single file via XmlLib::SaxReader.
//   * a small opendir/readdir directory walk (case-insensitive suffix match).
//
// This lives in its OWN translation unit because it must include
// XmlLib/SaxReader.h (which pulls XmlLib/Src/CriticalSection.h). The main
// GlobalDataLinux.cpp includes Build.h -> ObserverSubject.h -> the *identical
// but distinct* DDOBuilder/CriticalSection.h; having both in one TU is a
// "class CriticalSection redefined" error. Keeping the SaxReader-facing code
// here (which never needs Build.h) sidesteps that, exactly as RaceFile.cpp does.
#include "stdafx.h"

#include <dirent.h>
#include <algorithm>
#include <list>
#include <string>

#include "XmlLib/SaxReader.h"
#include "XmlLib/SaxContentElement.h"

#include "EnhancementTree.h"
#include "Augment.h"
#include "Filigree.h"
#include "SetBonus.h"
#include "Item.h"

namespace
{
    template <class T>
    class PerFileObjectReader : public XmlLib::SaxContentElement
    {
        public:
            PerFileObjectReader(const XmlLib::SaxString& root)
                : XmlLib::SaxContentElement(root) {}
            bool ReadFile(const std::string& filename)
            {
                XmlLib::SaxReader reader(this, ElementName());
                bool ok = reader.Open(filename);
                if (ok && !m_loadedObjects.empty())
                {
                    m_loadedObjects.back().SetFilename(filename);
                }
                return ok;
            }
            const std::list<T>& LoadedObjects() const { return m_loadedObjects; }
        protected:
            XmlLib::SaxContentElementInterface* StartElement(
                    const XmlLib::SaxString& name,
                    const XmlLib::SaxAttributes& attributes)
            {
                XmlLib::SaxContentElementInterface* subHandler =
                    SaxContentElement::StartElement(name, attributes);
                if (subHandler == NULL)
                {
                    T object;
                    if (object.SaxElementIsSelf(name, attributes))
                    {
                        m_loadedObjects.push_back(object);
                        subHandler = &(m_loadedObjects.back());
                    }
                }
                return subHandler;
            }
            void EndElement() { SaxContentElement::EndElement(); }
            std::list<T> m_loadedObjects;
    };

    // Walk <dir>, read every file whose name ends (case-insensitively) with
    // <ext> through PerFileObjectReader<T> keyed on <root>, appending to <out>.
    template <class T>
    void LoadMultiFileDir(
            const std::string& dir,
            const std::string& ext,
            const XmlLib::SaxString& root,
            std::list<T>& out)
    {
        DIR* d = opendir(dir.c_str());
        if (d == nullptr) return;
        std::list<std::string> files;
        for (struct dirent* e = readdir(d); e != nullptr; e = readdir(d))
        {
            std::string name(e->d_name);
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
            PerFileObjectReader<T> reader(root);
            reader.ReadFile(path);
            for (const auto& obj : reader.LoadedObjects())
            {
                out.push_back(obj);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// exported entry points (called from GlobalDataLinux.cpp). Root element +
// extension per CDDOBuilderApp::LoadEnhancements/LoadAugments/LoadFiligrees and
// the item load (ThreadedItemLoad).
// ---------------------------------------------------------------------------
void V2CalcLoadEnhancementTreesDir(const std::string& dir, std::list<EnhancementTree>& out)
{
    LoadMultiFileDir<EnhancementTree>(dir, ".tree.xml", L"Enhancements", out);
}

void V2CalcLoadAugmentsDir(const std::string& dir, std::list<Augment>& out)
{
    LoadMultiFileDir<Augment>(dir, ".augments.xml", L"Augments", out);
}

void V2CalcLoadFiligreesDir(const std::string& dir, std::list<Filigree>& out)
{
    LoadMultiFileDir<Filigree>(dir, ".filigree.xml", L"Filigrees", out);
}

void V2CalcLoadFiligreeSetBonusesDir(const std::string& dir, std::list<SetBonus>& out)
{
    LoadMultiFileDir<SetBonus>(dir, ".filigree.xml", L"Filigrees", out);
}

void V2CalcLoadItemsDir(const std::string& dir, std::list<Item>& out)
{
    LoadMultiFileDir<Item>(dir, ".item", L"Items", out);
}
