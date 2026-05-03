# Mobile client

This folder contains a React Native client for the Bun audio streamer.

The app uses `react-native-track-player` so Android and iOS can keep playback alive with the screen off.
The UI is intentionally minimal: one button to connect or disconnect, and one button to scan the server QR code.

## Install

```bash
cd mobile
npm install
```

Because this app uses a native background playback service, use a development build or release build instead of Expo Go.

## Run

```bash
npm run start
```

Then open a simulator or create a dev build:

```bash
npm run android
npm run ios
```

## How it connects

- Tap `Connect` to reconnect to the last saved server.
- Tap `Scan QR Code` to scan the Bun server QR code and connect immediately.
- The app converts the scanned or saved base URL into `http://<server>:6767/listen.wav`.
- `index.ts` exposes `/listen.wav`, a live WAV stream derived from the existing WebSocket PCM feed.

## Background playback

- Expo Go cannot run this version of the app because `react-native-track-player` is a native module.
- Build the app once with `npm run android` or `npm run ios`, then use `npm run start` to attach the dev server.
- Android playback is configured to continue with the screen off and to keep the media notification/service alive.
- iOS background audio requires a dev build or release build.
- Android cleartext HTTP is enabled so local-network streams work without HTTPS.
