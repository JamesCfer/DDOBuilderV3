// Response compression, loaded defensively.
//
// gzip is an optimisation, not a requirement: without it the app is slower but
// entirely functional. A hard `import compression from 'compression'` makes it
// a startup dependency instead, so a deploy that ships new code against stale
// node_modules crash-loops the whole server on
// `Error: Cannot find module 'compression'` — which is exactly what took
// production down after compression was introduced (the container mounts an
// anonymous /app/node_modules volume that Docker only populates when the
// volume is first created, so the freshly built image's modules never reached
// the running container).
//
// Loading it through a try/catch turns that class of failure into a logged
// warning and an uncompressed response, never a 502.

import type { RequestHandler } from 'express'

type Loader = (id: string) => unknown

/**
 * Returns the compression middleware, or a pass-through when the module is
 * not installed. `load` is injectable for tests.
 */
export function loadOptionalCompression(
  load: Loader = require,
  warn: (msg: string) => void = console.warn,
): RequestHandler {
  try {
    const factory = load('compression') as () => RequestHandler
    return factory()
  } catch {
    warn(
      '[startup] optional dependency "compression" is not installed — serving '
      + 'responses uncompressed (the item catalogue is ~9x larger this way). '
      + 'Run `npm ci` in webapp/ to restore it.',
    )
    return (_req, _res, next) => next()
  }
}
