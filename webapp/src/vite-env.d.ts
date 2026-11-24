/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

declare const __BUILDER_VERSION__: string
declare const __BUILDER_RELEASE__: string
declare const __BUILDER_UPDATED__: string
