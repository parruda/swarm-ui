# frozen_string_literal: true

require "open3"
require "uri"

class GithubReactionService
  class << self
    # Extracts the numeric comment ID from various GitHub URL formats using proper URI parsing
    # Handles:
    # - API URLs: https://api.github.com/repos/owner/repo/issues/comments/123456 → 123456
    # - Web URLs with anchors: https://github.com/owner/repo/issues/1#issuecomment-888 → 888
    # - PR review comments: https://github.com/owner/repo/pull/1#discussion_r123456 → 123456
    def extract_comment_id_from_url(url)
      uri = URI(url)

      # Check if URL has a fragment (part after #)
      if uri.fragment
        # Extract numeric ID from fragment
        # Handles patterns like "issuecomment-123456" or "discussion_r789012"
        uri.fragment.gsub(/\D/, "")
      else
        # For API URLs or simple paths, extract the last path segment
        uri.path.split("/").last
      end
    rescue URI::InvalidURIError
      # Fallback for non-URI strings (e.g., simple paths)
      url.split("/").last
    end

    def add_thumbs_up_to_comment(repo_full_name, comment_url)
      Rails.logger.info("Adding thumbs up reaction to comment: #{comment_url}")

      # Extract comment ID from the URL (handles both API and web URLs)
      comment_id = extract_comment_id_from_url(comment_url)
      # Sanitize comment_id to ensure it's numeric
      sanitized_comment_id = InputSanitizer.sanitize_numeric_id(comment_id)

      # Sanitize repo name
      sanitized_repo = InputSanitizer.sanitize_github_repo(repo_full_name)

      # Use gh CLI to add reaction
      # gh api method: POST /repos/{owner}/{repo}/issues/comments/{comment_id}/reactions
      cmd = [
        "gh",
        "api",
        "--method",
        "POST",
        "/repos/#{sanitized_repo}/issues/comments/#{sanitized_comment_id}/reactions",
        "-f",
        "content=+1",
      ]

      stdout, stderr, status = Open3.capture3(*cmd)

      if status.success?
        Rails.logger.info("Successfully added thumbs up reaction to comment #{comment_id}")
        true
      else
        Rails.logger.error("Failed to add reaction: #{stderr.presence || stdout}")
        false
      end
    rescue => e
      Rails.logger.error("Error adding reaction: #{e.message}")
      false
    end

    def add_thumbs_up_to_pr_review_comment(repo_full_name, comment_url)
      Rails.logger.info("Adding thumbs up reaction to PR review comment: #{comment_url}")

      # Extract comment ID from the URL (handles both API and web URLs)
      comment_id = extract_comment_id_from_url(comment_url)
      # Sanitize comment_id to ensure it's numeric
      sanitized_comment_id = InputSanitizer.sanitize_numeric_id(comment_id)

      # Sanitize repo name
      sanitized_repo = InputSanitizer.sanitize_github_repo(repo_full_name)

      # Use gh CLI to add reaction to pull request review comment
      # gh api method: POST /repos/{owner}/{repo}/pulls/comments/{comment_id}/reactions
      cmd = [
        "gh",
        "api",
        "--method",
        "POST",
        "/repos/#{sanitized_repo}/pulls/comments/#{sanitized_comment_id}/reactions",
        "-f",
        "content=+1",
      ]

      stdout, stderr, status = Open3.capture3(*cmd)

      if status.success?
        Rails.logger.info("Successfully added thumbs up reaction to PR review comment #{comment_id}")
        true
      else
        Rails.logger.error("Failed to add reaction: #{stderr.presence || stdout}")
        false
      end
    rescue => e
      Rails.logger.error("Error adding reaction: #{e.message}")
      false
    end
  end
end
