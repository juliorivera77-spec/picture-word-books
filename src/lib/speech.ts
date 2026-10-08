// Read-aloud uses the device's built-in voices, which work offline on most phones and tablets.
export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function voices(): SpeechSynthesisVoice[] {
  if (!canSpeak) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
}

export function speak(
  text: string,
  opts: { voiceURI?: string; rate?: number; onBoundary?: (charIndex: number) => void; onEnd?: () => void } = {},
) {
  if (!canSpeak) {
    opts.onEnd?.();
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const all = voices();
  // Prefer the chosen voice, then an on-device voice (works without internet).
  const v = all.find((x) => x.voiceURI === opts.voiceURI) ?? all.find((x) => x.localService) ?? all[0];
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else u.lang = 'en-US';
  u.rate = opts.rate ?? 0.85;
  if (opts.onBoundary) u.onboundary = (e) => e.name === 'word' && opts.onBoundary!(e.charIndex);
  u.onend = () => opts.onEnd?.();
  u.onerror = () => opts.onEnd?.();
  speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (canSpeak) speechSynthesis.cancel();
}
