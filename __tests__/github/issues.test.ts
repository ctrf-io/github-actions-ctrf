import { vi, describe, it, expect, beforeEach } from "vitest";
import type { components } from "@octokit/openapi-types";

type IssueComment = components["schemas"]["issue-comment"];

// Holds the stub the current test wants the Octokit client to fetch through.
const stub = vi.hoisted(() => ({
	fetch: undefined as
		| ((url: string, init?: RequestInit) => Promise<Response>)
		| undefined,
}));

// A real Octokit, so octokit.paginate under test is the real implementation
// walking Link headers.
vi.mock("../../src/client/github/index.js", async () => {
	const { Octokit } = await import("@octokit/rest");

	return {
		createGitHubClient: async () =>
			new Octokit({
				auth: "test-token",
				request: {
					fetch: (url: string, init?: RequestInit) => {
						if (stub.fetch === undefined) {
							throw new Error("no fetch stub installed for this test");
						}
						return stub.fetch(url, init);
					},
				},
			}),
	};
});

const { listComments } = await import("../../src/client/github/issues.js");

function createComment(id: number): IssueComment {
	return {
		id,
		node_id: `node-${id}`,
		body: `comment ${id}`,
		url: `https://api.github.com/comments/${id}`,
		html_url: `https://github.com/test-owner/test-repo/pull/7#${id}`,
		issue_url: "https://api.github.com/repos/test-owner/test-repo/issues/7",
		created_at: "2026-01-01T00:00:00Z",
		updated_at: "2026-01-01T00:00:00Z",
	} as IssueComment;
}

/**
 * Serves the issue comments endpoint the way GitHub does: oldest first, one
 * page per request, with the next page offered through a Link header only.
 */
function createCommentsApi(comments: IssueComment[]) {
	const listed: URL[] = [];

	const fetch = async (input: string): Promise<Response> => {
		const url = new URL(input);
		listed.push(url);

		const perPage = Number(url.searchParams.get("per_page") ?? 30);
		const page = Number(url.searchParams.get("page") ?? 1);

		const headers = new Headers({ "content-type": "application/json" });
		if (page * perPage < comments.length) {
			const next = new URL(url);
			next.searchParams.set("page", String(page + 1));
			headers.set("link", `<${next.toString()}>; rel="next"`);
		}

		const response = new Response(
			JSON.stringify(comments.slice((page - 1) * perPage, page * perPage)),
			{ status: 200, headers },
		);
		// Octokit's pagination reads response.url, which a constructed Response
		// leaves empty.
		Object.defineProperty(response, "url", { value: input });
		return response;
	};

	return { fetch, listed };
}

beforeEach(() => {
	stub.fetch = undefined;
});

describe("listComments", () => {
	it("should return comments from every page, newest last", async () => {
		const api = createCommentsApi(
			Array.from({ length: 150 }, (_, index) => createComment(index + 1)),
		);
		stub.fetch = api.fetch;

		const comments = await listComments("test-owner", "test-repo", 7);

		expect(comments).toHaveLength(150);
		expect(comments.at(-1)?.id).toBe(150);
		expect(
			api.listed.map((url) => url.searchParams.get("page") ?? "1"),
		).toEqual(["1", "2"]);
		expect(api.listed[0]?.searchParams.get("per_page")).toBe("100");
		expect(api.listed[0]?.pathname).toBe(
			"/repos/test-owner/test-repo/issues/7/comments",
		);
	});

	it("should return an empty list when the pull request has no comments", async () => {
		const api = createCommentsApi([]);
		stub.fetch = api.fetch;

		const comments = await listComments("test-owner", "test-repo", 7);

		expect(comments).toEqual([]);
	});
});
