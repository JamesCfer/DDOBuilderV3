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
