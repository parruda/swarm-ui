# frozen_string_literal: true

require "test_helper"

class GithubWebhooksControllerTest < ActionDispatch::IntegrationTest
  setup do
    @project = create(:project)
    # Enable webhook events
    create(:github_webhook_event, project: @project, event_type: "issue_comment", enabled: true)
  end

  test "should receive webhook with valid headers" do
    post github_webhooks_path(project_id: @project.id),
      params: { payload: "test" }.to_json,
      headers: {
        "X-GitHub-Event" => "issue_comment",
        "X-GitHub-Delivery" => "12345",
        "Content-Type" => "application/json",
      }

    assert_response :success
    response_body = JSON.parse(response.body)
    assert_equal "received", response_body["status"]
    assert_equal "issue_comment", response_body["event"]
    assert_equal @project.id, response_body["project_id"]
  end

  test "should return bad request without event header" do
    post github_webhooks_path(project_id: @project.id),
      params: { payload: "test" }.to_json,
      headers: {
        "X-GitHub-Delivery" => "12345",
        "Content-Type" => "application/json",
      }

    assert_response :bad_request
    response_body = JSON.parse(response.body)
    assert_equal "Missing X-GitHub-Event header", response_body["error"]
  end

  test "should return not found for invalid project" do
    post github_webhooks_path(project_id: 999999),
      params: { payload: "test" }.to_json,
      headers: {
        "X-GitHub-Event" => "push",
        "X-GitHub-Delivery" => "12345",
        "Content-Type" => "application/json",
      }

    assert_response :not_found
    response_body = JSON.parse(response.body)
    assert_equal "Project not found", response_body["error"]
  end

  test "should handle exceptions gracefully" do
    Project.stubs(:find).raises(StandardError, "Test error")

    post github_webhooks_path(project_id: @project.id),
      params: { payload: "test" }.to_json,
      headers: {
        "X-GitHub-Event" => "push",
        "X-GitHub-Delivery" => "12345",
        "Content-Type" => "application/json",
      }

    assert_response :internal_server_error
    response_body = JSON.parse(response.body)
    assert_equal "Internal server error", response_body["error"]
  end

  test "should skip authenticity token verification" do
    # This test ensures CSRF protection is disabled for webhooks
    # by making a request without authenticity token
    assert_nothing_raised do
      post github_webhooks_path(project_id: @project.id),
        params: { payload: "test" }.to_json,
        headers: {
          "X-GitHub-Event" => "push",
          "Content-Type" => "application/json",
        }
    end
  end
end
