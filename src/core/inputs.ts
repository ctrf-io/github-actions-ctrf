import * as core from "@actions/core";
import type { Inputs } from "../types/reporter.js";
import type {
	IntegrationsConfig,
	AIStandaloneConfig,
} from "src/types/integrations.js";

export function getInputs(): Inputs {
	const groupByInput = core.getInput("group-by") || "filePath";

	const groupBy: "suite" | "filePath" =
		groupByInput === "suite" ? "suite" : "filePath";

	const reportOrderInput = core.getInput("report-order");
	const reportOrder = reportOrderInput
		? reportOrderInput.split(",").map((s: string) => s.trim())
		: [];

	const baselineInput = core.getInput("baseline");
	const baseline =
		baselineInput !== "" && !Number.isNaN(Number(baselineInput))
			? Number(baselineInput)
			: baselineInput;

	return {
		ctrfPath: core.getInput("report-path", { required: true }),
		templatePath: core.getInput("template-path"),
		summary: core.getInput("summary").toLowerCase() === "true",
		githubReport: core.getInput("github-report").toLowerCase() === "true",
		pullRequest: core.getInput("pull-request").toLowerCase() === "true",
		issue: core.getInput("issue").toLowerCase() || "",
		issueRepo: core.getInput("issue-repo") || "",
		collapseLargeReports:
			core.getInput("collapse-large-reports").toLowerCase() === "true",
		summaryReport: core.getInput("summary-report").toLowerCase() === "true",
		summaryDeltaReport:
			core.getInput("summary-delta-report").toLowerCase() === "true",
		testsChangedReport:
			core.getInput("tests-changed-report").toLowerCase() === "true",
		testReport: core.getInput("test-report").toLowerCase() === "true",
		testListReport: core.getInput("test-list-report").toLowerCase() === "true",
		failedReport: core.getInput("failed-report").toLowerCase() === "true",
		failRateReport: core.getInput("fail-rate-report").toLowerCase() === "true",
		flakyReport: core.getInput("flaky-report").toLowerCase() === "true",
		flakyRateReport:
			core.getInput("flaky-rate-report").toLowerCase() === "true",
		failedFoldedReport:
			core.getInput("failed-folded-report").toLowerCase() === "true",
		previousResultsReport:
			core.getInput("previous-results-report").toLowerCase() === "true",
		aiReport: core.getInput("ai-report").toLowerCase() === "true",
		aiSummaryReport:
			core.getInput("ai-summary-report").toLowerCase() === "true",
		skippedReport: core.getInput("skipped-report").toLowerCase() === "true",
		suiteFoldedReport:
			core.getInput("suite-folded-report").toLowerCase() === "true",
		suiteListReport:
			core.getInput("suite-list-report").toLowerCase() === "true",
		pullRequestReport:
			core.getInput("pull-request-report").toLowerCase() === "true",
		commitReport: core.getInput("commit-report").toLowerCase() === "true",
		insightsReport: core.getInput("insights-report").toLowerCase() === "true",
		slowestReport: core.getInput("slowest-report").toLowerCase() === "true",
		customReport: core.getInput("custom-report").toLowerCase() === "true",
		communityReport: core.getInput("community-report").toLowerCase() === "true",
		communityReportName: core.getInput("community-report-name"),
		fileReport: core.getInput("file-report").toLowerCase() === "true",
		artifactName: core.getInput("artifact-name") || "ctrf-report",
		annotate: core.getInput("annotate").toLowerCase() === "true",
		title: core.getInput("title") || "",
		onFailOnly: core.getInput("on-fail-only").toLowerCase() === "true",
		exitOnNoFiles: core.getInput("exit-on-no-files").toLowerCase() === "true",
		exitOnFail: core.getInput("exit-on-fail").toLowerCase() === "true",
		exitOnEmpty: core.getInput("exit-on-empty").toLowerCase() === "true",
		useSuiteName: core.getInput("use-suite-name").toLowerCase() === "true",
		previousResultsMax: parseInt(
			core.getInput("previous-results-max") || "10",
			10,
		),
		flakyRateReportMax: parseInt(
			core.getInput("flaky-rate-report-max") || "-1",
			10,
		),
		failRateReportMax: parseInt(
			core.getInput("fail-rate-report-max") || "-1",
			10,
		),
		metricsReportsMax: parseInt(
			core.getInput("metrics-reports-max") || "100",
			10,
		),
		maxWorkflowRunsToCheck: parseInt(
			core.getInput("max-workflow-runs-to-check") || "400",
			10,
		),
		maxPreviousRunsToFetch: parseInt(
			core.getInput("max-previous-runs-to-fetch") || "100",
			10,
		),
		fetchPreviousResults:
			core.getInput("fetch-previous-results").toLowerCase() === "true",
		updateComment: core.getInput("update-comment").toLowerCase() === "true",
		overwriteComment:
			core.getInput("overwrite-comment").toLowerCase() === "true",
		alwaysLatestComment:
			core.getInput("always-latest-comment").toLowerCase() === "true",
		commentTag: core.getInput("comment-tag") || "",
		writeCtrfToFile: core.getInput("write-ctrf-to-file") || "",
		uploadArtifact: core.getInput("upload-artifact").toLowerCase() === "true",
		groupBy: groupBy,
		alwaysGroupBy: core.getInput("always-group-by").toLowerCase() === "true",
		integrationsConfig: JSON.parse(
			core.getInput("integrations-config") || "{}",
		) as IntegrationsConfig,
		ai: JSON.parse(core.getInput("ai") || "{}") as AIStandaloneConfig,
		statusCheck: core.getInput("status-check").toLowerCase() === "true",
		statusCheckName:
			core.getInput("status-check-name") || "Test Reporter Results",
		reportOrder,
		baseline: baseline,
		baselineReportPath: core.getInput("baseline-report-path") || "",
	};
}
