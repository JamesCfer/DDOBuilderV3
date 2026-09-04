// Copying text to the clipboard, without assuming the modern API is there.
//
// navigator.clipboard needs a secure context, so a build planner served over
// plain HTTP on a LAN (which is how people run this alongside the game) has
// only the legacy execCommand path. Callers get a boolean and can show the raw
// text when both fail, rather than a copy button that silently does nothing.

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Denied or unavailable: fall through to the legacy path.
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    // Off-screen, but still focusable: execCommand only copies a selection.
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}
