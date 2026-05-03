import { SystemAudioRecorder } from "native-audio-node";
import type { ServerWebSocket } from "bun";
import { networkInterfaces } from "os";
import qrcode from "qrcode-terminal";

const SAMPLE_RATE = 48000 as const;
const CHANNELS = 2 as const;
const BIT_DEPTH = 16 as const;
const PORT = 6767 as const;

function getLocalIp(): string {
    const interfaces = networkInterfaces();
    for (const name in interfaces) {
        for (const iface of interfaces[name]!) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return "127.0.0.1";
}

function float32ToInt16(data: Buffer): Buffer {
    const float32 = new Float32Array(
        data.buffer,
        data.byteOffset,
        data.byteLength / 4
    );
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
        int16[i] = Math.max(-32768, Math.min(32767, float32[i]! * 32768));
    }
    return Buffer.from(int16.buffer);
}

const recorder = new SystemAudioRecorder({
    sampleRate: SAMPLE_RATE * 2,
    chunkDurationMs: 20,
});

const clients = new Set<ServerWebSocket<unknown>>();

recorder.on("data", ({ data }: { data: Buffer }) => {
    if (clients.size === 0) return;
    const pcm16 = float32ToInt16(data);
    for (const ws of clients) {
        ws.sendBinary(pcm16);
    }
});

await recorder.start();
console.log("Recording started");

Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    fetch(req, server) {
        const url = new URL(req.url);

        if (url.pathname === "/stream") {
            if (server.upgrade(req)) return;
            return new Response("WebSocket upgrade failed", { status: 400 });
        }

        if (url.pathname === "/" || url.pathname === "/index.html") {
            return new Response(Bun.file("index.html"), {
                headers: { "Content-Type": "text/html" },
            });
        }

        return new Response("Not found", { status: 404 });
    },

    websocket: {
        open(ws) {
            clients.add(ws);
            ws.send(JSON.stringify({
                type: "format",
                sampleRate: SAMPLE_RATE,
                channels: CHANNELS,
                bitDepth: BIT_DEPTH,
            }));
            console.log("Client connected, total:", clients.size);
        },
        close(ws) {
            clients.delete(ws);
            console.log("Client disconnected, total:", clients.size);
        },
        message() { },
    },
});

console.log(`Server running at http://localhost:${PORT}`);
const ip = getLocalIp();
qrcode.generate(`http://${ip}:${PORT}`, { small: true });