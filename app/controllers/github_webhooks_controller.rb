# frozen_string_literal: true

class GithubWebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token

  def receive
    project = Project.find(params[:project_id])

    # Get webhook event type from GitHub headers
    event_type = request.headers["X-GitHub-Event"]
    delivery_id = request.headers["X-GitHub-Delivery"]

    unless event_type.present?
      render(json: { error: "Missing X-GitHub-Event header" }, status: :bad_request)
      return
    end

    # Log the webhook receipt
    Rails.logger.info("Received GitHub webhook for project #{project.id}: #{event_type} (delivery: #{delivery_id})")
    Rails.logger.info("Payload: #{request.raw_post}")

    # For now, just acknowledge receipt
    # In the future, this is where we'd trigger actions based on webhook events
    render(json: { status: "received", event: event_type, project_id: project.id })
  rescue ActiveRecord::RecordNotFound
    render(json: { error: "Project not found" }, status: :not_found)
  rescue => e
    Rails.logger.error("Webhook processing error: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render(json: { error: "Internal server error" }, status: :internal_server_error)
  end
end
