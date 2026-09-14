// Workspace model — the pure, testable half of the windowed interface.
//
// Every page of the app is a WORKSPACE: a scrolling canvas with a snapping
// grid on which the panels live as windows. The Character page has several
// workspaces (its tabs — Overview, Skills, Feats, Gear, Combat…); Crafting,
// Community and Plugins have one each. A window is any panel from the registry
// placed at a grid-aligned rectangle. The user can drag, resize, add, close
// and zoom every window, add and rename tabs, and the whole arrangement is
// remembered per account.
//
// Nothing in this file touches the DOM: geometry, snapping, defaults and the
// storage format all live here so they can be unit-tested without React.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PageId = 'Character' | 'Crafting' | 'Community' | 'Plugins'

export const PAGES: PageId[] = ['Character', 'Crafting', 'Community', 'Plugins']

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface WindowState extends Rect {
  id: string
  /** Registry key of the panel this window hosts. */
  panel: string
  /** Content zoom: 'auto' fits the panel's natural width (never above 100%). */
  zoom: number | 'auto'
  /** Rolled up to its title bar. */
  collapsed?: boolean
  /** Rect to restore to while maximized. */
  prev?: Rect
}

export interface Workspace {
  id: string
  name: string
  /** Built-in tabs can be reset to their default layout but not removed. */
  builtin?: boolean
  windows: WindowState[]
}

/** Everything the user has arranged, keyed by page. */
export type LayoutState = Record<PageId, Workspace[]>

/** Grid size in pixels. Windows snap to multiples of this. */
export const GRID_SIZES = [16, 24, 32] as const
export type GridSize = (typeof GRID_SIZES)[number]
export const DEFAULT_GRID: GridSize = 24

export const MIN_WINDOW_W = 200
export const MIN_WINDOW_H = 96

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Round a coordinate to the nearest grid line. */
export function snap(value: number, grid: number): number {
  if (grid <= 1) return Math.round(value)
  return Math.round(value / grid) * grid
}

/** Snap a whole rectangle, keeping it at least one cell and never negative. */
export function snapRect(r: Rect, grid: number): Rect {
  const x = Math.max(0, snap(r.x, grid))
  const y = Math.max(0, snap(r.y, grid))
  const w = Math.max(Math.max(MIN_WINDOW_W, grid), snap(r.w, grid))
  const h = Math.max(Math.max(MIN_WINDOW_H, grid), snap(r.h, grid))
  return { x, y, w, h }
}

/**
 * Canvas extent: the far edge of the outermost window plus a margin, so the
 * canvas always has room to drag something further out. The canvas grows in
 * BOTH axes — a 5K monitor is usable and so is a phone (which stacks instead;
 * see `stackOrder`).
 */
export function canvasExtent(windows: WindowState[], margin = 240): { width: number; height: number } {
  let width = 0
  let height = 0
  for (const w of windows) {
    width = Math.max(width, w.x + w.w)
    height = Math.max(height, w.y + (w.collapsed ? 32 : w.h))
  }
  return { width: width + margin, height: height + margin }
}

/** Reading order for the stacked (small-screen) mode: top to bottom, then left to right. */
export function stackOrder(windows: WindowState[]): WindowState[] {
  return [...windows].sort((a, b) => (a.y - b.y) || (a.x - b.x))
}

/**
 * A free spot for a new window: the first grid-aligned position, scanning
 * left to right then down, that does not overlap an existing window. Falls
 * back to just below everything when the canvas is crowded.
 */
export function findFreeSpot(
  windows: WindowState[], size: { w: number; h: number }, grid: number, viewportWidth: number,
): { x: number; y: number } {
  const overlaps = (r: Rect) => windows.some(o =>
    !o.collapsed && r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y,
  )
  const maxX = Math.max(viewportWidth - size.w, 0)
  const bottom = Math.max(0, ...windows.map(w => w.y + w.h))
  for (let y = 0; y <= bottom + grid; y += grid) {
    for (let x = 0; x <= maxX; x += grid) {
      if (!overlaps({ x, y, ...size })) return { x, y }
    }
  }
  return { x: 0, y: snap(bottom + grid, grid) }
}

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

let counter = 0
export function newId(prefix = 'w'): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`
}

// ---------------------------------------------------------------------------
// Default layouts
// ---------------------------------------------------------------------------

/**
 * A compact way to describe a default layout: a list of panel keys with grid
 * cell rectangles, laid out on a 24px grid at a 1440px-wide reference. Wider
 * screens get empty canvas to the right (add windows there); narrower ones
 * stack (see `stackOrder`).
 */
type Cell = [panel: string, x: number, y: number, w: number, h: number]

function ws(id: string, name: string, cells: Cell[]): Workspace {
  const g = DEFAULT_GRID
  return {
    id,
    name,
    builtin: true,
    windows: cells.map(([panel, x, y, w, h], i) => ({
      id: `${id}-${i}`,
      panel,
      x: x * g, y: y * g, w: w * g, h: h * g,
      zoom: 'auto',
    })),
  }
}

// Character tabs. Each is a full workspace; the ones that are one big tree or
// table give that panel the width and keep a numbers window alongside.
const CHARACTER_DEFAULTS: Workspace[] = [
  ws('overview', 'Overview', [
    ['Character Info',    0,  0, 15, 12],
    ['Race',              0, 12, 15,  8],
    ['Classes',           0, 20, 15, 14],
    ['Ability Scores',   15,  0, 20, 16],
    ['Ability Level Ups',15, 16, 20,  8],
    ['Tomes',            15, 24, 20, 10],
    ['Stats',            35,  0, 18, 20],
    ['Past Lives',       35, 20, 18, 14],
    ['Stances & Buffs',  53,  0, 14, 34],
  ]),
  ws('skills', 'Skills', [
    ['Skills',            0,  0, 44, 32],
    ['Breakdowns',       44,  0, 20, 32],
  ]),
  ws('feats', 'Feats', [
    ['Feats',             0,  0, 40, 22],
    ['Automatic Feats',   0, 22, 40, 12],
    ['Breakdowns',       40,  0, 20, 34],
  ]),
  ws('spells', 'Spells', [
    ['Spells',            0,  0, 40, 34],
    ['DCs',              40,  0, 22, 34],
  ]),
  ws('levelplan', 'Level Plan', [
    ['Level Training',    0,  0, 62, 36],
  ]),
  ws('enhancements', 'Enhancements', [
    ['Enhancements',      0,  0, 48, 36],
    ['Breakdowns',       48,  0, 18, 36],
  ]),
  ws('destinies', 'Destinies', [
    ['Epic Destinies',    0,  0, 48, 36],
    ['Breakdowns',       48,  0, 18, 36],
  ]),
  ws('reaper', 'Reaper', [
    ['Reaper',            0,  0, 48, 32],
    ['Stances & Buffs',  48,  0, 16, 32],
  ]),
  ws('pastlives', 'Past Lives', [
    ['Past Lives',        0,  0, 32, 30],
    ['Favor',            32,  0, 32, 30],
  ]),
  ws('gear', 'Gear', [
    ['Gear',              0,  0, 44, 30],
    ['Filigrees',         0, 30, 44, 16],
    ['Set Bonuses',      44,  0, 20, 14],
    ['Clickies',         44, 14, 20, 16],
    ['Breakdowns',       44, 30, 20, 16],
  ]),
  ws('combat', 'Combat', [
    ['Combat',            0,  0, 30, 30],
    ['Damage Calc',      30,  0, 36, 30],
    ['Stances & Buffs',   0, 30, 14, 20],
    ['DCs',              14, 30, 26, 20],
    ['Bonuses',          40, 30, 26, 20],
  ]),
  ws('optimizer', 'Optimizer', [
    ['Optimizer',         0,  0, 44, 34],
    ['Compare',          44,  0, 22, 34],
  ]),
  ws('notes', 'Notes & Export', [
    ['Notes',             0,  0, 26, 20],
    ['Build Log',         0, 20, 26, 14],
    ['Forum Export',     26,  0, 38, 34],
  ]),
]

const CRAFTING_DEFAULTS: Workspace[] = [
  ws('crafting', 'Crafting', [
    ['Crafting Systems',  0,  0, 34, 36],
    ['Cannith Planner',  34,  0, 32, 36],
  ]),
]

const COMMUNITY_DEFAULTS: Workspace[] = [
  ws('community', 'Community', [
    ['Browse Builds',     0,  0, 38, 36],
    ['My Builds',        38,  0, 28, 36],
  ]),
]

const PLUGINS_DEFAULTS: Workspace[] = [
  ws('plugins', 'Plugins', [
    ['Dungeon Help',      0,  0, 66, 36],
  ]),
]

export function defaultWorkspaces(page: PageId): Workspace[] {
  const src = page === 'Character' ? CHARACTER_DEFAULTS
    : page === 'Crafting' ? CRAFTING_DEFAULTS
    : page === 'Community' ? COMMUNITY_DEFAULTS
    : PLUGINS_DEFAULTS
  // Deep copy: callers mutate through state updates and the defaults must
  // stay pristine for "Reset layout".
  return src.map(w => ({ ...w, windows: w.windows.map(x => ({ ...x })) }))
}

export function defaultLayout(): LayoutState {
  return {
    Character: defaultWorkspaces('Character'),
    Crafting: defaultWorkspaces('Crafting'),
    Community: defaultWorkspaces('Community'),
    Plugins: defaultWorkspaces('Plugins'),
  }
}

/** The pristine copy of one built-in tab, for "Reset this tab". */
export function defaultWorkspace(page: PageId, id: string): Workspace | undefined {
  return defaultWorkspaces(page).find(w => w.id === id)
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const LAYOUT_STORAGE_KEY = 'ddo-builder-workspaces'
const LAYOUT_VERSION = 1

interface StoredLayout {
  v: number
  layout: LayoutState
}

/** Per-account key: signing in on a shared browser must not inherit (or overwrite) somebody else's arrangement. */
export function layoutStorageKey(userId: string | null): string {
  return userId ? `${LAYOUT_STORAGE_KEY}:${userId}` : LAYOUT_STORAGE_KEY
}

function isRect(x: unknown): x is Rect {
  const r = x as Rect
  return !!r && ['x', 'y', 'w', 'h'].every(k => typeof (r as unknown as Record<string, unknown>)[k] === 'number')
}

function sanitizeWindow(raw: unknown): WindowState | null {
  const w = raw as WindowState
  if (!w || typeof w !== 'object' || typeof w.panel !== 'string' || !isRect(w)) return null
  return {
    id: typeof w.id === 'string' ? w.id : newId(),
    panel: w.panel,
    x: Math.max(0, w.x), y: Math.max(0, w.y),
    w: Math.max(MIN_WINDOW_W, w.w), h: Math.max(MIN_WINDOW_H, w.h),
    zoom: typeof w.zoom === 'number' ? w.zoom : 'auto',
    collapsed: w.collapsed ? true : undefined,
    prev: isRect(w.prev) ? { ...w.prev } : undefined,
  }
}

function sanitizeWorkspace(raw: unknown): Workspace | null {
  const s = raw as Workspace
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || typeof s.name !== 'string') return null
  if (!Array.isArray(s.windows)) return null
  return {
    id: s.id,
    name: s.name,
    builtin: s.builtin ? true : undefined,
    windows: s.windows.map(sanitizeWindow).filter((w): w is WindowState => w !== null),
  }
}

/**
 * Parse a stored layout. Unknown pages fall back to their defaults; a page
 * with an empty tab list is a real choice on Character (the user removed
 * every custom tab and… no: built-ins cannot be removed, so an empty list
 * means corruption) and is restored to defaults. Returns null when nothing
 * usable is stored.
 */
export function parseLayout(raw: string | null): LayoutState | null {
  if (!raw) return null
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return null }
  const stored = parsed as StoredLayout
  if (!stored || typeof stored !== 'object' || stored.v !== LAYOUT_VERSION || !stored.layout) return null
  const out = defaultLayout()
  for (const page of PAGES) {
    const list = (stored.layout as Partial<LayoutState>)[page]
    if (!Array.isArray(list)) continue
    const cleaned = list.map(sanitizeWorkspace).filter((w): w is Workspace => w !== null)
    if (cleaned.length === 0) continue
    // Built-in tabs that a newer version added appear at the end, so an
    // upgrade never loses a tab the user has not seen yet.
    const known = new Set(cleaned.map(w => w.id))
    for (const d of defaultWorkspaces(page)) {
      if (!known.has(d.id)) cleaned.push(d)
    }
    out[page] = cleaned
  }
  return out
}

export function serializeLayout(layout: LayoutState): string {
  return JSON.stringify({ v: LAYOUT_VERSION, layout } satisfies StoredLayout)
}

/** Storage access is wrapped: private mode and blocked storage throw. */
function readKey(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

export function readLayout(userId: string | null): LayoutState {
  const own = parseLayout(readKey(layoutStorageKey(userId)))
  if (own) return own
  // First run for an account: adopt whatever was arranged while signed out.
  if (userId) {
    const anon = parseLayout(readKey(LAYOUT_STORAGE_KEY))
    if (anon) return anon
  }
  return defaultLayout()
}

export function writeLayout(userId: string | null, layout: LayoutState): void {
  try { localStorage.setItem(layoutStorageKey(userId), serializeLayout(layout)) } catch { /* nothing to remember it with */ }
}

// ---------------------------------------------------------------------------
// Workspace-level operations (all pure)
// ---------------------------------------------------------------------------

export function addWindow(
  space: Workspace, panel: string, size: { w: number; h: number }, grid: number, viewportWidth: number,
): Workspace {
  const at = findFreeSpot(space.windows, size, grid, viewportWidth)
  const win: WindowState = { id: newId(), panel, ...at, ...size, zoom: 'auto' }
  return { ...space, windows: [...space.windows, win] }
}

export function removeWindow(space: Workspace, id: string): Workspace {
  return { ...space, windows: space.windows.filter(w => w.id !== id) }
}

/** Patch one window. A patch for a window that no longer exists is a late event from a closed one — dropped. */
export function patchWindow(space: Workspace, id: string, patch: Partial<WindowState>): Workspace {
  if (!space.windows.some(w => w.id === id)) return space
  return { ...space, windows: space.windows.map(w => (w.id === id ? { ...w, ...patch } : w)) }
}

export function toggleMaximize(space: Workspace, id: string, viewport: Rect): Workspace {
  return patchWindow(space, id, (() => {
    const w = space.windows.find(x => x.id === id)
    if (!w) return {}
    if (w.prev) return { ...w.prev, prev: undefined, collapsed: undefined }
    return { prev: { x: w.x, y: w.y, w: w.w, h: w.h }, ...viewport, collapsed: undefined }
  })())
}

/**
 * Tidy: pack every window into rows of the available width, in reading
 * order, on the grid. The escape hatch when an arrangement has become a
 * mess or a layout from a wide monitor is opened on a narrow one.
 */
export function tidyWindows(windows: WindowState[], grid: number, viewportWidth: number): WindowState[] {
  const usable = Math.max(viewportWidth, MIN_WINDOW_W + grid)
  let x = 0
  let y = 0
  let rowH = 0
  return stackOrder(windows).map(w => {
    const width = Math.min(w.w, snap(usable, grid) || w.w)
    if (x > 0 && x + width > usable) {
      x = 0
      y += rowH
      rowH = 0
    }
    const placed = { ...w, x, y, w: width, prev: undefined }
    x += width
    rowH = Math.max(rowH, w.collapsed ? snap(48, grid) || 48 : w.h)
    return placed
  })
}
