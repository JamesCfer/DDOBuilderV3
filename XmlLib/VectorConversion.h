// VectorConversion.h
//
#pragma once

#include <vector>
#include <string>
#include <sstream>

namespace XmlLib
{
    template <typename T>
    bool VectorToString(const std::vector<T> & v, std::wstring * out)
    {
        std::wstringstream ss;
        ss << v;
        *out = ss.str();
        return !ss.fail();
    }

    template <>
    bool VectorToString(const std::vector<int> & v, std::wstring * out);

    template <>
    bool VectorToString(const std::vector<double> & v, std::wstring * out);
    
    template <>
    bool VectorToString(const std::vector<BYTE> & v, std::wstring * out);

    template <>
    bool VectorToString(const std::vector<bool> & v, std::wstring * out);

#if defined(V2CALC_LINUX)
    // On LP64 Linux size_t is a distinct type (unsigned long) with no
    // specialization above, so an implicit instantiation of the primary
    // template (which streams a std::vector and fails to compile) would be
    // selected. These declarations make the size_t specializations (defined in
    // v2calc/shim/VectorConversionLinux.cpp) visible at every instantiation
    // point so the primary template body is never instantiated. On MSVC size_t
    // is unsigned long long, so this guard is Linux-only and never affects the
    // Windows build.
    template <>
    bool VectorToString(const std::vector<size_t> & v, std::wstring * out);
#endif

    // overload to allow control of precision (num decimal places)
    template <typename T>
    bool VectorToString(const std::vector<T> & v, size_t precision, std::wstring * out)
    {
        UNREFERENCED_PARAMETER(precision);
        return VectorToString(v, out);
    }
    template <>
    bool VectorToString(const std::vector<double> & v, size_t precision, std::wstring * out);

    template <typename T>
    bool StringToVector(const std::wstring & s, std::vector<T> * out)
    {
        std::wstringstream ss(s);
        ss >> *out;
        return !ss.fail();
    }

    template <>
    bool StringToVector(const std::wstring & s, std::vector<int> * out);

    template <>
    bool StringToVector(const std::wstring & s, std::vector<double> * out);

    template <>
    bool StringToVector(const std::wstring & s, std::vector<BYTE> * out);

    template <>
    bool StringToVector(const std::wstring & s, std::vector<bool> * out);

#if defined(V2CALC_LINUX)
    // see the size_t VectorToString note above (LP64-only specialization)
    template <>
    bool StringToVector(const std::wstring & s, std::vector<size_t> * out);
#endif
}


