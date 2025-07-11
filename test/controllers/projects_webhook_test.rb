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
    @project.github_webhook_events.create!(event_type: "push", enabled: true)
    @project.github_webhook_events.create!(event_type: "pull_request", enabled: true)

    post toggle_webhook_project_path(@project), headers: { "HTTP_REFERER" => project_path(@project) }

    assert_redirected_to project_path(@project)
    assert_equal "GitHub webhooks enabled. The webhook forwarder will start shortly.", flash[:notice]

    @project.reload
    assert @project.github_webhook_enabled?
  end

  test "toggle_webhook disables webhooks" do
    # Create some events first so we can enable webhooks
    @project.github_webhook_events.create!(event_type: "push", enabled: true)
    @project.update!(github_webhook_enabled: true)

    post toggle_webhook_project_path(@project), headers: { "HTTP_REFERER" => project_path(@project) }

    assert_redirected_to project_path(@project)
    assert_equal "GitHub webhooks disabled.", flash[:notice]

    @project.reload
    assert_not @project.github_webhook_enabled?
  end

  test "toggle_webhook redirects if github not configured" do
    @project.update!(github_repo_owner: nil)

    post toggle_webhook_project_path(@project), headers: { "HTTP_REFERER" => project_path(@project) }

    assert_redirected_to project_path(@project)
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
    @project.github_webhook_events.create!(event_type: "push", enabled: false)
    @project.github_webhook_events.create!(event_type: "issues", enabled: true)

    patch project_path(@project), params: {
      project: {
        name: @project.name,
        webhook_events: ["push", "pull_request"],
      },
    }

    assert_redirected_to edit_project_path(@project)

    @project.reload
    push_event = @project.github_webhook_events.find_by(event_type: "push")
    issues_event = @project.github_webhook_events.find_by(event_type: "issues")
    pr_event = @project.github_webhook_events.find_by(event_type: "pull_request")

    assert push_event.enabled?
    assert_not issues_event.enabled?
    assert pr_event.enabled?
  end

  test "update handles empty webhook events" do
    @project.github_webhook_events.create!(event_type: "push", enabled: true)

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
