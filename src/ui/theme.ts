// Colours copied from the web app (apps/web/src/styles.css) so the app looks the same.
// Peacock (morpankh) palette: deep teal, sapphire, emerald, with a touch of gold and plum.
export const colors = {
  brand: '#0b6e7f',
  brand2: '#0e8f7a',
  brandInk: '#ffffff',
  brandSoft: 'rgba(11, 110, 127, 0.14)',
  ink: '#0b1f2a',
  muted: '#4a6068',
  danger: '#b4232a',
  warn: '#8a5500',
  ok: '#176b3a',
  info: '#1f5fa6',
  bg: '#eaf3f4',
  card: '#f5fafa',
  line: 'rgba(11, 31, 42, 0.14)',
  deep: '#073b4c',
  sapphire: '#1565a8',
  plum: '#5b3a8c',
  gold: '#d4a84b',
};
export const radius = 14;

/** A touch stronger than `line`, for the edge of inputs so they read as fields. */
export const lineStrong = 'rgba(11, 31, 42, 0.22)';

// Soft, tinted shadows (deep teal, never pure black) so cards lift a little off the page.
export const shadow = {
  card: {
    shadowColor: '#073b4c',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#073b4c',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
} as const;

/** The shared look of a content card. Padding and gap stay with each screen. */
export const surface = {
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
} as const;

/** Chips are pills. */
export const pill = 999;

/** What a pressed control looks like: a little lighter, no layout shift. */
export const pressedOpacity = 0.82;
