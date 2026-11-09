export const palettes = {
  light: {
    canvas: '#FFFFFF', surface: '#FFFFFF', ink: '#181818', muted: '#686868',
    quiet: '#F4F4F4', action: '#181818', onAction: '#FFFFFF',
    accent: '#FFE24A', accentInk: '#181818', success: '#386349',
    danger: '#AF3030', line: '#EAEAEA', scrim: '#18181855',
  },
  dark: {
    canvas: '#171717', surface: '#222222', ink: '#FAFAFA', muted: '#B5B5B5',
    quiet: '#2B2B2B', action: '#FFE24A', onAction: '#181818',
    accent: '#FFE24A', accentInk: '#181818', success: '#A9CFAD',
    danger: '#FFB1AC', line: '#393939', scrim: '#00000099',
  },
};
export type Palette = typeof palettes.light;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, gutter: 24, section: 32, large: 40, huge: 48 };
export const radius = { control: 28, message: 24, sheet: 28, pill: 999 };
export const motion = { press: 100, enter: 260, spring: { stiffness: 180, damping: 22, mass: 1 } };
export const type = {
  display: { fontSize: 28, lineHeight: 38, fontWeight: '700' as const, letterSpacing: -0.7 },
  title: { fontSize: 24, lineHeight: 34, fontWeight: '700' as const, letterSpacing: -0.6 },
  body: { fontSize: 17, lineHeight: 27 },
  action: { fontSize: 16, lineHeight: 24, fontWeight: '600' as const },
  caption: { fontSize: 14, lineHeight: 21 },
  nav: { fontSize: 12, lineHeight: 18, fontWeight: '600' as const },
};
