import * as core from '@actions/core'
import {
  type CtrfTest,
  type CtrfTestState,
  type CtrfReport,
} from '../types/ctrf'
import { stripAnsi } from './common'

export function generateTestDetailsTable(tests: CtrfTest[]): void {
  try {
    core.summary.addHeading(`Detailed Test Results`, 3)

    const maxRows = 8000
    let limitedTests = tests

    if (tests.length > maxRows) {
      limitedTests = tests.slice(0, maxRows)
    }

    const headers = [
      { data: 'Name', header: true },
      { data: 'Status', header: true },
      { data: 'ms', header: true },
      { data: 'Flaky 🍂', header: true },
    ]

    const rows = limitedTests.map((test) => [
      { data: test.name, header: false },
      {
        data: `${test.status} ${getEmojiForStatus(test.status)}`,
        header: false,
      },
      { data: test.duration.toString(), header: false },
      { data: test.flaky ? 'Yes' : '', header: false },
    ])

    core.summary.addTable([headers, ...rows])

    if (tests.length > maxRows) {
      core.summary.addRaw(
        `Note: You have a lot of tests. We've limited the number shown in the detailed breakdown to ${maxRows}.`
      )
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to append to job summary: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}

export function generateFlakyTestsDetailsTable(tests: CtrfTest[]): void {
  try {
    core.summary.addHeading(`Flaky Tests`, 3)

    const flakyTests = tests.filter((test) => test.flaky)

    if (flakyTests.length > 0) {
      const headers = [
        { data: 'Name', header: true },
        { data: 'Status', header: true },
        { data: 'Retries', header: true },
        { data: 'Flaky 🍂', header: true },
      ]

      const rows = flakyTests.map((test) => [
        { data: test.name, header: false },
        {
          data: test.status + ' ' + getEmojiForStatus(test.status),
          header: false,
        },
        { data: test.retries?.toString() || '0', header: false },
        { data: 'Yes', header: false },
      ])

      core.summary
        .addTable([headers, ...rows])
    } else {
      core.summary.addRaw('No flaky tests detected. ✨')
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to display flaky test details: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}

export function generateFailedTestsDetailsTable(tests: CtrfTest[]) {
  try {
    core.summary.addHeading(`Failed Tests`, 3)

    const failedTests = tests.filter((test) => test.status === 'failed')

    if (failedTests.length > 0) {
      core.summary
        .addTable([
          [
            { data: 'Name', header: true },
            { data: 'Status', header: true },
            { data: 'Failure Message', header: true },
          ],
          ...failedTests.map((test) => [
            { data: test.name, header: false },
            { data: `${test.status} ❌`, header: false },
            {
              data: `${stripAnsi(test.message || '') || 'No failure message'}`,
              header: false,
            },
          ]),
        ])
    } else {
      core.summary.addRaw('No failed tests ✨')
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to display failed test details: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}

export function generateAIFailedTestsSummaryTable(tests: CtrfTest[]) {
  try {
    core.summary.addHeading(`AI Summary`, 3)

    const failedTests = tests.filter((test) => test.status === 'failed')

    if (failedTests.length > 0) {
      core.summary
        .addTable([
          [
            { data: 'Failed Test ❌', header: true },
            { data: 'AI Summary ✨', header: true },
          ],
          ...failedTests.map((test) => [
            { data: `${test.name}`, header: true },
            { data: `${test.ai || 'No summary'}`, header: false },
          ]),
        ])
    } else {
      core.summary.addRaw('No failed tests ✨')
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to display failed test details: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}

export function generateSummaryDetailsTable(report: CtrfReport): void {
  try {
    const durationInSeconds =
      (report.results.summary.stop - report.results.summary.start) / 1000
    const durationFormatted =
      durationInSeconds < 1
        ? '<1s'
        : `${new Date(durationInSeconds * 1000).toISOString().substr(11, 8)}`

    const flakyCount = report.results.tests.filter((test) => test.flaky).length

    core.summary
      .addTable([
        [
          'Tests 📝',
          'Passed ✅',
          'Failed ❌',
          'Skipped ⏭️',
          'Pending ⏳',
          'Other ❓',
          'Flaky 🍂',
          'Duration ⏱️',
        ],
        [
          report.results.summary.tests.toString(),
          report.results.summary.passed.toString(),
          report.results.summary.failed.toString(),
          report.results.summary.skipped.toString(),
          report.results.summary.pending.toString(),
          report.results.summary.other.toString(),
          flakyCount.toString(),
          durationFormatted,
        ],
      ])
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to append to job summary: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}

export function addHeading(title: string): void {
  try {
    core.summary.addHeading(`${title}`, 2)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to add title: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}

export function annotateFailed(report: CtrfReport): void {
  try {
    report.results.tests.forEach((test) => {
      if (test.status === 'failed') {
        const message = test.message
          ? stripAnsi(test.message || '')
          : 'No message provided'
        const trace = test.trace ? stripAnsi(test.trace) : 'No trace available'
        const annotation = `${test.name}: ${stripAnsi(message)} - ${stripAnsi(trace)}`

        core.error(annotation, {
          title: `Failed Test: ${test.name}`,
          file: test.filePath,
          startLine: 0,
          endLine: 0,
        })
      }
    })
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to annotate failed tests: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}

export function write(): void {
  try {
    checkForExistingLink()
    core.summary.addLink(
      'Github Actions Test Reporter CTRF',
      'https://github.com/ctrf-io/github-actions-test-reporter-ctrf'
    )
    core.summary.write()
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Failed to write summary: ${error.message}`)
    } else {
      core.setFailed('An unknown error occurred')
    }
  }
}


function checkForExistingLink() {
  const summaryContent = core.summary.stringify()
  const linkText = 'Github Actions Test Reporter CTRF'
  const linkUrl = 'https://github.com/ctrf-io/github-actions-test-reporter-ctrf'
  const linkHtml = `<a href="${linkUrl}">${linkText}</a>`

  if (summaryContent.includes(linkHtml)) {
    const updatedSummary = summaryContent.replace(new RegExp(linkHtml, 'g'), '')

    core.summary.clear()
    core.summary.addRaw(updatedSummary)
  }
}

function getEmojiForStatus(status: CtrfTestState): string {
  switch (status) {
    case 'passed':
      return '✅'
    case 'failed':
      return '❌'
    case 'skipped':
      return '⏭️'
    case 'pending':
      return '⏳'
    default:
      return '❓'
  }
}
