# frozen_string_literal: true

require "test_helper"

class GithubWebhookEventTest < ActiveSupport::TestCase
  def setup
    @project = create(:project)
    @webhook_event = create(:github_webhook_event, project: @project)
  end

  test "should be valid with valid attributes" do
    assert @webhook_event.valid?
  end

  test "should require event_type" do
    @webhook_event.event_type = nil
    assert_not @webhook_event.valid?
    assert_includes @webhook_event.errors[:event_type], "can't be blank"
  end

  test "should validate event_type is in AVAILABLE_EVENTS" do
    @webhook_event.event_type = "invalid_event"
    assert_not @webhook_event.valid?
    assert_includes @webhook_event.errors[:event_type], "is not included in the list"
  end

  test "should enforce unique event_type per project" do
    duplicate = @project.github_webhook_events.build(event_type: @webhook_event.event_type)
    assert_not duplicate.valid?
    assert_includes duplicate.errors[:event_type], "has already been taken"
  end

  test "should allow same event_type for different projects" do
    other_project = create(:project)
    other_event = other_project.github_webhook_events.build(event_type: @webhook_event.event_type)
    assert other_event.valid?
  end

  test "enabled scope returns only enabled events" do
    enabled = create(:github_webhook_event, project: @project, enabled: true, event_type: "issues")
    disabled = create(:github_webhook_event, project: @project, enabled: false, event_type: "pull_request")

    results = @project.github_webhook_events.enabled
    assert_includes results, enabled
    assert_not_includes results, disabled
  end

  test "common_events returns expected events" do
    expected = ["push", "pull_request", "issues", "release"]
    assert_equal expected, GithubWebhookEvent.common_events
  end
end
