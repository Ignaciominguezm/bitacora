#!/usr/bin/env node
// Run after placing skull-512.png in public/icons/
// Usage: node scripts/gen-icons.mjs
import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

if (!existsSync('public/icons/skull-512.png')) {
  console.error('Missing public/icons/skull-512.png — place the source image there first.')
  process.exit(1)
}

try {
  require.resolve('sharp')
} catch {
  console.log('Installing sharp...')
  execSync('npm install sharp --no-save', { stdio: 'inherit' })
}

const sharp = require('sharp')

await sharp('public/icons/skull-512.png').resize(512, 512).png().toFile('public/icons/icon-512.png')
await sharp('public/icons/skull-512.png').resize(192, 192).png().toFile('public/icons/icon-192.png')
await sharp('public/icons/skull-512.png').resize(32, 32).png().toFile('public/icons/favicon.png')

console.log('Icons generated:')
console.log('  public/icons/favicon.png   (32x32)')
console.log('  public/icons/icon-192.png  (192x192)')
console.log('  public/icons/icon-512.png  (512x512)')
