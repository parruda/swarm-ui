# frozen_string_literal: true

require "test_helper"

module Api
  class TerminalSessionsControllerTest < ActionDispatch::IntegrationTest
    setup do
      @project = create(:project)
      @session = create(:session, project: @project)
      @terminal = create(:terminal_session, session: @session, status: "active")
      @stopped_terminal = create(:terminal_session, :stopped, session: @session)
    end

    teardown do
      FileUtils.rm_rf(@project.path) if File.exist?(@project.path)
    end

    # Update status tests
    test "should update terminal status to stopped" do
      # Use PUT instead of PATCH as per routes
      put "/api/terminal_sessions/#{@terminal.terminal_id}/status",
        params: { status: "stopped" },
        as: :json

      assert_response :success

      json = JSON.parse(@response.body)
      assert_equal "Terminal marked as stopped", json["message"]
      assert_equal "stopped", json["terminal"]["status"]
      assert_not_nil json["terminal"]["ended_at"]

      # Verify database update
      @terminal.reload
      assert_equal "stopped", @terminal.status
      assert_not_nil @terminal.ended_at
    end

    test "should update terminal status to active" do
      put status_api_terminal_session_url(@stopped_terminal.terminal_id),
        params: { status: "active" },
        as: :json

      assert_response :success

      json = JSON.parse(@response.body)
      assert_equal "Terminal marked as active", json["message"]
      assert_equal "active", json["terminal"]["status"]

      @stopped_terminal.reload
      assert_equal "active", @stopped_terminal.status
    end

    test "update status with invalid terminal id" do
      put status_api_terminal_session_url("non-existent"),
        params: { status: "stopped" },
        as: :json

      assert_response :not_found

      json = JSON.parse(@response.body)
      assert_equal "Terminal session not found", json["error"]
    end

    test "update status with invalid status value" do
      put status_api_terminal_session_url(@terminal.terminal_id),
        params: { status: "invalid" },
        as: :json

      assert_response :bad_request

      json = JSON.parse(@response.body)
      assert_equal "Invalid status. Must be 'active' or 'stopped'", json["error"]

      # Should not update terminal
      @terminal.reload
      assert_equal "active", @terminal.status
    end

    test "update status without status parameter" do
      put status_api_terminal_session_url(@terminal.terminal_id),
        as: :json

      assert_response :bad_request

      json = JSON.parse(@response.body)
      assert_equal "Invalid status. Must be 'active' or 'stopped'", json["error"]
    end

    test "handles validation errors gracefully" do
      # Force a validation error
      TerminalSession.any_instance.stubs(:save).returns(false)
      TerminalSession.any_instance.stubs(:errors).returns(
        ActiveModel::Errors.new(TerminalSession.new).tap { |e| e.add(:base, "Validation failed") },
      )

      put status_api_terminal_session_url(@terminal.terminal_id),
        params: { status: "stopped" },
        as: :json

      assert_response :unprocessable_entity

      json = JSON.parse(@response.body)
      assert_includes json["error"], "Validation failed"
    end

    # Response format tests
    test "returns consistent terminal data structure" do
      put status_api_terminal_session_url(@terminal.terminal_id),
        params: { status: "stopped" },
        as: :json

      assert_response :success

      json = JSON.parse(@response.body)
      terminal_data = json["terminal"]

      # Verify all expected fields are present
      assert terminal_data.key?("id")
      assert terminal_data.key?("status")
      assert terminal_data.key?("opened_at")
      assert terminal_data.key?("ended_at")

      # Verify terminal_id is used as id (not database id)
      assert_equal @terminal.terminal_id, terminal_data["id"]
    end

    test "setting active status does not change ended_at" do
      # Start with a stopped terminal that has ended_at
      original_ended_at = @stopped_terminal.ended_at

      put status_api_terminal_session_url(@stopped_terminal.terminal_id),
        params: { status: "active" },
        as: :json

      assert_response :success

      @stopped_terminal.reload
      # ended_at should remain unchanged when setting to active
      assert_equal original_ended_at.to_i, @stopped_terminal.ended_at.to_i
    end

    # Security tests
    test "skips CSRF protection" do
      ActionController::Base.allow_forgery_protection = true

      put(
        status_api_terminal_session_url(@terminal.terminal_id),
        params: { status: "stopped" },
        as: :json,
      )

      assert_response(:success)
    ensure
      ActionController::Base.allow_forgery_protection = false
    end
  end
end
