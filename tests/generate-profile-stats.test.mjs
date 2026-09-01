import test from 'node:test'
import assert from 'node:assert/strict'

import {
  calculateStreaks,
  normalizeContributionDays,
  renderActivityGraphSvg,
  renderLanguagesSvg,
  renderStatsSvg,
  renderStreakSvg,
  selectRecentContributionDays,
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

test('normalizeContributionDays deduplicates and sorts calendar overlap', () => {
  assert.deepEqual(
    normalizeContributionDays([
      { date: '2026-01-02', contributionCount: 1 },
      { date: '2026-01-01', contributionCount: 2 },
      { date: '2026-01-02', contributionCount: 3 },
    ]),
    [
      { date: '2026-01-01', contributionCount: 2 },
      { date: '2026-01-02', contributionCount: 3 },
    ],
  )
})

test('calculateStreaks uses yesterday when today has no contribution', () => {
  const streaks = calculateStreaks(
    [
      { date: '2026-08-01', contributionCount: 1 },
      { date: '2026-08-02', contributionCount: 1 },
      { date: '2026-08-03', contributionCount: 1 },
      { date: '2026-08-04', contributionCount: 0 },
      { date: '2026-08-23', contributionCount: 1 },
      { date: '2026-08-24', contributionCount: 2 },
      { date: '2026-08-25', contributionCount: 0 },
    ],
    new Date('2026-08-25T10:00:00Z'),
  )

  assert.equal(streaks.totalContributions, 6)
  assert.deepEqual(streaks.currentStreak, {
    length: 2,
    startDate: '2026-08-23',
    endDate: '2026-08-24',
  })
  assert.deepEqual(streaks.longestStreak, {
    length: 3,
    startDate: '2026-08-01',
    endDate: '2026-08-03',
  })
})

test('calculateStreaks reports no current streak after two empty days', () => {
  const streaks = calculateStreaks(
    [
      { date: '2026-08-24', contributionCount: 1 },
      { date: '2026-08-25', contributionCount: 0 },
      { date: '2026-08-26', contributionCount: 0 },
    ],
    new Date('2026-08-26T10:00:00Z'),
  )

  assert.deepEqual(streaks.currentStreak, {
    length: 0,
    startDate: null,
    endDate: null,
  })
})

test('selectRecentContributionDays fills missing dates with zero', () => {
  assert.deepEqual(
    selectRecentContributionDays(
      [{ date: '2026-08-23', contributionCount: 3 }],
      new Date('2026-08-25T10:00:00Z'),
      3,
    ),
    [
      { date: '2026-08-23', contributionCount: 3 },
      { date: '2026-08-24', contributionCount: 0 },
      { date: '2026-08-25', contributionCount: 0 },
    ],
  )
})

test('renderStreakSvg includes values and streak labels', () => {
  const svg = renderStreakSvg({
    totalContributions: 631,
    accountCreatedAt: '2018-12-04T00:00:00Z',
    currentStreak: { length: 2, startDate: '2026-08-23', endDate: '2026-08-24' },
    longestStreak: { length: 8, startDate: '2025-10-22', endDate: '2025-10-29' },
    now: new Date('2026-08-25T10:00:00Z'),
  })

  assert.match(svg, /width="495"/)
  assert.match(svg, /Total Contributions/)
  assert.match(svg, /Current Streak/)
  assert.match(svg, /Longest Streak/)
  assert.match(svg, />631</)
})

test('renderActivityGraphSvg handles empty data without invalid coordinates', () => {
  const svg = renderActivityGraphSvg({ name: 'Nghia <Pham>', days: [] })

  assert.match(svg, /width="1200"/)
  assert.match(svg, /Nghia &lt;Pham&gt;&apos;s Contribution Graph/)
  assert.match(svg, /<polyline/)
  assert.doesNotMatch(svg, /NaN|Infinity/)
})
