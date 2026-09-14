import React from 'react'
import styles from './Layout.module.css'
import TopNav, { type TopNavProps } from './TopNav'

interface LayoutProps extends TopNavProps {
  children: React.ReactNode
}

/** Header on top, the workspace filling everything below it. */
export default function Layout({ children, ...nav }: LayoutProps) {
  return (
    <div className={styles.root}>
      <TopNav {...nav} />
      <main className={styles.content}>
        {children}
      </main>
    </div>
  )
}
