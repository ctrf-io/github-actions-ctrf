import * as core from '@actions/core';
import {
    CtrfTest,
    CtrfTestState,
    CtrfReport
} from '../types/ctrf'


export function generateTestDetailsTable(tests: CtrfTest[]): void {
    try {
        core.summary.addHeading(`Detailed Test Results`, 3);

        const headers = [
            { data: 'Name', header: true },
            { data: 'Status', header: true },
            { data: 'ms', header: true },
            { data: 'Flaky 🍂', header: true }
        ];

        const rows = tests.map(test => [
            { data: test.name, header: false },
            { data: `${test.status} ${getEmojiForStatus(test.status)}`, header: false },
            { data: test.duration.toString(), header: false },
            { data: test.flaky ? 'Yes' : '', header: false }
        ]);

        core.summary.addTable([headers, ...rows])
            .addLink('A ctrf plugin', 'https://github.com/ctrf-io/github-actions-ctrf')


    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Failed to append to job summary: ${error.message}`);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}

export function generateFlakyTestsDetailsTable(tests: CtrfTest[]): void {
    try {
        core.summary.addHeading(`Flaky Tests`, 3);

        const flakyTests = tests.filter(test => test.flaky);

        if (flakyTests.length > 0) {
            const headers = [
                { data: 'Name', header: true },
                { data: 'Status', header: true },
                { data: 'Retries', header: true },
                { data: 'Flaky 🍂', header: true }
            ];

            const rows = flakyTests.map(test => [
                { data: test.name, header: false },
                { data: test.status + ' ' + getEmojiForStatus(test.status), header: false },
                { data: test.retries?.toString() || '0', header: false },
                { data: 'Yes', header: false }
            ]);

            core.summary.addTable([headers, ...rows])
                .addLink('A ctrf plugin', 'https://github.com/ctrf-io/github-actions-ctrf');
        } else {
            core.summary.addRaw('No flaky tests detected. ✨');
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Failed to display flaky test details: ${error.message}`);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}


export function generateFailedTestsDetailsTable(tests: CtrfTest[]) {
    try {
        core.summary.addHeading(`Failed Tests`, 3);

        const failedTests = tests.filter(test => test.status === 'failed');

        if (failedTests.length > 0) {

            core.summary.addTable([
                [{ data: 'Name', header: true }, { data: 'Status', header: true }, { data: 'Failure Message', header: true }],
                ...failedTests.map(test => [
                    { data: test.name, header: false },
                    { data: `${test.status} ❌`, header: false },
                    { data: `${test.message || 'No failure message'}`, header: false }
                ])
            ])
                .addLink('A ctrf plugin', 'https://github.com/ctrf-io/github-actions-ctrf')
        } else {
            core.summary.addRaw('No failed tests ✨');
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Failed to display failed test details: ${error.message}`);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}

export function generateSummaryDetailsTable(report: CtrfReport): void {
    try {
        const durationInSeconds = (report.results.summary.stop - report.results.summary.start) / 1000;
        const durationFormatted = durationInSeconds < 1
          ? "<1s"
          : `${new Date(durationInSeconds * 1000).toISOString().substr(11, 8)}`;

        const flakyCount = report.results.tests.filter(test => test.flaky).length;

        core.summary
            .addTable([
                [
                    'Tests 📝', 'Passed ✅', 'Failed ❌',
                    'Skipped ⏭️', 'Pending ⏳', 'Other ❓', 'Flaky 🍂', 'Duration ⏱️'
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
                ]
            ])
            .addLink('A ctrf plugin', 'https://github.com/ctrf-io/github-actions-ctrf')
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Failed to append to job summary: ${error.message}`);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}

export function addHeading(title: string): void {
    try {
        core.summary
            .addHeading(`${title}`, 2)
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Failed to add title: ${error.message}`);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}

export function annotateFailed(report: CtrfReport): void {
    try {
        report.results.tests.forEach(test => {
            if (test.status === 'failed') {
                const message = test.message ? test.message : 'No message provided';
                const trace = test.trace ? test.trace : 'No trace available';
                const annotation = `${test.name}: ${message} - ${trace}`;

                core.error(annotation, {
                    title: `Failed Test: ${test.name}`,
                    file: test.filePath,
                    startLine: 0,
                    endLine: 0
                });
            }
        });
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(`Failed to annotate failed tests: ${error.message}`);
        } else {
            core.setFailed("An unknown error occurred");
        }
    }
}

export function write(): void {
    core.summary.write();
}


function getEmojiForStatus(status: CtrfTestState): string {
    switch (status) {
        case 'passed':
            return '✅';
        case 'failed':
            return '❌';
        case 'skipped':
            return '⏭️';
        case 'pending':
            return '⏳';
        default:
            return '❓';
    }
}