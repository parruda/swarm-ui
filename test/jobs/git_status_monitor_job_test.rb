# frozen_string_literal: true

require "test_helper"

class GitStatusMonitorJobTest < ActiveJob::TestCase
  setup do
    @session = create(:session, status: "active")
    Rails.cache.clear
  end

  teardown do
    Rails.cache.clear
  end

  test "performs git status update for active session" do
    # Mock the service
    mock_service = mock("git_service")
    mock_statuses = { "instance1" => [{ branch: "main" }] }
    mock_service.expects(:fetch_all_statuses).returns(mock_statuses)
    OptimizedGitStatusService.expects(:new).with(@session).returns(mock_service)

    # Expect broadcast
    Turbo::StreamsChannel.expects(:broadcast_update_to)
      .with("session_#{@session.id}", anything)

    # Perform the job
    perform_enqueued_jobs do
      GitStatusMonitorJob.perform_later(@session.id)
    end

    # Verify cache was written
    cached = Rails.cache.read(GitStatusMonitorJob.cache_key(@session.id))
    assert_equal mock_statuses, cached
  end

  test "uses cached status when available and fresh" do
    # Pre-cache some status
    cached_status = {
      "instance1" => [{
        branch: "main",
        last_fetched: Time.current.to_s,
      }],
    }
    Rails.cache.write(GitStatusMonitorJob.cache_key(@session.id), cached_status)

    # Service should not be called
    OptimizedGitStatusService.expects(:new).never

    # Expect broadcast with cached data
    Turbo::StreamsChannel.expects(:broadcast_update_to)
      .with("session_#{@session.id}", anything)

    perform_enqueued_jobs do
      GitStatusMonitorJob.perform_later(@session.id)
    end
  end

  test "fetches fresh status when cache is stale" do
    # Pre-cache stale status (35 seconds old)
    cached_status = {
      "instance1" => [{
        branch: "main",
        last_fetched: 35.seconds.ago.to_s,
      }],
    }
    Rails.cache.write(GitStatusMonitorJob.cache_key(@session.id), cached_status)

    # Service should be called
    mock_service = mock("git_service")
    fresh_statuses = { "instance1" => [{ branch: "develop" }] }
    mock_service.expects(:fetch_all_statuses).returns(fresh_statuses)
    OptimizedGitStatusService.expects(:new).with(@session).returns(mock_service)

    # Expect broadcast
    Turbo::StreamsChannel.expects(:broadcast_update_to)

    perform_enqueued_jobs do
      GitStatusMonitorJob.perform_later(@session.id)
    end
  end

  test "forces update when force_update flag is true" do
    # Pre-cache some fresh status
    cached_status = {
      "instance1" => [{
        branch: "main",
        last_fetched: Time.current.to_s,
      }],
    }
    Rails.cache.write(GitStatusMonitorJob.cache_key(@session.id), cached_status)

    # Service should be called despite fresh cache
    mock_service = mock("git_service")
    mock_statuses = { "instance1" => [{ branch: "main" }] }
    mock_service.expects(:fetch_all_statuses).returns(mock_statuses)
    OptimizedGitStatusService.expects(:new).with(@session).returns(mock_service)

    # Expect broadcast
    Turbo::StreamsChannel.expects(:broadcast_update_to)

    perform_enqueued_jobs do
      GitStatusMonitorJob.perform_later(@session.id, force_update: true)
    end
  end

  test "reschedules with appropriate interval based on activity" do
    # Mock service
    mock_service = mock("git_service")
    mock_statuses = { "instance1" => [{ branch: "main" }] }
    mock_service.expects(:fetch_all_statuses).returns(mock_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)
    Turbo::StreamsChannel.expects(:broadcast_update_to)

    # Test active interval (when changes detected)
    assert_enqueued_with(job: GitStatusMonitorJob, args: [@session.id], wait: 2.seconds) do
      GitStatusMonitorJob.new.perform(@session.id)
    end
  end

  test "prevents concurrent execution for same session" do
    # Simulate another job running
    Rails.cache.write(GitStatusMonitorJob.running_key(@session.id), true)

    # Service should not be called
    OptimizedGitStatusService.expects(:new).never
    Turbo::StreamsChannel.expects(:broadcast_update_to).never

    # Job should exit early
    GitStatusMonitorJob.new.perform(@session.id)
  end

  test "cleans up cache when session becomes inactive" do
    @session.update!(status: "stopped")

    # Pre-cache some data
    cache_key = GitStatusMonitorJob.cache_key(@session.id)
    Rails.cache.write(cache_key, { test: "data" })

    # Service should not be called
    OptimizedGitStatusService.expects(:new).never

    # Perform job
    GitStatusMonitorJob.new.perform(@session.id)

    # Cache should be cleaned up
    assert_nil Rails.cache.read(cache_key)
  end

  test "handles missing session gracefully" do
    non_existent_id = "non-existent"

    # Pre-cache some data
    cache_key = GitStatusMonitorJob.cache_key(non_existent_id)
    Rails.cache.write(cache_key, { test: "data" })

    # Should not raise error
    assert_nothing_raised do
      GitStatusMonitorJob.new.perform(non_existent_id)
    end

    # Cache should be cleaned up
    assert_nil Rails.cache.read(cache_key)
  end
end
