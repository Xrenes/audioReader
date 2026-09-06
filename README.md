# Audio Reader

A mobile-first PWA that reads selected PDF passages aloud in **English and Bangla**
with calm neural voices. Frosted-black glass UI, iPhone-style audio player.

## Why it doesn't sound robotic

Most PDF readers use the OS `speechSynthesis` voice and feed it text line-by-line
straight from the PDF. This app does the opposite:

- **Neural TTS** (Azure) with curated *calm*-toned voices, slightly slowed, pitched down.
- **Text is rebuilt into real sentences** before synthesis — lines re-joined,
  hyphenation repaired, ligatures and footnote digits stripped, Unicode NFC-normalized.
- **SSML** wraps each paragraph with a gentle rate and a soft break at the end.
- **Playback** crossfades between chunks, inserts a paragraph pause, and fades in/out
  instead of hard-cutting. Optional ambient bed (rain / brown noise).

## Stack

| Concern | Tech |
|---|---|
| Framework | React 18 + TypeScript + Vite |
| PWA / offline | `vite-plugin-pwa` (Workbox) |
| State | Zustand (`persist`) |
| PDF | `pdfjs-dist` — render, text layer, thumbnails |
| TTS | Azure Speech REST (primary) · `speechSynthesis` (fallback) |
| Audio | Web Audio API — timeline, crossfade, ±5-min seek |
| Storage | IndexedDB via `idb` — PDFs + cached audio clips |
| Lock screen | Media Session API |

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run dev:host     # expose on LAN to open on your phone
npm run build        # production PWA in dist/
npm run preview      # serve the build
```

## Using it on your phone

1. `npm run dev:host`, open the Network URL in mobile Safari / Chrome.
2. **Share → Add to Home Screen.** It launches full-screen like an app.
3. First run: open the settings sheet, paste an **Azure Speech key + region**
   (stored only on device). Without it, playback falls back to the basic
   device voice.

## Azure Speech key

Create a free *Speech* resource in the Azure portal. You need the **key** and the
**region** id (e.g. `southeastasia`, `eastus`). For local dev you can instead set:

```
# .env.local
VITE_AZURE_SPEECH_KEY=xxxxxxxx
VITE_AZURE_SPEECH_REGION=southeastasia
```

This is a personal app — the key ships to the client. If you ever publish it,
move synthesis behind a small proxy.

## Layout

```
Library  →  pick / open a PDF (cached offline in IndexedDB)

Reader
├── TopBar          back · title · page x/y · page light/dark toggle
├── Left  (rail / bottom sheet)   synced page thumbnails, tap to jump
├── Center                        continuous vertical PDF, drag to select a passage
├── Right (rail / bottom sheet)   VoiceSettings — live, also the pre-reading setup
└── AudioBar                      glass mini-player → tap to expand full player
                                  ⏮  ↺5m  ▶/❚❚  5m↻  ⏭  · scrubber · Voice A/B switch
```

## Reading flow

`selection rect → text-layer items in reading order → preprocess → paragraphs →
sentences → (IndexedDB cache | Azure synth) → decode → Web Audio timeline → play`

Generate-then-play, so the scrubber and ±5-min seek work on a real timeline.
Changing a voice mid-session re-synthesizes the remaining chunks.

## Status

Scaffold complete and building. Working: library, PDF view + thumbnails + scroll
sync, rectangle selection + text extraction, settings panel, glass audio player,
Web Audio engine, Azure + browser engines, IndexedDB caching.

Not yet wired: OCR for scanned PDFs (`tesseract.js`, `eng`+`ben`), real Azure
word-boundary marks via the WebSocket SDK (for word highlighting + exact seek map),
ambient bed audio files, splice-based voice switching (currently full re-synth).
```
