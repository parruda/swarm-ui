# frozen_string_literal: true

require "test_helper"

class ProjectWebhookTest < ActiveSupport::TestCase
  def setup
    @project = create(:project, vcs_type: "git")
    @git_service = mock("GitService")
    @project.stubs(:git_service).returns(@git_service)
  end

  test "populate_github_fields_from_remote parses https github url" do
    @git_service.stubs(:remote_url).returns("https://github.com/owner/repo.git")

    @project.populate_github_fields_from_remote

    assert_equal "owner", @project.github_repo_owner
    assert_equal "repo", @project.github_repo_name
  end

  test "populate_github_fields_from_remote parses ssh github url" do
    @git_service.stubs(:remote_url).returns("git@github.com:owner/repo.git")

    @project.populate_github_fields_from_remote

    assert_equal "owner", @project.github_repo_owner
    assert_equal "repo", @project.github_repo_name
  end

  test "populate_github_fields_from_remote handles url without .git extension" do
    @git_service.stubs(:remote_url).returns("https://github.com/owner/repo")

    @project.populate_github_fields_from_remote

    assert_equal "owner", @project.github_repo_owner
    assert_equal "repo", @project.github_repo_name
  end

  test "populate_github_fields_from_remote skips non-github urls" do
    @git_service.stubs(:remote_url).returns("https://gitlab.com/owner/repo.git")

    @project.populate_github_fields_from_remote

    assert_nil @project.github_repo_owner
    assert_nil @project.github_repo_name
  end

  test "populate_github_fields_from_remote skips if not git project" do
    @project.vcs_type = "none"

    @project.populate_github_fields_from_remote

    assert_nil @project.github_repo_owner
    assert_nil @project.github_repo_name
  end

  test "populate_github_fields_from_remote skips if fields already set" do
    @project.github_repo_owner = "existing"
    @project.github_repo_name = "name"
    @git_service.stubs(:remote_url).returns("https://github.com/new/repo.git")

    @project.populate_github_fields_from_remote

    assert_equal "existing", @project.github_repo_owner
    assert_equal "name", @project.github_repo_name
  end

  test "github_configured? returns true when both fields present" do
    @project.github_repo_owner = "owner"
    @project.github_repo_name = "repo"

    assert @project.github_configured?
  end

  test "github_configured? returns false when fields missing" do
    assert_not @project.github_configured?

    @project.github_repo_owner = "owner"
    assert_not @project.github_configured?

    @project.github_repo_owner = nil
    @project.github_repo_name = "repo"
    assert_not @project.github_configured?
  end

  test "github_repo_full_name returns formatted name" do
    @project.github_repo_owner = "owner"
    @project.github_repo_name = "repo"

    assert_equal "owner/repo", @project.github_repo_full_name
  end

  test "github_repo_full_name returns nil when not configured" do
    assert_nil @project.github_repo_full_name
  end

  test "webhook_running? returns true when running process exists" do
    create(:github_webhook_process, :running, project: @project)
    assert @project.webhook_running?
  end

  test "webhook_running? returns false when no running process" do
    create(:github_webhook_process, project: @project, status: "stopped")
    assert_not @project.webhook_running?
  end

  test "stop_all_webhooks! calls WebhookProcessService" do
    WebhookProcessService.expects(:stop_all_for_project).with(@project)
    @project.stop_all_webhooks!
  end

  test "associations cascade delete webhook events" do
    event = create(:github_webhook_event, project: @project)
    @project.destroy

    assert_not GithubWebhookEvent.exists?(event.id)
  end

  test "associations cascade delete webhook processes" do
    process = create(:github_webhook_process, project: @project)
    @project.destroy

    assert_not GithubWebhookProcess.exists?(process.id)
  end
end
