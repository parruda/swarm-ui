# frozen_string_literal: true

require "test_helper"

class GithubReactionServiceTest < ActiveSupport::TestCase
  setup do
    @repo_full_name = "rails/rails"
    @comment_url = "https://api.github.com/repos/rails/rails/issues/comments/123456"
    @pr_comment_url = "https://api.github.com/repos/rails/rails/pulls/comments/789012"
  end

  # add_thumbs_up_to_comment tests
  test "handles web URL format for issue comments" do
    web_comment_url = "https://github.com/rails/rails/issues/1#issuecomment-123456"
    expected_cmd = [
      "gh",
      "api",
      "--method",
      "POST",
      "/repos/#{@repo_full_name}/issues/comments/123456/reactions",
      "-f",
      "content=+1",
    ]

    Open3.expects(:capture3).with(*expected_cmd).returns(["Success", "", stub(success?: true)])
    Rails.logger.expects(:info).with("Adding thumbs up reaction to comment: #{web_comment_url}")
    Rails.logger.expects(:info).with("Successfully added thumbs up reaction to comment 123456")

    result = GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, web_comment_url)

    assert result
  end

  test "adds thumbs up to issue comment successfully" do
    expected_cmd = [
      "gh",
      "api",
      "--method",
      "POST",
      "/repos/#{@repo_full_name}/issues/comments/123456/reactions",
      "-f",
      "content=+1",
    ]

    Open3.expects(:capture3).with(*expected_cmd).returns(["Success", "", stub(success?: true)])
    Rails.logger.expects(:info).with("Adding thumbs up reaction to comment: #{@comment_url}")
    Rails.logger.expects(:info).with("Successfully added thumbs up reaction to comment 123456")

    result = GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, @comment_url)

    assert result
  end

  test "extracts comment ID from various URL formats correctly" do
    # Test API URL format
    api_url = "https://api.github.com/repos/owner/repo/issues/comments/999"
    assert_equal "999", GithubReactionService.extract_comment_id_from_url(api_url)

    # Test web URL with issuecomment anchor
    web_url = "https://github.com/owner/repo/issues/1#issuecomment-888"
    assert_equal "888", GithubReactionService.extract_comment_id_from_url(web_url)

    # Test PR review comment with discussion_r anchor
    pr_url = "https://github.com/owner/repo/pull/1#discussion_r123456"
    assert_equal "123456", GithubReactionService.extract_comment_id_from_url(pr_url)

    # Test simple path
    simple_path = "some/path/777"
    assert_equal "777", GithubReactionService.extract_comment_id_from_url(simple_path)

    # Test edge case: fragment with mixed content
    mixed_fragment = "https://github.com/owner/repo/issues/42#issuecomment-abc123xyz456"
    assert_equal "123456", GithubReactionService.extract_comment_id_from_url(mixed_fragment)

    # Test URL with query parameters and fragment
    complex_url = "https://github.com/owner/repo/issues/1?tab=comments#issuecomment-999"
    assert_equal "999", GithubReactionService.extract_comment_id_from_url(complex_url)
  end

  test "handles gh command failure for issue comment" do
    error_message = "error: failed to add reaction"

    Open3.expects(:capture3).returns(["", error_message, stub(success?: false)])
    Rails.logger.expects(:error).with("Failed to add reaction: #{error_message}")

    result = GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, @comment_url)

    assert_not result
  end

  test "uses stdout if stderr is blank on failure" do
    stdout_message = "Authentication required"

    Open3.expects(:capture3).returns([stdout_message, "", stub(success?: false)])
    Rails.logger.expects(:error).with("Failed to add reaction: #{stdout_message}")

    result = GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, @comment_url)

    assert_not result
  end

  test "handles exceptions when adding reaction to comment" do
    Open3.expects(:capture3).raises(StandardError, "Command not found")
    Rails.logger.expects(:error).with("Error adding reaction: Command not found")

    result = GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, @comment_url)

    assert_not result
  end

  # add_thumbs_up_to_pr_review_comment tests
  test "adds thumbs up to PR review comment successfully" do
    expected_cmd = [
      "gh",
      "api",
      "--method",
      "POST",
      "/repos/#{@repo_full_name}/pulls/comments/789012/reactions",
      "-f",
      "content=+1",
    ]

    Open3.expects(:capture3).with(*expected_cmd).returns(["Success", "", stub(success?: true)])
    Rails.logger.expects(:info).with("Adding thumbs up reaction to PR review comment: #{@pr_comment_url}")
    Rails.logger.expects(:info).with("Successfully added thumbs up reaction to PR review comment 789012")

    result = GithubReactionService.add_thumbs_up_to_pr_review_comment(@repo_full_name, @pr_comment_url)

    assert result
  end

  test "uses correct API endpoint for PR review comments" do
    # PR review comments use /pulls/comments/ instead of /issues/comments/
    Open3.expects(:capture3).with(
      "gh",
      "api",
      "--method",
      "POST",
      "/repos/#{@repo_full_name}/pulls/comments/789012/reactions",
      "-f",
      "content=+1",
    ).returns(["", "", stub(success?: true)])

    GithubReactionService.add_thumbs_up_to_pr_review_comment(@repo_full_name, @pr_comment_url)
  end

  test "handles gh command failure for PR review comment" do
    error_message = "error: not found"

    Open3.expects(:capture3).returns(["", error_message, stub(success?: false)])
    Rails.logger.expects(:error).with("Failed to add reaction: #{error_message}")

    result = GithubReactionService.add_thumbs_up_to_pr_review_comment(@repo_full_name, @pr_comment_url)

    assert_not result
  end

  test "handles exceptions when adding reaction to PR comment" do
    Open3.expects(:capture3).raises(Errno::ENOENT, "gh command not found")
    Rails.logger.expects(:error).with(regexp_matches(/Error adding reaction:.*gh command not found/))

    result = GithubReactionService.add_thumbs_up_to_pr_review_comment(@repo_full_name, @pr_comment_url)

    assert_not result
  end

  # Repository name handling tests
  test "handles repository names with hyphens and underscores" do
    complex_repo = "my-org/my_complex-repo.name"

    Open3.expects(:capture3).with(
      "gh",
      "api",
      "--method",
      "POST",
      "/repos/#{complex_repo}/issues/comments/123456/reactions",
      "-f",
      "content=+1",
    ).returns(["", "", stub(success?: true)])

    result = GithubReactionService.add_thumbs_up_to_comment(complex_repo, @comment_url)

    assert result
  end

  # Content type tests
  test "always uses +1 reaction content" do
    # The service is specifically for thumbs up reactions
    Open3.expects(:capture3).with(
      anything,
      anything,
      anything,
      anything,
      anything,
      "-f",
      "content=+1",
    ).returns(["", "", stub(success?: true)])

    GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, @comment_url)
  end

  # Integration-like tests
  test "logs complete workflow for successful reaction" do
    # Test the full logging flow
    Rails.logger.expects(:info).with("Adding thumbs up reaction to comment: #{@comment_url}").once
    Rails.logger.expects(:info).with("Successfully added thumbs up reaction to comment 123456").once
    Rails.logger.expects(:error).never

    Open3.stubs(:capture3).returns(["", "", stub(success?: true)])

    assert GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, @comment_url)
  end

  test "logs complete workflow for failed reaction" do
    # Test the full logging flow for failure
    Rails.logger.expects(:info).with("Adding thumbs up reaction to comment: #{@comment_url}").once
    Rails.logger.expects(:info).with(regexp_matches(/Successfully/)).never
    Rails.logger.expects(:error).with(regexp_matches(/Failed to add reaction/)).once

    Open3.stubs(:capture3).returns(["", "API rate limit exceeded", stub(success?: false)])

    assert_not GithubReactionService.add_thumbs_up_to_comment(@repo_full_name, @comment_url)
  end
end
