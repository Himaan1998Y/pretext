/**
 * Multi-language Test Suite Runner
 */

import type { MeasurementSample, MeasurementResult } from './types.js'
import type { PretextLayoutResult } from './comparator.js'
import { MeasurementComparator } from './comparator.js'
import { generateConsoleSummary } from './report-generator.js'

export interface CorpusSample extends MeasurementSample {
  id: string
}

export interface TestSuiteSummary {
  total: number
  passed: number
  warned: number
  errored: number
  critical: number
  passRate: number
}

/** Optional callback that provides Pretext layout for a given sample. */
export type LayoutProvider = (sample: MeasurementSample) => PretextLayoutResult

export class TestSuite {
  private samples: CorpusSample[] = []
  private comparator = new MeasurementComparator()
  private layoutProvider: LayoutProvider

  /**
   * @param layoutProvider - Optional function that produces Pretext layout for
   *   a sample. When omitted all Pretext widths default to 0 (DOM-only mode).
   */
  constructor(layoutProvider?: LayoutProvider) {
    this.layoutProvider = layoutProvider ?? (() => ({}))
  }

  async load(corpusPath: string): Promise<void> {
    const response = await fetch(corpusPath)
    const json: unknown = await response.json()
    this.samples = json as CorpusSample[]
  }

  loadFromArray(samples: CorpusSample[]): void {
    this.samples = samples
  }

  async run(): Promise<MeasurementResult[]> {
    const results: MeasurementResult[] = []
    for (const sample of this.samples) {
      const pretextLayout = this.layoutProvider(sample)
      const result = await this.comparator.compare(sample, pretextLayout)
      results.push(result)
    }
    return results
  }

  summarize(results: MeasurementResult[]): TestSuiteSummary {
    const total = results.length
    const passed = results.filter((r) => r.overallSeverity === 'pass').length
    const warned = results.filter((r) => r.overallSeverity === 'warning').length
    const errored = results.filter((r) => r.overallSeverity === 'error').length
    const critical = results.filter((r) => r.overallSeverity === 'critical').length
    const passRate = total > 0 ? passed / total : 0
    return { total, passed, warned, errored, critical, passRate }
  }

  async runByLanguage(languageGroup: string): Promise<MeasurementResult[]> {
    const filtered = this.samples.filter((s) => s.id.startsWith(languageGroup))
    const results: MeasurementResult[] = []
    for (const sample of filtered) {
      const pretextLayout = this.layoutProvider(sample)
      const result = await this.comparator.compare(sample, pretextLayout)
      results.push(result)
    }
    return results
  }

  report(results: MeasurementResult[]): string {
    return generateConsoleSummary(results)
  }
}
