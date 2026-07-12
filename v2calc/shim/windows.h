// v2calc/shim/windows.h
//
// Linux replacement for <windows.h> used when building the v2calc
// exact-parity oracle. Provides ONLY the subset of Win32 types, macros
// and functions actually referenced by the DDOBuilder/XmlLib calculation
// core. Everything is inline/static so no extra library is required.
//
#pragma once

#ifndef V2CALC_LINUX
#define V2CALC_LINUX 1
#endif

#include <cassert>
#include <cerrno>
#include <cstdarg>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cwchar>
#include <string>

#include <fcntl.h>
#include <pthread.h>
#include <strings.h>
#include <unistd.h>

// ---------------------------------------------------------------------------
// basic types
// ---------------------------------------------------------------------------
typedef int                 BOOL;
typedef unsigned char       BYTE;
typedef unsigned char*      LPBYTE;
typedef unsigned short      WORD;
typedef unsigned int        UINT;
typedef int                 INT;
typedef long                LONG;
typedef unsigned long       ULONG;
typedef unsigned int        DWORD;      // 32bit on Windows; unsigned int on LP64
typedef long long           LONGLONG;
typedef unsigned long long  ULONGLONG;
typedef long                HRESULT;
typedef void*               HANDLE;
typedef void*               HWND;
typedef void*               HINSTANCE;
typedef void*               HBITMAP;
typedef void*               HICON;
typedef void*               HMENU;
typedef void*               HTREEITEM;
typedef void*               HHOOK;
typedef void*               HDC;
typedef void*               LPVOID;
typedef const void*         LPCVOID;
typedef char*               LPSTR;
typedef char*               LPTSTR;
typedef const char*         LPCSTR;
typedef const char*         LPCTSTR;
typedef wchar_t*            LPWSTR;
typedef const wchar_t*      LPCWSTR;
typedef char                TCHAR;
typedef intptr_t            INT_PTR;
typedef uintptr_t           UINT_PTR;
typedef intptr_t            LONG_PTR;
typedef uintptr_t           ULONG_PTR;
typedef UINT_PTR            WPARAM;
typedef LONG_PTR            LPARAM;
typedef LONG_PTR            LRESULT;
typedef DWORD               COLORREF;

#ifndef TRUE
#define TRUE 1
#endif
#ifndef FALSE
#define FALSE 0
#endif
#ifndef NULL
#define NULL 0
#endif

#ifndef MAX_PATH
#define MAX_PATH 260
#endif

// calling conventions / COM decoration - all vanish on Linux
#define __stdcall
#define __cdecl
#define __fastcall
#define WINAPI
#define CALLBACK
#define AFXAPI
#define __RPC_FAR
#define FAR
#define NEAR
#define IN
#define OUT

// SAL source-annotation macros - all vanish on Linux
#define _In_
#define _Out_
#define _Inout_
#define _In_opt_
#define _Out_opt_
#define _Inout_opt_
#define _In_z_
#define _In_reads_(x)
#define _Ret_maybenull_
#define _Success_(x)

#define UNREFERENCED_PARAMETER(x) ((void)(x))

// ---------------------------------------------------------------------------
// common Win32 message / notification structs (declaration-only use in UI hdrs)
// ---------------------------------------------------------------------------
typedef struct tagPOINT { long x; long y; } POINT, *LPPOINT;
typedef struct tagNMHDR
{
    HWND     hwndFrom;
    UINT_PTR idFrom;
    UINT     code;
} NMHDR, *LPNMHDR;
typedef struct tagMSG
{
    HWND    hwnd;
    UINT    message;
    WPARAM  wParam;
    LPARAM  lParam;
    DWORD   time;
    POINT   pt;
} MSG, *LPMSG;
typedef struct tagCREATESTRUCT
{
    LPVOID    lpCreateParams;
    HINSTANCE hInstance;
    HMENU     hMenu;
    HWND      hwndParent;
    int       cy;
    int       cx;
    int       y;
    int       x;
    long      style;
    LPCSTR    lpszName;
    LPCSTR    lpszClass;
    DWORD     dwExStyle;
} CREATESTRUCT, *LPCREATESTRUCT;

typedef struct tagRECT { long left; long top; long right; long bottom; } RECT, *LPRECT;

// owner-draw / item message structs (declaration-only use in UI hdrs)
typedef struct tagDRAWITEMSTRUCT { UINT CtlType; UINT CtlID; UINT itemID; UINT itemAction; UINT itemState; HWND hwndItem; HDC hDC; RECT rcItem; ULONG_PTR itemData; } DRAWITEMSTRUCT, *LPDRAWITEMSTRUCT;
typedef struct tagMEASUREITEMSTRUCT { UINT CtlType; UINT CtlID; UINT itemID; UINT itemWidth; UINT itemHeight; ULONG_PTR itemData; } MEASUREITEMSTRUCT, *LPMEASUREITEMSTRUCT;
typedef struct tagCOMPAREITEMSTRUCT { UINT CtlType; UINT CtlID; UINT itemID1; ULONG_PTR itemData1; UINT itemID2; ULONG_PTR itemData2; DWORD dwLocaleId; } COMPAREITEMSTRUCT, *LPCOMPAREITEMSTRUCT;
typedef struct tagDELETEITEMSTRUCT { UINT CtlType; UINT CtlID; UINT itemID; HWND hwndItem; ULONG_PTR itemData; } DELETEITEMSTRUCT, *LPDELETEITEMSTRUCT;

// 64-bit integer union
typedef union _LARGE_INTEGER { struct { DWORD LowPart; long HighPart; } u; long long QuadPart; } LARGE_INTEGER;

typedef short SHORT;

// common-control (tree/list) constants + structs (UI-header decl-only)
#define TVI_ROOT   ((HTREEITEM)-0x10000)
#define TVI_FIRST  ((HTREEITEM)-0x0FFFF)
#define TVI_LAST   ((HTREEITEM)-0x0FFFE)
#define TVI_SORT   ((HTREEITEM)-0x0FFFD)
#define LVCFMT_LEFT   0x0000
#define LVCFMT_RIGHT  0x0001
#define LVCFMT_CENTER 0x0002
typedef struct tagTVITEM { UINT mask; HTREEITEM hItem; UINT state; UINT stateMask; LPTSTR pszText; int cchTextMax; int iImage; int iSelectedImage; int cChildren; LPARAM lParam; } TVITEM, *LPTVITEM;
typedef struct tagTVINSERTSTRUCT { HTREEITEM hParent; HTREEITEM hInsertAfter; TVITEM item; } TVINSERTSTRUCT, *LPTVINSERTSTRUCT;
typedef struct tagTVHITTESTINFO { POINT pt; UINT flags; HTREEITEM hItem; } TVHITTESTINFO, *LPTVHITTESTINFO;
typedef int (*PFNTVCOMPARE)(LPARAM, LPARAM, LPARAM);
typedef struct tagTVSORTCB { HTREEITEM hParent; PFNTVCOMPARE lpfnCompare; LPARAM lParam; } TVSORTCB, *LPTVSORTCB;

// window-style constants (only ever OR'd into ignored args on the calc path)
#define WS_OVERLAPPEDWINDOW 0x00CF0000L
#define FWS_ADDTOTITLE      0x00008000L

// windows.h traditionally provides unqualified min/max. Templates (not
// macros) so std::numeric_limits<T>::max() etc. still work.
template <typename A, typename B>
constexpr auto min(const A& a, const B& b) -> decltype(a < b ? a : b)
{
    return a < b ? a : b;
}
template <typename A, typename B>
constexpr auto max(const A& a, const B& b) -> decltype(a < b ? b : a)
{
    return a < b ? b : a;
}
#define _T(x) x
#define TEXT(x) x

// ---------------------------------------------------------------------------
// HRESULT support
// ---------------------------------------------------------------------------
#define S_OK        ((HRESULT)0L)
#define S_FALSE     ((HRESULT)1L)
#define E_FAIL      ((HRESULT)0x80004005L)
#define E_NOTIMPL   ((HRESULT)0x80004001L)
#define E_POINTER   ((HRESULT)0x80004003L)
#define E_NOINTERFACE ((HRESULT)0x80004002L)
#define FAILED(hr)      (((HRESULT)(hr)) < 0)
#define SUCCEEDED(hr)   (((HRESULT)(hr)) >= 0)

// COM method declaration macros. NOTE: deliberately NON-virtual on Linux -
// the raw_* COM plumbing methods declared with these are never called (expat
// drives the SAX callbacks directly), and keeping them non-virtual means we
// do not have to provide definitions for them to satisfy vtable emission.
#define STDMETHOD(method)           HRESULT method
#define STDMETHOD_(type, method)    type method
#define STDMETHODIMP                HRESULT
#define STDMETHODIMP_(type)         type
#define STDMETHODCALLTYPE

struct _GUID { unsigned data[4]; };
typedef _GUID GUID;
typedef _GUID IID;

// ---------------------------------------------------------------------------
// _com_error / bstr_t (normally from <comdef.h>)
// ---------------------------------------------------------------------------
class _com_error
{
    public:
        explicit _com_error(HRESULT hr = E_FAIL) : m_hr(hr) {}
        HRESULT Error() const { return m_hr; }
        void* ErrorInfo() const { return nullptr; }
        const char* Description() const { return "COM error (v2calc shim)"; }
    private:
        HRESULT m_hr;
};

// bstr_t here is just a narrow/wide string converter (that is all the
// calculation core uses it for, e.g. std::string += bstr_t(wideStr)).
class bstr_t
{
    public:
        bstr_t(const char* s) : m_narrow(s ? s : "")
        {
            m_wide.assign(m_narrow.begin(), m_narrow.end());
        }
        bstr_t(const wchar_t* s)
        {
            if (s != nullptr)
            {
                m_wide = s;
                m_narrow.reserve(m_wide.size());
                for (wchar_t wc : m_wide)
                {
                    m_narrow += (wc < 256) ? char(wc) : '?';
                }
            }
        }
        operator std::string() const { return m_narrow; }
        operator const wchar_t*() const { return m_wide.c_str(); }
    private:
        std::string m_narrow;
        std::wstring m_wide;
};

// ---------------------------------------------------------------------------
// critical sections (recursive, matching Win32 semantics)
// ---------------------------------------------------------------------------
typedef struct _RTL_CRITICAL_SECTION
{
    pthread_mutex_t mutex;
} CRITICAL_SECTION, *LPCRITICAL_SECTION;

inline void InitializeCriticalSection(LPCRITICAL_SECTION cs)
{
    pthread_mutexattr_t attr;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_settype(&attr, PTHREAD_MUTEX_RECURSIVE);
    pthread_mutex_init(&cs->mutex, &attr);
    pthread_mutexattr_destroy(&attr);
}
inline void EnterCriticalSection(LPCRITICAL_SECTION cs) { pthread_mutex_lock(&cs->mutex); }
inline void LeaveCriticalSection(LPCRITICAL_SECTION cs) { pthread_mutex_unlock(&cs->mutex); }
inline void DeleteCriticalSection(LPCRITICAL_SECTION cs) { pthread_mutex_destroy(&cs->mutex); }

// ---------------------------------------------------------------------------
// file I/O (SaxWriter uses CreateFile/WriteFile/CloseHandle)
// ---------------------------------------------------------------------------
#define INVALID_HANDLE_VALUE ((HANDLE)(intptr_t)-1)
#define GENERIC_READ    0x80000000u
#define GENERIC_WRITE   0x40000000u
#define CREATE_ALWAYS   2
#define OPEN_EXISTING   3
#define FILE_ATTRIBUTE_NORMAL 0x80

inline HANDLE CreateFile(
        LPCSTR filename,
        DWORD access,
        DWORD /*shareMode*/,
        void* /*security*/,
        DWORD disposition,
        DWORD /*flags*/,
        HANDLE /*template*/)
{
    int oflags = 0;
    if ((access & GENERIC_WRITE) && (access & GENERIC_READ)) oflags = O_RDWR;
    else if (access & GENERIC_WRITE) oflags = O_WRONLY;
    else oflags = O_RDONLY;
    if (disposition == CREATE_ALWAYS) oflags |= O_CREAT | O_TRUNC;
    int fd = ::open(filename, oflags, 0644);
    if (fd < 0)
    {
        return INVALID_HANDLE_VALUE;
    }
    return (HANDLE)(intptr_t)fd;
}

inline BOOL WriteFile(HANDLE h, const void* data, DWORD len, DWORD* written, void* /*overlapped*/)
{
    ssize_t n = ::write((int)(intptr_t)h, data, len);
    if (n < 0)
    {
        if (written) *written = 0;
        return FALSE;
    }
    if (written) *written = (DWORD)n;
    return TRUE;
}

inline BOOL CloseHandle(HANDLE h)
{
    return ::close((int)(intptr_t)h) == 0 ? TRUE : FALSE;
}

inline DWORD GetLastError() { return (DWORD)errno; }

// ---------------------------------------------------------------------------
// FormatMessage / LocalFree (used purely for error message text)
// ---------------------------------------------------------------------------
#define FORMAT_MESSAGE_ALLOCATE_BUFFER 0x00000100
#define FORMAT_MESSAGE_FROM_SYSTEM     0x00001000
#define MAKELANGID(p, s) 0
#define LANG_NEUTRAL 0
#define SUBLANG_DEFAULT 0

inline DWORD FormatMessage(
        DWORD /*flags*/,
        LPCVOID /*source*/,
        DWORD messageId,
        DWORD /*languageId*/,
        LPTSTR buffer,
        DWORD /*size*/,
        va_list* /*args*/)
{
    // Only ever called with FORMAT_MESSAGE_ALLOCATE_BUFFER in this codebase:
    // buffer is really a pointer to a char* to receive an allocated string.
    const char* text = strerror((int)messageId);
    char** out = reinterpret_cast<char**>(buffer);
    *out = strdup(text != nullptr ? text : "unknown error");
    return (DWORD)strlen(*out);
}

inline HANDLE LocalFree(HANDLE mem) { free(mem); return nullptr; }

// ---------------------------------------------------------------------------
// misc user32/gdi bits referenced from stdafx.h and shared headers
// ---------------------------------------------------------------------------
#define RGB(r, g, b) ((COLORREF)(((BYTE)(r)) | (((WORD)((BYTE)(g))) << 8) | (((DWORD)((BYTE)(b))) << 16)))
#define GetRValue(rgb) ((BYTE)(rgb))
#define GetGValue(rgb) ((BYTE)((rgb) >> 8))
#define GetBValue(rgb) ((BYTE)((rgb) >> 16))
#define CF_PRIVATEFIRST 0x0200
#define MB_OK 0
#define MB_ICONERROR 0x10
#define MB_ICONWARNING 0x30
#define MB_ICONINFORMATION 0x40
#define MB_ICONEXCLAMATION 0x30
#define MB_ICONSTOP 0x10
#define MB_ICONQUESTION 0x20
#define MB_ICONASTERISK 0x40
#define MB_YESNO 0x4
#define MB_YESNOCANCEL 0x3
#define MB_OKCANCEL 0x1
#define IDOK 1
#define IDCANCEL 2
#define IDYES 6
#define IDNO 7
#define ILC_COLOR32 0x20
#define ILC_COLOR24 0x18
#define ILC_COLOR16 0x10
#define ILC_COLOR8  0x08
#define ILD_NORMAL 0x0000
#define ILD_TRANSPARENT 0x0001
#define ILD_BLEND25 0x0002
#define ILD_FOCUS 0x0002
#define ILD_SELECTED 0x0004
#define ILD_MASK 0x0010
#define ILC_MASK 0x1

inline UINT RegisterWindowMessage(LPCSTR /*name*/)
{
    static UINT s_next = 0xC000; // WM_APP range lookalike
    return ++s_next;
}

inline void OutputDebugString(LPCSTR text)
{
    if (getenv("V2CALC_DEBUG") != nullptr && text != nullptr)
    {
        fputs(text, stderr);
    }
}

inline int MessageBox(HWND, LPCSTR text, LPCSTR caption, UINT)
{
    fprintf(stderr, "[MessageBox] %s: %s\n", caption ? caption : "", text ? text : "");
    return IDOK;
}

// ---------------------------------------------------------------------------
// "secure" CRT replacements
// ---------------------------------------------------------------------------
#ifndef _TRUNCATE
#define _TRUNCATE ((size_t)-1)
#endif

inline int sprintf_s(char* buffer, size_t size, const char* format, ...)
{
    va_list args;
    va_start(args, format);
    int result = vsnprintf(buffer, size, format, args);
    va_end(args);
    return result;
}

template <size_t N>
inline int sprintf_s(char (&buffer)[N], const char* format, ...)
{
    va_list args;
    va_start(args, format);
    int result = vsnprintf(buffer, N, format, args);
    va_end(args);
    return result;
}

inline int swprintf_s(wchar_t* buffer, size_t size, const wchar_t* format, ...)
{
    va_list args;
    va_start(args, format);
    int result = vswprintf(buffer, size, format, args);
    va_end(args);
    return result;
}

inline int _itow_s(int value, wchar_t* buffer, size_t size, int radix)
{
    // only radix 10 is used by the codebase
    (void)radix;
    swprintf(buffer, size, L"%d", value);
    return 0;
}

inline int _itoa_s(int value, char* buffer, size_t size, int radix)
{
    (void)radix;
    snprintf(buffer, size, "%d", value);
    return 0;
}

// Byte-wise narrow<->wide conversions. Deliberately NOT locale based:
// SaxString round-trips text through these and byte-wise mapping preserves
// the raw bytes exactly as the Windows MBCS build does.
inline int mbstowcs_s(
        size_t* converted,
        wchar_t* dst,
        size_t dstSize,
        const char* src,
        size_t count)
{
    size_t i = 0;
    if (dst == nullptr || dstSize == 0)
    {
        if (converted) *converted = src ? strlen(src) + 1 : 0;
        return 0;
    }
    size_t limit = (count == _TRUNCATE) ? dstSize - 1 : count;
    if (limit > dstSize - 1) limit = dstSize - 1;
    for (; i < limit && src[i] != '\0'; ++i)
    {
        dst[i] = wchar_t((unsigned char)src[i]);
    }
    dst[i] = L'\0';
    if (converted) *converted = i + 1; // MSVC semantics: includes the NUL
    return 0;
}

inline int wcstombs_s(
        size_t* converted,
        char* dst,
        size_t dstSize,
        const wchar_t* src,
        size_t count)
{
    size_t i = 0;
    if (dst == nullptr || dstSize == 0)
    {
        if (converted) *converted = src ? wcslen(src) + 1 : 0;
        return 0;
    }
    size_t limit = (count == _TRUNCATE) ? dstSize - 1 : count;
    if (limit > dstSize - 1) limit = dstSize - 1;
    for (; i < limit && src[i] != L'\0'; ++i)
    {
        dst[i] = (src[i] < 256) ? char(src[i]) : '?';
    }
    dst[i] = '\0';
    if (converted) *converted = i + 1; // MSVC semantics: includes the NUL
    return 0;
}

typedef long long __int64;
inline int _isnan(double v) { return v != v; }
inline int _finite(double v) { return v == v && v * 0.0 == 0.0; }
inline int wcscpy_s(wchar_t* dst, size_t size, const wchar_t* src)
{
    size_t len = wcslen(src);
    if (len >= size)
    {
        len = size > 0 ? size - 1 : 0;
    }
    wmemcpy(dst, src, len);
    if (size > 0) dst[len] = L'\0';
    return 0;
}
inline int _stricmp(const char* a, const char* b) { return strcasecmp(a, b); }
inline int _strnicmp(const char* a, const char* b, size_t n) { return strncasecmp(a, b, n); }
inline int _wcsicmp(const wchar_t* a, const wchar_t* b) { return wcscasecmp(a, b); }
inline long long _atoi64(const char* s) { return atoll(s); }
inline char* strtok_s(char* str, const char* delim, char** context) { return strtok_r(str, delim, context); }
inline int strcpy_s(char* dst, size_t size, const char* src)
{
    snprintf(dst, size, "%s", src);
    return 0;
}
template <size_t N>
inline int strcpy_s(char (&dst)[N], const char* src)
{
    snprintf(dst, N, "%s", src);
    return 0;
}
inline int strcat_s(char* dst, size_t size, const char* src)
{
    size_t len = strlen(dst);
    if (len < size)
    {
        snprintf(dst + len, size - len, "%s", src);
    }
    return 0;
}
inline int localtime_s(struct tm* out, const time_t* t) { return localtime_r(t, out) ? 0 : -1; }
inline int ctime_s(char* buf, size_t size, const time_t* t)
{
    char tmp[64];
    ctime_r(t, tmp);
    snprintf(buf, size, "%s", tmp);
    return 0;
}

// ---------------------------------------------------------------------------
// clipboard / global-memory stubs (EquippedGear import/export - never on the
// calc path). All inert.
// ---------------------------------------------------------------------------
typedef void* HGLOBAL;
#define CF_TEXT 1
#define GMEM_MOVEABLE 0x0002
inline BOOL   OpenClipboard(HWND) { return FALSE; }
inline BOOL   CloseClipboard() { return TRUE; }
inline BOOL   EmptyClipboard() { return TRUE; }
inline HGLOBAL GetClipboardData(UINT) { return nullptr; }
inline HGLOBAL SetClipboardData(UINT, HGLOBAL) { return nullptr; }
inline HGLOBAL GlobalAlloc(UINT, size_t) { return nullptr; }
inline HGLOBAL GlobalFree(HGLOBAL) { return nullptr; }
inline void*  GlobalLock(HGLOBAL h) { return h; }
inline BOOL   GlobalUnlock(HGLOBAL) { return TRUE; }
inline size_t GlobalSize(HGLOBAL) { return 0; }
