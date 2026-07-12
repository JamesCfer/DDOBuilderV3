// v2calc shim: afxcontextmenumanager.h - inert base for CustomContextMenuManager
#pragma once
#include <afxwin.h>
class CContextMenuManager
{
    public:
        virtual ~CContextMenuManager() {}
        virtual UINT TrackPopupMenu(HMENU, int, int, CWnd*, BOOL = FALSE) { return 0; }
};
