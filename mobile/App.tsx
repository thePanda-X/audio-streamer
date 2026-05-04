import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { QrCode } from "lucide-react-native";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  type PressableStateCallbackType,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import TrackPlayer, {
  Event,
  State,
  usePlaybackState,
} from "react-native-track-player";
import { ensurePlayerSetup, getTrackForStream, stopPlayback } from "./player";

const STORAGE_KEY = "audio-streamer/mobile-server-url";
const DEFAULT_SERVER_URL = "http://192.168.1.10:6767";

function normalizeServerUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("QR code did not contain a server URL.");
  }

  const withHttp = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed.replace(/^ws/i, "http")
    : `http://${trimmed}`;

  const url = new URL(withHttp);
  return url.origin;
}

function getStreamUrl(serverUrl: string): string {
  return `${normalizeServerUrl(serverUrl)}/listen.wav`;
}

export default function App() {
  const playback = usePlaybackState();
  const [permission, requestPermission] = useCameraPermissions();
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const playerState = playback.state;
  const isConnected =
    streamUrl !== null &&
    playerState !== State.None &&
    playerState !== State.Stopped &&
    playerState !== State.Ended;

  const statusText = useMemo(() => {
    if (lastError) {
      return lastError;
    }

    if (playerState === State.Loading || playerState === State.Buffering || isBusy) {
      return "Connecting...";
    }

    if (isConnected) {
      return `Connected to ${serverUrl}`;
    }

    return serverUrl ? `Ready for ${serverUrl}` : "Ready";
  }, [isBusy, isConnected, lastError, playerState, serverUrl]);

  const startStream = useCallback(
    async (nextServerUrl?: string) => {
      try {
        const normalizedServerUrl = normalizeServerUrl(nextServerUrl ?? serverUrl);
        const nextStreamUrl = getStreamUrl(normalizedServerUrl);

        setIsBusy(true);
        setLastError(null);

        await ensurePlayerSetup();
        await TrackPlayer.reset();
        await TrackPlayer.add(getTrackForStream(nextStreamUrl));
        await TrackPlayer.play();

        setServerUrl(normalizedServerUrl);
        setStreamUrl(nextStreamUrl);
        await AsyncStorage.setItem(STORAGE_KEY, normalizedServerUrl);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not start the live stream.";

        setLastError(message);
        setStreamUrl(null);
        Alert.alert("Stream error", message);
      } finally {
        setIsBusy(false);
      }
    },
    [serverUrl],
  );

  const stopStream = useCallback(async () => {
    try {
      setIsBusy(true);
      setLastError(null);
      await stopPlayback();
      setStreamUrl(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not stop the live stream.";

      setLastError(message);
      Alert.alert("Stop error", message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const openScanner = useCallback(async () => {
    setLastError(null);

    if (!permission?.granted) {
      const result = await requestPermission();

      if (!result.granted) {
        Alert.alert(
          "Camera permission needed",
          "Allow camera access to scan the server QR code.",
        );
        return;
      }
    }

    setHasScanned(false);
    setIsScannerOpen(true);
  }, [permission?.granted, requestPermission]);

  const closeScanner = useCallback(() => {
    setIsScannerOpen(false);
    setHasScanned(false);
  }, []);

  const handleQrScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (hasScanned) {
        return;
      }

      setHasScanned(true);
      setIsScannerOpen(false);

      try {
        await startStream(data);
      } finally {
        setHasScanned(false);
      }
    },
    [hasScanned, startStream],
  );

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const savedUrl = await AsyncStorage.getItem(STORAGE_KEY);
        if (savedUrl && isMounted) {
          setServerUrl(savedUrl);
        }

        await ensurePlayerSetup();
        const activeTrack = await TrackPlayer.getActiveTrack();

        if (isMounted && activeTrack?.url) {
          setStreamUrl(String(activeTrack.url));
        }
      } catch {
        // Keep defaults when setup or restore fails.
      }
    })();

    const errorSubscription = TrackPlayer.addEventListener(
      Event.PlaybackError,
      (event) => {
        setLastError(event.message);
      },
    );

    const trackSubscription = TrackPlayer.addEventListener(
      Event.PlaybackActiveTrackChanged,
      async () => {
        const activeTrack = await TrackPlayer.getActiveTrack();
        setStreamUrl(activeTrack?.url ? String(activeTrack.url) : null);
      },
    );

    return () => {
      isMounted = false;
      errorSubscription.remove();
      trackSubscription.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      <View style={styles.container}>
        <View style={styles.topBar}>
          <View style={styles.topBarSpacer} />
          <Pressable
            disabled={isBusy}
            onPress={() => void openScanner()}
            style={({ pressed }: PressableStateCallbackType) => [
              styles.iconButton,
              (pressed || isBusy) && styles.buttonPressed,
            ]}
          >
            <QrCode color="#eee" size={28} strokeWidth={2.25} />
          </Pressable>
        </View>

        <Text style={styles.title}>Audio Streamer</Text>
        <Text style={styles.status}>{statusText}</Text>

        <Pressable
          disabled={isBusy}
          onPress={isConnected ? stopStream : () => void startStream()}
          style={({ pressed }: PressableStateCallbackType) => [
            styles.button,
            isConnected ? styles.disconnectButton : styles.connectButton,
            (pressed || isBusy) && styles.buttonPressed,
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color="#fffaf1" />
          ) : (
            <Text style={styles.buttonText}>
              {isConnected ? "Disconnect" : "Connect"}
            </Text>
          )}
        </Pressable>
      </View>

      <Modal animationType="slide" transparent visible={isScannerOpen}>
        <View style={styles.modalBackdrop}>
          <View style={styles.scannerCard}>
            <Text style={styles.scannerTitle}>Scan Server QR</Text>

            <View style={styles.cameraFrame}>
              {permission?.granted ? (
                <CameraView
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={hasScanned ? undefined : handleQrScanned}
                  style={StyleSheet.absoluteFillObject}
                />
              ) : (
                <View style={styles.cameraFallback}>
                  <Text style={styles.cameraFallbackText}>Camera permission required</Text>
                </View>
              )}
            </View>

            <Pressable onPress={closeScanner} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#111",
    paddingTop: 20,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    gap: 18,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  topBar: {
    position: "absolute",
    top: 16,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  topBarSpacer: {
    width: 44,
    height: 44,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#222",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#eee",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
  status: {
    color: "#888",
    fontSize: 13,
    lineHeight: 30,
    textAlign: "center",
    marginBottom: 12,
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
  button: {
    minHeight: 88,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#444",
  },
  connectButton: {
    backgroundColor: "#222",
  },
  disconnectButton: {
    backgroundColor: "#333",
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonText: {
    color: "#eee",
    fontSize: 36,
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.88)",
    justifyContent: "center",
    padding: 20,
  },
  scannerCard: {
    gap: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#111",
    padding: 18,
  },
  scannerTitle: {
    color: "#eee",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
  cameraFrame: {
    overflow: "hidden",
    borderRadius: 4,
    aspectRatio: 1,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#000",
  },
  cameraFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  cameraFallbackText: {
    color: "#eee",
    fontSize: 16,
    textAlign: "center",
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
  closeButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#444",
    backgroundColor: "#222",
  },
  closeButtonText: {
    color: "#eee",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Courier", android: "monospace", default: "monospace" }),
  },
});
