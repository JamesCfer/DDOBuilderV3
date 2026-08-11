// In-game plugin downloads. The headline download is the Plugin Hub — the
// plugin manager that installs and updates every other plugin from inside
// DungeonHelper — with the individual plugins listed underneath for anyone who
// wants to install one by hand. Releases come from /api/plugins, which
// aggregates the public release repo's catalog.json + per-plugin manifests.

import { useEffect, useState } from 'react'
import styles from './Plugins.module.css'
import { api } from '../../api'
import type { PluginRelease } from '../../api'

/** Stable download URL served by us; redirects to the current release zip. */
function downloadUrl(key: string) {
  return `/api/plugins/${encodeURIComponent(key)}/download`
}

export default function PluginsPanel() {
  const [plugins, setPlugins] = useState<PluginRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.plugins()
      .then(res => { if (!cancelled) setPlugins(res.plugins) })
      .catch(() => { if (!cancelled) setError('Could not reach the plugin release feed. Try again in a moment.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const manager = plugins.find(p => p.isManager) ?? null
  const others = plugins.filter(p => !p.isManager)

  return (
    <div className={styles.panel}>
      <div className="panel">
        <div className="panel-header">DDO Plugins</div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ fontSize: '13px', margin: 0 }}>
            These run inside the game through{' '}
            <a href="https://www.dungeonhelper.com/" target="_blank" rel="noreferrer">DungeonHelper</a>,
            not in this planner. Install the Plugin Hub once and it installs,
            updates and hosts the rest for you.
          </p>

          {loading && <p style={{ fontSize: '13px' }}>Loading the plugin catalogue…</p>}
          {error && <p className={styles.error}>{error}</p>}

          {manager && (
            <section className={styles.hero}>
              <div className={styles.heroText}>
                <h2 className={styles.heroTitle}>
                  {manager.name}
                  {manager.version && <span className={styles.version}>v{manager.version}</span>}
                </h2>
                <p className={styles.blurb}>{manager.description}</p>
                {manager.notes && (
                  <p className={styles.notes}><strong>Latest release:</strong> {manager.notes}</p>
                )}
              </div>
              <div className={styles.heroActions}>
                {manager.zipUrl ? (
                  <>
                    <a className={styles.downloadBtn} href={downloadUrl(manager.key)}>
                      ⬇ Download the Plugin Hub
                    </a>
                    <span className={styles.downloadHint}>
                      {manager.key}-{manager.version}.zip · free · by {manager.author}
                    </span>
                  </>
                ) : (
                  <span className={styles.unavailable}>No release published yet.</span>
                )}
              </div>
            </section>
          )}

          <section>
            <strong>Installing it</strong>
            <ol className={styles.steps}>
              <li>Download the zip above — leave it zipped.</li>
              <li>Open DungeonHelper and go to its plugin settings.</li>
              <li>Choose <em>Add plugin</em> and pick the zip you just downloaded.</li>
              <li>Restart DungeonHelper. The hub appears on the DungeonHelper toolbar.</li>
              <li>Open the hub and install any of the plugins below from inside it — it keeps them updated from then on.</li>
            </ol>
          </section>

          {others.length > 0 && (
            <section>
              <strong>Plugins the hub can install</strong>
              <p style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '4px 0 10px' }}>
                You don't need to download these individually — the hub does it
                for you. The direct links are here for manual installs.
              </p>
              <div className={styles.grid}>
                {others.map(p => (
                  <article key={p.key} className={styles.card}>
                    <h3 className={styles.cardTitle}>
                      <span>{p.name}</span>
                      {p.version && <span className={styles.version}>v{p.version}</span>}
                    </h3>
                    <p className={styles.cardDesc}>{p.description}</p>
                    <div className={styles.cardFoot}>
                      <span>by {p.author}</span>
                      {p.zipUrl
                        ? <a className={styles.smallDownload} href={downloadUrl(p.key)}>⬇ Download</a>
                        : <span className={styles.unavailable}>No release yet</span>}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
