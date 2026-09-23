# proximity+

A minimal, fast, and beautiful local music player with **automatic lyrics** and **auto-tagging**. Drop in a folder of untagged, messy, downloader-cluttered MP3s proximity+ identifies every track with AI, fetches synchronized lyrics, and cleans up your library automatically.

Built with Electron, React, Express, and Groq..... preview: https://proximity-em5e.onrender.com/

## Features

- **AI auto-tagging** identifies title, artist, and album from even the most cluttered filenames ("03 - [320KBPS] blinding_lights(1).mp3"), with cover art from the iTunes catalog
- **Automatic synchronized lyrics** karaoke-style line highlighting as the song plays
- **Instant search** fuzzy search across your whole library
- **Dark industrial design** red-on-black, minimal chrome, keyboard-driven
- **Fully local** your music files never leave your machine; only filenames are sent for identification
- **Zero-config desktop app** keys are embedded at build time; no API setup for end users

## Downloads

Grab the latest release for your platform:

- **Windows**: installer (Setup .exe) or portable single-file (.exe)
- **macOS**: .dmg for both Intel and Apple Silicon

Visit the [download page](https://nithilan-alt-f4.github.io/proximity-/).

## Development

```bash
npm install
cp .env.example .env   # add your Groq API key(s)
npm run dev            # tsx server on :3001
```

Frontend dev server proxies `/api/*` to the backend (see `vite.config.ts`).

### Build from source

```bash
npm run build          # bundles web frontend + server (embeds keys from .env)
npx electron-builder --win   # or --mac / --dir for unpacked
```

`GROQ_API_KEYS` in `.env` (comma-separated) is baked into the server bundle at build time. Multiple keys are pooled and rotated automatically with rate-limit handling.

## How it works

- **Frontend**: React + Vite, Tailwind CSS v4
- **Backend**: Express bundled with esbuild into a single `server.cjs`, run in-process inside Electron
- **Identification**: Groq (`openai/gpt-oss-120b`) resolves filenames to title/artist/album, with user-confirmed values as ground truth
- **Lyrics**: LRCLIB (free, no key) with AI-powered per-word sync correction
- **Cover art**: iTunes Search API
