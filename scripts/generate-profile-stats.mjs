import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_DIR = path.resolve('profile-summary-card-output/tokyonight')
const STATS_PATH = path.join(OUTPUT_DIR, '3-stats.svg')
const LANGUAGES_PATH = path.join(OUTPUT_DIR, '1-repos-per-language.svg')
const STREAK_PATH = path.join(OUTPUT_DIR, '5-streak.svg')
const GRAPH_PATH = path.join(OUTPUT_DIR, '6-activity-graph.svg')
const GRAPH_DAYS = 31

const THEME = {
  background: '#1a1b27',
  title: '#70a5fd',
  text: '#38bdae',
  accent: '#bf91f3',
  border: '#1a1b27',
}

const LANGUAGE_COLORS = {
  Rust: '#dea584',
  JavaScript: '#f1e05a',
  Lua: '#000080',
  TypeScript: '#3178c6',
  'C#': '#178600',
  Go: '#00add8',
  Python: '#3572A5',
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function dateFromIsoDate(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`)
}

function isoDateFromUtcDate(date) {
  return date.toISOString().slice(0, 10)
}

function isoDateAtUtcOffset(date, offset) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  result.setUTCDate(result.getUTCDate() + offset)
  return isoDateFromUtcDate(result)
}

function isNextUtcDay(previousDate, currentDate) {
  return isoDateAtUtcOffset(dateFromIsoDate(previousDate), 1) === currentDate
}

function formatDate(isoDate, includeYear) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(dateFromIsoDate(isoDate))
}

function formatStreakRange(streak, referenceYear) {
  if (!streak.length) {
    return 'No active streak'
  }

  const includeYear = [streak.startDate, streak.endDate].some(
    (date) => Number(date.slice(0, 4)) !== referenceYear,
  )
  const start = formatDate(streak.startDate, includeYear)
  const end = formatDate(streak.endDate, includeYear)
  return start === end ? start : `${start} – ${end}`
}

export function normalizeContributionDays(days) {
  const daysByDate = new Map()

  for (const day of days) {
    const contributionCount = Number(day.contributionCount) || 0
    const existing = daysByDate.get(day.date)

    if (!existing || contributionCount > existing.contributionCount) {
      daysByDate.set(day.date, { date: day.date, contributionCount })
    }
  }

  return [...daysByDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function calculateStreaks(days, now = new Date()) {
  const normalizedDays = normalizeContributionDays(days)
  const daysByDate = new Map(normalizedDays.map((day) => [day.date, day]))
  const totalContributions = normalizedDays.reduce(
    (total, day) => total + day.contributionCount,
    0,
  )

  let longestStreak = { length: 0, startDate: null, endDate: null }
  let runLength = 0
  let runStartDate = null
  let previousDate = null

  for (const day of normalizedDays) {
    const continuesRun = previousDate && isNextUtcDay(previousDate, day.date) && runLength > 0

    if (day.contributionCount > 0) {
      if (continuesRun) {
        runLength += 1
      } else {
        runLength = 1
        runStartDate = day.date
      }

      if (runLength > longestStreak.length) {
        longestStreak = {
          length: runLength,
          startDate: runStartDate,
          endDate: day.date,
        }
      }
    } else {
      runLength = 0
      runStartDate = null
    }

    previousDate = day.date
  }

  const today = isoDateAtUtcOffset(now, 0)
  const yesterday = isoDateAtUtcOffset(now, -1)
  const currentEndDate =
    daysByDate.get(today)?.contributionCount > 0
      ? today
      : daysByDate.get(yesterday)?.contributionCount > 0
        ? yesterday
        : null

  let currentStreak = { length: 0, startDate: null, endDate: null }

  if (currentEndDate) {
    let cursor = currentEndDate
    let length = 0

    while (daysByDate.get(cursor)?.contributionCount > 0) {
      length += 1
      cursor = isoDateAtUtcOffset(dateFromIsoDate(cursor), -1)
    }

    currentStreak = {
      length,
      startDate: isoDateAtUtcOffset(dateFromIsoDate(cursor), 1),
      endDate: currentEndDate,
    }
  }

  return { totalContributions, currentStreak, longestStreak }
}

export function selectRecentContributionDays(days, now = new Date(), count = GRAPH_DAYS) {
  const daysByDate = new Map(normalizeContributionDays(days).map((day) => [day.date, day]))

  return Array.from({ length: count }, (_, index) => {
    const date = isoDateAtUtcOffset(now, index - (count - 1))
    return {
      date,
      contributionCount: daysByDate.get(date)?.contributionCount ?? 0,
    }
  })
}

export function renderStreakSvg({
  totalContributions,
  accountCreatedAt,
  currentStreak,
  longestStreak,
  now = new Date(),
}) {
  const referenceYear = now.getUTCFullYear()
  const accountStart = accountCreatedAt.slice(0, 10)
  const totalRange = `${formatDate(accountStart, true)} – Present`
  const currentRange = formatStreakRange(currentStreak, referenceYear)
  const longestRange = longestStreak.length
    ? formatStreakRange(longestStreak, referenceYear)
    : 'No contributions'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="495" height="195" viewBox="0 0 495 195" role="img" aria-label="GitHub contribution streak"><style>* { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif }</style><rect x="0.5" y="0.5" width="494" height="194" rx="4.5" fill="${THEME.background}" stroke="${THEME.background}"/><line x1="165" y1="28" x2="165" y2="170" stroke="#E4E2E2" stroke-opacity="0.45"/><line x1="330" y1="28" x2="330" y2="170" stroke="#E4E2E2" stroke-opacity="0.45"/><g text-anchor="middle"><text x="82.5" y="80" fill="${THEME.title}" font-size="28" font-weight="700">${escapeXml(totalContributions)}</text><text x="82.5" y="108" fill="${THEME.title}" font-size="14">Total Contributions</text><text x="82.5" y="134" fill="${THEME.text}" font-size="12">${escapeXml(totalRange)}</text><circle cx="247.5" cy="68" r="40" fill="none" stroke="${THEME.title}" stroke-width="5"/><text x="247.5" y="78" fill="${THEME.accent}" font-size="28" font-weight="700">${escapeXml(currentStreak.length)}</text><text x="247.5" y="108" fill="${THEME.accent}" font-size="14" font-weight="700">Current Streak</text><text x="247.5" y="134" fill="${THEME.text}" font-size="12">${escapeXml(currentRange)}</text><text x="412.5" y="80" fill="${THEME.title}" font-size="28" font-weight="700">${escapeXml(longestStreak.length)}</text><text x="412.5" y="108" fill="${THEME.title}" font-size="14">Longest Streak</text><text x="412.5" y="134" fill="${THEME.text}" font-size="12">${escapeXml(longestRange)}</text></g></svg>`
}

export function renderActivityGraphSvg({ name, days }) {
  const safeDays = days.length
    ? days.map((day) => ({
        date: day.date,
        contributionCount: Math.max(0, Number(day.contributionCount) || 0),
      }))
    : [{ date: '1970-01-01', contributionCount: 0 }]
  const width = 1200
  const height = 420
  const left = 90
  const right = 50
  const top = 80
  const bottom = 350
  const plotWidth = width - left - right
  const plotHeight = bottom - top
  const highestCount = Math.max(...safeDays.map((day) => day.contributionCount), 1)
  const yMax = Math.max(3, Math.ceil(highestCount / 3) * 3)
  const pointSpacing = plotWidth / Math.max(safeDays.length - 1, 1)
  const points = safeDays.map((day, index) => ({
    x: left + index * pointSpacing,
    y: bottom - (day.contributionCount / yMax) * plotHeight,
    value: day.contributionCount,
  }))
  const polyline = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  const yGrid = Array.from({ length: 4 }, (_, index) => {
    const value = (yMax / 3) * index
    const y = bottom - (value / yMax) * plotHeight
    return `<line x1="${left}" y1="${y}" x2="${width - right}" y2="${y}" stroke="#313347" stroke-width="1"/><text x="${left - 12}" y="${y + 4}" fill="${THEME.title}" font-size="12" text-anchor="end">${value}</text>`
  }).join('')
  const labelCount = Math.min(6, safeDays.length)
  const labelIndexes =
    labelCount === 1
      ? [0]
      : Array.from({ length: labelCount }, (_, index) =>
          Math.round((index * (safeDays.length - 1)) / (labelCount - 1)),
        )
  const xLabels = labelIndexes
    .map((index) => {
      const point = points[index]
      return `<line x1="${point.x}" y1="${top}" x2="${point.x}" y2="${bottom}" stroke="#313347" stroke-width="1"/><text x="${point.x}" y="${bottom + 22}" fill="${THEME.title}" font-size="12" text-anchor="middle">${escapeXml(formatDate(safeDays[index].date, false))}</text>`
    })
    .join('')
  const dots = points
    .filter((point) => point.value > 0)
    .map(
      (point) =>
        `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" fill="${THEME.text}"/>`,
    )
    .join('')
  const displayName = name || 'GitHub'

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(displayName)} contribution graph"><style>* { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif }</style><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="${THEME.background}" stroke="${THEME.background}"/><text x="${width / 2}" y="42" fill="${THEME.title}" font-size="20" font-weight="600" text-anchor="middle">${escapeXml(displayName)}&apos;s Contribution Graph</text><g>${yGrid}${xLabels}<polyline points="${polyline}" fill="none" stroke="${THEME.accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${dots}</g><text x="${width / 2}" y="400" fill="${THEME.title}" font-size="14" text-anchor="middle">Days</text><text x="22" y="${(top + bottom) / 2}" fill="${THEME.title}" font-size="14" text-anchor="middle" transform="rotate(-90 22 ${(top + bottom) / 2})">Contributions</text></svg>`
}

export function summarizeTopLanguages(languageMaps, limit = 4) {
  const totals = new Map()

  for (const languageMap of languageMaps) {
    for (const [name, value] of Object.entries(languageMap)) {
      totals.set(name, (totals.get(name) ?? 0) + value)
    }
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({
      name,
      value,
      color: LANGUAGE_COLORS[name] ?? '#70a5fd',
    }))
}

export function renderStatsSvg(stats) {
  const rows = [
    ['Total Stars:', stats.totalStars],
    ['Total Commits:', stats.totalCommits],
    ['Total PRs:', stats.totalPullRequests],
    ['Total Issues:', stats.totalIssues],
    ['Contributed to:', stats.contributedTo],
  ]

  const rowSvg = rows
    .map(
      ([label, value], index) => `
      <text x="51" y="${74 + index * 25.2}" style="fill: ${THEME.text}; font-size: 14px;">${escapeXml(label)}</text>
      <text x="160" y="${74 + index * 25.2}" style="fill: ${THEME.text}; font-size: 14px;">${escapeXml(value)}</text>`,
    )
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200" viewBox="0 0 340 200"><style>* { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif }</style><rect x="1" y="1" rx="5" ry="5" height="99%" width="99.41176470588235%" stroke="${THEME.border}" stroke-width="1" fill="${THEME.background}" stroke-opacity="1"></rect><text x="30" y="40" style="font-size: 22px; fill: ${THEME.title};">Stats</text><g transform="translate(0,0)">${rowSvg}</g><g transform="translate(220,60)"><circle cx="35" cy="35" r="30" fill="none" stroke="${THEME.title}" stroke-width="4"></circle><text x="35" y="42" text-anchor="middle" style="fill: ${THEME.accent}; font-size: 24px; font-weight: 700;">GH</text></g></svg>`
}

function polarToCartesian(cx, cy, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  }
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle)
  const end = polarToCartesian(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
  return `M${start.x} ${start.y}A${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`
}

export function renderLanguagesSvg(languages) {
  const total = languages.reduce((sum, language) => sum + language.value, 0) || 1
  let currentAngle = 0
  const arcs = languages
    .map((language) => {
      const sweep = (language.value / total) * 360
      const path = describeArc(230, 80, 60, currentAngle, currentAngle + sweep)
      currentAngle += sweep
      return `<path d="${path}" stroke="${language.color}" stroke-width="25" fill="none"></path>`
    })
    .join('')

  const labels = languages
    .map(
      (language, index) => `
      <rect x="40" y="${58 + index * 25.2}" width="14" height="14" fill="${language.color}" stroke="${THEME.border}" style="stroke-width: 1px;"></rect>
      <text x="56.8" y="${70 + index * 25.2}" style="fill: ${THEME.text}; font-size: 14px;">${escapeXml(language.name)}</text>`,
    )
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200" viewBox="0 0 340 200"><style>* { font-family: 'Segoe UI', Ubuntu, 'Helvetica Neue', Sans-Serif }</style><rect x="1" y="1" rx="5" ry="5" height="99%" width="99.41176470588235%" stroke="${THEME.border}" stroke-width="1" fill="${THEME.background}" stroke-opacity="1"></rect><text x="30" y="40" style="font-size: 22px; fill: ${THEME.title};">Top Languages by Repo</text><g>${labels}</g><g>${arcs}</g></svg>`
}

async function githubRequest(query, variables, token) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    throw new Error(`GitHub GraphQL request failed: ${response.status}`)
  }

  const payload = await response.json()
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '))
  }

  return payload.data
}

async function fetchRepositories(username, token) {
  const repos = []
  let hasNextPage = true
  let cursor = null

  while (hasNextPage) {
    const data = await githubRequest(
      `query($username: String!, $cursor: String) {
        user(login: $username) {
          repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
            nodes {
              name
              stargazerCount
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    name
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }`,
      { username, cursor },
      token,
    )

    const repositoryConnection = data.user.repositories
    repos.push(...repositoryConnection.nodes)
    hasNextPage = repositoryConnection.pageInfo.hasNextPage
    cursor = repositoryConnection.pageInfo.endCursor
  }

  return repos
}

async function fetchContributionSummary(username, token) {
  const data = await githubRequest(
    `query($username: String!) {
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
          }
          totalPullRequestContributions
          totalIssueContributions
        }
        repositoriesContributedTo(contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, REPOSITORY], first: 100) {
          totalCount
        }
      }
    }`,
    { username },
    token,
  )

  return {
    totalCommits: data.user.contributionsCollection.contributionCalendar.totalContributions,
    totalPullRequests: data.user.contributionsCollection.totalPullRequestContributions,
    totalIssues: data.user.contributionsCollection.totalIssueContributions,
    contributedTo: data.user.repositoriesContributedTo.totalCount,
  }
}

async function fetchContributionCalendar(username, token, from, to) {
  const data = await githubRequest(
    `query($username: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $username) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }`,
    { username, from, to },
    token,
  )

  return data.user.contributionsCollection.contributionCalendar.weeks.flatMap(
    (week) => week.contributionDays,
  )
}

async function fetchContributionHistory(username, token, now) {
  const data = await githubRequest(
    `query($username: String!) {
      user(login: $username) {
        name
        createdAt
        contributionsCollection {
          contributionYears
        }
      }
    }`,
    { username },
    token,
  )
  const user = data.user
  const currentYear = now.getUTCFullYear()
  const createdYear = new Date(user.createdAt).getUTCFullYear()
  const years = [...new Set(user.contributionsCollection.contributionYears)]
    .filter((year) => year >= createdYear && year <= currentYear)
    .sort((a, b) => a - b)

  if (!years.length) {
    years.push(createdYear)
  }

  const calendarDays = await Promise.all(
    years.map((year) =>
      fetchContributionCalendar(
        username,
        token,
        `${year}-01-01T00:00:00Z`,
        year === currentYear ? now.toISOString() : `${year + 1}-01-01T00:00:00Z`,
      ),
    ),
  )

  return {
    name: user.name ?? username,
    createdAt: user.createdAt,
    days: normalizeContributionDays(calendarDays.flat()),
  }
}

export async function generateProfileStats({ username, token, now = new Date() }) {
  const [repositories, contributionSummary, contributionHistory] = await Promise.all([
    fetchRepositories(username, token),
    fetchContributionSummary(username, token),
    fetchContributionHistory(username, token, now),
  ])

  const totalStars = repositories.reduce((sum, repository) => sum + repository.stargazerCount, 0)
  const languages = summarizeTopLanguages(
    repositories.map((repository) =>
      Object.fromEntries(
        repository.languages.edges.map((edge) => [edge.node.name, edge.size]),
      ),
    ),
  )
  const streaks = calculateStreaks(contributionHistory.days, now)

  return {
    statsSvg: renderStatsSvg({
      totalStars,
      totalCommits: contributionSummary.totalCommits,
      totalPullRequests: contributionSummary.totalPullRequests,
      totalIssues: contributionSummary.totalIssues,
      contributedTo: contributionSummary.contributedTo,
    }),
    languagesSvg: renderLanguagesSvg(languages),
    streakSvg: renderStreakSvg({
      totalContributions: streaks.totalContributions,
      accountCreatedAt: contributionHistory.createdAt,
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
      now,
    }),
    graphSvg: renderActivityGraphSvg({
      name: contributionHistory.name,
      days: selectRecentContributionDays(contributionHistory.days, now),
    }),
  }
}

async function writeGeneratedAssets() {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME

  if (!token || !username) {
    throw new Error('GITHUB_TOKEN and GITHUB_USERNAME are required')
  }

  const { statsSvg, languagesSvg, streakSvg, graphSvg } = await generateProfileStats({ username, token })

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await Promise.all([
    fs.writeFile(STATS_PATH, `${statsSvg}\n`),
    fs.writeFile(LANGUAGES_PATH, `${languagesSvg}\n`),
    fs.writeFile(STREAK_PATH, `${streakSvg}\n`),
    fs.writeFile(GRAPH_PATH, `${graphSvg}\n`),
  ])
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGeneratedAssets().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
