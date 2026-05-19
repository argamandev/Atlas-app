import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBin: string = require('@ffmpeg-installer/ffmpeg').path

const execFileAsync = promisify(execFile)

const EXEC_OPTS = {
  maxBuffer: 50 * 1024 * 1024,
  timeout: 30 * 60 * 1000,
}

function getYtDlpBin(): string {
  if (process.platform === 'win32') {
    const winPath = path.join(process.cwd(), 'bin', 'yt-dlp.exe')
    if (!fs.existsSync(winPath)) {
      throw new Error(
        `yt-dlp.exe not found at ${winPath}. ` +
        `Download from https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe`
      )
    }
    return winPath
  }
  // Linux/Mac: check local bin (downloaded during Railway build), fallback to PATH
  const localPath = path.join(process.cwd(), 'bin', 'yt-dlp')
  if (fs.existsSync(localPath)) {
    return localPath
  }
  return 'yt-dlp'
}

let cookiesPathCache: string | null | undefined = undefined

function getCookiesPath(): string | null {
  if (cookiesPathCache !== undefined) return cookiesPathCache
  const b64 = process.env.YOUTUBE_COOKIES_B64
  if (!b64) {
    console.log('[ytdlp] cookies: disabled (set YOUTUBE_COOKIES_B64 to enable)')
    cookiesPathCache = null
    return null
  }
  try {
    const out = path.join(os.tmpdir(), 'yt-cookies.txt')
    fs.writeFileSync(out, Buffer.from(b64, 'base64').toString('utf8'), { mode: 0o600 })
    console.log(`[ytdlp] cookies: enabled (wrote ${out})`)
    cookiesPathCache = out
    return out
  } catch (err) {
    console.error('[ytdlp] failed to decode YOUTUBE_COOKIES_B64:', err)
    cookiesPathCache = null
    return null
  }
}

function commonFlags(): string[] {
  const flags = [
    '--no-playlist',
    '--retries', '10',
    '--fragment-retries', '10',
    '--socket-timeout', '30',
    '--extractor-args', 'youtube:player_client=android,ios,web_creator,web',
    '--no-check-certificate',
    '--no-warnings',
  ]
  const cookies = getCookiesPath()
  if (cookies) flags.push('--cookies', cookies)
  return flags
}

function ytDlpError(err: unknown, context: string): Error {
  const e = err as { stderr?: string; stdout?: string; message?: string }
  const stderr = (e.stderr ?? '').trim()
  const reason = stderr || e.message || 'unknown error'
  return new Error(`yt-dlp ${context} failed: ${reason.slice(0, 800)}`)
}

export async function getVideoInfo(url: string) {
  const bin = getYtDlpBin()
  try {
    const { stdout } = await execFileAsync(bin, [
      '--dump-json',
      ...commonFlags(),
      url,
    ], EXEC_OPTS)
    const info = JSON.parse(stdout)
    return {
      title: info.title as string,
      durationSecs: info.duration as number,
      thumbnail: (info.thumbnail ?? null) as string | null,
    }
  } catch (err) {
    throw ytDlpError(err, 'metadata')
  }
}

export async function downloadAudio(url: string, outputTemplate: string): Promise<void> {
  const bin = getYtDlpBin()
  try {
    await execFileAsync(bin, [
      url,
      ...commonFlags(),
      '--ffmpeg-location', ffmpegBin,
      '-f', 'bestaudio',
      '-x',
      '--audio-format', 'mp3',
      '--audio-quality', '32K',
      '--postprocessor-args', 'ffmpeg:-ac 1 -ar 16000',
      '--no-progress',
      '-o', outputTemplate,
    ], EXEC_OPTS)
  } catch (err) {
    throw ytDlpError(err, 'download')
  }
}
