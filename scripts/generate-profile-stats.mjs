import fs from 'node:fs/promises'
import path from 'node:path'

const OUTPUT_DIR = path.resolve('profile-summary-card-output/tokyonight')
const STATS_PATH = path.join(OUTPUT_DIR, '3-stats.svg')
const LANGUAGES_PATH = path.join(OUTPUT_DIR, '1-repos-per-language.svg')

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

export async function generateProfileStats({ username, token }) {
  const [repositories, contributionSummary] = await Promise.all([
    fetchRepositories(username, token),
    fetchContributionSummary(username, token),
  ])

  const totalStars = repositories.reduce((sum, repository) => sum + repository.stargazerCount, 0)
  const languages = summarizeTopLanguages(
    repositories.map((repository) =>
      Object.fromEntries(
        repository.languages.edges.map((edge) => [edge.node.name, edge.size]),
      ),
    ),
  )

  return {
    statsSvg: renderStatsSvg({
      totalStars,
      totalCommits: contributionSummary.totalCommits,
      totalPullRequests: contributionSummary.totalPullRequests,
      totalIssues: contributionSummary.totalIssues,
      contributedTo: contributionSummary.contributedTo,
    }),
    languagesSvg: renderLanguagesSvg(languages),
  }
}

async function writeGeneratedAssets() {
  const token = process.env.GITHUB_TOKEN
  const username = process.env.GITHUB_USERNAME

  if (!token || !username) {
    throw new Error('GITHUB_TOKEN and GITHUB_USERNAME are required')
  }

  const { statsSvg, languagesSvg } = await generateProfileStats({ username, token })

  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await Promise.all([
    fs.writeFile(STATS_PATH, `${statsSvg}\n`),
    fs.writeFile(LANGUAGES_PATH, `${languagesSvg}\n`),
  ])
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeGeneratedAssets().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
