import type { components } from "@octokit/openapi-types";
import { createGitHubClient } from "./index.js";

type IssueComment = components["schemas"]["issue-comment"];

/**
 * Adds a comment to a specified pull request on GitHub.
 *
 * @param owner - The owner of the repository (organization or user).
 * @param repo - The name of the repository.
 * @param issue_number - The pull request number to which the comment will be added.
 * @param body - The content of the comment to be added.
 *
 * @returns {Promise<IssueComment>} A promise that resolves to the response data from GitHub's API.
 *
 * @throws {Error} If the GitHub client fails to authenticate or the API request fails.
 */
export async function addCommentToIssue(
	owner: string,
	repo: string,
	issue_number: number,
	body: string,
): Promise<IssueComment> {
	const octokit = await createGitHubClient();
	const response = await octokit.issues.createComment({
		owner,
		repo,
		issue_number,
		body,
	});
	return response.data;
}

/**
 * Updates a comment to a specified pull request on GitHub.
 *
 * @param comment_id - The ID number of the comment
 * @param owner - The owner of the repository (organization or user).
 * @param repo - The name of the repository.
 * @param issue_number - The pull request number to which the comment will be added.
 * @param body - The content of the comment to be added.
 *
 * @returns {Promise<IssueComment>} A promise that resolves to the response data from GitHub's API.
 *
 * @throws {Error} If the GitHub client fails to authenticate or the API request fails.
 */
export async function updateComment(
	comment_id: number,
	owner: string,
	repo: string,
	issue_number: number,
	body: string,
): Promise<IssueComment> {
	const octokit = await createGitHubClient();
	const response = await octokit.issues.updateComment({
		comment_id,
		owner,
		repo,
		issue_number,
		body,
	});
	return response.data;
}

/**
 * Lists comments on a specified pull request on GitHub.
 *
 * @param owner - The owner of the repository (organization or user).
 * @param repo - The name of the repository.
 * @param issue_number - The pull request number to which the comments are listed.
 *
 * @returns {Promise<IssueComment[]>} A promise that resolves to the response data from GitHub's API.
 *
 * @throws {Error} If the GitHub client fails to authenticate or the API request fails.
 */
export async function listComments(
	owner: string,
	repo: string,
	issue_number: number,
): Promise<IssueComment[]> {
	const octokit = await createGitHubClient();
	return octokit.paginate(octokit.issues.listComments, {
		owner,
		repo,
		issue_number,
		per_page: 100,
	});
}

/**
 * Deletes a comment on a specified pull request on GitHub.
 *
 * @param comment_id - The ID number of the comment
 * @param owner - The owner of the repository (organization or user).
 * @param repo - The name of the repository.
 * @param issue_number - The pull request number to which the comment will be added.
 */
export async function deleteComment(
	comment_id: number,
	owner: string,
	repo: string,
	issue_number: number,
): Promise<void> {
	const octokit = await createGitHubClient();
	await octokit.issues.deleteComment({
		comment_id,
		owner,
		repo,
		issue_number,
	});
}
