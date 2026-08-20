import * as core from "@actions/core";
import { context } from "@actions/github";
import {
	updateComment,
	listComments,
	addCommentToIssue,
	deleteComment,
} from "../client/github/index.js";
import type { Inputs } from "../types/index.js";
import type { CTRFReport } from "ctrf";
import { generateViews, annotateFailed } from "./core.js";
import type { components } from "@octokit/openapi-types";
import { createCheckRun } from "../client/github/checks.js";
import { checkReportSize } from "../utils/report-utils.js";

type IssueComment = components["schemas"]["issue-comment"];
const UPDATE_EMOJI = "🔄";

/**
 * Handles the generation of views and comments for a CTRF report.
 *
 * - Generates various views of the CTRF report and adds them to the GitHub Actions summary.
 * - Adds or updates a comment on the pull request if conditions are met.
 * - Writes the summary to the GitHub Actions output if requested.
 *
 * @param inputs - The user-provided inputs for configuring views and comments.
 * @param report - The CTRF report containing test results.
 * @returns A promise that resolves when the operations are completed.
 */
export async function handleViewsAndComments(
	inputs: Inputs,
	report: CTRFReport,
): Promise<void> {
	core.startGroup(`📝 Generating reports`);
	const INVISIBLE_MARKER = inputs.commentTag
		? `<!-- CTRF PR COMMENT TAG: ${inputs.commentTag} -->`
		: `<!-- CTRF PR COMMENT TAG: DEFAULT -->`;

	generateViews(inputs, report);

	core.setOutput("summary", core.summary.stringify());

	const { reportJson, isSafeToOutput } = checkReportSize(report, "report");
	if (isSafeToOutput) {
		core.setOutput("report", reportJson);
	}

	if (shouldAddCommentToPullRequest(inputs, report)) {
		await postOrUpdatePRComment(inputs, INVISIBLE_MARKER);
	}

	if (inputs.issue) {
		await postOrUpdateIssueComment(inputs, INVISIBLE_MARKER);
	}

	if (inputs.statusCheck) {
		await createStatusCheck(inputs, report);
	}

	if (inputs.summary && !inputs.pullRequestReport) {
		await core.summary.write();
	}

	core.endGroup();
}

/**
 * Determines if a comment should be added to the pull request based on inputs and report data.
 *
 * @param inputs - The user-provided inputs for configuring pull request comments.
 * @param report - The CTRF report containing test results.
 * @returns `true` if a comment should be added, otherwise `false`.
 */
export function shouldAddCommentToPullRequest(
	inputs: Inputs,
	report: CTRFReport,
): boolean {
	const shouldAddComment =
		(inputs.onFailOnly && report.results.summary.failed > 0) ||
		!inputs.onFailOnly;

	return (
		(inputs.pullRequestReport || inputs.pullRequest) &&
		(context.eventName === "pull_request" ||
			context.eventName === "pull_request_target") &&
		shouldAddComment
	);
}

/**
 * Handles the annotation of failed tests in the CTRF report.
 *
 * - Annotates all failed tests in the GitHub Actions log if annotation is enabled in inputs.
 *
 * @param inputs - The user-provided inputs for configuring annotations.
 * @param report - The CTRF report containing test results.
 */
export function handleAnnotations(inputs: Inputs, report: CTRFReport): void {
	if (inputs.annotate) {
		core.startGroup(`🔍 Annotating failed tests`);
		core.info("Annotating failed tests");
		annotateFailed(report);
		core.endGroup();
	}
}

/**
 * Posts or updates a comment on either a PR or Issue.
 *
 * @param owner - The owner of the repository
 * @param repo - The repository name
 * @param issue_number - The PR or issue number
 * @param body - The comment body to post
 * @param marker - The unique marker to identify existing comments
 * @param updateConfig - Configuration for update behavior
 */
export async function handleComment(
	owner: string,
	repo: string,
	issue_number: number,
	body: string,
	marker: string,
	updateConfig: {
		shouldUpdate: boolean;
		shouldOverwrite: boolean;
		alwaysLatestComment: boolean;
	},
): Promise<void> {
	let finalBody = body;
	const { comment: existingComment, isLatest } =
		await findExistingMarkedComment(owner, repo, issue_number, marker);

	if (updateConfig.alwaysLatestComment && existingComment && !isLatest) {
		await addCommentToIssue(owner, repo, issue_number, `${body}\n${marker}`);
		await deleteComment(existingComment.id, owner, repo, issue_number);
		return;
	}

	if (existingComment) {
		if (updateConfig.shouldUpdate && !updateConfig.shouldOverwrite) {
			finalBody = `${existingComment.body}\n\n---\n\n${body}\n${marker}`;
		} else if (updateConfig.shouldOverwrite) {
			finalBody = `${body}\n\n${UPDATE_EMOJI} This comment has been updated`;
		}
	}

	if (!finalBody.includes(marker)) {
		finalBody = `${finalBody}\n${marker}`;
	}

	if (
		existingComment &&
		(updateConfig.shouldUpdate || updateConfig.shouldOverwrite)
	) {
		await updateComment(
			existingComment.id,
			owner,
			repo,
			issue_number,
			finalBody,
		);
	} else {
		await addCommentToIssue(owner, repo, issue_number, finalBody);
	}
}

/**
 * Posts or updates a comment on a pull request.
 *
 * @param inputs - The user-provided inputs for configuring the comment behavior.
 * @param marker - The unique marker used to identify existing comments.
 * @returns A promise that resolves when the comment operation is completed.
 */
async function postOrUpdatePRComment(
	inputs: Inputs,
	marker: string,
): Promise<void> {
	core.info("Posting or updating PR comment");
	const newSummary = core.summary.stringify();

	try {
		await handleComment(
			context.repo.owner,
			context.repo.repo,
			context.issue.number,
			newSummary,
			marker,
			{
				shouldUpdate: inputs.updateComment,
				shouldOverwrite: inputs.overwriteComment,
				alwaysLatestComment: inputs.alwaysLatestComment,
			},
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("Resource not accessible by integration")
		) {
			core.endGroup();
			core.warning(
				`${error.message}\n` +
					"Unable to post PR comment - this is likely a permissions issue.\n" +
					'Required permission: "pull-requests: write" needs to be set in your workflow permissions.\n' +
					"Add this to your workflow file:\n\n" +
					"jobs:\n" +
					"  build:\n" +
					"    runs-on: ubuntu-latest\n" +
					"    permissions:\n" +
					"      pull-requests: write\n\n" +
					"See documentation: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token\n\n" +
					"For forked PRs, you should use the pull_request_target event instead of pull_request.",
			);
		} else if (error instanceof Error) {
			core.warning(`Failed to post PR comment: ${error.message}`);
		}
	}
}

/**
 * Resolves the repository that an issue comment should be posted to.
 *
 * @param issueRepo - The user-provided `issue-repo` input in `owner/repo` format, or an empty string.
 * @returns The owner and repository name to comment on.
 * @throws {Error} If `issueRepo` is set but not in `owner/repo` format.
 */
export function resolveIssueRepo(issueRepo: string): {
	owner: string;
	repo: string;
} {
	if (!issueRepo) {
		return { owner: context.repo.owner, repo: context.repo.repo };
	}

	const parts = issueRepo.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error(
			`Invalid issue-repo "${issueRepo}" - expected "owner/repo" format`,
		);
	}

	return { owner: parts[0], repo: parts[1] };
}

/**
 * Posts or updates a comment on an issue.
 *
 * @param inputs - The user-provided inputs for configuring the comment behavior.
 * @param marker - The unique marker used to identify existing comments.
 * @returns A promise that resolves when the comment operation is completed.
 */
async function postOrUpdateIssueComment(
	inputs: Inputs,
	marker: string,
): Promise<void> {
	core.info("Posting or updating issue comment");
	const newSummary = core.summary.stringify();

	try {
		const { owner, repo } = resolveIssueRepo(inputs.issueRepo);
		await handleComment(
			owner,
			repo,
			parseInt(inputs.issue, 10),
			newSummary,
			marker,
			{
				shouldUpdate: inputs.updateComment,
				shouldOverwrite: inputs.overwriteComment,
				alwaysLatestComment: inputs.alwaysLatestComment,
			},
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("Resource not accessible by integration")
		) {
			core.endGroup();
			core.warning(
				`${error.message}\n` +
					"Unable to post issue comment - this is likely a permissions issue.\n" +
					'Required permission: "issues: write" needs to be set in your workflow permissions.\n' +
					"Add this to your workflow file:\n\n" +
					"jobs:\n" +
					"  build:\n" +
					"    runs-on: ubuntu-latest\n" +
					"    permissions:\n" +
					"      issues: write\n\n" +
					"When commenting on an issue in another repository via the issue-repo input, GITHUB_TOKEN must be a token with write access to that repository.\n" +
					"See documentation: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token",
			);
		} else if (error instanceof Error) {
			core.warning(`Failed to post issue comment: ${error.message}`);
		}
	}
}

/**
 * Formats the test summary into a string like "10 passed, 1 failed, 2 skipped".
 * @param summary - The test summary object
 * @returns Formatted summary string
 */
function formatTestSummary(summary: {
	passed: number;
	failed: number;
	skipped: number;
	pending: number;
	other: number;
}): string {
	const parts: string[] = [];

	if (summary.passed > 0) {
		parts.push(`${summary.passed} passed`);
	}

	if (summary.failed > 0) {
		parts.push(`${summary.failed} failed`);
	}

	if (summary.skipped > 0) {
		parts.push(`${summary.skipped} skipped`);
	}

	if (summary.pending > 0) {
		parts.push(`${summary.pending} pending`);
	}

	if (summary.other > 0) {
		parts.push(`${summary.other} other`);
	}

	if (parts.length === 0) {
		return "No tests";
	}

	return parts.join(", ");
}

/**
 * Creates a status check for a action.
 *
 * @param inputs - The user-provided inputs for configuring the status check.
 * @param report - The CTRF report containing test results.
 */
export async function createStatusCheck(
	inputs: Inputs,
	report: CTRFReport,
): Promise<void> {
	core.info("Creating status check");
	let summary = core.summary.stringify();
	if (summary.length > 65000) {
		core.warning("Summary is too long to create a status check. Truncating...");
		summary = summary.slice(0, 65000);
	}

	try {
		const formattedSummary = formatTestSummary(report.results.summary);

		await createCheckRun(
			context.repo.owner,
			context.repo.repo,
			context.sha,
			inputs.statusCheckName,
			"completed",
			report.results.summary.failed > 0 ? "failure" : "success",
			formattedSummary,
			summary,
		);
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.includes("Resource not accessible by integration")
		) {
			core.endGroup();
			core.warning(
				`${error.message}\n` +
					"Unable to create status check - this is likely a permissions issue.\n" +
					'Required permission: "checks: write" needs to be set in your workflow permissions.\n' +
					"Add this to your workflow file:\n\n" +
					"jobs:\n" +
					"  build:\n" +
					"    runs-on: ubuntu-latest\n" +
					"    permissions:\n" +
					"      checks: write\n\n" +
					"See documentation: https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token",
			);
		} else if (error instanceof Error) {
			core.warning(`Failed to create status check: ${error.message}`);
		}
	}
}

/**
 * Searches for an existing PR comment containing a given marker.
 *
 * @param owner - The owner of the repository.
 * @param repo - The repository name.
 * @param issue_number - The pull request number.
 * @param marker - The unique marker used to identify the comment.
 * @returns Object containing the comment if found and whether it's the latest comment.
 */
export async function findExistingMarkedComment(
	owner: string,
	repo: string,
	issue_number: number,
	marker: string,
): Promise<{ comment: IssueComment | undefined; isLatest: boolean }> {
	const comments = await listComments(owner, repo, issue_number);
	const markedComment = [...comments]
		.reverse()
		.find((comment: IssueComment) => comment.body?.includes(marker));

	const isLatest = Boolean(
		markedComment &&
			comments.length > 0 &&
			markedComment.id === comments[comments.length - 1].id,
	);

	return { comment: markedComment, isLatest };
}
