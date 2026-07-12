// v2calc/shim/afxwin.h
//
// Linux stand-in for the MFC core header. Provides a std::string backed
// CString plus declaration-level stubs for the MFC classes that appear in
// headers pulled in by the DDOBuilder calculation core. UI classes are
// inert: they compile but do nothing.
#pragma once

#include <windows.h> // v2calc shim

#include <cassert>
#include <cstdarg>
#include <cstdio>
#include <string>
#include <vector>
#include <map>
#include <cmath>
#include <cstring>
#include <cctype>

// ---------------------------------------------------------------------------
// diagnostics
// ---------------------------------------------------------------------------
#ifndef ASSERT
#define ASSERT(x) assert(x)
#endif
#ifndef VERIFY
#define VERIFY(x) do { bool _v2c_ok = !!(x); assert(_v2c_ok); (void)_v2c_ok; } while (0)
#endif
// MFC exception macro used by XmlLib (throws a const char* like the V2 build)
#ifndef THROW
#define THROW(e) throw (e)
#endif
#ifndef THROW_LAST
#define THROW_LAST() throw
#endif
inline void V2CalcTrace(const char* format, ...)
{
    if (getenv("V2CALC_DEBUG") != nullptr)
    {
        va_list args;
        va_start(args, format);
        vfprintf(stderr, format, args);
        va_end(args);
    }
}
#ifndef TRACE
#define TRACE V2CalcTrace
#define TRACE0(s) V2CalcTrace("%s", s)
#define TRACE1(s, a) V2CalcTrace(s, a)
#define TRACE2(s, a, b) V2CalcTrace(s, a, b)
#define TRACE3(s, a, b, c) V2CalcTrace(s, a, b, c)
#endif

// message map / runtime class macros - all inert
#define afx_msg
#define DECLARE_MESSAGE_MAP()
#define DECLARE_DYNAMIC(cls)
#define DECLARE_DYNCREATE(cls)
#define DECLARE_SERIAL(cls)
#define BEGIN_MESSAGE_MAP(cls, base) /* unused in ported code */
#define END_MESSAGE_MAP()
#define IMPLEMENT_DYNAMIC(cls, base)
#define IMPLEMENT_DYNCREATE(cls, base)

// ---------------------------------------------------------------------------
// CString - std::string backed, MBCS semantics like the V2 Windows build
// ---------------------------------------------------------------------------
class CString
{
    public:
        CString() {}
        CString(const char* text) : m_str(text != nullptr ? text : "") {}
        CString(const char* text, int length) : m_str(text, text + length) {}
        CString(const CString& other) : m_str(other.m_str) {}
        CString(char c, int repeat) : m_str((size_t)repeat, c) {}

        CString& operator=(const CString& other) { m_str = other.m_str; return *this; }
        CString& operator=(const char* text) { m_str = (text != nullptr ? text : ""); return *this; }

        operator LPCTSTR() const { return m_str.c_str(); }
        operator std::string() const { return m_str; }

        int GetLength() const { return (int)m_str.size(); }
        bool IsEmpty() const { return m_str.empty(); }
        void Empty() { m_str.clear(); }

        char GetAt(int i) const { return m_str[(size_t)i]; }
        char operator[](int i) const { return m_str[(size_t)i]; }
        void SetAt(int i, char c) { m_str[(size_t)i] = c; }

        void Format(const char* format, ...)
        {
            va_list args;
            va_start(args, format);
            FormatV(format, args);
            va_end(args);
        }
        void FormatV(const char* format, va_list args)
        {
            va_list copy;
            va_copy(copy, args);
            int needed = vsnprintf(nullptr, 0, format, copy);
            va_end(copy);
            if (needed < 0) needed = 0;
            m_str.resize((size_t)needed);
            if (needed > 0)
            {
                vsnprintf(&m_str[0], (size_t)needed + 1, format, args);
            }
        }
        void AppendFormat(const char* format, ...)
        {
            va_list args;
            va_start(args, format);
            CString tail;
            tail.FormatV(format, args);
            va_end(args);
            m_str += tail.m_str;
        }

        CString& operator+=(const CString& other) { m_str += other.m_str; return *this; }
        CString& operator+=(const char* text) { if (text) m_str += text; return *this; }
        CString& operator+=(char c) { m_str += c; return *this; }

        friend CString operator+(const CString& a, const CString& b) { CString r(a); r += b; return r; }
        friend CString operator+(const CString& a, const char* b) { CString r(a); r += b; return r; }
        friend CString operator+(const char* a, const CString& b) { CString r(a); r += b; return r; }

        friend bool operator==(const CString& a, const CString& b) { return a.m_str == b.m_str; }
        friend bool operator==(const CString& a, const char* b) { return a.m_str == (b ? b : ""); }
        friend bool operator==(const char* a, const CString& b) { return b == a; }
        friend bool operator!=(const CString& a, const CString& b) { return !(a == b); }
        friend bool operator!=(const CString& a, const char* b) { return !(a == b); }
        friend bool operator!=(const char* a, const CString& b) { return !(a == b); }
        friend bool operator<(const CString& a, const CString& b) { return a.m_str < b.m_str; }

        int Compare(const char* other) const { return strcmp(m_str.c_str(), other); }
        int CompareNoCase(const char* other) const { return strcasecmp(m_str.c_str(), other); }

        CString Left(int count) const
        {
            if (count < 0) count = 0;
            if (count > GetLength()) count = GetLength();
            return CString(m_str.substr(0, (size_t)count).c_str());
        }
        CString Right(int count) const
        {
            if (count < 0) count = 0;
            if (count > GetLength()) count = GetLength();
            return CString(m_str.substr(m_str.size() - (size_t)count).c_str());
        }
        CString Mid(int first) const
        {
            if (first < 0) first = 0;
            if (first > GetLength()) first = GetLength();
            return CString(m_str.substr((size_t)first).c_str());
        }
        CString Mid(int first, int count) const
        {
            if (first < 0) first = 0;
            if (first > GetLength()) first = GetLength();
            if (count < 0) count = 0;
            return CString(m_str.substr((size_t)first, (size_t)count).c_str());
        }

        void MakeLower() { for (auto& c : m_str) c = (char)tolower((unsigned char)c); }
        void MakeUpper() { for (auto& c : m_str) c = (char)toupper((unsigned char)c); }
        void MakeReverse() { std::string r(m_str.rbegin(), m_str.rend()); m_str = r; }

        int Find(char c, int start = 0) const
        {
            size_t pos = m_str.find(c, (size_t)start);
            return pos == std::string::npos ? -1 : (int)pos;
        }
        int Find(const char* sub, int start = 0) const
        {
            size_t pos = m_str.find(sub, (size_t)start);
            return pos == std::string::npos ? -1 : (int)pos;
        }
        int ReverseFind(char c) const
        {
            size_t pos = m_str.rfind(c);
            return pos == std::string::npos ? -1 : (int)pos;
        }

        int Replace(const char* from, const char* to)
        {
            int count = 0;
            size_t fromLen = strlen(from);
            size_t toLen = strlen(to);
            size_t pos = 0;
            while ((pos = m_str.find(from, pos)) != std::string::npos)
            {
                m_str.replace(pos, fromLen, to);
                pos += toLen;
                ++count;
            }
            return count;
        }
        int Replace(char from, char to)
        {
            int count = 0;
            for (auto& c : m_str)
            {
                if (c == from) { c = to; ++count; }
            }
            return count;
        }

        int Remove(char c)
        {
            int count = 0;
            std::string out;
            out.reserve(m_str.size());
            for (char ch : m_str)
            {
                if (ch == c) ++count; else out += ch;
            }
            m_str = out;
            return count;
        }
        int Delete(int index, int count = 1)
        {
            if (index >= 0 && (size_t)index < m_str.size())
            {
                m_str.erase((size_t)index, (size_t)count);
            }
            return GetLength();
        }
        int Insert(int index, const char* text)
        {
            if (index < 0) index = 0;
            if ((size_t)index > m_str.size()) index = (int)m_str.size();
            m_str.insert((size_t)index, text);
            return GetLength();
        }
        int Insert(int index, char c)
        {
            char buf[2] = { c, '\0' };
            return Insert(index, buf);
        }

        CString& Trim()
        {
            TrimLeft();
            TrimRight();
            return *this;
        }
        CString& TrimLeft()
        {
            size_t pos = m_str.find_first_not_of(" \t\r\n");
            m_str.erase(0, pos == std::string::npos ? m_str.size() : pos);
            return *this;
        }
        CString& TrimLeft(char c)
        {
            size_t pos = m_str.find_first_not_of(c);
            m_str.erase(0, pos == std::string::npos ? m_str.size() : pos);
            return *this;
        }
        CString& TrimRight()
        {
            size_t pos = m_str.find_last_not_of(" \t\r\n");
            m_str.erase(pos == std::string::npos ? 0 : pos + 1);
            return *this;
        }
        CString& TrimRight(char c)
        {
            size_t pos = m_str.find_last_not_of(c);
            m_str.erase(pos == std::string::npos ? 0 : pos + 1);
            return *this;
        }

        CString Tokenize(const char* delims, int& start) const
        {
            if (start < 0 || (size_t)start >= m_str.size())
            {
                start = -1;
                return CString();
            }
            size_t begin = m_str.find_first_not_of(delims, (size_t)start);
            if (begin == std::string::npos)
            {
                start = -1;
                return CString();
            }
            size_t end = m_str.find_first_of(delims, begin);
            if (end == std::string::npos) end = m_str.size();
            start = (int)(end < m_str.size() ? end + 1 : m_str.size());
            return CString(m_str.substr(begin, end - begin).c_str());
        }

        LPTSTR GetBuffer(int minSize = 0)
        {
            if ((int)m_str.size() < minSize)
            {
                m_str.resize((size_t)minSize);
            }
            return &m_str[0];
        }
        void ReleaseBuffer(int newLength = -1)
        {
            if (newLength >= 0)
            {
                m_str.resize((size_t)newLength);
            }
            else
            {
                m_str.resize(strlen(m_str.c_str()));
            }
        }

        // convenience for the port (not real MFC, but harmless)
        const std::string& StdString() const { return m_str; }

    private:
        std::string m_str;
};

// ---------------------------------------------------------------------------
// geometry helpers
// ---------------------------------------------------------------------------
class CPoint
{
    public:
        CPoint() : x(0), y(0) {}
        CPoint(int px, int py) : x(px), y(py) {}
        int x;
        int y;
};

class CSize
{
    public:
        CSize() : cx(0), cy(0) {}
        CSize(int w, int h) : cx(w), cy(h) {}
        int cx;
        int cy;
};

class CRect
{
    public:
        CRect() : left(0), top(0), right(0), bottom(0) {}
        CRect(int l, int t, int r, int b) : left(l), top(t), right(r), bottom(b) {}
        int Width() const { return right - left; }
        int Height() const { return bottom - top; }
        template <typename P> BOOL PtInRect(const P&) const { return FALSE; }
        int left, top, right, bottom;
};

// ---------------------------------------------------------------------------
// inert GDI/window stubs (enough to compile headers, all no-ops)
// ---------------------------------------------------------------------------
class CImage
{
    public:
        HBITMAP Detach() { return nullptr; }
        void* GetBits() { return nullptr; }
        int GetPitch() const { return 0; }
        int GetWidth() const { return 0; }
        int GetHeight() const { return 0; }
};

class CBitmap
{
    public:
        void Attach(HBITMAP) {}
        HBITMAP Detach() { return nullptr; }
        BOOL DeleteObject() { return TRUE; }
};

class CImageList
{
    public:
        BOOL Create(int, int, UINT, int, int) { return TRUE; }
        int Add(CBitmap*, COLORREF) { return -1; }
        int Add(CBitmap*, CBitmap*) { return -1; }
        int Add(HICON) { return -1; }
        int GetImageCount() const { return 0; }
        BOOL DeleteImageList() { return TRUE; }
        BOOL SetOverlayImage(int, int) { return TRUE; }
        HANDLE GetSafeHandle() const { return nullptr; }
};

class CFont
{
    public:
        BOOL DeleteObject() { return TRUE; }
        BOOL CreateFontIndirect(const void*) { return TRUE; }
        HANDLE GetSafeHandle() const { return nullptr; }
};

class CDC
{
    public:
        HANDLE GetSafeHdc() const { return nullptr; }
        int GetDeviceCaps(int) const { return 0; }
        CFont* SelectObject(CFont*) { return nullptr; }
        CBitmap* SelectObject(CBitmap*) { return nullptr; }
        BOOL BitBlt(int, int, int, int, CDC*, int, int, DWORD) { return TRUE; }
        BOOL CreateCompatibleDC(CDC*) { return TRUE; }
        COLORREF SetPixel(int, int, COLORREF) { return 0; }
        COLORREF GetPixel(int, int) const { return 0; }
};

class CDataExchange {};

class CCmdTarget
{
    public:
        virtual ~CCmdTarget() {}
};

class CWnd : public CCmdTarget
{
    public:
        virtual ~CWnd() {}
        virtual BOOL PreTranslateMessage(MSG*) { return FALSE; }
        virtual BOOL OnCommand(WPARAM, LPARAM) { return FALSE; }
        virtual BOOL OnNotify(WPARAM, LPARAM, LRESULT*) { return FALSE; }
};

class CListBox : public CWnd {};
class CStatic : public CWnd {};
class CEdit : public CWnd {};
class CButton : public CWnd {};
class CComboBox : public CWnd
{
    public:
        virtual void DrawItem(LPDRAWITEMSTRUCT) {}
        virtual void MeasureItem(LPMEASUREITEMSTRUCT) {}
        virtual int  CompareItem(LPCOMPAREITEMSTRUCT) { return 0; }
        virtual void DeleteItem(LPDELETEITEMSTRUCT) {}
};
class CDialog : public CWnd {};
class CDialogEx : public CDialog {};
class CPropertyPage : public CDialog {};
class CPropertySheet : public CWnd {};

class CListCtrl : public CWnd
{
    public:
        int GetItemCount() const { return 0; }
        DWORD GetItemData(int) const { return 0; }
        int GetColumnWidth(int) const { return 0; }
        BOOL SetColumnWidth(int, int) { return TRUE; }
};

class CTreeCtrl : public CWnd
{
    public:
        HTREEITEM GetRootItem() const { return nullptr; }
        HTREEITEM GetNextSiblingItem(HTREEITEM) const { return nullptr; }
        HTREEITEM GetChildItem(HTREEITEM) const { return nullptr; }
};

class CSliderCtrl : public CWnd
{
    public:
        int GetPos() const { return 0; }
        void SetPos(int) {}
        void SetRange(int, int, BOOL = FALSE) {}
        void SetRangeMin(int, BOOL = FALSE) {}
        void SetRangeMax(int, BOOL = FALSE) {}
};

class CScrollBar : public CWnd {};

class CCmdUI
{
    public:
        void Enable(BOOL = TRUE) {}
        void SetCheck(int = 1) {}
        void SetText(LPCTSTR) {}
        UINT m_nID = 0;
};

class CView : public CWnd
{
    public:
        virtual void OnInitialUpdate() {}
};

class CScrollView : public CView {};

class CFormView : public CView
{
    public:
        virtual void DoDataExchange(CDataExchange*) {}
};

class CArchive {};
class CDocument : public CCmdTarget
{
    public:
        virtual void SetModifiedFlag(BOOL = TRUE) {}
        virtual BOOL IsModified() { return FALSE; }
        virtual BOOL OnNewDocument() { return TRUE; }
        virtual BOOL OnOpenDocument(LPCTSTR) { return TRUE; }
        virtual BOOL OnSaveDocument(LPCTSTR) { return TRUE; }
        virtual void Serialize(CArchive&) {}
};
class CToolTipCtrl : public CWnd {};
class CHeaderCtrl : public CWnd {};

// MFC associative-map template (afxtempl)
template <typename K, typename AK, typename V, typename AV> class CMap
{
    public:
        int GetCount() const { return (int)m_data.size(); }
        bool IsEmpty() const { return m_data.empty(); }
        void RemoveAll() { m_data.clear(); }
        void SetAt(AK k, AV v) { m_data[k] = v; }
        V& operator[](AK k) { return m_data[k]; }
        BOOL Lookup(AK k, V& v) const { auto it = m_data.find(k); if (it == m_data.end()) return FALSE; v = it->second; return TRUE; }
        BOOL RemoveKey(AK k) { return m_data.erase(k) ? TRUE : FALSE; }
    private:
        std::map<K, V> m_data;
};
class CWaitCursor { public: CWaitCursor() {} ~CWaitCursor() {} void Restore() {} };
class CMFCButton : public CButton
{
    protected:
        virtual void OnDraw(CDC*, const CRect&, UINT) {}
};

// MFC dynamic-array templates (afxtempl)
template <typename T, typename A = T> class CArray
{
    public:
        int GetSize() const { return (int)m_data.size(); }
        int GetCount() const { return (int)m_data.size(); }
        bool IsEmpty() const { return m_data.empty(); }
        void RemoveAll() { m_data.clear(); }
        int Add(A v) { m_data.push_back(v); return (int)m_data.size() - 1; }
        void SetSize(int n) { m_data.resize(n); }
        void SetAtGrow(int i, A v) { if ((int)m_data.size() <= i) m_data.resize(i + 1); m_data[i] = v; }
        T& operator[](int i) { return m_data[i]; }
        const T& operator[](int i) const { return m_data[i]; }
        T& GetAt(int i) { return m_data[i]; }
        const T& GetAt(int i) const { return m_data[i]; }
        void SetAt(int i, A v) { m_data[i] = v; }
        void RemoveAt(int i, int n = 1) { m_data.erase(m_data.begin() + i, m_data.begin() + i + n); }
    private:
        std::vector<T> m_data;
};
typedef CArray<DWORD> CDWordArray;
typedef CArray<WORD> CWordArray;
typedef CArray<int> CIntArray;
typedef CArray<UINT> CUIntArray;
typedef CArray<BYTE> CByteArray;
typedef CArray<void*> CPtrArray;
typedef CArray<CString> CStringArray;
class CWinApp : public CCmdTarget {};

// ---------------------------------------------------------------------------
// runtime-class machinery (RUNTIME_CLASS is only ever passed around as an
// opaque tag on the calc path - never dereferenced)
// ---------------------------------------------------------------------------
struct CRuntimeClass
{
    const char* m_lpszClassName;
};
#ifndef RUNTIME_CLASS
#define RUNTIME_CLASS(cls) ((CRuntimeClass*)nullptr)
#endif
struct CCreateContext {};
struct AFX_CMDHANDLERINFO {};

// ---------------------------------------------------------------------------
// frame windows, toolbars, misc controls (inert UI, present only so the calc
// core's headers - which reference the app frame - compile)
// ---------------------------------------------------------------------------
class CProgressCtrl : public CWnd
{
    public:
        void SetRange(short, short) {}
        void SetRange32(int, int) {}
        int  SetPos(int) { return 0; }
        int  StepIt() { return 0; }
};

class CFrameWnd : public CWnd
{
    public:
        virtual BOOL PreCreateWindow(CREATESTRUCT&) { return TRUE; }
        virtual BOOL LoadFrame(UINT, DWORD = 0, CWnd* = nullptr, CCreateContext* = nullptr) { return TRUE; }
        virtual BOOL OnCmdMsg(UINT, int, void*, AFX_CMDHANDLERINFO*) { return FALSE; }
        virtual void GetMessageString(UINT, CString&) const {}
};
class CFrameWndEx : public CFrameWnd {};
class CMDIFrameWnd : public CFrameWnd {};
class CMDIFrameWndEx : public CMDIFrameWnd {};
class CMDIChildWndEx : public CFrameWnd {};

class CMFCToolBarImages {};
class CMFCToolBar : public CWnd {};
class CMFCMenuBar : public CWnd {};

// ---------------------------------------------------------------------------
// Afx functions
// ---------------------------------------------------------------------------
inline int AfxMessageBox(LPCTSTR text, UINT type = MB_OK, UINT helpId = 0)
{
    (void)type;
    (void)helpId;
    fprintf(stderr, "[AfxMessageBox] %s\n", text != nullptr ? text : "(null)");
    return IDOK;
}

class CWinAppShim
{
    public:
        UINT GetProfileInt(LPCTSTR, LPCTSTR, int defaultValue) { return (UINT)defaultValue; }
        BOOL WriteProfileInt(LPCTSTR, LPCTSTR, int) { return TRUE; }
        CString GetProfileString(LPCTSTR, LPCTSTR, LPCTSTR defaultValue = nullptr)
        {
            return CString(defaultValue != nullptr ? defaultValue : "");
        }
        BOOL WriteProfileString(LPCTSTR, LPCTSTR, LPCTSTR) { return TRUE; }
};

inline CWinAppShim* AfxGetApp()
{
    static CWinAppShim s_app;
    return &s_app;
}

inline CWnd* AfxGetMainWnd() { return nullptr; }
