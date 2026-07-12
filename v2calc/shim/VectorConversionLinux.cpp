// v2calc/shim/VectorConversionLinux.cpp
//
// size_t specializations of XmlLib::VectorToString / StringToVector.
// XmlLib/Src/VectorConversion.cpp only specializes int/double/BYTE/bool.
// On LP64 Linux size_t is a distinct type (unsigned long) with no
// specialization, so the primary template (which streams a std::vector and
// fails to compile) would be selected. These provide the missing pieces in
// the same space-separated integer format used by the int specialization.
#include <windows.h>          // v2calc shim (BYTE etc. for the header)
#include <VectorConversion.h> // resolves via -IXmlLib
#include <sstream>
#include <vector>

template <>
bool XmlLib::VectorToString(const std::vector<size_t> & v, std::wstring * out)
{
    std::wstringstream ss;
    for (size_t i = 0; i < v.size(); ++i)
    {
        if (i > 0) ss << L' ';
        ss << v[i];
    }
    *out = ss.str();
    return true;
}

template <>
bool XmlLib::StringToVector(const std::wstring & s, std::vector<size_t> * out)
{
    out->clear();
    std::wstringstream ss(s);
    size_t value;
    while (ss >> value)
    {
        out->push_back(value);
    }
    return !ss.bad();
}
