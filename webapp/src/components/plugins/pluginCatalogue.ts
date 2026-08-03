// The dungeon-help plugin catalogue shown on the Plugins page.
//
// One entry per plugin. Everything except `name`, `description` and
// `category` is optional, so a plugin can be listed before it has a download
// link. Order within a category follows this array.
//
// Intentionally empty: the page is wired up and ready, but the real plugin
// names, descriptions and URLs have to come from you — putting invented ones
// on a public page would be worse than an honest empty state.

export const PLUGIN_CATEGORIES = [
  'Quest & Dungeon Guides',
  'Combat & Timers',
  'Loot & Crafting',
  'Utility',
] as const

export type PluginCategory = (typeof PLUGIN_CATEGORIES)[number]

export interface PluginEntry {
  name: string
  description: string
  category: PluginCategory
  /** Shown as "v<version>" next to the name. */
  version?: string
  /** Direct download (a release asset, say). Renders the primary button. */
  downloadUrl?: string
  /** Docs, repository or forum thread. */
  infoUrl?: string
  /** Short keywords, e.g. ['raid', 'timers']. */
  tags?: string[]
}

export const PLUGINS: PluginEntry[] = [
  // Example of the shape — delete this comment and add real entries:
  // {
  //   name: 'Quest Compass',
  //   description: 'Marks objectives and optionals on the dungeon map.',
  //   category: 'Quest & Dungeon Guides',
  //   version: '1.2.0',
  //   downloadUrl: 'https://example.com/quest-compass.zip',
  //   infoUrl: 'https://example.com/quest-compass',
  //   tags: ['maps', 'objectives'],
  // },
]
