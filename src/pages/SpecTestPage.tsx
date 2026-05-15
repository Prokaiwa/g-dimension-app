import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { FONT_UI, COLOR_ACCENT } from '../tokens'

type Result = {
  category: string
  name: string
  status: 'pass' | 'fail'
  specCount: number
  error?: string
  stage?: string
}

function parseOptions(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as string[]
  try { return JSON.parse(raw as string) as string[] } catch { return [] }
}

function dummyValue(inputType: string, options: string[]): string | null {
  switch (inputType) {
    case 'text':        return 'test'
    case 'number':      return '42'
    case 'boolean':     return 'true'
    case 'date':        return '2024-01-01'
    case 'select':      return options[0] ?? null
    case 'multiselect': return options.length ? JSON.stringify([options[0]]) : null
    default:            return null
  }
}

export default function SpecTestPage() {
  const navigate = useNavigate()
  const [running, setRunning]   = useState(false)
  const [results, setResults]   = useState<Result[]>([])
  const [summary, setSummary]   = useState<{ passed: number; failed: number; total: number } | null>(null)
  const [status, setStatus]     = useState('')

  async function runTests() {
    setRunning(true)
    setResults([])
    setSummary(null)

    // Get a car to attach test jobs to
    setStatus('Loading car...')
    const { data: cars } = await supabase.from('cars').select('id, nickname').limit(1)
    if (!cars?.length) {
      setStatus('No cars found on this account.')
      setRunning(false)
      return
    }
    const car = cars[0]

    // Load all active part types
    setStatus('Loading part types...')
    const { data: partTypes, error: ptErr } = await supabase
      .from('part_types')
      .select('id, name, category')
      .eq('is_active', true)
      .order('category')
      .order('display_order')

    if (ptErr || !partTypes?.length) {
      setStatus('Failed to load part types: ' + ptErr?.message)
      setRunning(false)
      return
    }

    const allResults: Result[] = []
    let passed = 0
    let failed = 0

    for (const pt of partTypes) {
      setStatus(`Testing ${pt.category} › ${pt.name}...`)

      // Load spec templates
      const { data: templates } = await supabase
        .from('spec_templates')
        .select('spec_key, input_type, options, unit')
        .eq('part_type_id', pt.id)
        .order('display_order')

      // Build spec rows
      const specRows: { spec_key: string; spec_value: string; spec_unit: string | null }[] = []
      for (const t of templates ?? []) {
        const opts = parseOptions(t.options)
        const val  = dummyValue(t.input_type, opts)
        if (val !== null) specRows.push({ spec_key: t.spec_key, spec_value: val, spec_unit: t.unit ?? null })
      }

      // Insert test job
      const { data: job, error: jobErr } = await supabase
        .from('jobs')
        .insert({
          car_id:       car.id,
          type:         'modification',
          category:     pt.category,
          title:        `[TEST] ${pt.name}`,
          status:       'installed',
          part_type_id: pt.id,
          installed_by: 'self',
          parts_cost:   '0',
        })
        .select('id')
        .single()

      if (jobErr) {
        failed++
        allResults.push({ category: pt.category, name: pt.name, status: 'fail', specCount: 0, stage: 'job insert', error: jobErr.message })
        setResults([...allResults])
        continue
      }

      // Insert specs
      let specErr: { message: string } | null = null
      if (specRows.length > 0) {
        const res = await supabase
          .from('job_specs')
          .insert(specRows.map(r => ({ job_id: job.id, ...r })))
        specErr = res.error
      }

      if (specErr) {
        failed++
        allResults.push({ category: pt.category, name: pt.name, status: 'fail', specCount: specRows.length, stage: 'spec insert', error: specErr.message })
        setResults([...allResults])
        await supabase.from('jobs').delete().eq('id', job.id)
        continue
      }

      // Verify count
      const { data: saved } = await supabase.from('job_specs').select('spec_key').eq('job_id', job.id)

      // Cleanup
      await supabase.from('jobs').delete().eq('id', job.id)

      if ((saved?.length ?? 0) === specRows.length) {
        passed++
        allResults.push({ category: pt.category, name: pt.name, status: 'pass', specCount: specRows.length })
      } else {
        failed++
        allResults.push({
          category: pt.category, name: pt.name, status: 'fail', specCount: specRows.length,
          stage: 'verify', error: `expected ${specRows.length} specs, saved ${saved?.length ?? 0}`,
        })
      }
      setResults([...allResults])
    }

    setSummary({ passed, failed, total: partTypes.length })
    setStatus('')
    setRunning(false)
  }

  // Group results by category
  const grouped = results.reduce<Record<string, Result[]>>((acc, r) => {
    ;(acc[r.category] ??= []).push(r)
    return acc
  }, {})

  const passedAll = summary && summary.failed === 0

  return (
    <div style={{ minHeight: '100dvh', background: '#0d0d0d', padding: '24px 20px 60px', fontFamily: FONT_UI }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', color: 'rgba(245,240,228,0.5)', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >‹</button>
        <span style={{ color: 'rgba(245,240,228,0.9)', fontSize: 16, fontWeight: 700, letterSpacing: '0.04em' }}>
          SPEC INSERT TEST
        </span>
      </div>

      {/* Run button */}
      {!running && !summary && (
        <div style={{ marginBottom: 32 }}>
          <p style={{ color: 'rgba(245,240,228,0.45)', fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
            Tests every part type by inserting a job with dummy values, verifying the specs saved, then deleting the test data. Nothing is kept.
          </p>
          <button
            onClick={runTests}
            style={{
              width: '100%', padding: '14px', background: COLOR_ACCENT,
              border: 'none', color: '#fff', fontFamily: FONT_UI,
              fontWeight: 700, fontSize: 14, letterSpacing: '0.08em',
              cursor: 'pointer',
            }}
          >
            RUN TESTS
          </button>
        </div>
      )}

      {/* Running status */}
      {running && status && (
        <p style={{ color: 'rgba(245,240,228,0.4)', fontSize: 12, marginBottom: 20, letterSpacing: '0.02em' }}>
          {status}
        </p>
      )}

      {/* Results by category */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} style={{ marginBottom: 24 }}>
          <p style={{ color: 'rgba(245,240,228,0.35)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 10 }}>
            {category.toUpperCase()}
          </p>
          {items.map(r => (
            <div key={r.name} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              padding: '10px 0', borderBottom: '1px solid rgba(245,240,228,0.06)',
            }}>
              <div style={{ flex: 1 }}>
                <span style={{ color: r.status === 'pass' ? 'rgba(245,240,228,0.8)' : '#ff5555', fontSize: 14, fontWeight: 600 }}>
                  {r.name}
                </span>
                {r.error && (
                  <p style={{ color: '#ff5555', fontSize: 11, marginTop: 3, opacity: 0.8 }}>
                    {r.stage}: {r.error}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingLeft: 12 }}>
                <span style={{ color: 'rgba(245,240,228,0.25)', fontSize: 11 }}>
                  {r.specCount} spec{r.specCount !== 1 ? 's' : ''}
                </span>
                <span style={{ fontSize: 14 }}>{r.status === 'pass' ? '✓' : '✗'}</span>
              </div>
            </div>
          ))}
        </div>
      ))}

      {/* Summary */}
      {summary && (
        <div style={{
          marginTop: 32, padding: '20px',
          background: passedAll ? 'rgba(200,102,26,0.08)' : 'rgba(255,85,85,0.08)',
          border: `1px solid ${passedAll ? 'rgba(200,102,26,0.25)' : 'rgba(255,85,85,0.25)'}`,
        }}>
          <p style={{ color: passedAll ? COLOR_ACCENT : '#ff5555', fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
            {passedAll ? 'All tests passed' : `${summary.failed} failed`}
          </p>
          <p style={{ color: 'rgba(245,240,228,0.4)', fontSize: 12 }}>
            {summary.passed} passed · {summary.failed} failed · {summary.total} total
          </p>
        </div>
      )}

      {/* Run again */}
      {summary && !running && (
        <button
          onClick={runTests}
          style={{
            width: '100%', marginTop: 16, padding: '12px',
            background: 'transparent', border: '1px solid rgba(245,240,228,0.15)',
            color: 'rgba(245,240,228,0.5)', fontFamily: FONT_UI,
            fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', cursor: 'pointer',
          }}
        >
          RUN AGAIN
        </button>
      )}
    </div>
  )
}
