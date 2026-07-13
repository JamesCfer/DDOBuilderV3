// v2calc shim: afxstatusbar.h - minimal CMFCStatusBar stub
#pragma once
#include <afxwin.h>

class CMFCStatusBar : public CWnd
{
    public:
        virtual BOOL SetPaneText(int, LPCTSTR, BOOL = TRUE) { return TRUE; }
};
