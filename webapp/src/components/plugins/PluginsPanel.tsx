// Plugins — where people find the dungeon-help plugins that go with the
// planner.
//
// The list is DATA, not markup (`pluginCatalogue.ts`): adding a plugin should
// be one entry, not a JSX edit, and the page renders whatever is there. It
// ships empty on purpose — inventing plugin names and download links would
// put things on screen that do not exist and cannot be clicked. Fill the
// catalogue in and the page populates itself.

import { PLUGINS, PLUGIN_CATEGORIES, type PluginEntry } from './pluginCatalogue'
import styles from './PluginsPanel.module.css'

function PluginCard({ plugin }: { plugin: PluginEntry }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.cardName}>{plugin.name}</span>
        {plugin.version && <span className={styles.cardVersion}>v{plugin.version}</span>}
      </div>
      <p className={styles.cardDesc}>{plugin.description}</p>
      {plugin.tags && plugin.tags.length > 0 && (
        <div className={styles.tags}>
          {plugin.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
        </div>
      )}
      <div className={styles.cardLinks}>
        {plugin.downloadUrl && (
          <a
            className={styles.primaryLink}
            href={plugin.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Download
          </a>
        )}
        {plugin.infoUrl && (
          <a
            className={styles.link}
            href={plugin.infoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Details
          </a>
        )}
      </div>
    </div>
  )
}

export default function PluginsPanel() {
  const categories = PLUGIN_CATEGORIES.filter(c => PLUGINS.some(p => p.category === c))

  return (
    <div className="panel">
      <div className="panel-header">Dungeon Help Plugins</div>
      <div className="panel-body">
        <p className={styles.intro}>
          In-game helpers that pair with the planner — quest and dungeon
          guidance, timers, trackers and overlays.
        </p>

        {PLUGINS.length === 0 ? (
          <div className={styles.empty}>
            <p>No plugins are listed yet.</p>
            <p className={styles.emptyHint}>
              The catalogue lives in{' '}
              <code>webapp/src/components/plugins/pluginCatalogue.ts</code>. Add
              an entry per plugin — name, description, category and links — and
              it appears here.
            </p>
          </div>
        ) : (
          categories.map(category => (
            <section key={category} className={styles.section}>
              <h3 className={styles.sectionTitle}>{category}</h3>
              <div className={styles.grid}>
                {PLUGINS.filter(p => p.category === category).map(p => (
                  <PluginCard key={p.name} plugin={p} />
                ))}
              </div>
            </section>
          ))
        )}

        <p className={styles.footnote}>
          Plugins are separate downloads and are installed in the game client,
          not here. Links open in a new tab.
        </p>
      </div>
    </div>
  )
}
