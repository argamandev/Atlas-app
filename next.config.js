/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'fluent-ffmpeg',
      '@ffmpeg-installer/ffmpeg',
      '@distube/ytdl-core',
      'yt-dlp-wrap',
    ],
  },
}

module.exports = nextConfig
