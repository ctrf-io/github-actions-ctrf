import { vi, describe, it, expect, beforeEach } from "vitest";
import AdmZip from "adm-zip";
import type { components } from "@octokit/openapi-types";

type Artifact = components["schemas"]["artifact"];
type WorkflowRun = components["schemas"]["workflow-run"];

// Holds the stub the current test wants the Octokit client to fetch through.
const stub = vi.hoisted(() => ({
	fetch: undefined as
		| ((url: string, init?: RequestInit) => Promise<Response>)
		| undefined,
}));

// A real Octokit, so octokit.paginate under test is the real implementation:
// it follows Link headers rather than any page walking invented here.
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

vi.mock("@actions/github", () => ({
	context: {
		repo: {
			owner: "test-owner",
			repo: "test-repo",
		},
	},
}));

const { fetchArtifacts, processArtifactsFromRun } = await import(
	"../../src/client/github/artifacts.js"
);

const ARTIFACT_NAME = "ctrf-report";

function createArtifact(id: number, name: string): Artifact {
	return {
		id,
		name,
		node_id: `node-${id}`,
		size_in_bytes: 100,
		url: `https://api.github.com/artifacts/${id}`,
		archive_download_url: `https://api.github.com/artifacts/${id}/zip`,
		expired: false,
		created_at: null,
		expires_at: null,
		updated_at: null,
	} as Artifact;
}

function createZippedReport(corrupt = false): Buffer {
	const zip = new AdmZip();
	zip.addFile(
		"ctrf-report.json",
		Buffer.from(
			corrupt
				? "{ not json"
				: JSON.stringify({
						reportFormat: "CTRF",
						specVersion: "1.0.0",
						results: {
							tool: { name: "vitest" },
							summary: {
								tests: 1,
								passed: 1,
								failed: 0,
								skipped: 0,
								pending: 0,
								other: 0,
								start: 0,
								stop: 1,
							},
							tests: [{ name: "test1", status: "passed", duration: 1 }],
						},
					}),
		),
	);
	return zip.toBuffer();
}

/**
 * Builds a response that reports the URL it came from, as a real fetch response
 * does. Octokit's pagination reads response.url, and a constructed Response
 * leaves it empty.
 */
function respond(url: string, body: BodyInit, init: ResponseInit): Response {
	const response = new Response(body, init);
	Object.defineProperty(response, "url", { value: url });
	return response;
}

/**
 * Serves the artifacts list endpoint the way GitHub does: one page per request,
 * with the next page offered through a Link header only.
 * @param artifacts - The artifacts the run holds.
 * @param options.honoursNameFilter - False models an API too old to know the
 * `name` query parameter, which then returns the whole run.
 * @param options.goneIds - Artifact ids whose download answers 410, as GitHub
 * does once retention has passed.
 * @param options.corruptIds - Artifact ids whose zip holds unparseable JSON.
 */
function createArtifactsApi(
	artifacts: Artifact[],
	options: {
		honoursNameFilter?: boolean;
		goneIds?: number[];
		corruptIds?: number[];
	} = {},
) {
	const { honoursNameFilter = true, goneIds = [], corruptIds = [] } = options;
	const listed: URL[] = [];
	const downloaded: string[] = [];

	const fetch = async (input: string): Promise<Response> => {
		const url = new URL(input);

		if (url.pathname.endsWith("/artifacts")) {
			listed.push(url);

			const name = url.searchParams.get("name");
			const perPage = Number(url.searchParams.get("per_page") ?? 30);
			const page = Number(url.searchParams.get("page") ?? 1);
			const matching =
				honoursNameFilter && name !== null
					? artifacts.filter((artifact) => artifact.name === name)
					: artifacts;

			const headers = new Headers({ "content-type": "application/json" });
			if (page * perPage < matching.length) {
				const next = new URL(url);
				next.searchParams.set("page", String(page + 1));
				headers.set("link", `<${next.toString()}>; rel="next"`);
			}

			return respond(
				input,
				JSON.stringify({
					total_count: matching.length,
					artifacts: matching.slice((page - 1) * perPage, page * perPage),
				}),
				{ status: 200, headers },
			);
		}

		if (url.pathname.endsWith("/zip")) {
			downloaded.push(url.pathname);
			const id = Number(url.pathname.split("/").at(-2));

			if (goneIds.includes(id)) {
				return respond(input, JSON.stringify({ message: "Gone" }), {
					status: 410,
					headers: { "content-type": "application/json" },
				});
			}

			return respond(
				input,
				new Uint8Array(createZippedReport(corruptIds.includes(id))),
				{ status: 200, headers: { "content-type": "application/zip" } },
			);
		}

		return respond(input, "[]", {
			status: 404,
			headers: { "content-type": "application/json" },
		});
	};

	return { fetch, listed, downloaded };
}

beforeEach(() => {
	stub.fetch = undefined;
});

describe("fetchArtifacts", () => {
	it("should return artifacts from every page of the run", async () => {
		const api = createArtifactsApi(
			Array.from({ length: 250 }, (_, index) =>
				createArtifact(index + 1, `artifact-${index + 1}`),
			),
		);
		stub.fetch = api.fetch;

		const fetched = await fetchArtifacts("test-owner", "test-repo", 42);

		expect(fetched).toHaveLength(250);
		expect(fetched.at(-1)?.name).toBe("artifact-250");
		expect(
			api.listed.map((url) => url.searchParams.get("page") ?? "1"),
		).toEqual(["1", "2", "3"]);
		expect(api.listed[0]?.searchParams.get("per_page")).toBe("100");
		expect(api.listed[0]?.pathname).toBe(
			"/repos/test-owner/test-repo/actions/runs/42/artifacts",
		);
	});

	it("should filter on artifact name when one is given", async () => {
		const api = createArtifactsApi([
			createArtifact(1, "other-artifact"),
			createArtifact(2, ARTIFACT_NAME),
		]);
		stub.fetch = api.fetch;

		const fetched = await fetchArtifacts(
			"test-owner",
			"test-repo",
			42,
			ARTIFACT_NAME,
		);

		expect(fetched.map((artifact) => artifact.id)).toEqual([2]);
		expect(api.listed[0]?.searchParams.get("name")).toBe(ARTIFACT_NAME);
	});

	it("should not send a name filter when no usable name is given", async () => {
		const api = createArtifactsApi([createArtifact(1, ARTIFACT_NAME)]);
		stub.fetch = api.fetch;

		await fetchArtifacts("test-owner", "test-repo", 42);
		await fetchArtifacts("test-owner", "test-repo", 42, "");

		// A bare `name=` would match no artifact at all.
		expect(api.listed[0]?.searchParams.has("name")).toBe(false);
		expect(api.listed[1]?.searchParams.has("name")).toBe(false);
	});
});

describe("processArtifactsFromRun", () => {
	it("should download the artifact matching the report name", async () => {
		const api = createArtifactsApi([
			createArtifact(1, "other-artifact"),
			createArtifact(2, ARTIFACT_NAME),
		]);
		stub.fetch = api.fetch;

		const reports = await processArtifactsFromRun(
			{ id: 42 } as WorkflowRun,
			ARTIFACT_NAME,
		);

		expect(reports).toHaveLength(1);
		expect(reports[0]?.results.summary.tests).toBe(1);
		expect(api.downloaded).toEqual(["/artifacts/2/zip"]);
	});

	it("should skip artifacts whose retention has expired", async () => {
		const api = createArtifactsApi([
			{ ...createArtifact(1, ARTIFACT_NAME), expired: true },
			createArtifact(2, ARTIFACT_NAME),
		]);
		stub.fetch = api.fetch;

		const reports = await processArtifactsFromRun(
			{ id: 42 } as WorkflowRun,
			ARTIFACT_NAME,
		);

		expect(reports).toHaveLength(1);
		expect(api.downloaded).toEqual(["/artifacts/2/zip"]);
	});

	it("should keep the reports collected before a download fails", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		const api = createArtifactsApi(
			[createArtifact(1, ARTIFACT_NAME), createArtifact(2, ARTIFACT_NAME)],
			{ goneIds: [1] },
		);
		stub.fetch = api.fetch;

		const reports = await processArtifactsFromRun(
			{ id: 42 } as WorkflowRun,
			ARTIFACT_NAME,
		);

		expect(reports).toHaveLength(1);
		expect(api.downloaded).toEqual(["/artifacts/1/zip", "/artifacts/2/zip"]);
		expect(logged).toHaveBeenCalledOnce();
		logged.mockRestore();
	});

	it("should keep the reports collected before an unreadable artifact", async () => {
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		const api = createArtifactsApi(
			[createArtifact(1, ARTIFACT_NAME), createArtifact(2, ARTIFACT_NAME)],
			{ corruptIds: [1] },
		);
		stub.fetch = api.fetch;

		const reports = await processArtifactsFromRun(
			{ id: 42 } as WorkflowRun,
			ARTIFACT_NAME,
		);

		expect(reports).toHaveLength(1);
		expect(logged).toHaveBeenCalledOnce();
		logged.mockRestore();
	});

	it("should find the report on a later page when the name filter is ignored", async () => {
		const api = createArtifactsApi(
			[
				...Array.from({ length: 200 }, (_, index) =>
					createArtifact(index + 1, `other-artifact-${index + 1}`),
				),
				createArtifact(201, ARTIFACT_NAME),
			],
			{ honoursNameFilter: false },
		);
		stub.fetch = api.fetch;

		const reports = await processArtifactsFromRun(
			{ id: 42 } as WorkflowRun,
			ARTIFACT_NAME,
		);

		expect(reports).toHaveLength(1);
		expect(api.listed).toHaveLength(3);
		expect(api.downloaded).toEqual(["/artifacts/201/zip"]);
	});
});
