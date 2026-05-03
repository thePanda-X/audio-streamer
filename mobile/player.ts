import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  IOSCategory,
} from "react-native-track-player";
import type { AddTrack } from "react-native-track-player";

const LIVE_TRACK_ID = "bun-live-stream";

let setupPromise: Promise<void> | null = null;

export function getTrackForStream(streamUrl: string): AddTrack {
  return {
    id: LIVE_TRACK_ID,
    url: streamUrl,
    title: "Desktop Audio",
    artist: "Bun Stream",
    album: "Live",
    description: "Live system audio from server",
    contentType: "audio/wav",
    isLiveStream: true,
  };
}

export async function ensurePlayerSetup(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      await TrackPlayer.setupPlayer({
        autoHandleInterruptions: true,
        iosCategory: IOSCategory.Playback,
        minBuffer: 15,
        maxBuffer: 60,
        backBuffer: 0,
        playBuffer: 2.5,
      });

      await TrackPlayer.updateOptions({
        android: {
          appKilledPlaybackBehavior:
            AppKilledPlaybackBehavior.ContinuePlayback,
          stopForegroundGracePeriod: 60,
        },
        capabilities: [Capability.Play, Capability.Pause, Capability.Stop],
        compactCapabilities: [Capability.Play, Capability.Pause],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
        ],
        progressUpdateEventInterval: 1,
      });
    })().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }

  await setupPromise;
}

export async function stopPlayback(): Promise<void> {
  await ensurePlayerSetup();
  await TrackPlayer.stop();
  await TrackPlayer.reset();
}
