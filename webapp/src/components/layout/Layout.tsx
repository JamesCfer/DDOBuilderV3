import React from 'react'
import styles from './Layout.module.css'
import TopNav, { type TopNavProps } from './TopNav'

interface LayoutProps extends TopNavProps {
  children: React.ReactNode
  /** Span the full viewport width (Custom › Windows work area). */
  fullBleed?: boolean
}

export default function Layout({ children, fullBleed, ...nav }: LayoutProps) {
  return (
    <div className={styles.root}>
      <TopNav {...nav} />
      <main className={`${styles.content} ${fullBleed ? styles.contentFull : ''}`}>
        {children}
      </main>
    </div>
  )
}
