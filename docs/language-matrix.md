# Language Support Matrix

The measurement validator ships with test fixtures covering 20+ languages across five scripts categories.

## Supported Languages

| Language      | Script      | Fixture File                  | Known Issues |
|---------------|-------------|-------------------------------|--------------|
| English       | Latin       | `english-samples.json`        | None         |
| Arabic        | Arabic      | `rtl-samples.json`            | Bidi shaping may differ between canvas and DOM |
| Hebrew        | Hebrew      | `rtl-samples.json`            | Bidi shaping |
| Urdu          | Arabic      | `rtl-samples.json`            | Naskh/Nastaliq glyph joining |
| Chinese       | CJK         | `cjk-samples.json`            | Full-width glyph width variation |
| Japanese      | CJK/Kana    | `cjk-samples.json`            | Kana iteration marks |
| Korean        | Hangul      | `cjk-samples.json`            | None         |
| Thai          | Thai        | `complex-script-samples.json` | No inter-word spaces; line-break is content-dependent |
| Myanmar       | Myanmar     | `complex-script-samples.json` | Medial consonant stacking |
| Khmer         | Khmer       | `complex-script-samples.json` | Zero-width separators in source text |
| Hindi         | Devanagari  | `complex-script-samples.json` | Conjunct consonants |
| Mixed EN+AR   | Latin+Arabic| `mixed-bidi-samples.json`     | Bidi embedding |
| Mixed EN+HE   | Latin+Hebrew| `mixed-bidi-samples.json`     | Bidi embedding |

## Fixture Summary

| File                           | Samples | Languages |
|--------------------------------|---------|-----------|
| `english-samples.json`         | 10      | English   |
| `rtl-samples.json`             | 5       | Arabic, Hebrew, Urdu |
| `cjk-samples.json`             | 5       | Chinese, Japanese, Korean |
| `complex-script-samples.json`  | 5       | Thai, Myanmar, Khmer, Hindi |
| `mixed-bidi-samples.json`      | 4       | English+Arabic, English+Hebrew |
| **Total**                      | **29**  | **13+ languages** |

## Adding a New Language

1. Add fixture entries to the appropriate JSON file (or create a new one in `test/fixtures/`).
2. Each entry requires `id`, `text`, `font`, `maxWidth`; `lineHeight` is optional.
3. Run `bun test test/classifier.test.ts` to verify detection behaviour.

## Known Limitations

- **Font availability**: Fixtures use generic system fonts (`Arial`, `Georgia`, etc.). Rare-script fonts may not be installed on all systems, causing `font_fallback` divergence.
- **Bidi shaping**: Canvas `measureText` does not apply full Unicode bidirectional shaping. RTL samples will typically show divergence until Pretext ships bidi-aware measurement.
- **Complex scripts**: Thai, Myanmar, and Khmer use contextual glyph shaping that is not reproduced by canvas `measureText`. Expect major/critical divergence on complex-script samples.
- **Emoji**: Emoji widths vary by OS, browser, and emoji version. The `emoji_rendering` classifier will flag these samples.
