# frozen_string_literal: true

require "application_system_test_case"

class GitStatusVisibilityTest < ApplicationSystemTestCase
  setup do
    @project = create(:project, path: "/tmp/test-project")
    @session = create(:session, project: @project, status: "active")
  end

  test "git status polling only happens when tab is visible" do
    visit session_path(@session)

    # Verify the visibility controller is present
    assert_selector '[data-controller="git-status-visibility"]'

    # Verify it has the correct session ID
    visibility_element = find('[data-controller="git-status-visibility"]')
    assert_equal @session.id.to_s, visibility_element["data-git-status-visibility-session-id-value"]

    # Verify polling interval is set
    assert_equal "5000", visibility_element["data-git-status-visibility-poll-interval-value"]

    # NOTE: We can't actually test the Page Visibility API behavior in system tests
    # as Selenium doesn't support hiding/showing browser tabs
  end

  test "manual refresh button works" do
    # Mock the service
    mock_service = mock("git_service")
    mock_statuses = { "instance1" => [{ branch: "main", has_changes: true }] }
    mock_service.expects(:fetch_all_statuses).returns(mock_statuses).at_least_once
    OptimizedGitStatusService.stubs(:new).returns(mock_service)

    visit session_path(@session)

    # Find and click the refresh button
    refresh_button = find('[data-controller="git-refresh"]')
    refresh_button.click

    # The button should have the arrow-path icon
    assert refresh_button.has_css?(".heroicon")
  end
end
