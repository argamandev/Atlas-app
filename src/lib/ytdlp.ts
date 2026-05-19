import * as fs from 'fs'
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

export async function getVideoInfo(url: string) {
  const bin = getYtDlpBin()
  const { stdout } = await execFileAsync(bin, [
    '--dump-json',
    '--no-playlist',
    '--js-runtimes', 'node',
    url,
  ], EXEC_OPTS)

  const info = JSON.parse(stdout)
  return {
    title: info.title as string,
    durationSecs: info.duration as number,
    thumbnail: (info.thumbnail ?? null) as string | null,
  }
}

export async function downloadAudio(url: string, outputTemplate: string): Promise<void> {
  const bin = getYtDlpBin()
  await execFileAsync(bin, [
    url,
    '--no-playlist',
    '--js-runtimes', 'node',
    '--ffmpeg-location', ffmpegBin,
    '-f', 'bestaudio',
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '32K',
    '--postprocessor-args', 'ffmpeg:-ac 1 -ar 16000',
    '--no-progress',
    '-o', outputTemplate,
  ], EXEC_OPTS)
}
