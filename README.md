# audio-streamer

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.10. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Mobile client

A React Native client lives in `mobile/`.

- The Bun server now also exposes `http://<server>:6767/listen.wav` for native audio playback.
- The mobile app uses that endpoint so playback can continue while the app is backgrounded.
- See `mobile/README.md` for install and run steps.
