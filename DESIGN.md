# Eve's Lily EPK: Design Direction (Perayaan Bintang Jatuh Edition)

## Design Read

Reading this as: Band Electronic Press Kit (EPK) and built-in GitHub content studio for festival bookers, event promoters, media, and fans of Eve's Lily (Banjarmasin, Kalimantan Selatan), in a celestial-nocturne editorial style adapted directly from the official cover artwork of their upcoming single **"Perayaan Bintang Jatuh"**, dial **ENERGY 3 / RHYTHM 3 / MOTION 2**.

## Palette Provenance (R-01, R-25, R-29)

Every color is derived directly from Eve's Lily's official *"Perayaan Bintang Jatuh"* single illustration (cobalt night sky, luminous cyan Milky Way & comet core, rose-pink comet tail, crisp starlight white), verified via `contrast-check.py`:

| Token | Hex | Role | Verified Contrast |
|---|---|---|---|
| `--bg-cosmos` | `#040A1E` | Deep cobalt cosmos night ground | Base |
| `--bg-cosmos-elevated` | `#0A1638` | Elevated twilight indigo panels, modals, admin | Base |
| `--bg-cosmos-nebula` | `#102863` | Royal cobalt sky zenith (Hero & Contact) | Base |
| `--bg-paper` | `#EEF4FC` | Cool starlight paper (Discography & Schedule) | Base |
| `--bg-paper-card` | `#FFFFFF` | Release cards & elevated light surfaces | Base |
| `--ink-on-dark` | `#F2F7FF` | Primary starlight text on dark | 18.29:1 on `#040A1E`, 16.48:1 on `#0A1638` |
| `--ink-muted-dark` | `#A8C2E6` | Secondary metadata on dark | 10.80:1 on `#040A1E`, 9.73:1 on `#0A1638` |
| `--ink-on-light` | `#0A1533` | Primary midnight text on paper | 16.25:1 on `#EEF4FC`, 17.98:1 on `#FFFFFF` |
| `--ink-muted-light` | `#3B4E73` | Secondary metadata on paper | 7.52:1 on `#EEF4FC`, 8.32:1 on `#FFFFFF` |
| `--accent-comet` | `#6FD8FF` | Luminous comet sky-cyan accent on dark | 12.13:1 on `#040A1E`, 12.13:1 with `#040A1E` ink |
| `--accent-cobalt-on-light` | `#0C4DA2` | Deep cobalt accent on starlight paper | 7.30:1 on `#EEF4FC`, 8.08:1 on `#FFFFFF` |
| `--accent-rose` | `#F5A4D8` | Comet-tail rose accent (meteor trails & upcoming motif on dark) | 10.48:1 on `#040A1E`, 9.44:1 on `#0A1638` |
| `--accent-rose-on-light` | `#992970` | Deep comet-rose label on starlight paper | 6.53:1 on `#EEF4FC`, 7.23:1 on `#FFFFFF` |
| `--border-dark` | `#6C8AC4` | Interactive borders on dark | 5.69:1 on `#040A1E`, 5.12:1 on `#0A1638` |
| `--border-light` | `#4E638C` | Interactive borders on light paper | 5.44:1 on `#EEF4FC` |
| `--status-ok` | `#7BE0AD` | Admin success feedback | 11.06:1 on `#0A1638` |
| `--status-err` | `#FF94A8` | Admin error feedback | 8.49:1 on `#0A1638` |

## Typography (R-06)

- **Display (`Italiana`, serif)**: Monumental Art Deco condensed serif for section headings, continuing Eve's Lily's established EPK editorial voice without subtitles cluttering beneath headings.
- **Editorial Serif (`Cormorant Garamond`, italic & regular)**: Opening lyric quote and biographical headings.
- **Body & UI (`Plus Jakarta Sans`, sans-serif)**: Clean humanist sans for Indonesian prose, 37-row schedules, and admin editor forms.

## Brand Asset Rules (Owner-Specified)

- **Header**: Official Eve's Lily circular lily icon (`lily-icon-only.png`) paired with official Eve's Lily wordmark lettering (`wordmark-text-only.png`).
- **Hero**: Clean cosmos portrait with full circular emblem + wordmark (`logo-emblem-wordmark.png`) and lyric quote. No top era ribbon or sky pause button.
- **Discography**: Upcoming single *"Perayaan Bintang Jatuh"* appears directly inside Discography with pre-blurred teaser cover art; released singles/EP offer icon-only `44x44px` DSP buttons for Spotify, Apple Music, and YouTube Music (`aria-label` + `title`).
- **The Meaning of Eve's Lily**: Official circular lily icon without text (`lily-icon-only.png`) and without caption text beneath it.
- **Members**: No numeric `01 / LINEUP` index labels; per-member `object-position` (`50% 56%` on Yusee matching Canva's exact bass framing).
- **Contact**: Clearly visible seated band lily-shirt backdrop (`opacity: 0.78` with balanced cobalt scrim while keeping info panels >10:1 contrast) and text-only Eve's Lily wordmark (`wordmark-text-only.png`) at bottom center.
- **Public Footer & Mobile Drawer**: Strictly public navigation only (`Home`, `Press Photos`, `Biography`, `Schedule`); `/admin.html` is accessed directly by band admins without a public footer link.

## Owner Override Record (R-37)

- **R-39 >5s Motion Pause Control**: Owner explicitly requested removing the visible `"Jeda langit bintang"` button from the Hero sky canvas. Recorded as an explicit owner override under R-37; OS-level `@media (prefers-reduced-motion: reduce)` remains fully enforced to stop all falling-star motion for users who request reduced motion.
