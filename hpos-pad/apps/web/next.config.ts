import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (ignored by Vercel).
  output: 'standalone',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  transpilePackages: ['@hpos-pad/shared'],
  // The monorepo root, so Turbopack does not pick up stray lockfiles further up the tree.
  turbopack: { root: path.resolve(process.cwd(), '../..') },
}

export default nextConfig
