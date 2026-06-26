# Audio assets

Drop the Pixabay files here with these EXACT names (served at `/audio/...`):

| File | Used by | Notes |
|---|---|---|
| `confirm.mp3` | `playConfirm()` in `src/lib/sound.ts` — the "enter section" / confirm sound | Keep it short (<1s). Until present, confirm falls back to the synth ping. |
| `music.mp3` | Background music loop in `src/lib/music.ts` | A longer track; it loops seamlessly. Plays at 35% volume, starts on first tap, default ON (toggle in Settings → Sound → Background Music). |

MP3 is required (Safari/iOS don't support ogg). The Pixabay license is
royalty-free, commercial-OK, no attribution required.

To change which sound a button uses, or the music volume, edit
`src/lib/sound.ts` / `src/lib/music.ts` — call sites don't change.
