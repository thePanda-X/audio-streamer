# audio-streamer

Local system-audio -> network audio streamer (experiment).

This is a small experiment I built because I don't have Bluetooth on my computer and wanted to stream system audio to other devices on my local network. It's not production-quality code — just something I wanted to share.

Summary

- Server: Bun + native-audio-node captures system audio and exposes two ways to consume it:
  - a WebSocket PCM feed at `/stream` (used by the bundled browser client), and
  - a continuous WAV HTTP stream at `/listen.wav` (used by the mobile client for native playback).
- Port: 6767 (prints a QR code with the local IP on start).

Quick start

Requirements:

- Bun installed (https://bun.sh). The server uses Bun APIs (Bun.serve).
- A system that can provide audio capture (the repo uses `native-audio-node`).

Install and run the server:

```bash
bun install
bun run index.ts
```

Open http://localhost:6767 in a browser on the same machine and click "Start Listening" to test the WebSocket client.

How it works (high level)

- `index.ts` creates a `SystemAudioRecorder` that captures system audio as float32 samples.
- Captured audio is converted to signed 16-bit PCM and pushed to connected WebSocket clients and any HTTP `listen.wav` clients.
- The WebSocket endpoint (`/stream`) first sends a small JSON message describing the stream format, then sends raw Int16 PCM binary chunks (interleaved channels).
- The HTTP endpoint (`/listen.wav`) sends a WAV header followed by the same PCM chunks so native players can play the stream continuously.

Endpoints

- `GET /` serves a minimal browser client (`index.html`) that connects to `ws://<server>/stream` and plays the audio via WebAudio.
- `GET /listen.wav` returns a streaming WAV response (Content-Type: `audio/wav`).
- `WS /stream` accepts WebSocket upgrades. First message (text) is a JSON format descriptor: e.g. `{ "type": "format", "sampleRate": 48000, "channels": 2, "bitDepth": 16 }`. Subsequent messages are binary Int16 PCM chunks (little-endian, interleaved channels).

Mobile client

A simple React Native client lives in `mobile/`. It converts a scanned/saved server URL into `http://<server>:6767/listen.wav` and uses `react-native-track-player` so playback can continue while the app is backgrounded. See `mobile/README.md` for install and run steps.

Files of interest

- `index.ts` — Bun server and audio capture logic.
- `index.html` — tiny browser WebSocket client for quick testing.
- `mobile/` — React Native client (Expo + react-native-track-player).
- `file-recording-experiment.ts` — helper that records a short WAV file to disk (useful when experimenting).

Security / privacy

- This tool captures system audio and streams it over the local network. Do not run it on untrusted networks or when sensitive audio may be present.
- There is no authentication or TLS. The server is intended for local network experimentation only.

Troubleshooting

- If you don't hear audio on a client, make sure the server and client are on the same LAN and that firewalls are not blocking port 6767.
- The project depends on `native-audio-node`; prebuilt native binaries may be available for common platforms. If capture fails, check that the native module loaded correctly.
- Mobile builds require a development/release build (Expo Go won't work with the native background playback module).

Acknowledgements

- Built with Bun (https://bun.sh).
- Audio capture via `native-audio-node`.
- QR codes via `qrcode-terminal`.

Notes from the author

This is a quick, personal experiment — not a polished or secure product. Use at your own risk. If you find this useful or want to improve it, feel free to open a PR or an issue.
