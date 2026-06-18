// Test fixtures covering a variety of English language patterns.
// These are used by the validator CLI and unit tests.

import type { MeasurementSample } from './types.js'

const FONT = '16px sans-serif'
const LINE_HEIGHT = 20
const MAX_WIDTH = 320

/** 15 durable English test fixtures. */
export const englishFixtures: MeasurementSample[] = [
  {
    label: 'en-short-word',
    text: 'Hello world',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-long-sentence',
    text: 'The quick brown fox jumps over the lazy dog near the river bank.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-narrow-width',
    text: 'Typography matters in every application.',
    font: FONT,
    maxWidth: 120,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-wide-width',
    text: 'Wide containers rarely wrap short text like this.',
    font: FONT,
    maxWidth: 800,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-multiple-sentences',
    text: 'First sentence here. Second sentence follows. Third sentence ends the paragraph.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-long-word',
    text: 'Supercalifragilisticexpialidocious is a famously long word.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-punctuation',
    text: 'Wait — really? Yes, absolutely. (Or maybe not.)',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-numbers',
    text: 'Version 3.14 was released on 2024-01-15 at 09:30 AM.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-url',
    text: 'Visit https://example.com/path?query=value for more details.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-caps',
    text: 'ALL CAPS TEXT CAN APPEAR IN HEADINGS AND LABELS.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-mixed-case',
    text: 'JavaScript, TypeScript, WebAssembly, and CSS are web technologies.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-emoji',
    text: 'Great work today 🎉 Keep it up! 🚀',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
  {
    label: 'en-small-font',
    text: 'Smaller font sizes are common in secondary text and captions.',
    font: '12px sans-serif',
    maxWidth: MAX_WIDTH,
    lineHeight: 16,
  },
  {
    label: 'en-large-font',
    text: 'Large display headings are typically short.',
    font: '32px sans-serif',
    maxWidth: MAX_WIDTH,
    lineHeight: 40,
  },
  {
    label: 'en-whitespace-runs',
    text: 'Leading and trailing spaces   and  internal  gaps.',
    font: FONT,
    maxWidth: MAX_WIDTH,
    lineHeight: LINE_HEIGHT,
  },
]

/** All built-in fixtures, indexed by language tag. */
export const fixtures: Record<string, MeasurementSample[]> = {
  en: englishFixtures,
}
