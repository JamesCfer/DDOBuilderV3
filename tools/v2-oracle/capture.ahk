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
; The first 'DDOBuilder' window may be a splash/progress window; the real
; main frame only exists once loading ends. Re-enumerate the process's
; top-level windows every attempt and post the command to ALL of them.
; Wait for V2 to go IDLE (data load done) before commanding it — driving
; it mid-load crashes the process (proven: window vanishes after the first
; post). Poll CPU: once the process uses ~no CPU across consecutive samples,
; loading is finished.
Log("waiting for V2 to finish loading (CPU idle)...")
idleStreak := 0
loop 120 {
    if !ProcessExist(pid) {
        Log("ERROR: V2 exited during load")
        ExitApp 2
    }
    if CheckModal("load") {
        continue
    }
    t1 := ProcessCpuTime(pid)
    Sleep 2000
    t2 := ProcessCpuTime(pid)
    busy := t2 - t1
    if busy < 150 {
        idleStreak++
        if idleStreak >= 3 {
            Log("V2 idle after ~" (A_Index*2) "s")
            break
        }
    } else {
        idleStreak := 0
    }
    if Mod(A_Index, 10) = 0 {
        Log("still loading; cpu-delta=" busy "ms")
    }
}

ProcessCpuTime(procId) {
    ; Kernel+user CPU time (ms) via WMI Win32_Process.
    for p in ComObjGet("winmgmts:").ExecQuery("SELECT KernelModeTime,UserModeTime FROM Win32_Process WHERE ProcessId=" procId) {
        return (p.KernelModeTime + p.UserModeTime) / 10000   ; 100ns units → ms
    }
    return 0
}

dlgUp := false
loop 10 {
    CheckModal("pre-menu")
    if !ProcessExist(pid) {
        Log("ERROR: V2 exited before export dialog (crash on command?)")
        ExitApp 2
    }
    mainWin := WinExist("ahk_pid " pid)
    Log("posting WM_COMMAND 32847 to hwnd=" mainWin " (attempt " A_Index ")")
    try PostMessage 0x111, 32847, 0, , mainWin
    if WinWait("Configure Forum Export", , 15) {
        dlgUp := true
        break
    }
    Sleep 3000
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
