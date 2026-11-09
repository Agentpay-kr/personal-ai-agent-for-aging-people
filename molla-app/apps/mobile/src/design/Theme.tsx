import React, { createContext, useContext, useEffect, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { palettes } from './tokens';

type Mode = 'system' | 'light' | 'dark';
const ThemeContext = createContext({ colors: palettes.light, dark: false, reducedMotion: false, editorial: false, mode: 'system' as Mode, setMode: (_: Mode) => {} });

export function ThemeProvider({ children, editorial }: { children: React.ReactNode; editorial: boolean }) {
  const system = useColorScheme();
  const [mode, setMode] = useState<Mode>('light');
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (mounted) setReducedMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted = false; subscription.remove(); };
  }, []);
  const dark = mode === 'dark' || (mode === 'system' && system === 'dark');
  return <ThemeContext.Provider value={{ colors: dark ? palettes.dark : palettes.light, dark, reducedMotion, editorial, mode, setMode }}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
