// v2calc/shim/DocStub.cpp
//
// Minimal Linux implementation of CDDOBuilderDoc. The real DDOBuilderDoc.cpp
// is UI-heavy (CMainFrame, backup files, AfxMessageBox, forum export) and is
// never compiled. v2calc only needs the doc to (a) act as the SAX root element
// ("DDOBuilderCharacterData") that hands off to its Character child, and (b) be
// the non-null owner pointer that Character::m_pDocument points at (Character
// only ever calls doc->SetModifiedFlag(), which resolves to the inert
// CDocument shim override).
//
// StartElement mirrors the real doc exactly: on the <Character> child it
// returns &m_character so the SAX stack parses the character in place.
#include "stdafx.h" // v2calc: windows+afxwin shims + DDOBuilder game constants
#include "DDOBuilderDoc.h"

namespace
{
    const XmlLib::SaxString f_saxElementName = L"DDOBuilderCharacterData";
}

CDDOBuilderDoc::CDDOBuilderDoc() :
    SaxContentElement(f_saxElementName),
    m_character(this)
{
}

CDDOBuilderDoc::~CDDOBuilderDoc()
{
}

BOOL CDDOBuilderDoc::OnNewDocument()
{
    return TRUE;
}

BOOL CDDOBuilderDoc::OnOpenDocument(LPCTSTR)
{
    return TRUE;
}

BOOL CDDOBuilderDoc::OnSaveDocument(LPCTSTR)
{
    return TRUE;
}

void CDDOBuilderDoc::Serialize(CArchive&)
{
}

BOOL CDDOBuilderDoc::LoadIndirect(LPCTSTR)
{
    return TRUE;
}

void CDDOBuilderDoc::OnUpdateRevertToBackup(CCmdUI*)
{
}

void CDDOBuilderDoc::OnRevertToBackup()
{
}

XmlLib::SaxContentElementInterface* CDDOBuilderDoc::StartElement(
        const XmlLib::SaxString& name,
        const XmlLib::SaxAttributes& attributes)
{
    XmlLib::SaxContentElementInterface* subHandler =
            SaxContentElement::StartElement(name, attributes);
    if (subHandler == NULL)
    {
        if (m_character.SaxElementIsSelf(name, attributes))
        {
            subHandler = &m_character;
        }
    }
    return subHandler;
}

void CDDOBuilderDoc::EndElement()
{
    SaxContentElement::EndElement();
}
