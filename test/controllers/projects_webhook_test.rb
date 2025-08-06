# frozen_string_literal: true

require "test_helper"

class ProjectsWebhookTest < ActionDispatch::IntegrationTest
  setup do
    @project = create(
      :project,
      vcs_type: "git",
      github_repo_owner: "test",
      github_repo_name: "repo",
    )
  end

  test "toggle_webhook enables webhooks" do
    assert_not @project.github_webhook_enabled?

    # Create some events first
    @project.github_webhook_events.create!(event_type: "issue_comment", enabled: true)
    @project.github_webhook_events.create!(event_type: "pull_request_review", enabled: true)

    # Need to mock Setting.github_username_configured? to return true
    # The view calls this method multiple times
    Setting.stubs(:github_username_configured?).returns(true)

    post toggle_webhook_project_path(@project), headers: { 
      "HTTP_REFERER" => project_path(@project),
      "Turbo-Frame" => "webhook-toggle"
    }

    assert_response :success
    assert_equal "GitHub webhooks enabled. The webhook forwarder will start shortly.", flash[:notice]

    @project.reload
    assert @project.github_webhook_enabled?
  end

  test "toggle_webhook disables webhooks" do
    # Create some events first so we can enable webhooks
    @project.github_webhook_events.create!(event_type: "issue_comment", enabled: true)
    @project.update!(github_webhook_enabled: true)

    # Need to mock Setting.github_username_configured? to return true
    # The view calls this method multiple times
    Setting.stubs(:github_username_configured?).returns(true)

    post toggle_webhook_project_path(@project), headers: { 
      "HTTP_REFERER" => project_path(@project),
      "Turbo-Frame" => "webhook-toggle"
    }

    assert_response :success
    assert_equal "GitHub webhooks disabled.", flash[:notice]

    @project.reload
    assert_not @project.github_webhook_enabled?
  end

  test "toggle_webhook shows alert if github not configured" do
    @project.update!(github_repo_owner: nil)

    post toggle_webhook_project_path(@project), headers: { 
      "HTTP_REFERER" => project_path(@project),
      "Turbo-Frame" => "webhook-toggle"
    }

    assert_response :success
    assert_equal "Please configure GitHub repository information first.", flash[:alert]

    @project.reload
    assert_not @project.github_webhook_enabled?
  end

  test "webhook_status returns running status" do
    process = create(:github_webhook_process, :running, project: @project, started_at: 1.hour.ago)

    get webhook_status_project_path(@project)

    assert_response :success
    status = JSON.parse(response.body)
    assert status["running"]
    assert_equal process.pid, status["pid"]
    assert_not_nil status["started_at"]
    assert_not_nil status["duration"]
  end

  test "webhook_status returns not running status" do
    get webhook_status_project_path(@project)

    assert_response :success
    status = JSON.parse(response.body)
    assert_not status["running"]
  end

  test "handle_webhook_events updates event states" do
    @project.github_webhook_events.create!(event_type: "issue_comment", enabled: false)
    @project.github_webhook_events.create!(event_type: "pull_request_review", enabled: true)

    patch project_path(@project), params: {
      project: {
        name: @project.name,
        webhook_events: ["issue_comment", "pull_request_review_comment"],
      },
    }

    assert_redirected_to edit_project_path(@project)

    @project.reload
    issue_comment_event = @project.github_webhook_events.find_by(event_type: "issue_comment")
    pr_review_event = @project.github_webhook_events.find_by(event_type: "pull_request_review")
    pr_review_comment_event = @project.github_webhook_events.find_by(event_type: "pull_request_review_comment")

    assert issue_comment_event.enabled?
    assert_not pr_review_event.enabled?
    assert pr_review_comment_event.enabled?
  end

  test "update handles empty webhook events" do
    @project.github_webhook_events.create!(event_type: "issue_comment", enabled: true)

    patch project_path(@project), params: {
      project: {
        name: @project.name,
        webhook_events: [],
      },
    }

    assert_redirected_to edit_project_path(@project)

    # Should disable all events when none selected
    @project.reload
    assert_not @project.github_webhook_events.any?(&:enabled?)
  end
end
