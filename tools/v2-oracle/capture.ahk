; DDOBuilder V2 forum-export capture (AutoHotkey v2).
;
;   AutoHotkey64.exe capture.ahk <v2pid> <outFile>
;
; Launches V2 with the build file on its command line (MFC shell-command
; open), waits for the main frame, invokes menu "Forum Export" → "Forum
; Export" (ID_EDIT_FORUMEXPORT), accepts the "Configure Forum Export"
; dialog (all sections default ON in a fresh registry; OK copies the
; export to the clipboard — ForumExportDlg.cpp:306), and writes the
; clipboard to outFile. Exit codes: 0 ok, 2 no main window, 3 menu failed,
; 4 export dialog missing, 5 clipboard empty.

#Requires AutoHotkey v2.0
#SingleInstance Off
SetTitleMatchMode 2
DetectHiddenWindows false

FileAppend "capture.ahk start; args=" A_Args.Length "`n", "*"
if A_Args.Length < 2 {
    FileAppend "usage: capture.ahk pid out`n", "*"
    ExitApp 1
}
; V2 is launched by capture.ps1 (CreateProcess — avoids the ShellExecute
; consent dialog that blocked Run on the MotW-tagged downloaded exe).
pid := Integer(A_Args[1])
outFile := A_Args[2]
FileAppend "attaching to pid=" pid "`n", "*"

DumpWindows(tag) {
    global pid
    for hwnd in WinGetList() {
        try {
            t := WinGetTitle(hwnd)
            c := WinGetClass(hwnd)
            p := WinGetPID(hwnd)
            if (p = pid || InStr(t, "DDO") || InStr(c, "Afx")) {
                FileAppend tag ": hwnd=" hwnd " pid=" p " class=" c " title='" t "'`n", "*"
            }
        }
    }
}

; ── Wait for the main frame (data load can take a while on first run) ────
mainWin := 0
deadline := A_TickCount + 180000
while A_TickCount < deadline {
    ; Dismiss any modal message box the app throws while loading (data
    ; read-error notices etc.) — press Enter on it and keep waiting.
    modal := WinExist("ahk_class #32770 ahk_pid " pid)
    if modal {
        title := WinGetTitle(modal)
        FileAppend "dismissing modal during load: '" title "' text=<" SubStr(WinGetText(modal), 1, 400) ">`n", "*"
        WinActivate modal
        Send "{Enter}"
        Sleep 500
        continue
    }
    ; Match ANY top-level window of the process (title-independent).
    mainWin := WinExist("ahk_pid " pid)
    if !mainWin {
        mainWin := WinExist("ahk_exe DDOBuilder.exe")
    }
    if mainWin {
        FileAppend "main window: '" WinGetTitle(mainWin) "' class=" WinGetClass(mainWin) "`n", "*"
        break
    }
    Sleep 1000
}
if !mainWin {
    FileAppend "ERROR: main window never appeared`n", "*"
    DumpWindows("timeout-dump")
    if !ProcessExist(pid) {
        FileAppend "NOTE: process " pid " has EXITED (crash or missing DLL?)`n", "*"
    }
    ExitApp 2
}

; Let the document finish loading/rendering. V2 loads ~17k data files at
; startup; wait until the SDI title shows the document ("<name> - DDOBuilder")
; or up to 150s, heartbeating so the log shows where time goes.
WinActivate mainWin
loadDeadline := A_TickCount + 240000
while A_TickCount < loadDeadline {
    ; A modal here usually means the document failed to load — abort fast.
    modal := WinExist("ahk_class #32770 ahk_pid " pid)
    if modal {
        mtext := SubStr(WinGetText(modal), 1, 400)
        FileAppend "modal during doc-load: <" mtext ">`n", "*"
        if InStr(mtext, "failed to load") {
            FileAppend "ERROR: document rejected by V2 parser`n", "*"
            ProcessClose pid
            ExitApp 6
        }
        WinActivate modal
        Send "{Enter}"
        Sleep 800
        continue
    }
    t := WinGetTitle(mainWin)
    if InStr(t, " - ") || InStr(t, "fuzz") {
        FileAppend "document loaded: '" t "'`n", "*"
        break
    }
    if Mod(A_TickCount, 10000) < 1100 {
        FileAppend "waiting for load; title='" t "'`n", "*"
    }
    Sleep 1000
}
Sleep 3000

; Dismiss any straggler modals (e.g. per-file read warnings).
loop 5 {
    modal := WinExist("ahk_class #32770 ahk_pid " pid)
    if !modal {
        break
    }
    FileAppend "dismissing modal post-load: '" WinGetTitle(modal) "' text=<" SubStr(WinGetText(modal), 1, 400) ">`n", "*"
    WinActivate modal
    Send "{Enter}"
    Sleep 800
}

; ── Invoke Forum Export → Forum Export ───────────────────────────────────
DumpWindows("pre-menu")
WinActivate mainWin
FileAppend "invoking menu Forum Export...`n", "*"
try {
    MenuSelect mainWin, , "Forum Export", "Forum Export"
    FileAppend "menu invoked`n", "*"
} catch as e {
    FileAppend "ERROR: MenuSelect failed: " e.Message "`n", "*"
    DumpWindows("menu-fail")
    ExitApp 3
}

if !WinWait("Configure Forum Export", , 20) {
    FileAppend "ERROR: Configure Forum Export dialog never appeared`n", "*"
    ExitApp 4
}

; ── OK → clipboard ───────────────────────────────────────────────────────
A_Clipboard := ""
WinActivate "Configure Forum Export"
Sleep 500
Send "{Enter}"
if !ClipWait(15) {
    FileAppend "ERROR: clipboard never populated`n", "*"
    ExitApp 5
}
text := A_Clipboard
FileAppend "captured " StrLen(text) " chars`n", "*"
if FileExist(outFile) {
    FileDelete outFile
}
FileAppend text, outFile, "UTF-8-RAW"

; ── Close V2 without saving ──────────────────────────────────────────────
WinClose mainWin
if WinWait("ahk_class #32770 ahk_pid " pid, , 5) {
    Send "n"          ; "Save changes?" → No
    Sleep 500
    Send "{Enter}"
}
Sleep 1000
if ProcessExist(pid) {
    ProcessClose pid
}
ExitApp 0
