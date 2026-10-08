import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { loadSettings, storeSettings } from './db';
import type { Settings } from './types';

const Ctx = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void } | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadSettings);
  const update = (patch: Partial<Settings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      storeSettings(next);
      return next;
    });
  useEffect(() => {
    document.documentElement.style.setProperty('--pic', `${settings.pictureSize}px`);
    document.documentElement.style.setProperty('--word', `${settings.fontSize}px`);
  }, [settings.pictureSize, settings.fontSize]);
  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useSettings outside provider');
  return c;
}

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
