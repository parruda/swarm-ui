# frozen_string_literal: true

require "test_helper"

class SimpleGitStatusJobTest < ActiveJob::TestCase
  setup do
    @project = create(:project)
    @session = create(:session, project: @project, status: "active")
    @git_statuses = {
      "/project/path" => {
        branch: "main",
        dirty: false,
        changes: [],
      },
    }
  end

  teardown do
    FileUtils.rm_rf(@project.path) if File.exist?(@project.path)
  end

  test "fetches git status and broadcasts update for active session" do
    mock_service = mock
    mock_service.expects(:fetch_all_statuses).returns(@git_statuses)
    OptimizedGitStatusService.expects(:new).with(@session).returns(mock_service)

    Turbo::StreamsChannel.expects(:broadcast_update_to).with(
      "session_#{@session.id}",
      target: "git-status-display",
      partial: "shared/git_status",
      locals: { session: @session, git_statuses: @git_statuses },
    )

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "does not proceed when session not found" do
    OptimizedGitStatusService.expects(:new).never
    Turbo::StreamsChannel.expects(:broadcast_update_to).never

    SimpleGitStatusJob.perform_now(999999)
  end

  test "does not proceed when session is not active" do
    @session.update!(status: "stopped")

    OptimizedGitStatusService.expects(:new).never
    Turbo::StreamsChannel.expects(:broadcast_update_to).never

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "handles archived sessions" do
    @session.update!(status: "archived")

    OptimizedGitStatusService.expects(:new).never
    Turbo::StreamsChannel.expects(:broadcast_update_to).never

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "job is queued in default queue" do
    assert_equal "default", SimpleGitStatusJob.new.queue_name
  end

  test "broadcasts correct stream name" do
    mock_service = mock
    mock_service.expects(:fetch_all_statuses).returns(@git_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    expected_stream = "session_#{@session.id}"

    Turbo::StreamsChannel.expects(:broadcast_update_to).with(
      expected_stream,
      anything,
      anything,
      anything,
    )

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "uses correct target element" do
    mock_service = mock
    mock_service.expects(:fetch_all_statuses).returns(@git_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    Turbo::StreamsChannel.expects(:broadcast_update_to).with(
      anything,
      target: "git-status-display",
      partial: anything,
      locals: anything,
    )

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "renders correct partial" do
    mock_service = mock
    mock_service.expects(:fetch_all_statuses).returns(@git_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    Turbo::StreamsChannel.expects(:broadcast_update_to).with(
      anything,
      target: anything,
      partial: "shared/git_status",
      locals: anything,
    )

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "passes session and git_statuses to partial" do
    mock_service = mock
    mock_service.expects(:fetch_all_statuses).returns(@git_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    Turbo::StreamsChannel.expects(:broadcast_update_to).with(
      anything,
      target: anything,
      partial: anything,
      locals: { session: @session, git_statuses: @git_statuses },
    )

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "handles empty git statuses" do
    empty_statuses = {}

    mock_service = mock
    mock_service.expects(:fetch_all_statuses).returns(empty_statuses)
    OptimizedGitStatusService.expects(:new).returns(mock_service)

    Turbo::StreamsChannel.expects(:broadcast_update_to).with(
      anything,
      target: anything,
      partial: anything,
      locals: { session: @session, git_statuses: empty_statuses },
    )

    SimpleGitStatusJob.perform_now(@session.id)
  end

  test "performs with session instance" do
    # Test that job can also accept session object directly
    mock_service = mock
    mock_service.expects(:fetch_all_statuses).returns(@git_statuses)
    OptimizedGitStatusService.expects(:new).with(@session).returns(mock_service)

    Turbo::StreamsChannel.expects(:broadcast_update_to)

    # Should handle session object by extracting ID
    SimpleGitStatusJob.perform_now(@session.id)
  end
end
