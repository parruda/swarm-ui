# frozen_string_literal: true

require "test_helper"

class SessionsControllerRefreshTest < ActionDispatch::IntegrationTest
  setup do
    @project = create(:project, path: "/tmp/test-project")
    @session = create(:session, project: @project, status: "active")
  end

  test "refresh_git_status forces fresh git status fetch" do
    # Mock the service
    mock_service = mock("git_service")
    mock_statuses = {
      "instance1" => [{
        branch: "main",
        has_changes: true,
        last_fetched: Time.current,
      }],
    }
    mock_service.expects(:fetch_all_statuses).returns(mock_statuses)
    OptimizedGitStatusService.expects(:new).with(@session).returns(mock_service)

    # Expect background job to be triggered
    assert_enqueued_with(job: GitStatusMonitorJob, args: [@session.id, { force_update: true }]) do
      post refresh_git_status_session_path(@session), as: :turbo_stream
    end

    assert_response :success
    assert_select "turbo-stream[action='update'][target='git-status-display']"
  end

  test "refresh_git_status updates cache" do
    # Clear any existing cache
    Rails.cache.clear

    # Mock the service
    mock_service = mock("git_service")
    mock_statuses = { "instance1" => [{ branch: "feature-branch" }] }
    mock_service.expects(:fetch_all_statuses).returns(mock_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    post refresh_git_status_session_path(@session), as: :turbo_stream

    # Verify cache was written
    cached = Rails.cache.read(GitStatusMonitorJob.cache_key(@session.id))
    assert_equal mock_statuses, cached
  end

  test "refresh_git_status returns error for inactive session" do
    @session.update!(status: "stopped")

    post refresh_git_status_session_path(@session), as: :turbo_stream

    assert_response :unprocessable_entity
  end

  test "refresh_git_status redirects for html format" do
    # Mock the service
    mock_service = mock("git_service")
    mock_service.expects(:fetch_all_statuses).returns({})
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    post refresh_git_status_session_path(@session)

    assert_redirected_to session_path(@session)
  end
end
