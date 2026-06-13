// Downloads yt-dlp binary on Linux during Railway build.
// On Windows, bin/yt-dlp.exe is checked in to the repo directly.
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.platform === 'win32') {
  console.log('[install-yt-dlp] Windows — skipping (using bin/yt-dlp.exe)')
  process.exit(0)
}

const binDir = path.join(process.cwd(), 'bin')
const binPath = path.join(binDir, 'yt-dlp')

fs.mkdirSync(binDir, { recursive: true })

if (fs.existsSync(binPath)) {
  console.log('[install-yt-dlp] already exists — skipping')
  process.exit(0)
}

console.log('[install-yt-dlp] downloading yt-dlp for Linux...')
try {
  execSync(
    `curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o "${binPath}" && chmod +x "${binPath}"`,
    { stdio: 'inherit' }
  )
  console.log('[install-yt-dlp] done')
} catch (err) {
  // Non-fatal: nixpacks.toml also installs yt-dlp on PATH, and getYtDlpBin() falls back to it.
  // Don't fail the whole build over a transient download hiccup.
  console.warn('[install-yt-dlp] download failed — relying on PATH yt-dlp (nixpacks):', err && err.message)
}
