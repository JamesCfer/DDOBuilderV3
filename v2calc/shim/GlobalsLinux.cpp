// v2calc/shim/GlobalsLinux.cpp
//
// Linux definitions for the handful of global functions/objects from
// DDOBuilder's UI layer (GlobalSupportFunctions.cpp, LogPane.cpp,
// DDOBuilder.cpp) that the calculation-core object files reference.
// The UI .cpp files themselves are never compiled.
//
#include <windows.h> // v2calc shim
#include <afxwin.h>  // v2calc shim

#include <map>
#include <string>

// globals declared extern in DDOBuilder/stdafx.h
bool g_bShowIgnoredItems = false;
bool g_bShowZeroBreakdown = false;
bool g_bAllowDPIScaling = false;
