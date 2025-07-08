# frozen_string_literal: true

require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    get sessions_url
    assert_response :success
  end

  test "should get new" do
    get new_session_url
    assert_response :success
  end

  test "should create session" do
    assert_difference("Session.count") do
      post sessions_url, params: {
        session: {
          swarm_name: "Test Swarm",
          project_path: "/home/test/project",
          project_folder_name: "test-project",
          configuration_path: "/home/test/config.yml",
        },
      }
    end

    assert_redirected_to session_url(Session.last)
    assert_equal "Session was successfully created.", flash[:notice]
  end

  test "should show session" do
    session = Session.create!(
      session_id: SecureRandom.uuid,
      swarm_name: "Test Swarm",
      project_path: "/home/test/project",
      status: "active",
      started_at: Time.current,
    )

    get session_url(session)
    assert_response :success
  end

  test "should handle non-existent session" do
    get session_url(id: 999999)
    assert_redirected_to sessions_url
    assert_equal "Session not found.", flash[:alert]
  end
end
