# frozen_string_literal: true

require "test_helper"

class SessionsControllerPollTest < ActionDispatch::IntegrationTest
  setup do
    @project = create(:project, path: "/tmp/test-project")
    @session = create(:session, project: @project, status: "active")
  end

  test "git_status_poll returns cached status when fresh" do
    # Pre-cache some fresh status
    cache_key = GitStatusMonitorJob.cache_key(@session.id)
    cache_timestamp_key = "#{cache_key}:timestamp"

    cached_status = { "instance1" => [{ branch: "main" }] }
    Rails.cache.write(cache_key, cached_status)
    Rails.cache.write(cache_timestamp_key, Time.current)

    # Service should not be called
    OptimizedGitStatusService.expects(:new).never

    get git_status_poll_session_path(@session), as: :turbo_stream

    assert_response :success
    assert_select "turbo-stream[action='update'][target='git-status-display']"
  end

  test "git_status_poll fetches fresh status when cache is stale" do
    # Pre-cache stale status (15 seconds old)
    cache_key = GitStatusMonitorJob.cache_key(@session.id)
    cache_timestamp_key = "#{cache_key}:timestamp"

    cached_status = { "instance1" => [{ branch: "main" }] }
    Rails.cache.write(cache_key, cached_status)
    Rails.cache.write(cache_timestamp_key, 15.seconds.ago)

    # Service should be called
    mock_service = mock("git_service")
    fresh_statuses = { "instance1" => [{ branch: "develop" }] }
    mock_service.expects(:fetch_all_statuses).returns(fresh_statuses)
    OptimizedGitStatusService.expects(:new).with(@session).returns(mock_service)

    get git_status_poll_session_path(@session), as: :turbo_stream

    assert_response :success
  end

  test "git_status_poll returns no content for inactive session" do
    @session.update!(status: "stopped")

    get git_status_poll_session_path(@session), as: :turbo_stream

    assert_response :no_content
  end

  test "git_status_poll updates cache timestamp" do
    # Clear cache
    Rails.cache.clear

    # Mock the service
    mock_service = mock("git_service")
    mock_statuses = { "instance1" => [{ branch: "main" }] }
    mock_service.expects(:fetch_all_statuses).returns(mock_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    get git_status_poll_session_path(@session), as: :turbo_stream

    # Verify both cache and timestamp were written
    cache_key = GitStatusMonitorJob.cache_key(@session.id)
    cache_timestamp_key = "#{cache_key}:timestamp"

    assert_equal mock_statuses, Rails.cache.read(cache_key)
    assert_not_nil Rails.cache.read(cache_timestamp_key)
  end
end
