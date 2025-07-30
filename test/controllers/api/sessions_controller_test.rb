# frozen_string_literal: true

require "test_helper"

module Api
  class SessionsControllerTest < ActionDispatch::IntegrationTest
    setup do
      @project = create(:project)
      @session = create(:session, project: @project, status: "active", started_at: 1.hour.ago)
      @stopped_session = create(:session, project: @project, status: "stopped", started_at: 2.hours.ago, ended_at: 1.hour.ago)
    end

    teardown do
      # Clean up test directory
      FileUtils.rm_rf(@project.path) if File.exist?(@project.path)
    end

    # Mark ended tests
    test "should mark session as ended" do
      post ended_api_session_url(@session.session_id), as: :json

      assert_response :success

      json = JSON.parse(@response.body)
      assert_equal "Session marked as stopped", json["message"]
      assert_equal "stopped", json["session"]["status"]
      assert_not_nil json["session"]["ended_at"]

      # Verify database update
      @session.reload
      assert_equal "stopped", @session.status
      assert_not_nil @session.ended_at
    end

    test "mark ended with non-existent session" do
      post ended_api_session_url("non-existent"), as: :json

      assert_response :not_found

      json = JSON.parse(@response.body)
      assert_equal "Session not found", json["error"]
    end

    # Update status tests
    test "should update status to active" do
      put status_api_session_url(@stopped_session.session_id),
        params: { status: "active" },
        as: :json

      assert_response :success

      json = JSON.parse(@response.body)
      assert_equal "Session marked as active", json["message"]
      assert_equal "active", json["session"]["status"]
      assert_nil json["session"]["ended_at"]

      # Should set resumed_at since it was previously stopped
      @stopped_session.reload
      assert_equal "active", @stopped_session.status
      assert_not_nil @stopped_session.resumed_at
      assert_nil @stopped_session.ended_at
    end

    test "should update status to stopped" do
      put status_api_session_url(@session.session_id),
        params: { status: "stopped" },
        as: :json

      assert_response :success

      json = JSON.parse(@response.body)
      assert_equal "Session marked as stopped", json["message"]
      assert_equal "stopped", json["session"]["status"]
      assert_not_nil json["session"]["ended_at"]

      @session.reload
      assert_equal "stopped", @session.status
      assert_not_nil @session.ended_at
    end

    test "update status with invalid status" do
      put status_api_session_url(@session.session_id),
        params: { status: "invalid" },
        as: :json

      assert_response :bad_request

      json = JSON.parse(@response.body)
      assert_equal "Invalid status. Must be 'active' or 'stopped'", json["error"]

      # Should not update session
      @session.reload
      assert_equal "active", @session.status
    end

    test "update status without status parameter" do
      put status_api_session_url(@session.session_id), as: :json

      assert_response :bad_request

      json = JSON.parse(@response.body)
      assert_equal "Invalid status. Must be 'active' or 'stopped'", json["error"]
    end

    test "update status with non-existent session" do
      put status_api_session_url("non-existent"),
        params: { status: "stopped" },
        as: :json

      assert_response :not_found

      json = JSON.parse(@response.body)
      assert_equal "Session not found", json["error"]
    end

    test "first time starting session sets started_at" do
      new_session = create(:session, project: @project, status: "stopped", started_at: nil, ended_at: nil)

      put status_api_session_url(new_session.session_id),
        params: { status: "active" },
        as: :json

      assert_response :success

      new_session.reload
      assert_not_nil new_session.started_at
      assert_nil new_session.ended_at
      assert_nil new_session.resumed_at # Not resuming, first time
    end

    test "resuming session sets resumed_at" do
      # Session that was started and stopped
      session = create(
        :session,
        project: @project,
        status: "stopped",
        started_at: 2.hours.ago,
        ended_at: 1.hour.ago,
      )

      put status_api_session_url(session.session_id),
        params: { status: "active" },
        as: :json

      assert_response :success

      session.reload
      assert_equal "active", session.status
      assert_not_nil session.resumed_at
      assert_nil session.ended_at
      # Original started_at should be preserved (with 1 second tolerance for timing)
      assert_in_delta 2.hours.ago.to_i, session.started_at.to_i, 1
    end

    test "handles validation errors gracefully" do
      # Force a validation error
      Session.any_instance.stubs(:save).returns(false)
      Session.any_instance.stubs(:errors).returns(
        ActiveModel::Errors.new(Session.new).tap { |e| e.add(:base, "Something went wrong") },
      )

      put status_api_session_url(@session.session_id),
        params: { status: "stopped" },
        as: :json

      assert_response :unprocessable_entity

      json = JSON.parse(@response.body)
      assert_includes json["error"], "Something went wrong"
    end

    # Security tests
    test "skips CSRF protection" do
      # API endpoints should skip CSRF for external integration
      ActionController::Base.allow_forgery_protection = true

      post(ended_api_session_url(@session.session_id), as: :json)

      assert_response(:success)
    ensure
      ActionController::Base.allow_forgery_protection = false
    end

    # Response format tests
    test "returns consistent session data structure" do
      put status_api_session_url(@session.session_id),
        params: { status: "stopped" },
        as: :json

      assert_response :success

      json = JSON.parse(@response.body)
      session_data = json["session"]

      # Verify all expected fields are present
      assert session_data.key?("id")
      assert session_data.key?("status")
      assert session_data.key?("started_at")
      assert session_data.key?("ended_at")

      # Verify session_id is used as id (not database id)
      assert_equal @session.session_id, session_data["id"]
    end
  end
end
