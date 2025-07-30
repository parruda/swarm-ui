# frozen_string_literal: true

require "test_helper"

class GithubWebhookProcessTest < ActiveSupport::TestCase
  def setup
    @project = create(:project)
    @process = create(:github_webhook_process, project: @project)
  end

  # Validation tests
  test "should be valid with valid attributes" do
    assert @process.valid?
  end

  test "should validate status inclusion" do
    @process.status = "invalid"
    assert_not @process.valid?
    assert_includes @process.errors[:status], "is not included in the list"
  end

  test "allows all valid statuses" do
    GithubWebhookProcess::STATUSES.each do |status|
      @process.status = status
      assert @process.valid?, "Should allow status: #{status}"
    end
  end

  # Association tests
  test "belongs to project" do
    assert_respond_to @process, :project
    assert_equal @project, @process.project
  end

  test "requires project" do
    @process.project = nil
    assert_not @process.valid?
    assert_includes @process.errors[:project], "must exist"
  end

  test "running scope returns only running processes" do
    running = create(:github_webhook_process, :running, project: @project)
    stopped = create(:github_webhook_process, project: @project, status: "stopped")

    results = GithubWebhookProcess.running
    assert_includes results, running
    assert_not_includes results, stopped
  end

  test "stopped scope returns only stopped processes" do
    running = create(:github_webhook_process, :running, project: @project)
    stopped = create(:github_webhook_process, project: @project, status: "stopped")

    results = GithubWebhookProcess.stopped
    assert_includes results, stopped
    assert_not_includes results, running
  end

  test "with_errors scope returns only error processes" do
    running = create(:github_webhook_process, :running, project: @project)
    error = create(:github_webhook_process, :error, project: @project)

    results = GithubWebhookProcess.with_errors
    assert_includes results, error
    assert_not_includes results, running
  end

  test "running? returns true for running status" do
    @process.status = "running"
    assert @process.running?

    @process.status = "stopped"
    assert_not @process.running?
  end

  test "stopped? returns true for stopped status" do
    @process.status = "stopped"
    assert @process.stopped?

    @process.status = "running"
    assert_not @process.stopped?
  end

  test "error? returns true for error status" do
    @process.status = "error"
    assert @process.error?

    @process.status = "running"
    assert_not @process.error?
  end

  test "duration calculates time difference" do
    @process.started_at = Time.current
    @process.stopped_at = Time.current + 2.hours

    assert_in_delta 7200, @process.duration, 1
  end

  test "duration uses current time if not stopped" do
    @process.started_at = 1.hour.ago
    @process.stopped_at = nil

    assert_in_delta 3600, @process.duration, 10
  end

  test "duration returns nil if not started" do
    @process.started_at = nil
    assert_nil @process.duration
  end

  test "cleanup_old_records removes old stopped records" do
    old_stopped = create(:github_webhook_process, project: @project, status: "stopped", stopped_at: 10.days.ago)
    old_error = create(:github_webhook_process, project: @project, status: "error", stopped_at: 10.days.ago)
    recent_stopped = create(:github_webhook_process, project: @project, status: "stopped", stopped_at: 1.day.ago)
    running = create(:github_webhook_process, :running, project: @project)

    GithubWebhookProcess.cleanup_old_records(days_to_keep: 7)

    assert_not GithubWebhookProcess.exists?(old_stopped.id)
    assert_not GithubWebhookProcess.exists?(old_error.id)
    assert GithubWebhookProcess.exists?(recent_stopped.id)
    assert GithubWebhookProcess.exists?(running.id)
  end

  test "cleanup_old_records with custom days_to_keep" do
    old = create(:github_webhook_process, project: @project, status: "stopped", stopped_at: 3.days.ago)
    recent = create(:github_webhook_process, project: @project, status: "stopped", stopped_at: 1.day.ago)

    GithubWebhookProcess.cleanup_old_records(days_to_keep: 2)

    assert_not GithubWebhookProcess.exists?(old.id)
    assert GithubWebhookProcess.exists?(recent.id)
  end

  test "cleanup_old_records ignores records without stopped_at" do
    error_no_stopped_at = create(:github_webhook_process, project: @project, status: "error", stopped_at: nil)
    GithubWebhookProcess.cleanup_old_records(days_to_keep: 7)
    assert GithubWebhookProcess.exists?(error_no_stopped_at.id)
  end

  test "stop! calls WebhookProcessService.stop" do
    WebhookProcessService.expects(:stop).with(@process)
    @process.stop!
  end

  # Scope ordering tests
  test "recent scope orders by created_at desc" do
    older = create(:github_webhook_process, project: @project, created_at: 2.days.ago)
    newer = create(:github_webhook_process, project: @project, created_at: 1.day.ago)

    results = GithubWebhookProcess.recent.where(id: [older.id, newer.id])
    assert_equal [newer, older], results.to_a
  end

  # Constant tests
  test "STATUSES contains expected values" do
    expected = ["starting", "running", "stopped", "error"]
    assert_equal expected, GithubWebhookProcess::STATUSES
  end
end
