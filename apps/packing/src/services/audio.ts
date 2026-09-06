// @ts-ignore
import { AudioFeedback } from '@shared-core';

export const audio = {
  success: () => AudioFeedback.playSuccess(),
  error: () => AudioFeedback.playError(),
  shutter: () => AudioFeedback.playShutter(),
  toggle: () => AudioFeedback.toggleAudio(),
  isEnabled: () => AudioFeedback.isAudioEnabled()
};
