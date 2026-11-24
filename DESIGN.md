# Eve's Lily EPK: Design Direction

## Design Read

Reading this as: Band Electronic Press Kit (EPK) and built-in GitHub content studio for festival bookers, event promoters, media, and fans of Eve's Lily (Banjarmasin, Kalimantan Selatan), in a celestial-nocturne editorial style themed around the upcoming single "Perayaan Bintang Jatuh", dial **ENERGY 3 / RHYTHM 3 / MOTION 2**.

## Identity & Mood

Eve's Lily blends alternative pop with J-Pop sensibilities. The visual direction evolves their high-contrast black-and-white Canva EPK into a sharper, editorial night-sky aesthetic inspired by their upcoming single, **"Perayaan Bintang Jatuh"** (Celebration of Falling Stars):

- Deep midnight observatory indigo-black (`#060813`) replaces flat black so the page feels like an open night sky rather than a generic dark template.
- Warm starlight paper (`#F5F3EE`) replaces harsh pure white on Discography and Schedule bands, evoking a printed J-Pop CD lyric booklet while making colorful anime-style cover art pop with clarity.
- One deliberate meteor-gold accent (`#F2C97D` on dark, `#7D500B` on paper) marks shooting stars, active navigation states, and key booking/listening actions.
- Identity motif: Eve's Lily's authentic 6-petal circular lily emblem paired with subtle celestial hairline rules and a crisp 4-point star marker reserved strictly as the band's era motif.

## Color System (Verified WCAG AA via contrast-check.py)

Active palette: 2 core color families (Cosmos Midnight + Starlight Paper) + 1 deliberate accent (Meteor Gold).

| Token | Hex | Role | Verified Contrast |
|---|---|---|---|
| `--bg-cosmos` | `#060813` | Primary dark sky canvas | Base |
| `--bg-cosmos-elevated` | `#0F1426` | Elevated panels, modals, admin workspace | Base |
| `--bg-cosmos-nebula` | `#151D38` | Subtle radial zenith sky tint (Hero & Contact only) | Base |
| `--bg-paper` | `#F5F3EE` | Editorial light contrast sections (Discography, Schedule) | Base |
| `--bg-paper-card` | `#FFFFFF` | Release tiles & surfaces on starlight paper | Base |
| `--ink-on-dark` | `#F4F5F8` | Primary text on dark | 18.31:1 on `#060813`, 16.77:1 on `#0F1426` |
| `--ink-muted-dark` | `#A9B4CC` | Secondary metadata on dark | 9.59:1 on `#060813`, 8.78:1 on `#0F1426` |
| `--ink-on-light` | `#0D1120` | Primary text on starlight paper | 16.94:1 on `#F5F3EE`, 18.78:1 on `#FFFFFF` |
| `--ink-muted-light` | `#444D63` | Secondary metadata on starlight paper | 7.61:1 on `#F5F3EE`, 8.44:1 on `#FFFFFF` |
| `--accent-gold` | `#F2C97D` | Meteor-gold accent on dark surfaces | 12.76:1 on `#060813`, 12.30:1 with `#0B0E1A` text |
| `--accent-gold-ink` | `#7D500B` | Burnished gold accent on paper surfaces | 6.26:1 on `#F5F3EE`, 6.94:1 on `#FFFFFF` |
| `--border-interactive-dark` | `#6E7B9C` | Control & input borders on dark | 4.73:1 on `#060813`, 4.33:1 on `#0F1426` (passes 3:1 UI) |
| `--border-interactive-light` | `#5D657A` | Control & input borders on paper | 5.25:1 on `#F5F3EE` (passes 3:1 UI) |
| `--status-ok` | `#7BE0AD` | Admin save/sync success text & icon | 11.41:1 on `#0F1426` |
| `--status-err` | `#FF8A8A` | Admin validation/error text & icon | 8.06:1 on `#0F1426` |

## Typography (R-06)

- **Display (`Italiana`, serif)**: Ultra-thin high-contrast serif for monumental section titles (`DISCOGRAPHY`, `PRESS PHOTOS`, `BIOGRAPHY`, `SCHEDULE`, `VIDEO`, `CONTACT`), carrying forward Eve's Lily's signature Art Deco editorial character from their original EPK.
- **Editorial Serif (`Cormorant Garamond`, italic & regular)**: Used for the opening lyric quote and band name philosophy epigraph, giving musical lyricism a distinct voice from prose.
- **Body & Interface (`Plus Jakarta Sans`, sans-serif)**: Warm geometric humanist sans designed for crisp readability across Indonesian biographical prose, dense 37-row show schedules, and admin studio forms.

## Layout & Rhythm Decisions (R-05, R-14, R-31)

- **Hero**: Full-bleed night sky framing Eve's Lily's studio portrait (`fetchpriority="high"`), overlaid circular lily emblem, lyric quote, and subtle era note for *"Perayaan Bintang Jatuh"*.
- **Band Profile**: Asymmetric 5:7 split pairing the organic-edge band photo with synchronized biographical facts (no generic card grid).
- **Discography (Starlight Paper)**: Featured latest release (*Langit pun Bernyanyi*) paired with an integrated Spotify player and DSP links, followed by a filterable catalog where the *BERAWAL* EP spans wider to present its full 6-track list with visual hierarchy.
- **Press Photos Preview (Cosmos)**: Asymmetric 1-feature + 2-stacked editorial photo layout with click-to-enlarge lightbox and direct Instagram links.
- **Guestings & Shows Preview (Starlight Paper)**: Clean typographic ledger divided by crisp horizontal rules (no repetitive cards), showing upcoming shows first (if any) followed by recent highlights.
- **Video Showcase (Cosmos)**: 1 wide featured performance clip above 2 side-by-side clips; clicking loads a native YouTube player inside an accessible modal (zero blocking third-party iframes on initial load).
- **Contact & Booking Finale**: Full-bleed band lily-shirt photo with an 82% dark cosmos scrim ensuring >10:1 text contrast everywhere, paired with clickable WhatsApp, Email, 1-click Copy Booking Info, and social links.
- **Admin Editor (`/admin.html`)**: Focused section-based content studio (Hero & Bio, Discography, Press Photos, Schedule, Videos, Members, Contact & GitHub Sync) with live local preview, image upload to GitHub repo, JSON export/import, and zero decorative stat cards.

## Motion & Accessibility (R-19, R-32, R-39, R-40)

- **Shooting Star Sky Canvas**: Runs exclusively in the Hero (and subtle static starfield in Contact) to express *"Perayaan Bintang Jatuh"*. Includes an explicit **Pause/Play Sky** toggle (`aria-pressed`) because animation exceeds 5 seconds, and freezes automatically under `prefers-reduced-motion: reduce`.
- **Scroll Reveal**: Single-pass subtle rise (`14px`) via `IntersectionObserver`, disabled when `prefers-reduced-motion: reduce` is set.
- **Radius Discipline (R-11)**: Sharp editorial corners (`2px`–`4px`) for photographic frames, cards, and inputs; rounded `999px` pill geometry reserved deliberately for primary editorial action buttons and filter chips so controls stand apart from content frames.
- **Shadows & Glass (R-10, R-12, R-13)**: Flat surfaces by default; subtle backdrop blur (`backdrop-filter`) used on at most 1 element (sticky top navigation bar on scroll); shadow reserved strictly for open modals/lightbox and toast notifications. Zero neon glow spam.
