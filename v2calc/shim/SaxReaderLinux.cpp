// v2calc/shim/SaxReaderLinux.cpp
//
// Linux implementation of XmlLib::SaxReader backed by expat instead of
// MSXML COM. Replaces XmlLib/Src/SaxReader.cpp in the v2calc build.
//
// The element-handler stack logic (StartElement/EndElement/Characters) is
// copied verbatim from XmlLib/Src/SaxReader.cpp so the SAX event semantics
// seen by every SaxContentElement based reader are identical to the
// Windows build. Only the parser driving code (Open/ParseText) differs.
//
#include <windows.h> // v2calc shim
#include "XmlLib/SaxReader.h"
#include "XmlLib/SaxAttributes.h"

#include <expat.h>

#include <fstream>
#include <sstream>
#include <vector>

using XmlLib::SaxReader;
using XmlLib::SaxString;
using XmlLib::SaxAttributes;

namespace
{
    // Context shared with the expat C callbacks. C++ exceptions must not
    // propagate through expat's C frames, so callbacks trap everything,
    // record the failure and stop the parser.
    struct ExpatContext
    {
        SaxReader* reader = nullptr;
        XML_Parser parser = nullptr;
        bool aborted = false;
        std::string abortMessage;

        void Abort(const std::string& message)
        {
            if (!aborted)
            {
                aborted = true;
                abortMessage = message;
                XML_StopParser(parser, XML_FALSE);
            }
        }
    };

    thread_local ExpatContext* t_context = nullptr;

    void XMLCALL OnStartElement(void* userData, const XML_Char* name, const XML_Char** atts)
    {
        ExpatContext* context = static_cast<ExpatContext*>(userData);
        if (context->aborted) return;
        try
        {
            SaxString rawName(name);
            SaxAttributes attributes;
            for (size_t i = 0; atts[i] != nullptr; i += 2)
            {
                attributes.Insert(SaxString(atts[i]), SaxString(atts[i + 1]));
            }
            // MSXML passed (uri, localName, rawName, attributes); without
            // namespace processing localName == rawName and uri is empty
            context->reader->StartElement(SaxString(L""), rawName, rawName, attributes);
        }
        catch (const std::exception& e)
        {
            context->Abort(e.what());
        }
        catch (const std::string& e)
        {
            context->Abort(e);
        }
        catch (...)
        {
            context->Abort("Unknown exception during StartElement");
        }
    }

    void XMLCALL OnEndElement(void* userData, const XML_Char* name)
    {
        ExpatContext* context = static_cast<ExpatContext*>(userData);
        if (context->aborted) return;
        try
        {
            SaxString rawName(name);
            context->reader->EndElement(SaxString(L""), rawName, rawName);
        }
        catch (const std::exception& e)
        {
            context->Abort(e.what());
        }
        catch (const std::string& e)
        {
            context->Abort(e);
        }
        catch (...)
        {
            context->Abort("Unknown exception during EndElement");
        }
    }

    void XMLCALL OnCharacters(void* userData, const XML_Char* s, int len)
    {
        ExpatContext* context = static_cast<ExpatContext*>(userData);
        if (context->aborted) return;
        try
        {
            context->reader->Characters(SaxString(s, (size_t)len));
        }
        catch (const std::exception& e)
        {
            context->Abort(e.what());
        }
        catch (const std::string& e)
        {
            context->Abort(e);
        }
        catch (...)
        {
            context->Abort("Unknown exception during Characters");
        }
    }
}

SaxReader::SaxReader(XmlLib::SaxContentElement * root, const SaxString & rootName) :
    m_root(root),
    m_rootName(rootName),
    m_subElementDepth(0),
    m_errorReported(false)
{
    // no MSXML reader to create on Linux; expat parsers are created per parse
}

SaxReader::~SaxReader()
{
}

namespace
{
    // shared parse driver for Open/ParseText
    bool RunExpatParse(
            SaxReader* reader,
            const char* data,
            size_t length,
            bool* errorReported,
            std::string* errorMessage)
    {
        XML_Parser parser = XML_ParserCreate(nullptr); // no namespace processing
        if (parser == nullptr)
        {
            *errorReported = true;
            *errorMessage = "Failed to create expat parser";
            return false;
        }

        ExpatContext context;
        context.reader = reader;
        context.parser = parser;

        XML_SetUserData(parser, &context);
        XML_SetElementHandler(parser, OnStartElement, OnEndElement);
        XML_SetCharacterDataHandler(parser, OnCharacters);

        XML_Status status = XML_Parse(parser, data, (int)length, XML_TRUE);

        if (context.aborted)
        {
            if (!*errorReported)
            {
                *errorReported = true;
                *errorMessage = context.abortMessage;
            }
        }
        else if (status != XML_STATUS_OK)
        {
            if (!*errorReported)
            {
                std::stringstream ss;
                ss << "XML parse error at line "
                        << XML_GetCurrentLineNumber(parser)
                        << ", column " << XML_GetCurrentColumnNumber(parser)
                        << ": " << XML_ErrorString(XML_GetErrorCode(parser));
                *errorReported = true;
                *errorMessage = ss.str();
            }
        }

        XML_ParserFree(parser);
        return !*errorReported;
    }
}

bool SaxReader::Open(const std::string & pathname)
{
    // critical section on the Read/Write actions as XmlLib is not thread safe
    CriticalSectionLock lock(&s_critsec);
    m_errorReported = false;
    m_errorMessage.erase();

    std::ifstream file(pathname.c_str(), std::ios::binary);
    if (!file.is_open())
    {
        m_errorReported = true;
        m_errorMessage = "Failed to open file \"" + pathname + "\"";
        return false;
    }
    std::string content(
            (std::istreambuf_iterator<char>(file)),
            std::istreambuf_iterator<char>());
    file.close();

    return RunExpatParse(this, content.data(), content.size(), &m_errorReported, &m_errorMessage);
}

bool SaxReader::ParseText(const std::string & xmlText)
{
    m_errorReported = false;
    m_errorMessage.erase();
    return RunExpatParse(this, xmlText.data(), xmlText.size(), &m_errorReported, &m_errorMessage);
}

bool SaxReader::ReadError() const
{
    return m_errorReported;
}

std::string SaxReader::ErrorMessage() const
{
    return m_errorMessage;
}

// ---------------------------------------------------------------------------
// Element handler stack logic below is copied VERBATIM from
// XmlLib/Src/SaxReader.cpp (minus the _com_error catch clauses which cannot
// occur on Linux). Do not "improve" - parity with V2 is the whole point.
// ---------------------------------------------------------------------------

void SaxReader::StartElement(
        const SaxString & namespaceUri,
        const SaxString & localName,
        const SaxString & rawName,
        const SaxAttributes & attributes)
{
    UNREFERENCED_PARAMETER(namespaceUri);
    UNREFERENCED_PARAMETER(localName);
    if (m_handlers.empty())
    {
        if (rawName == m_rootName)
        {
            // The root is right so handle the document
            m_root->ClearSaxReadErrorHandler(); // shouldn't be needed, but just in case...
            m_root->SaxSetAttributes(attributes); // make sure we read any versioning info etc
            m_handlers.push_back(m_root);
            m_subElementDepth = 0;
        }
        else
        {
            if (!m_errorReported)
            {
                m_errorReported = true;
                std::stringstream ss;
                ss << "Root element name '" << std::string(rawName)
                        << "' does not match expected root element name '" << std::string(m_rootName) << "'";
                m_errorMessage = ss.str();
            }
        }
    }
    else
    {
        // skip if top handler declined to start a new element last time
        if (m_subElementDepth != 0)
        {
            ++m_subElementDepth;
        }
        else
        {
            SaxContentElementInterface * oldHandler = m_handlers.back();
            SaxContentElementInterface * newHandler = oldHandler->StartElement(rawName, attributes);
            if (newHandler == NULL)
            {
                m_subElementDepth = 1;
            }
            else
            {
                m_handlers.push_back(newHandler);
                // keep a reporting trail back to the top
                newHandler->SetSaxReadErrorHandler(oldHandler);
            }
        }
    }
}

void SaxReader::EndElement(
        const SaxString & uri,
        const SaxString & localName,
        const SaxString & rawName)
{
    UNREFERENCED_PARAMETER(uri);
    UNREFERENCED_PARAMETER(localName);
    UNREFERENCED_PARAMETER(rawName);
    if (m_subElementDepth == 0 && !m_handlers.empty())
    {
        // end of the handler
        SaxContentElementInterface * oldHandler = m_handlers.back();
        oldHandler->EndElement();
        m_handlers.pop_back();
    }
    else
    {
        --m_subElementDepth;
    }
}

void SaxReader::Characters(const SaxString & chars)
{
    if (chars.size() > 0)
    {
        if (m_subElementDepth == 0 && !m_handlers.empty())
        {
            // send the chars to the handler
            m_handlers.back()->Characters(chars);
        }
    }
}

// from SAXErrorHandlerImpl

void SaxReader::Error(
        int lineNumber,
        int columnNumber,
        const SaxString & errorMessage,
        HRESULT errorCode)
{
    UNREFERENCED_PARAMETER(lineNumber);
    UNREFERENCED_PARAMETER(columnNumber);
    UNREFERENCED_PARAMETER(errorCode);
    if (!m_errorReported)
    {
        m_errorReported = true;
        m_errorMessage = errorMessage;
    }
}

void SaxReader::FatalError(
        int lineNumber,
        int columnNumber,
        const SaxString & errorMessage,
        HRESULT errorCode)
{
    UNREFERENCED_PARAMETER(lineNumber);
    UNREFERENCED_PARAMETER(columnNumber);
    UNREFERENCED_PARAMETER(errorCode);
    if (!m_errorReported)
    {
        m_errorReported = true;
        m_errorMessage = errorMessage;
    }
}

void SaxReader::HandleComError(const _com_error & e)
{
    // cannot occur on Linux (no COM); keep linkable for the header's sake
    UNREFERENCED_PARAMETER(e);
    if (!m_errorReported)
    {
        m_errorReported = true;
        m_errorMessage = "COM error (unexpected on Linux)";
    }
}

// ---------------------------------------------------------------------------
// SAXContentHandlerImpl / SAXErrorHandlerImpl construction stubs.
// Their .cpp files are the MSXML COM plumbing and are excluded from the
// Linux build; only the ctors/dtors are needed to instantiate SaxReader.
// ---------------------------------------------------------------------------
#include "XmlLib/SAXContentHandlerImpl.h"
#include "XmlLib/SAXErrorHandlerImpl.h"

namespace XmlLib
{
    SAXContentHandlerImpl::SAXContentHandlerImpl() {}
    SAXContentHandlerImpl::~SAXContentHandlerImpl() {}
    SAXErrorHandlerImpl::SAXErrorHandlerImpl() {}
    SAXErrorHandlerImpl::~SAXErrorHandlerImpl() {}
}
