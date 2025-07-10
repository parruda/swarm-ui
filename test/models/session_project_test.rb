# frozen_string_literal: true

require "test_helper"

class SessionProjectTest < ActiveSupport::TestCase
  test "session belongs to a project" do
    project = create(:project)
    session = create(:session, project: project)

    assert_equal project, session.project
  end

  test "session requires a project" do
    session = build(:session, project: nil)

    assert_not session.valid?
    assert_includes session.errors[:project], "must exist"
  end

  test "increments project counters when session is created" do
    project = create(:project, total_sessions_count: 5, active_sessions_count: 2)

    create(:session, project: project, status: "active")

    project.reload
    assert_equal 6, project.total_sessions_count
    assert_equal 3, project.active_sessions_count
  end

  test "increments only total_sessions_count for non-active sessions" do
    project = create(:project, total_sessions_count: 5, active_sessions_count: 2)

    create(:session, project: project, status: "stopped")

    project.reload
    assert_equal 6, project.total_sessions_count
    assert_equal 2, project.active_sessions_count
  end

  test "updates active_sessions_count when session status changes" do
    project = create(:project, active_sessions_count: 2)
    session = create(:session, project: project, status: "active")

    project.reload
    assert_equal 3, project.active_sessions_count

    session.update!(status: "stopped")

    project.reload
    assert_equal 2, project.active_sessions_count
  end

  test "updates project last_session_at when session is updated" do
    project = create(:project, last_session_at: 1.day.ago)
    session = create(:session, project: project)

    freeze_time do
      session.update!(swarm_name: "Updated Name")

      project.reload
      assert_in_delta Time.current.to_f, project.last_session_at.to_f, 1
    end
  end

  test "decrements project counters when session is destroyed" do
    project = create(:project, total_sessions_count: 5, active_sessions_count: 2)
    session = create(:session, project: project, status: "active")

    project.reload
    assert_equal 6, project.total_sessions_count
    assert_equal 3, project.active_sessions_count

    session.destroy

    project.reload
    assert_equal 5, project.total_sessions_count
    assert_equal 2, project.active_sessions_count
  end

  test "handles counter updates correctly when switching between active and inactive states" do
    project = create(:project, active_sessions_count: 1)
    session = create(:session, project: project, status: "active")

    project.reload
    assert_equal 2, project.active_sessions_count

    # Change to stopped
    session.update!(status: "stopped")
    project.reload
    assert_equal 1, project.active_sessions_count

    # Change to archived (still inactive)
    session.update!(status: "archived")
    project.reload
    assert_equal 1, project.active_sessions_count

    # Change back to active
    session.update!(status: "active")
    project.reload
    assert_equal 2, project.active_sessions_count
  end
end
