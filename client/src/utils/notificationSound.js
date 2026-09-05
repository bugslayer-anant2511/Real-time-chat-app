import { NOTIFICATION_SOUND_URL } from './constants.js';

let audioInstance = null;

const getAudio = () => {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  if (!audioInstance) {
    audioInstance = new Audio(NOTIFICATION_SOUND_URL);
    audioInstance.preload = 'auto';
    audioInstance.volume = 0.5;
  }
  return audioInstance;
};

export const playNotificationSound = () => {
  const audio = getAudio();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const result = audio.play();
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        // Autoplay blocked
      });
    }
  } catch {
    // Synchronously thrown exception
  }
};
