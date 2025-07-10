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
    project = create(:project)

    assert_difference("Session.count") do
      post sessions_url, params: {
        session: {
          swarm_name: "Test Swarm",
          project_id: project.id,
          configuration_path: "/home/test/config.yml",
        },
      }
    end

    assert_redirected_to session_url(Session.last, new_session: true)
  end

  test "should show session" do
    project = create(:project)
    session = create(:session, project: project)

    # Stub the Setting.openai_api_key method to avoid encryption issues
    Setting.stubs(:openai_api_key).returns("test_api_key")

    get session_url(session)
    assert_response :success
  end

  test "should handle non-existent session" do
    get session_url(id: 999999)
    assert_redirected_to sessions_url
    assert_equal "Session not found.", flash[:alert]
  end
end
