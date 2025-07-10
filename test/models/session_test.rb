# frozen_string_literal: true

require "test_helper"

class SessionTest < ActiveSupport::TestCase
  test "should not save session without session_id" do
    project = create(:project)
    session = Session.new(project: project)
    assert_not session.save
  end

  test "should not save session with duplicate session_id" do
    project = create(:project)
    create(:session, session_id: "test-123", status: "active", project: project)
    session2 = build(:session, session_id: "test-123", status: "active", project: project)
    assert_not session2.save
  end

  test "should validate status inclusion" do
    project = create(:project)
    session = build(:session, session_id: "test-123", status: "invalid", project: project)
    assert_not session.valid?
    assert_includes session.errors[:status], "is not included in the list"
  end

  test "should accept valid statuses" do
    project = create(:project)
    ["active", "stopped", "archived"].each do |status|
      session = build(:session, session_id: "test-#{status}", status: status, project: project)
      assert session.valid?
    end
  end

  test "should calculate duration when ended_at changes" do
    project = create(:project)
    session = create(
      :session,
      session_id: "test-duration",
      status: "active",
      started_at: Time.current,
      project: project,
    )

    session.update!(ended_at: session.started_at + 1.hour, status: "stopped")
    assert_equal 3600, session.duration_seconds
  end

  test "active scope returns only active sessions" do
    project = create(:project)
    create(:session, session_id: "active-1", status: "active", project: project)
    create(:session, session_id: "stopped-1", status: "stopped", project: project)
    create(:session, session_id: "archived-1", status: "archived", project: project)

    active_sessions = Session.active
    assert_equal 1, active_sessions.count
    assert_equal "active", active_sessions.first.status
  end

  test "recent scope orders by started_at descending" do
    project = create(:project)
    old_session = create(
      :session,
      session_id: "old",
      status: "stopped",
      started_at: 2.days.ago,
      project: project,
    )
    new_session = create(
      :session,
      session_id: "new",
      status: "active",
      started_at: 1.hour.ago,
      project: project,
    )

    recent = Session.recent
    assert_equal new_session, recent.first
    assert_equal old_session, recent.last
  end
end
