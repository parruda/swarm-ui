# frozen_string_literal: true

require "test_helper"

class SessionTest < ActiveSupport::TestCase
  test "should not save session without session_id" do
    session = Session.new
    assert_not session.save
  end

  test "should not save session with duplicate session_id" do
    Session.create!(session_id: "test-123", status: "active", project_path: "/test/path")
    session2 = Session.new(session_id: "test-123", status: "active", project_path: "/test/path")
    assert_not session2.save
  end

  test "should validate status inclusion" do
    session = Session.new(session_id: "test-123", status: "invalid")
    assert_not session.valid?
    assert_includes session.errors[:status], "is not included in the list"
  end

  test "should accept valid statuses" do
    ["active", "stopped", "archived"].each do |status|
      session = Session.new(session_id: "test-#{status}", status: status, project_path: "/test/path")
      assert session.valid?
    end
  end

  test "should calculate duration when ended_at changes" do
    session = Session.create!(
      session_id: "test-duration",
      status: "active",
      started_at: Time.current,
      project_path: "/test/path",
    )

    session.update!(ended_at: session.started_at + 1.hour, status: "stopped")
    assert_equal 3600, session.duration_seconds
  end

  test "active scope returns only active sessions" do
    Session.create!(session_id: "active-1", status: "active", project_path: "/test/path")
    Session.create!(session_id: "stopped-1", status: "stopped", project_path: "/test/path")
    Session.create!(session_id: "archived-1", status: "archived", project_path: "/test/path")

    active_sessions = Session.active
    assert_equal 1, active_sessions.count
    assert_equal "active", active_sessions.first.status
  end

  test "recent scope orders by started_at descending" do
    old_session = Session.create!(
      session_id: "old",
      status: "stopped",
      started_at: 2.days.ago,
      project_path: "/test/path",
    )
    new_session = Session.create!(
      session_id: "new",
      status: "active",
      started_at: 1.hour.ago,
      project_path: "/test/path",
    )

    recent = Session.recent
    assert_equal new_session, recent.first
    assert_equal old_session, recent.last
  end
end
