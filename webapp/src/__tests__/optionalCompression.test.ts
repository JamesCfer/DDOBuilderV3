// Compression is an optimisation, not a startup dependency. Shipping code
// against stale node_modules used to crash-loop the server on
// `Cannot find module 'compression'` and return 502 for the whole site; it
// must degrade to uncompressed responses instead.

import { describe, it, expect, vi } from 'vitest'
import { loadOptionalCompression } from '../server/optionalCompression'

describe('loadOptionalCompression', () => {
  it('uses the real middleware when the module is installed', () => {
    const middleware = vi.fn()
    const factory = vi.fn(() => middleware)
    const warn = vi.fn()

    const handler = loadOptionalCompression(() => factory, warn)

    expect(handler).toBe(middleware)
    expect(factory).toHaveBeenCalledOnce()
    expect(warn).not.toHaveBeenCalled()
  })

  it('falls back to a pass-through when the module is missing', () => {
    const warn = vi.fn()
    const handler = loadOptionalCompression(() => {
      throw new Error("Cannot find module 'compression'")
    }, warn)

    const next = vi.fn()
    handler({} as never, {} as never, next)

    // The request continues untouched — uncompressed, but served.
    expect(next).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain('compression')
  })

  it('warns loudly enough to be actionable in a deploy log', () => {
    const warn = vi.fn()
    loadOptionalCompression(() => { throw new Error('missing') }, warn)
    const message = warn.mock.calls[0][0] as string
    expect(message).toContain('[startup]')
    expect(message).toContain('npm ci')
  })
})
