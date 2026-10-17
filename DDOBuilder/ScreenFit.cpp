// ScreenFit.cpp
//
#include "stdafx.h"
#include "ScreenFit.h"
#include <commctrl.h>

#pragma comment(lib, "comctl32.lib")

namespace
{
    const UINT_PTR c_screenFitSubclassId = 0x53466974;  // "SFit"
    const int c_lineScroll = 20;                        // pixels per scroll arrow click

    struct ScreenFitState
    {
        CSize content;      // full client size the dialog was designed for
        CPoint pos;         // current scroll offset
        bool inUpdate;      // guards against WM_SIZE re-entry while scroll bars show/hide
    };

    void ScrollContent(HWND hwnd, ScreenFitState* pState, int newX, int newY)
    {
        int dx = pState->pos.x - newX;
        int dy = pState->pos.y - newY;
        if (dx != 0 || dy != 0)
        {
            pState->pos = CPoint(newX, newY);
            ::ScrollWindowEx(
                    hwnd,
                    dx,
                    dy,
                    NULL,
                    NULL,
                    NULL,
                    NULL,
                    SW_SCROLLCHILDREN | SW_INVALIDATE | SW_ERASE);
        }
    }

    void UpdateScrollBars(HWND hwnd, ScreenFitState* pState)
    {
        if (pState->inUpdate)
        {
            return;
        }
        pState->inUpdate = true;
        // run twice, as showing one scroll bar can make the other one needed
        for (int pass = 0; pass < 2; ++pass)
        {
            CRect client;
            ::GetClientRect(hwnd, &client);
            int maxX = max(0, (int)pState->content.cx - client.Width());
            int maxY = max(0, (int)pState->content.cy - client.Height());
            ScrollContent(hwnd, pState, min((int)pState->pos.x, maxX), min((int)pState->pos.y, maxY));

            SCROLLINFO si;
            memset(&si, 0, sizeof(SCROLLINFO));
            si.cbSize = sizeof(SCROLLINFO);
            si.fMask = SIF_RANGE | SIF_PAGE | SIF_POS;
            si.nMin = 0;
            si.nMax = pState->content.cx - 1;
            si.nPage = client.Width();
            si.nPos = pState->pos.x;
            ::SetScrollInfo(hwnd, SB_HORZ, &si, TRUE);
            si.nMax = pState->content.cy - 1;
            si.nPage = client.Height();
            si.nPos = pState->pos.y;
            ::SetScrollInfo(hwnd, SB_VERT, &si, TRUE);
        }
        pState->inUpdate = false;
    }

    void ScrollBy(HWND hwnd, ScreenFitState* pState, int bar, int newPos)
    {
        SCROLLINFO si;
        memset(&si, 0, sizeof(SCROLLINFO));
        si.cbSize = sizeof(SCROLLINFO);
        si.fMask = SIF_ALL;
        ::GetScrollInfo(hwnd, bar, &si);
        int maxPos = max(0, si.nMax - (int)si.nPage + 1);
        newPos = max(0, min(newPos, maxPos));
        if (bar == SB_HORZ)
        {
            ScrollContent(hwnd, pState, newPos, pState->pos.y);
        }
        else
        {
            ScrollContent(hwnd, pState, pState->pos.x, newPos);
        }
        ::SetScrollPos(hwnd, bar, newPos, TRUE);
        // let the dialog refresh anything that tracks control screen
        // positions (e.g. tooltip hover areas) in its OnSize handler
        CRect client;
        ::GetClientRect(hwnd, &client);
        ::SendMessage(hwnd, WM_SIZE, SIZE_RESTORED, MAKELPARAM(client.Width(), client.Height()));
    }

    void HandleScroll(HWND hwnd, ScreenFitState* pState, int bar, WPARAM wParam)
    {
        SCROLLINFO si;
        memset(&si, 0, sizeof(SCROLLINFO));
        si.cbSize = sizeof(SCROLLINFO);
        si.fMask = SIF_ALL;
        ::GetScrollInfo(hwnd, bar, &si);
        int pos = si.nPos;
        switch (LOWORD(wParam))
        {
        case SB_LINEUP:         pos -= c_lineScroll; break;    // also SB_LINELEFT
        case SB_LINEDOWN:       pos += c_lineScroll; break;    // also SB_LINERIGHT
        case SB_PAGEUP:         pos -= (int)si.nPage; break;
        case SB_PAGEDOWN:       pos += (int)si.nPage; break;
        case SB_THUMBTRACK:
        case SB_THUMBPOSITION:  pos = si.nTrackPos; break;
        case SB_TOP:            pos = 0; break;
        case SB_BOTTOM:         pos = si.nMax; break;
        default:                return;
        }
        ScrollBy(hwnd, pState, bar, pos);
    }

    LRESULT CALLBACK ScreenFitSubclassProc(
            HWND hwnd,
            UINT msg,
            WPARAM wParam,
            LPARAM lParam,
            UINT_PTR idSubclass,
            DWORD_PTR refData)
    {
        ScreenFitState* pState = reinterpret_cast<ScreenFitState*>(refData);
        switch (msg)
        {
        case WM_VSCROLL:
        case WM_HSCROLL:
            // lParam is 0 when it comes from the dialog's own scroll bars,
            // otherwise it is a child scroll bar/trackbar the dialog handles
            if (lParam == 0)
            {
                HandleScroll(hwnd, pState, (msg == WM_VSCROLL) ? SB_VERT : SB_HORZ, wParam);
                return 0;
            }
            break;
        case WM_MOUSEWHEEL:
            {
                CRect client;
                ::GetClientRect(hwnd, &client);
                if (pState->content.cy > client.Height())
                {
                    int delta = GET_WHEEL_DELTA_WPARAM(wParam);
                    ScrollBy(hwnd, pState, SB_VERT, pState->pos.y - (delta * c_lineScroll * 3) / WHEEL_DELTA);
                    return 0;
                }
            }
            break;
        case WM_SIZE:
            {
                LRESULT result = ::DefSubclassProc(hwnd, msg, wParam, lParam);
                if (wParam != SIZE_MINIMIZED)
                {
                    UpdateScrollBars(hwnd, pState);
                }
                return result;
            }
        case WM_NCDESTROY:
            ::RemoveWindowSubclass(hwnd, ScreenFitSubclassProc, idSubclass);
            delete pState;
            break;
        }
        return ::DefSubclassProc(hwnd, msg, wParam, lParam);
    }
}

void FitDialogToScreen(CWnd* pDialog)
{
    if (pDialog == NULL || !::IsWindow(pDialog->GetSafeHwnd()))
    {
        return;
    }
    HWND hwnd = pDialog->GetSafeHwnd();

    // use the monitor the owning window is on, as the dialog itself has not
    // been positioned yet
    HWND hwndOwner = ::GetWindow(hwnd, GW_OWNER);
    HMONITOR hMonitor = ::MonitorFromWindow(
            (hwndOwner != NULL) ? hwndOwner : hwnd,
            MONITOR_DEFAULTTONEAREST);
    MONITORINFO monitorInfo;
    memset(&monitorInfo, 0, sizeof(MONITORINFO));
    monitorInfo.cbSize = sizeof(MONITORINFO);
    ::GetMonitorInfo(hMonitor, &monitorInfo);
    CRect workArea(monitorInfo.rcWork);

    CRect windowRect;
    pDialog->GetWindowRect(&windowRect);
    if (windowRect.Width() <= workArea.Width()
            && windowRect.Height() <= workArea.Height())
    {
        // fits as is, MFC will centre it as normal
        return;
    }

    CRect client;
    pDialog->GetClientRect(&client);
    ScreenFitState* pState = new ScreenFitState;
    pState->content = client.Size();
    pState->pos = CPoint(0, 0);
    pState->inUpdate = false;
    if (!::SetWindowSubclass(hwnd, ScreenFitSubclassProc, c_screenFitSubclassId, reinterpret_cast<DWORD_PTR>(pState)))
    {
        delete pState;
        return;
    }

    // shrink to the work area and centre on it
    int width = min(windowRect.Width(), workArea.Width());
    int height = min(windowRect.Height(), workArea.Height());
    pDialog->SetWindowPos(
            NULL,
            workArea.left + (workArea.Width() - width) / 2,
            workArea.top + (workArea.Height() - height) / 2,
            width,
            height,
            SWP_NOZORDER | SWP_NOACTIVATE);
    UpdateScrollBars(hwnd, pState);
}
