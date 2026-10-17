// ScreenFit.h
//
// Keeps popup dialogs usable on small screens and with large display
// scaling. A dialog that is bigger than the monitor it opens on is shrunk
// to fit and given scroll bars, so every control can still be reached.
#pragma once

// Call at the end of a dialog's OnInitDialog, after its controls are set up.
// Does nothing when the dialog already fits on its monitor.
void FitDialogToScreen(CWnd* pDialog);
