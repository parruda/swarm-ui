# frozen_string_literal: true

require "test_helper"

class WebhookProcessServiceTest < ActiveSupport::TestCase
  setup do
    @project = create(
      :project,
      github_webhook_enabled: true,
      github_repo_owner: "test",
      github_repo_name: "repo",
    )
    create(:github_webhook_event, project: @project, event_type: "push", enabled: true)

    # Mock Process.spawn to avoid creating real processes
    Process.stubs(:spawn).returns(12345)
    Process.stubs(:getpgid).returns(12345)
    Process.stubs(:waitpid)
    Process.stubs(:kill)
    IO.stubs(:pipe).returns([mock_io, mock_io])
    Thread.stubs(:new)
    Timeout.stubs(:timeout).yields
  end

  teardown do
    # Ensure no real processes are created
    Process.unstub(:spawn)
    Process.unstub(:waitpid)
    Process.unstub(:kill)
  end

  def mock_io
    io = mock("IO")
    io.stubs(:close)
    io.stubs(:each_line)
    io
  end

  test "start creates process when webhook enabled" do
    Rails.application.routes.url_helpers.expects(:github_webhooks_url).returns("http://localhost:3000/webhooks")

    WebhookProcessService.start(@project)

    process = @project.github_webhook_processes.last
    assert_equal "running", process.status
    assert_equal 12345, process.pid
    assert_not_nil process.started_at
  end

  test "start returns early if webhook disabled" do
    @project.update!(github_webhook_enabled: false)

    WebhookProcessService.start(@project)

    assert_equal 0, @project.github_webhook_processes.count
  end

  test "start returns early if process already running" do
    create(:github_webhook_process, :running, project: @project)

    WebhookProcessService.start(@project)

    assert_equal 1, @project.github_webhook_processes.count
  end

  test "start returns early if github repo not configured" do
    @project.update!(github_repo_owner: nil)

    WebhookProcessService.start(@project)

    assert_equal 0, @project.github_webhook_processes.count
  end

  test "start returns early if no events enabled" do
    @project.github_webhook_events.update_all(enabled: false)

    WebhookProcessService.start(@project)

    assert_equal 0, @project.github_webhook_processes.count
  end

  test "start handles spawn errors" do
    Process.unstub(:spawn)
    Process.stubs(:spawn).raises(StandardError, "spawn error")

    assert_raises(StandardError) do
      WebhookProcessService.start(@project)
    end

    process = @project.github_webhook_processes.last
    assert_equal "error", process.status
    assert_not_nil process.stopped_at
  end

  test "stop sends SIGTERM to process" do
    process = create(:github_webhook_process, :running, project: @project)
    Process.expects(:kill).with("-TERM", process.pid)
    Process.expects(:waitpid).with(process.pid)

    WebhookProcessService.stop(process)

    process.reload
    assert_equal "stopped", process.status
    assert_not_nil process.stopped_at
  end

  test "stop handles already dead process" do
    process = create(:github_webhook_process, :running, project: @project)
    Process.expects(:kill).raises(Errno::ESRCH)

    WebhookProcessService.stop(process)

    process.reload
    assert_equal "stopped", process.status
  end

  test "stop force kills on timeout" do
    process = create(:github_webhook_process, :running, project: @project)
    Process.expects(:kill).with("-TERM", process.pid)
    Timeout.expects(:timeout).raises(Timeout::Error)
    Process.expects(:kill).with("-KILL", process.pid)

    WebhookProcessService.stop(process)

    process.reload
    assert_equal "stopped", process.status
  end

  test "stop returns early if not running" do
    process = create(:github_webhook_process, project: @project, status: "stopped")
    Process.expects(:kill).never

    WebhookProcessService.stop(process)
  end

  test "stop_all_for_project stops all running processes" do
    process1 = create(:github_webhook_process, :running, project: @project)
    process2 = create(:github_webhook_process, :running, project: @project, pid: 12346)
    stopped = create(:github_webhook_process, project: @project, status: "stopped")

    WebhookProcessService.expects(:stop).with(process1)
    WebhookProcessService.expects(:stop).with(process2)
    WebhookProcessService.expects(:stop).with(stopped).never

    WebhookProcessService.stop_all_for_project(@project)
  end

  test "restart stops all processes and starts new one" do
    create(:github_webhook_process, :running, project: @project)

    # Expect stop_all_for_project to be called
    WebhookProcessService.expects(:stop_all_for_project).with(@project)

    # Expect sleep for process cleanup
    WebhookProcessService.expects(:sleep).with(0.5)

    # Expect start to be called
    WebhookProcessService.expects(:start).with(@project)

    WebhookProcessService.restart(@project)
  end
end
