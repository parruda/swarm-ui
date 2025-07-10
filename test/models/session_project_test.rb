# frozen_string_literal: true

require "test_helper"

class SessionProjectTest < ActiveSupport::TestCase
  test "session can belong to a project" do
    project = create(:project)
    session = create(:session, :with_project, project: project)

    assert_equal project, session.project
    assert_equal project.path, session.project_path
  end

  test "session can exist without a project for backward compatibility" do
    session = create(:session)

    assert_nil session.project
    assert_not_nil session.project_path
  end

  test "syncs project_path from project when project is assigned" do
    project = create(:project)
    session = build(:session, project: project, project_path: nil)

    session.valid?

    assert_equal project.path, session.project_path
  end

  test "validates that either project or project_path is present" do
    session = build(:session, project: nil, project_path: nil)

    assert_not session.valid?
    assert_includes session.errors[:base], "Either project or project path must be present"
  end

  test "increments project counters when session is created" do
    project = create(:project, total_sessions_count: 5, active_sessions_count: 2)

    create(:session, :with_project, project: project, status: "active")

    project.reload
    assert_equal 6, project.total_sessions_count
    assert_equal 3, project.active_sessions_count
  end

  test "increments only total_sessions_count for non-active sessions" do
    project = create(:project, total_sessions_count: 5, active_sessions_count: 2)

    create(:session, :with_project, project: project, status: "stopped")

    project.reload
    assert_equal 6, project.total_sessions_count
    assert_equal 2, project.active_sessions_count
  end

  test "updates active_sessions_count when session status changes" do
    project = create(:project, active_sessions_count: 2)
    session = create(:session, :with_project, project: project, status: "active")

    project.reload
    assert_equal 3, project.active_sessions_count

    session.update!(status: "stopped")

    project.reload
    assert_equal 2, project.active_sessions_count
  end

  test "updates project last_session_at when session is updated" do
    project = create(:project, last_session_at: 1.day.ago)
    session = create(:session, :with_project, project: project)

    freeze_time do
      session.update!(swarm_name: "Updated Name")

      project.reload
      assert_in_delta Time.current.to_f, project.last_session_at.to_f, 1
    end
  end

  test "decrements project counters when session is destroyed" do
    project = create(:project, total_sessions_count: 5, active_sessions_count: 2)
    session = create(:session, :with_project, project: project, status: "active")

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
    session = create(:session, :with_project, project: project, status: "active")

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
