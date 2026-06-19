# Language Support Matrix

This document describes the measurement validator's coverage for each language
group, known divergence patterns, and recommended workarounds.

## Language Groups

| Group | Languages | Fixture file | Status |
|-------|-----------|--------------|--------|
| `ltr-simple` | English, Spanish, French, German | `english-samples.json` | ✅ Phase 1 |
| `rtl` | Arabic, Hebrew, Urdu | `rtl-samples.json` | ✅ Phase 2 |
| `cjk` | Chinese (Simplified/Traditional), Japanese, Korean | `cjk-samples.json` | ✅ Phase 2 |
| `complex-script` | Thai, Myanmar, Khmer | `complex-script-samples.json` | ✅ Phase 2 |
| `mixed-bidi` | English + Arabic/Hebrew in same text | `mixed-bidi-samples.json` | ✅ Phase 2 |

---

## LTR Simple (`ltr-simple`)

**Languages:** English, Spanish, French, German (and other Latin-script languages)

**Accuracy target:** ≥ 99 % of lines within 0.5 px

**Known divergences:**

| Divergence | Cause | Impact | Workaround |
|---|---|---|---|
| System font resolution | `system-ui` resolves differently in canvas vs DOM on macOS | Moderate | Use named font (e.g. `Arial`, `Helvetica`) |
| Soft-hyphen visibility | SHY (`\u00AD`) is invisible until chosen as break point | Minor | Expected; Pretext exposes trailing `-` in `line.text` |
| Non-breaking space | NBSP prevents word breaks but may add visual width | Minor | Expected behaviour |

---

## RTL (`rtl`)

**Languages:** Arabic, Hebrew, Urdu, Persian

**Accuracy target:** ≥ 85 % of lines within 1.0 px

**Key considerations:**

- Arabic is a **connected script** — glyphs change shape depending on position in a word
  (initial, medial, final, isolated forms). `canvas.measureText` uses the shaped
  glyph widths when the font is loaded; divergence usually means the font is missing.
- The classifier flags RTL text with `rootCause: 'bidi_shaping'` at confidence 0.85.
- Pretext's `prepareWithSegments()` exposes `segLevels` (bidi embedding levels) for
  custom RTL rendering; `layout()` itself does not read bidi levels.

**Known divergences:**

| Divergence | Cause | Impact |
|---|---|---|
| Arabic ligature width | Some fonts collapse two glyphs into one ligature | Minor |
| Diacritic (harakat) stacking | Zero-width combining marks may add canvas overhead | Minor |
| RTL line direction | DOM aligns text to the right; Pretext reports pixel widths only | N/A |

**Workarounds:**

1. Always preload the target Arabic/Hebrew font — falling back to a system font will
   cause significant divergence.
2. Use `prepareWithSegments()` and inspect `segLevels` to confirm bidi levels.
3. For Urdu (Nastaliq style), use a font that supports the Nastaliq layout engine.

---

## CJK (`cjk`)

**Languages:** Chinese (Simplified), Chinese (Traditional), Japanese, Korean

**Accuracy target:** ≥ 90 % of lines within 0.5 px

**Key considerations:**

- CJK ideographs are normally one grapheme cluster per character and break at every
  character boundary (Pretext uses `Intl.Segmenter` for this).
- Japanese kinsoku rules prohibit certain punctuation at line start/end; Pretext merges
  these into adjacent graphemes.
- `word-break: keep-all` prevents mid-word breaks in CJK; pass `wordBreak: 'keep-all'`
  to `MeasurementSample` to test this mode.
- Full-width punctuation and iteration marks have specific break prohibition rules.

**Known divergences:**

| Divergence | Cause | Impact |
|---|---|---|
| Kinsoku edge cases | Browser may differ from Pretext on rare punctuation combinations | Minor |
| Mixed CJK + Latin kerning | Latin kerning near CJK glyphs varies by font | Minor |
| `word-break: keep-all` | Hangul syllable block break policy varies | Minor |

---

## Complex Scripts (`complex-script`)

**Languages:** Thai, Myanmar, Khmer

**Accuracy target:** ≥ 80 % of lines within 1.0 px

**Key considerations:**

- These scripts do **not** use spaces as word boundaries; line breaking is
  cluster/syllable-based and requires ICU dictionary data.
- Pretext relies on `Intl.Segmenter` which uses the browser's ICU data — this varies
  between Chrome, Firefox, and Safari.
- **Use `Range`-based DOM extraction** for these scripts. Span-based extraction
  can perturb line breaking around cluster boundaries.
- Divergences here are often extractor-sensitive, not algorithm bugs.

**Known divergences:**

| Language | Divergence | Notes |
|---|---|---|
| Thai | Cluster boundary differences between browsers | Chrome ICU ≥ Firefox |
| Myanmar | Medial/glue glyph stacking | Font-dependent |
| Khmer | Zero-width spaces from clean source text | Can be explicit break hints |

**Workarounds:**

1. Use the exact corpus font for measurements.
2. For diagnosis, prefer Range-based extraction over span-based.
3. Accept higher tolerance (1.0 px) for these scripts.

---

## Mixed Bidi (`mixed-bidi`)

**Languages:** Any combination of LTR + RTL in the same string

**Accuracy target:** ≥ 80 % of lines within 1.0 px

**Key considerations:**

- Mixed bidi text requires the Unicode Bidi Algorithm (UBA) to determine visual order.
- Pretext handles bidi at the segment level via `prepareWithSegments().segLevels`.
- The classifier returns `rootCause: 'bidi_shaping'` for any text containing RTL ranges.
- Line-break opportunities in mixed bidi text depend on the resolved bidi levels.

**Known divergences:**

| Divergence | Cause | Impact |
|---|---|---|
| Visual order of neutral characters | Punctuation between LTR and RTL runs | Minor |
| URL / brand names in RTL context | Latin embedded in Arabic paragraph | Minor |
| Number direction | Arabic-Indic vs Western Arabic numerals | Minor |

---

## Browser Compatibility

| Browser | LTR Simple | RTL | CJK | Complex Script | Mixed Bidi |
|---|---|---|---|---|---|
| Chrome (Chromium) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Safari (WebKit) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |
| Firefox (Gecko) | ✅ | ✅ | ✅ | ⚠️ | ⚠️ |

⚠️ = higher tolerance required; see the accuracy checker pages for current per-browser data.

---

## Adding New Languages

1. Add fixture samples to the appropriate JSON file under `test/fixtures/`.
2. Give each sample an `id`, `description`, `languageGroup`, and `language` field.
3. Run the test suite with `bun test test/` to confirm the new samples load.
4. If a new language group is needed, add it to the `LanguageGroup` union in
   `src/measurement-validator/types.ts` and add a corresponding fixture file.
