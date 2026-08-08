/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'fluent-ffmpeg',
      '@ffmpeg-installer/ffmpeg',
      '@distube/ytdl-core',
      'yt-dlp-wrap',
      // ADDED 2026-08-06 so a MAYA filing can be extracted inside an API route.
      //
      // `src/lib/documents/extract.ts` carries the warning "import this module
      // only from scripts (tsx) — never from Next server code", and pulling it
      // into `/api/workspaces/[id]/items/from-maya` broke exactly as promised:
      // webpack mangles the pdfjs ESM bundle and the route died with
      // "Object.defineProperty called on non-object". Listing it here makes
      // Next `require` it from node_modules at runtime instead of bundling it,
      // which is what this list is for and what the four entries above do.
      //
      // The rule in extract.ts is now narrower than "scripts only": the module
      // may be used server-side PROVIDED pdfjs stays external. The browser
      // still must not import it — that path uses the committed
      // `public/pdf.min.mjs` (see `.claude/rules/app.md`).
      'pdfjs-dist',
    ],
  },
}

module.exports = nextConfig
