import test from 'node:test'
import assert from 'node:assert/strict'

import {
  renderLanguagesSvg,
  renderStatsSvg,
  summarizeTopLanguages,
} from '../scripts/generate-profile-stats.mjs'

test('renderStatsSvg includes expected labels and values', () => {
  const svg = renderStatsSvg({
    totalStars: 14,
    totalCommits: 483,
    totalPullRequests: 50,
    totalIssues: 0,
    contributedTo: 15,
  })

  assert.match(svg, /<svg/)
  assert.match(svg, /Total Stars:/)
  assert.match(svg, />483</)
  assert.match(svg, /Contributed to:/)
})

test('summarizeTopLanguages sorts and limits language totals', () => {
  const summary = summarizeTopLanguages([
    { Rust: 1200, JavaScript: 400 },
    { Rust: 300, Lua: 700 },
    { Lua: 50, TypeScript: 100 },
  ])

  assert.deepEqual(summary, [
    { name: 'Rust', value: 1500, color: '#dea584' },
    { name: 'Lua', value: 750, color: '#000080' },
    { name: 'JavaScript', value: 400, color: '#f1e05a' },
    { name: 'TypeScript', value: 100, color: '#3178c6' },
  ])
})

test('renderLanguagesSvg includes top language labels', () => {
  const svg = renderLanguagesSvg([
    { name: 'Rust', value: 1500, color: '#dea584' },
    { name: 'Lua', value: 750, color: '#000080' },
    { name: 'JavaScript', value: 400, color: '#f1e05a' },
  ])

  assert.match(svg, /Top Languages by Repo/)
  assert.match(svg, />Rust</)
  assert.match(svg, />Lua</)
  assert.match(svg, /<path d="M/)
})
