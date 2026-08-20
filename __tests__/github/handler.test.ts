import { vi, describe, it, expect, beforeEach, beforeAll } from "vitest";
import * as core from "@actions/core";
import { context } from "@actions/github";
import { createCheckRun } from "../../src/client/github/checks.js";
import {
	createStatusCheck,
	findExistingMarkedComment,
	handleComment,
	handleViewsAndComments,
	resolveIssueRepo,
} from "../../src/github/handler.js";
import type { Inputs } from "../../src/types/index.js";
import type { Report } from "../../src/ctrf/core/types/ctrf.js";
import * as githubClient from "../../src/client/github/index.js";
import type { components } from "@octokit/openapi-types";
import Handlebars from "handlebars";

type IssueComment = components["schemas"]["issue-comment"];

beforeAll(() => {
	Handlebars.registerHelper(
		"formatDurationFromTimes",
		(_start: number, _stop: number) => "0ms",
	);

	Handlebars.registerHelper("getCtrfEmoji", (_status: string) => {
		return "✅";
	});

	Handlebars.registerHelper("addAll", (..._args: any[]) => 0);

	Handlebars.registerHelper("countFlaky", (_tests: any[]) => 0);

	Handlebars.registerHelper(
		"formatDurationFromTimes",
		(_start: number, _stop: number) => "0ms",
	);

	Handlebars.registerHelper("formatDurationMs", (_duration: number) => "0ms");

	Handlebars.registerHelper("escapeMarkdown", (text: string) => text || "");

	Handlebars.registerHelper("gt", (_a: number, _b: number) => false);

	Handlebars.registerHelper("lt", (_a: number, _b: number) => false);

	Handlebars.registerHelper("eq", (_a: any, _b: any) => false);

	Handlebars.registerHelper(
		"toPercent",
		(_value: number, _decimals: number = 2) => "0%",
	);

	Handlebars.registerHelper("uppercase", (text: string) => text || "");

	Handlebars.registerHelper(
		"slice",
		(_array: any[], _start: number, _end: number) => [],
	);

	Handlebars.registerHelper(
		"sliceString",
		(str: string, _start: number, _end: number) => str || "",
	);

	Handlebars.registerHelper("countFlakyTests", (_tests: any[]) => 0);
});

vi.mock("@actions/core");
vi.mock("@actions/github", () => ({
	context: {
		repo: {
			owner: "test-owner",
			repo: "test-repo",
		},
		sha: "test-sha",
	},
}));
vi.mock("../../src/client/github/checks", () => ({
	createCheckRun: vi.fn(),
}));
vi.mock("../../src/client/github");

describe("createStatusCheck", () => {
	const mockCore = vi.mocked(core);
	const mockCreateCheckRun = vi.mocked(createCheckRun);

	beforeEach(() => {
		vi.clearAllMocks();
		mockCore.summary.stringify.mockReturnValue("Test summary");
	});

	it("should create a successful check run when no tests failed", async () => {
		const inputs: Inputs = {
			statusCheckName: "Test Status",
			statusCheck: true,
		} as Inputs;

		const report: Report = {
			results: {
				summary: {
					passed: 5,
					skipped: 2,
				},
			},
		} as Report;

		await createStatusCheck(inputs, report);

		expect(mockCreateCheckRun).toHaveBeenCalledWith(
			"test-owner",
			"test-repo",
			"test-sha",
			"Test Status",
			"completed",
			"success",
			"5 passed, 2 skipped",
			"Test summary",
		);
	});

	it("should create a failed check run when tests failed", async () => {
		const inputs: Inputs = {
			statusCheckName: "Test Status",
			statusCheck: true,
		} as Inputs;

		const report: Report = {
			results: {
				summary: {
					failed: 1,
				},
			},
		} as Report;

		await createStatusCheck(inputs, report);

		expect(mockCreateCheckRun).toHaveBeenCalledWith(
			"test-owner",
			"test-repo",
			"test-sha",
			"Test Status",
			"completed",
			"failure",
			"1 failed",
			"Test summary",
		);
	});

	it("should truncate summary if it exceeds 65000 characters", async () => {
		const longSummary = "a".repeat(65001);
		mockCore.summary.stringify.mockReturnValue(longSummary);

		const inputs: Inputs = {
			statusCheckName: "Test Status",
			statusCheck: true,
		} as Inputs;

		const report: Report = {
			results: {
				summary: {
					passed: 10,
					failed: 0,
				},
			},
		} as Report;

		await createStatusCheck(inputs, report);

		expect(mockCore.warning).toHaveBeenCalledWith(
			"Summary is too long to create a status check. Truncating...",
		);
		expect(mockCreateCheckRun).toHaveBeenCalledWith(
			"test-owner",
			"test-repo",
			"test-sha",
			"Test Status",
			"completed",
			"success",
			"10 passed",
			expect.stringMatching(/^a{65000}$/),
		);
	});
});

describe("findExistingMarkedComment", () => {
	const mockListComments = vi.mocked(githubClient.listComments);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should return undefined when no comments exist", async () => {
		mockListComments.mockResolvedValue([]);

		const result = await findExistingMarkedComment(
			"owner",
			"repo",
			1,
			"<!-- MARKER -->",
		);

		expect(result.comment).toBeUndefined();
		expect(result.isLatest).toBeFalsy();
	});

	it("should return undefined when no comment with marker exists", async () => {
		const comments = [
			{
				id: 1,
				node_id: "node1",
				url: "url1",
				html_url: "html1",
				body: "Comment without marker",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			{
				id: 2,
				node_id: "node2",
				url: "url2",
				html_url: "html2",
				body: "Another comment without marker",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		] as IssueComment[];

		mockListComments.mockResolvedValue(comments);

		const result = await findExistingMarkedComment(
			"owner",
			"repo",
			1,
			"<!-- MARKER -->",
		);

		expect(result.comment).toBeUndefined();
		expect(result.isLatest).toBeFalsy();
	});

	it("should find marked comment and identify it is not latest", async () => {
		const comments = [
			{
				id: 1,
				node_id: "node1",
				url: "url1",
				html_url: "html1",
				body: "Comment with marker <!-- MARKER -->",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			{
				id: 2,
				node_id: "node2",
				url: "url2",
				html_url: "html2",
				body: "Latest comment without marker",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		] as IssueComment[];

		mockListComments.mockResolvedValue(comments);

		const result = await findExistingMarkedComment(
			"owner",
			"repo",
			1,
			"<!-- MARKER -->",
		);

		expect(result.comment).toEqual(comments[0]);
		expect(result.isLatest).toBeFalsy();
	});

	it("should find marked comment and identify it is latest", async () => {
		const comments = [
			{
				id: 1,
				node_id: "node1",
				url: "url1",
				html_url: "html1",
				body: "First comment without marker",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			{
				id: 2,
				node_id: "node2",
				url: "url2",
				html_url: "html2",
				body: "Comment with marker <!-- MARKER -->",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		] as IssueComment[];

		mockListComments.mockResolvedValue(comments);

		const result = await findExistingMarkedComment(
			"owner",
			"repo",
			1,
			"<!-- MARKER -->",
		);

		expect(result.comment).toEqual(comments[1]);
		expect(result.isLatest).toBeTruthy();
	});

	it("should find the latest marked comment when multiple exist", async () => {
		const comments = [
			{
				id: 1,
				node_id: "node1",
				url: "url1",
				html_url: "html1",
				body: "Old comment with marker <!-- MARKER -->",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
			{
				id: 2,
				node_id: "node2",
				url: "url2",
				html_url: "html2",
				body: "Latest comment with marker <!-- MARKER -->",
				user: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			},
		] as IssueComment[];

		mockListComments.mockResolvedValue(comments);

		const result = await findExistingMarkedComment(
			"owner",
			"repo",
			1,
			"<!-- MARKER -->",
		);

		expect(result.comment).toEqual(comments[1]);
		expect(result.isLatest).toBeTruthy();
	});
});

describe("handleComment", () => {
	const mockAddComment = vi.fn();
	const mockUpdateComment = vi.fn();
	const mockListComments = vi.fn();

	beforeEach(() => {
		vi.resetAllMocks();
		vi.mocked(githubClient.addCommentToIssue).mockImplementation(
			mockAddComment,
		);
		vi.mocked(githubClient.updateComment).mockImplementation(mockUpdateComment);
		vi.mocked(githubClient.listComments).mockImplementation(mockListComments);
	});

	describe("New PR - All flags disabled", () => {
		it("should create new comment when no comments exist", async () => {
			mockListComments.mockResolvedValue([]);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: false,
				shouldOverwrite: false,
				alwaysLatestComment: false,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});
	});

	describe("New PR - updateComment enabled", () => {
		it("should create new comment when no comment exists and updateComment enabled", async () => {
			mockListComments.mockResolvedValue([]);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: true,
				shouldOverwrite: false,
				alwaysLatestComment: false,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});

		it("should create new comment when no comment exists and updateComment and alwaysLatest enabled", async () => {
			mockListComments.mockResolvedValue([]);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: true,
				shouldOverwrite: false,
				alwaysLatestComment: true,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});
	});

	describe("New PR - overwriteComment enabled", () => {
		it("should create new comment when no comment exists and overwriteComment enabled", async () => {
			mockListComments.mockResolvedValue([]);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: false,
				shouldOverwrite: true,
				alwaysLatestComment: false,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});

		it("should create new comment when no comment exists and overwriteComment and alwaysLatest enabled", async () => {
			mockListComments.mockResolvedValue([]);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: false,
				shouldOverwrite: true,
				alwaysLatestComment: true,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});
	});

	describe("Existing PR - All flags disabled", () => {
		it("should create new comment when comment found and no flags enabled", async () => {
			const existingComments = [
				{
					id: 1,
					node_id: "node1",
					url: "url1",
					html_url: "html1",
					body: "Existing comment with MARKER",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			] as IssueComment[];

			mockListComments.mockResolvedValue(existingComments);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: false,
				shouldOverwrite: false,
				alwaysLatestComment: false,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});
	});

	describe("Existing PR - updateComment enabled", () => {
		it("should update existing comment when updateComment enabled", async () => {
			const existingComments = [
				{
					id: 1,
					node_id: "node1",
					url: "url1",
					html_url: "html1",
					body: "Existing comment with MARKER",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			] as IssueComment[];

			mockListComments.mockResolvedValue(existingComments);

			await handleComment("owner", "repo", 1, "Updated comment", "MARKER", {
				shouldUpdate: true,
				shouldOverwrite: false,
				alwaysLatestComment: false,
			});

			expect(mockUpdateComment).toHaveBeenCalled();
			expect(mockAddComment).not.toHaveBeenCalled();
		});

		it("should update existing comment when updateComment enabled and alwaysLatest enabled and comment is latest", async () => {
			const existingComments = [
				{
					id: 1,
					node_id: "node1",
					url: "url1",
					html_url: "html1",
					body: "First comment without marker",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
				{
					id: 2,
					node_id: "node2",
					url: "url2",
					html_url: "html2",
					body: "Latest comment with MARKER",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			] as IssueComment[];

			mockListComments.mockResolvedValue(existingComments);

			await handleComment("owner", "repo", 1, "Updated comment", "MARKER", {
				shouldUpdate: true,
				shouldOverwrite: false,
				alwaysLatestComment: true,
			});

			expect(mockUpdateComment).toHaveBeenCalled();
			expect(mockAddComment).not.toHaveBeenCalled();
		});

		it("should create new comment when updateComment enabled and alwaysLatest enabled and comment is not latest", async () => {
			const existingComments = [
				{
					id: 1,
					node_id: "node1",
					url: "url1",
					html_url: "html1",
					body: "Comment with MARKER",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
				{
					id: 2,
					node_id: "node2",
					url: "url2",
					html_url: "html2",
					body: "Latest comment without marker",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			] as IssueComment[];

			mockListComments.mockResolvedValue(existingComments);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: true,
				shouldOverwrite: false,
				alwaysLatestComment: true,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});
	});

	describe("Existing PR - overwriteComment enabled", () => {
		it("should overwrite existing comment when overwriteComment enabled", async () => {
			const existingComments = [
				{
					id: 1,
					node_id: "node1",
					url: "url1",
					html_url: "html1",
					body: "Existing comment with MARKER",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			] as IssueComment[];

			mockListComments.mockResolvedValue(existingComments);

			await handleComment("owner", "repo", 1, "Overwritten comment", "MARKER", {
				shouldUpdate: false,
				shouldOverwrite: true,
				alwaysLatestComment: false,
			});

			expect(mockUpdateComment).toHaveBeenCalled();
			expect(mockAddComment).not.toHaveBeenCalled();
		});

		it("should overwrite existing comment when overwriteComment enabled and alwaysLatest enabled and comment is latest", async () => {
			const existingComments = [
				{
					id: 1,
					node_id: "node1",
					url: "url1",
					html_url: "html1",
					body: "First comment without marker",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
				{
					id: 2,
					node_id: "node2",
					url: "url2",
					html_url: "html2",
					body: "Latest comment with MARKER",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			] as IssueComment[];

			mockListComments.mockResolvedValue(existingComments);

			await handleComment("owner", "repo", 1, "Overwritten comment", "MARKER", {
				shouldUpdate: false,
				shouldOverwrite: true,
				alwaysLatestComment: true,
			});

			expect(mockUpdateComment).toHaveBeenCalled();
			expect(mockAddComment).not.toHaveBeenCalled();
		});

		it("should create new comment when overwriteComment enabled and alwaysLatest enabled and comment is not latest", async () => {
			const existingComments = [
				{
					id: 1,
					node_id: "node1",
					url: "url1",
					html_url: "html1",
					body: "Comment with MARKER",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
				{
					id: 2,
					node_id: "node2",
					url: "url2",
					html_url: "html2",
					body: "Latest comment without marker",
					user: null,
					created_at: new Date().toISOString(),
					updated_at: new Date().toISOString(),
				},
			] as IssueComment[];

			mockListComments.mockResolvedValue(existingComments);

			await handleComment("owner", "repo", 1, "New comment", "MARKER", {
				shouldUpdate: false,
				shouldOverwrite: true,
				alwaysLatestComment: true,
			});

			expect(mockAddComment).toHaveBeenCalledWith(
				"owner",
				"repo",
				1,
				"New comment\nMARKER",
			);
			expect(mockUpdateComment).not.toHaveBeenCalled();
		});
	});
});

describe("handleViewsAndComments", () => {
	const mockCore = vi.mocked(core);
	beforeEach(() => {
		vi.clearAllMocks();
		context.payload ||= {};
		mockCore.summary.stringify.mockReturnValue("Test summary");
		mockCore.summary.addRaw.mockReturnValue(mockCore.summary);
		mockCore.summary.addEOL.mockReturnValue(mockCore.summary);
	});

	it("should create a check run with views and comments", async () => {
		const inputs: Inputs = {
			statusCheckName: "Test Status",
			statusCheck: true,
		} as Inputs;

		const report = {
			results: {
				summary: {
					failed: 0,
				},
				tests: [],
			},
			extra: {
				reportConditionals: {
					includeFailedReportCurrentFooter: false,
				},
			},
		} as unknown as Report;
		await handleViewsAndComments(inputs, report);

		expect(mockCore.setOutput).toHaveBeenCalledTimes(2);
	});
});

describe("resolveIssueRepo", () => {
	it("should fall back to the workflow repository when issue-repo is empty", () => {
		expect(resolveIssueRepo("")).toEqual({
			owner: "test-owner",
			repo: "test-repo",
		});
	});

	it("should resolve owner and repo from an owner/repo value", () => {
		expect(resolveIssueRepo("some-org/some-repo")).toEqual({
			owner: "some-org",
			repo: "some-repo",
		});
	});

	it.each(["no-slash", "too/many/slashes", "/missing-owner", "missing-repo/"])(
		"should throw for malformed issue-repo %s",
		(value) => {
			expect(() => resolveIssueRepo(value)).toThrow(
				`Invalid issue-repo "${value}" - expected "owner/repo" format`,
			);
		},
	);
});
