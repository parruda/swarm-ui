# frozen_string_literal: true

require "test_helper"

class SessionTest < ActiveSupport::TestCase
  test "should not save session without session_id" do
    session = Session.new
    assert_not session.save
  end

  test "should not save session with duplicate session_id" do
    Session.create!(session_id: "test-123", status: "active")
    session2 = Session.new(session_id: "test-123", status: "active")
    assert_not session2.save
  end

  test "should validate status inclusion" do
    session = Session.new(session_id: "test-123", status: "invalid")
    assert_not session.valid?
    assert_includes session.errors[:status], "is not included in the list"
  end

  test "should accept valid statuses" do
    ["active", "completed", "failed"].each do |status|
      session = Session.new(session_id: "test-#{status}", status: status)
      assert session.valid?
    end
  end

  test "should calculate duration when ended_at changes" do
    session = Session.create!(
      session_id: "test-duration",
      status: "active",
      started_at: Time.current,
    )

    session.update!(ended_at: session.started_at + 1.hour, status: "completed")
    assert_equal 3600, session.duration_seconds
  end

  test "active scope returns only active sessions" do
    Session.create!(session_id: "active-1", status: "active")
    Session.create!(session_id: "completed-1", status: "completed")
    Session.create!(session_id: "failed-1", status: "failed")

    active_sessions = Session.active
    assert_equal 1, active_sessions.count
    assert_equal "active", active_sessions.first.status
  end

  test "recent scope orders by started_at descending" do
    old_session = Session.create!(
      session_id: "old",
      status: "completed",
      started_at: 2.days.ago,
    )
    new_session = Session.create!(
      session_id: "new",
      status: "active",
      started_at: 1.hour.ago,
    )

    recent = Session.recent
    assert_equal new_session, recent.first
    assert_equal old_session, recent.last
  end
end
