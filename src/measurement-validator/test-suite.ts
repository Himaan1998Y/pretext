/**
 * Multi-language Test Suite Runner
 */

import type { MeasurementSample, MeasurementResult } from './types.js'
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

export class TestSuite {
  private samples: CorpusSample[] = []
  private comparator = new MeasurementComparator()

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
      const result = await this.comparator.compare(sample, {})
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
      const result = await this.comparator.compare(sample, {})
      results.push(result)
    }
    return results
  }

  report(results: MeasurementResult[]): string {
    return generateConsoleSummary(results)
  }
}
