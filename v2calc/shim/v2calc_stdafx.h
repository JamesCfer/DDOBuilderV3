// v2calc/shim/v2calc_stdafx.h
//
// Combined replacement for BOTH precompiled headers:
//   - XmlLib/Src/StdAfx.h      (windows.h + pointer cast macros)
//   - DDOBuilder/stdafx.h      (MFC includes + game constants)
//
// The build's generated include farm maps the quoted includes
// "stdafx.h" / "StdAfx.h" (which fail includer-directory lookup on a
// case-sensitive filesystem) to this header, so every original .cpp
// compiles unmodified.
#pragma once

#include <windows.h> // v2calc shim
#include <afxwin.h>  // v2calc shim (CString etc.)

// from XmlLib/Src/StdAfx.h
#define USHORTPTRPTR(x) ((unsigned short **)(void**)x)
#define USHORTPTR(x) ((unsigned short *)(void*)x)
#define CWCHARTPTR(x) ((const wchar_t *)(void*)x)

// the real DDOBuilder stdafx.h (game constants, common enums); its MFC
// includes resolve to the v2calc shim headers
#include <v2calc_ddobuilder_stdafx.h>

// XmlLib's VectorConversion only specializes int/double/BYTE/bool. size_t
// vectors (e.g. Dice::Number/Sides) fall through to the primary template,
// which streams a std::vector directly and does not compile. Declare size_t
// specializations here (before any DDOBuilder header instantiates them);
// definitions live in shim/VectorConversionLinux.cpp.
#include <VectorConversion.h> // v2calc shim resolves via -IXmlLib
namespace XmlLib
{
    template <> bool VectorToString(const std::vector<size_t> & v, std::wstring * out);
    template <> bool StringToVector(const std::wstring & s, std::vector<size_t> * out);
}

// Several model headers hold std::list<T> / std::vector<T> members where T is
// only forward-declared (e.g. Class.h has `std::list<Feat> m_ClassFeats` with
// `class Feat;`). MSVC instantiates the container's special members lazily; g++
// needs T complete wherever a holder is copied/destroyed. Force-completing the
// common offenders here (before any holder header) keeps the V2 sources
// unmodified. Only pulls in already-compiled calc-core types.
#ifndef V2CALC_NO_FORCE_COMPLETE
#include "Feat.h"
#endif
