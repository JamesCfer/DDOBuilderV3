; DDOBuilder V2 forum-export capture (AutoHotkey v2).
;
;   AutoHotkey64.exe capture.ahk <exePath> <buildFile> <outFile>
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

if A_Args.Length < 3 {
    FileAppend "usage: capture.ahk exe build out`n", "*"
    ExitApp 1
}
exePath := A_Args[1]
buildFile := A_Args[2]
outFile := A_Args[3]

SplitPath exePath, , &exeDir

Run '"' exePath '" "' buildFile '"', exeDir, , &pid

; ── Wait for the main frame (data load can take a while on first run) ────
mainWin := 0
deadline := A_TickCount + 180000
while A_TickCount < deadline {
    ; Dismiss any modal message box the app throws while loading (data
    ; read-error notices etc.) — press Enter on it and keep waiting.
    modal := WinExist("ahk_class #32770 ahk_pid " pid)
    if modal {
        title := WinGetTitle(modal)
        FileAppend "dismissing modal during load: '" title "'`n", "*"
        WinActivate modal
        Send "{Enter}"
        Sleep 500
        continue
    }
    mainWin := WinExist("DDOBuilder ahk_pid " pid)
    if mainWin {
        break
    }
    Sleep 1000
}
if !mainWin {
    FileAppend "ERROR: main window never appeared`n", "*"
    ExitApp 2
}

; Let the document finish loading/rendering.
WinActivate mainWin
Sleep 8000

; Dismiss any straggler modals (e.g. per-file read warnings).
loop 5 {
    modal := WinExist("ahk_class #32770 ahk_pid " pid)
    if !modal {
        break
    }
    FileAppend "dismissing modal post-load: '" WinGetTitle(modal) "'`n", "*"
    WinActivate modal
    Send "{Enter}"
    Sleep 800
}

; ── Invoke Forum Export → Forum Export ───────────────────────────────────
WinActivate mainWin
try {
    MenuSelect mainWin, , "Forum Export", "Forum Export"
} catch as e {
    FileAppend "ERROR: MenuSelect failed: " e.Message "`n", "*"
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
