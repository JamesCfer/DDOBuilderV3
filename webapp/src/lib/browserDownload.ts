/** Trigger a browser download of a text file (V2's `CFileDialog` save-as counterpart). */
export function downloadTextFile(text: string, filename: string, mimeType = 'application/xml'): void {
  const blob = new Blob([text], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
