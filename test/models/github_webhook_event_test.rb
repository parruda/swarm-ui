# frozen_string_literal: true

require "test_helper"

class GithubWebhookEventTest < ActiveSupport::TestCase
  setup do
    @project = create(:project)
    @webhook_event = create(:github_webhook_event, project: @project)
  end

  # Validation tests
  test "valid github webhook event" do
    assert @webhook_event.valid?
  end

  test "requires event_type" do
    @webhook_event.event_type = nil
    assert_not @webhook_event.valid?
    assert_includes @webhook_event.errors[:event_type], "can't be blank"
  end

  test "requires event_type to be in AVAILABLE_EVENTS" do
    @webhook_event.event_type = "push" # This is not in AVAILABLE_EVENTS anymore
    assert_not @webhook_event.valid?
    assert_includes @webhook_event.errors[:event_type], "is not included in the list"
  end

  test "allows all available event types" do
    GithubWebhookEvent::AVAILABLE_EVENTS.each do |event_type|
      @webhook_event.event_type = event_type
      assert @webhook_event.valid?, "Should allow event_type: #{event_type}"
    end
  end

  test "enforces unique event_type per project" do
    duplicate = @project.github_webhook_events.build(event_type: @webhook_event.event_type)
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:event_type], "has already been taken"
  end

  test "allows same event_type for different projects" do
    other_project = create(:project)
    other_event = other_project.github_webhook_events.build(
      event_type: @webhook_event.event_type,
      enabled: true,
    )
    assert other_event.valid?
  end

  test "belongs to project" do
    assert_respond_to @webhook_event, :project
    assert_equal @project, @webhook_event.project
  end

  # Scope tests
  test "enabled scope returns only enabled events" do
    enabled = create(:github_webhook_event, :pull_request_review, project: @project, enabled: true)
    disabled = create(:github_webhook_event, :pull_request_review_comment, project: @project, enabled: false)

    results = GithubWebhookEvent.enabled
    assert_includes results, enabled
    assert_includes results, @webhook_event # default is enabled
    assert_not_includes results, disabled
  end

  test "disabled scope returns only disabled events" do
    enabled = create(:github_webhook_event, :pull_request_review, project: @project, enabled: true)
    disabled = create(:github_webhook_event, :pull_request_review_comment, project: @project, enabled: false)

    results = GithubWebhookEvent.disabled
    assert_includes results, disabled
    assert_not_includes results, enabled
    assert_not_includes results, @webhook_event # default is enabled
  end

  # Class method tests
  test "common_events returns AVAILABLE_EVENTS" do
    assert_equal GithubWebhookEvent::AVAILABLE_EVENTS, GithubWebhookEvent.common_events
  end

  # Callback tests
  test "notifies when enabled status changes" do
    RedisClient.expects(:publish).with(
      WebhookManager::WEBHOOK_EVENTS_CHANNEL,
      { project_id: @webhook_event.project_id, operation: "UPDATE" }.to_json,
    )

    @webhook_event.update!(enabled: false)
  end

  test "does not notify when enabled status doesn't change" do
    RedisClient.expects(:publish).never

    # Update something other than enabled
    @webhook_event.update!(updated_at: Time.current)
  end

  test "notifies when destroyed" do
    RedisClient.expects(:publish).with(
      WebhookManager::WEBHOOK_EVENTS_CHANNEL,
      { project_id: @webhook_event.project_id, operation: "DESTROY" }.to_json,
    )

    @webhook_event.destroy
  end

  test "handles Redis errors gracefully when notifying" do
    RedisClient.stubs(:publish).raises(Redis::BaseError, "Connection refused")

    # Should not raise an error
    assert_nothing_raised do
      @webhook_event.update!(enabled: false)
    end
  end

  # Constant tests
  test "AVAILABLE_EVENTS contains expected webhook events" do
    expected = ["issue_comment", "pull_request_review", "pull_request_review_comment"]
    assert_equal expected, GithubWebhookEvent::AVAILABLE_EVENTS
  end
end
