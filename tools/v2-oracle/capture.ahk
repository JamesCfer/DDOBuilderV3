; DDOBuilder V2 forum-export capture (AutoHotkey v2).
;
;   AutoHotkey64.exe capture.ahk <v2pid> <outFile>
;
; V2 is launched by capture.ps1 (CreateProcess — avoids the ShellExecute
; MotW consent dialog). This script attaches by pid, waits out the data
; load, invokes menu "Forum Export" → "Forum Export" (ID_EDIT_FORUMEXPORT,
; retried — the menu is unresponsive while V2's UI thread is loading),
; accepts the "Configure Forum Export" dialog (OK copies the export to the
; clipboard — ForumExportDlg.cpp:306), and writes the clipboard to outFile.
;
; All progress goes to <outFile>.log via per-call FileAppend (flushed on
; every write, so nothing is lost if the orchestrator kills us on timeout).
; Exit codes: 0 ok, 2 no main window, 4 export dialog missing,
; 5 clipboard empty, 6 document rejected by V2's parser.

#Requires AutoHotkey v2.0
#SingleInstance Off
SetTitleMatchMode 2
DetectHiddenWindows false

if A_Args.Length < 2 {
    FileAppend "usage: capture.ahk pid out`n", "*"
    ExitApp 1
}
pid := Integer(A_Args[1])
outFile := A_Args[2]
logFile := outFile ".log"

Log(msg) {
    global logFile
    try FileAppend msg "`n", logFile
    FileAppend msg "`n", "*"
}

DumpWindows(tag) {
    global pid
    for hwnd in WinGetList() {
        try {
            t := WinGetTitle(hwnd)
            c := WinGetClass(hwnd)
            p := WinGetPID(hwnd)
            if (p = pid || InStr(t, "DDO") || InStr(c, "Afx")) {
                Log(tag ": hwnd=" hwnd " pid=" p " class=" c " title='" t "'")
            }
        }
    }
}

; Returns the modal's hwnd if one is up; aborts the whole capture if it is
; a document-load failure (its text carries V2's parser error).
CheckModal(phase) {
    global pid
    modal := WinExist("ahk_class #32770 ahk_pid " pid)
    if !modal {
        return 0
    }
    mtext := SubStr(WinGetText(modal), 1, 400)
    Log(phase " modal: <" mtext ">")
    if InStr(mtext, "failed to load") {
        Log("ERROR: document rejected by V2 parser")
        ProcessClose pid
        ExitApp 6
    }
    WinActivate modal
    Send "{Enter}"
    Sleep 800
    return modal
}

Log("capture.ahk start; attaching to pid=" pid)

; ── Wait for the main frame ──────────────────────────────────────────────
mainWin := 0
deadline := A_TickCount + 180000
while A_TickCount < deadline {
    if CheckModal("startup") {
        continue
    }
    mainWin := WinExist("ahk_pid " pid)
    if mainWin {
        Log("main window: '" WinGetTitle(mainWin) "' class=" WinGetClass(mainWin))
        break
    }
    if !ProcessExist(pid) {
        Log("ERROR: process exited before a window appeared")
        ExitApp 2
    }
    Sleep 1000
}
if !mainWin {
    Log("ERROR: main window never appeared")
    DumpWindows("timeout-dump")
    ExitApp 2
}

; ── Invoke Forum Export. V2's menu bar is an MFC Feature-Pack toolbar —
; NOT a Win32 menu, so MenuSelect can never drive it. Post WM_COMMAND with
; ID_EDIT_FORUMEXPORT (32847, DDOBuilder/resource.h) instead; the message
; queues until V2's UI thread finishes its multi-minute data load, so the
; retry loop doubles as the load wait. ───────────────────────────────────
dlgUp := false
loop 30 {
    CheckModal("pre-menu")
    Log("posting WM_COMMAND ID_EDIT_FORUMEXPORT (attempt " A_Index ")")
    try PostMessage 0x111, 32847, 0, , mainWin
    if WinWait("Configure Forum Export", , 20) {
        dlgUp := true
        break
    }
    Log("dialog not up yet; retrying")
    Sleep 5000
}
if !dlgUp {
    Log("ERROR: Configure Forum Export dialog never appeared after retries")
    DumpWindows("menu-fail")
    ExitApp 4
}
Log("export dialog is up")

; ── OK → clipboard ───────────────────────────────────────────────────────
A_Clipboard := ""
WinActivate "Configure Forum Export"
Sleep 500
Send "{Enter}"
if !ClipWait(15) {
    Log("ERROR: clipboard never populated")
    ExitApp 5
}
text := A_Clipboard
Log("captured " StrLen(text) " chars")
if FileExist(outFile) {
    FileDelete outFile
}
FileAppend text, outFile, "UTF-8-RAW"

; ── Close V2 without saving ──────────────────────────────────────────────
WinClose mainWin
if WinWait("ahk_class #32770 ahk_pid " pid, , 5) {
    Send "n"
    Sleep 500
    Send "{Enter}"
}
Sleep 1000
if ProcessExist(pid) {
    ProcessClose pid
}
ExitApp 0
