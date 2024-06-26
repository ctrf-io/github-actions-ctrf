#!/usr/bin/env node
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import fs from 'fs';
import * as core from '@actions/core';
import { CtrfReport } from '../types/ctrf';
import { write, generateSummaryDetailsTable, generateTestDetailsTable, generateFailedTestsDetailsTable, generateFlakyTestsDetailsTable, annotateFailed } from './summary';

interface Arguments {
    _: (string | number)[];
    file?: string;
}

const argv: Arguments = yargs(hideBin(process.argv))
    .command(['$0 <file>', 'all <file>'], 'Generate all tables from the specified CTRF file', (yargs) => {
        return yargs.positional('file', {
            describe: 'Path to the CTRF file',
            type: 'string',
            demandOption: true
        });
    })
    .command('summary <file>', 'Generate test summary from a CTRF report', (yargs) => {
        return yargs.positional('file', {
            describe: 'Path to the CTRF file',
            type: 'string'
        });
    })
    .command('tests <file>', 'Generate test details from a CTRF report', (yargs) => {
        return yargs.positional('file', {
            describe: 'Path to the CTRF file',
            type: 'string'
        });
    })
    .command('failed <file>', 'Generate fail test report from a CTRF report', (yargs) => {
        return yargs.positional('file', {
            describe: 'Path to the CTRF file',
            type: 'string'
        });
    })
    .command('flaky <file>', 'Generate flaky test report from a CTRF report', (yargs) => {
        return yargs.positional('file', {
            describe: 'Path to the CTRF file',
            type: 'string'
        });
    })
    .command('annotate <file>', 'Annotate failed tests from a CTRF report', (yargs) => {
        return yargs.positional('file', {
            describe: 'Path to the CTRF file',
            type: 'string'
        });
    })
    .help()
    .alias('help', 'h')
    .parseSync();
// Extract the command used or default to an empty string if none provided
const commandUsed = argv._[0] || '';

// Check if the command is 'all' or no specific command was given
if ((commandUsed === 'all' || commandUsed === '') && argv.file) {
    try {
        const data = fs.readFileSync(argv.file, 'utf8');
        const report = validateCtrfFile(argv.file)
        if (report !== null) {
            generateSummaryDetailsTable(report);
            generateTestDetailsTable(report.results.tests);
            generateFailedTestsDetailsTable(report.results.tests);
            generateFlakyTestsDetailsTable(report.results.tests);
            annotateFailed(report);
            write();
        }
    } catch (error) {
        console.error('Failed to read file:', error);
    }
} else if (argv._.includes('summary') && argv.file) {
    try {
        const data = fs.readFileSync(argv.file, 'utf8');
        const report = validateCtrfFile(argv.file)
        if (report !== null) {
            generateSummaryDetailsTable(report);
            write();
        }
    } catch (error) {
        console.error('Failed to read file:', error);
    }
} else if (argv._.includes('tests') && argv.file) {
    try {
        const data = fs.readFileSync(argv.file, 'utf8');
        const report = validateCtrfFile(argv.file)
        if (report !== null) {
            generateTestDetailsTable(report.results.tests);
            write();
        }
    } catch (error) {
        console.error('Failed to read file:', error);
    }
} else if (argv._.includes('failed') && argv.file) {
    try {
        const data = fs.readFileSync(argv.file, 'utf8');
        const report = validateCtrfFile(argv.file)
        if (report !== null) {
            generateFailedTestsDetailsTable(report.results.tests);
            write();
        }
    } catch (error) {
        console.error('Failed to read file:', error);
    }
} else if (argv._.includes('flaky') && argv.file) {
    try {
        const data = fs.readFileSync(argv.file, 'utf8');
        const report = validateCtrfFile(argv.file)
        if (report !== null) {
            generateFlakyTestsDetailsTable(report.results.tests);
            write();
        }
    } catch (error) {
        console.error('Failed to read file:', error);
    }
}
else if (argv._.includes('annotate') && argv.file) {
    try {
        const data = fs.readFileSync(argv.file, 'utf8');
        const report = validateCtrfFile(argv.file)
        if (report !== null) {
            annotateFailed(report);
        }
    } catch (error) {
        console.error('Failed to read file:', error);
    }
}
else {
}
function validateCtrfFile(filePath: string): CtrfReport | null {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonData: CtrfReport = JSON.parse(fileContent);

        if (!jsonData.results || !jsonData.results.summary || !jsonData.results.tests) {
            console.warn('Warning: The file does not contain valid CTRF data.');
            core.setFailed('Invalid CTRF file format.');
            return null;
        }
        return jsonData;
    } catch (error) {
        console.error('Failed to read or process the file:', error);
        core.setFailed(`Error processing the file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
    }
}