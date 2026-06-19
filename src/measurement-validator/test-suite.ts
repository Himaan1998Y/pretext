// Multi-language test suite runner — Phase 2.
//
// Loads fixture files for multiple language groups, runs the comparator and
// classifier against each sample, and produces a TestSuiteReport with
// per-language-group statistics.

import type { DOMAdapter } from './dom-adapter.js'
import { compareMeasurements } from './comparator.js'
import { classifyDivergenceSync } from './classifier.js'
import { buildGroupStats } from './report-generator.js'
import type {
  DivergenceAnalysis,
  FixtureSample,
  LanguageGroup,
  MeasurementResult,
  TestSuiteReport,
} from './types.js'

// --- Fixture loading ---

export type FixtureSet = {
  group: LanguageGroup
  samples: FixtureSample[]
}

export function validateFixtureSamples(samples: unknown): FixtureSample[] {
  if (!Array.isArray(samples)) {
    throw new TypeError('Fixture file must contain a JSON array of samples.')
  }
  return samples as FixtureSample[]
}

// --- Suite runner ---

export type TestSuiteOptions = {
  adapter: DOMAdapter
  fixtureSets: FixtureSet[]
  tolerance?: import('./types.js').ToleranceConfig
}

export async function runTestSuite(options: TestSuiteOptions): Promise<TestSuiteReport> {
  const startMs = Date.now()
  const { adapter, fixtureSets, tolerance } = options

  const allResults: MeasurementResult[] = []
  const allDivergences: DivergenceAnalysis[] = []

  for (const fixtureSet of fixtureSets) {
    for (const sample of fixtureSet.samples) {
      const domLines = adapter.measureLines(sample)
  const result = compareMeasurements(sample, domLines, { tolerance })
      allResults.push(result)

      const analysis = classifyDivergenceSync(result)
      allDivergences.push(analysis)
    }
  }

  const totalSamples = allResults.length
  const totalPassed = allResults.filter((r) => r.overallSeverity === 'pass').length

  // Build per-group stats
  const groupMap = new Map<LanguageGroup, MeasurementResult[]>()
  for (const fixtureSet of fixtureSets) {
    const groupResults = allResults.filter(
      (r) => (r.sample as FixtureSample).languageGroup === fixtureSet.group,
    )
    groupMap.set(fixtureSet.group, groupResults)
  }

  const byLanguageGroup = [...groupMap.entries()].map(([group, results]) =>
    buildGroupStats(group, results),
  )

  return {
    totalSamples,
    totalPassed,
    overallPassRate: totalSamples > 0 ? totalPassed / totalSamples : 1,
    byLanguageGroup,
    results: allResults,
    divergences: allDivergences,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startMs,
  }
}

// --- Subset helpers ---

export function filterByGroup(
  samples: FixtureSample[],
  group: LanguageGroup,
): FixtureSample[] {
  return samples.filter((s) => s.languageGroup === group)
}

export function groupSamplesByLanguage(
  samples: FixtureSample[],
): Map<LanguageGroup, FixtureSample[]> {
  const map = new Map<LanguageGroup, FixtureSample[]>()
  for (const sample of samples) {
    const list = map.get(sample.languageGroup) ?? []
    list.push(sample)
    map.set(sample.languageGroup, list)
  }
  return map
}
