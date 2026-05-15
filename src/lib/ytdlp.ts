import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ffmpegBin: string = require('@ffmpeg-installer/ffmpeg').path

const execFileAsync = promisify(execFile)

const YTDLP_PATH = path.join(process.cwd(), 'bin', 'yt-dlp.exe')
const EXEC_OPTS = {
  maxBuffer: 50 * 1024 * 1024, // 50 MB — enough for long JSON + stderr
  timeout: 30 * 60 * 1000,     // 30 min max
}

function ensureYtDlp(): string {
  if (!fs.existsSync(YTDLP_PATH)) {
    throw new Error(
      `yt-dlp.exe not found at ${YTDLP_PATH}. ` +
      `Download from https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe`
    )
  }
  return YTDLP_PATH
}

export async function getVideoInfo(url: string) {
  const bin = ensureYtDlp()
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
  const bin = ensureYtDlp()
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
