// v2calc/src/main.cpp
//
// Session 1 driver: prove the unmodified V2 reader stack works on Linux by
// loading Output/DataFiles/Feats.xml through FeatsFile (SaxContentElement +
// DL_* macro machinery + expat-backed SaxReader) and printing a JSON result.
//
// Later sessions extend this to load a .DDOBuild and emit every breakdown
// total as JSON for exact-parity CI comparison against the Windows build.
//
#include <windows.h> // v2calc shim
#include <afxwin.h>  // v2calc shim

#include <cstdio>
#include <string>

#include "FeatsFile.h"

int main(int argc, char** argv)
{
    std::string path = "Output/DataFiles/Feats.xml";
    if (argc > 1)
    {
        path = argv[1];
    }

    FeatsFile file(path);
    file.Read();
    const std::map<std::string, Feat> feats = file.Feats();

    // sample a few names so parity checking has content, not just a count
    std::string sampleNames;
    size_t sampleCount = 0;
    for (const auto& entry : feats)
    {
        if (sampleCount >= 3) break;
        if (sampleCount > 0) sampleNames += ", ";
        sampleNames += "\"" + entry.first + "\"";
        ++sampleCount;
    }

    printf("{\n");
    printf("  \"file\": \"%s\",\n", path.c_str());
    printf("  \"featCount\": %zu,\n", feats.size());
    printf("  \"firstFeats\": [%s]\n", sampleNames.c_str());
    printf("}\n");
    return feats.empty() ? 1 : 0;
}
