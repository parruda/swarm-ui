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

    # Parse payload
    payload = JSON.parse(request.raw_post)

    # Log the webhook receipt
    Rails.logger.info("Received GitHub webhook for project #{project.id}: #{event_type} (delivery: #{delivery_id})")
    Rails.logger.debug("Payload: #{request.raw_post}")

    # Check if project has this event enabled
    unless project.github_webhook_events.where(event_type: event_type, enabled: true).exists?
      Rails.logger.info("Event type #{event_type} not enabled for project #{project.id}, ignoring")
      render(json: { status: "ignored", event: event_type, project_id: project.id })
      return
    end

    # Process webhook commands for supported event types
    case event_type
    when "issue_comment", "pull_request_review_comment", "pull_request_review"
      process_webhook_command(project, payload, event_type)
    else
      # For other events, just acknowledge receipt
      Rails.logger.info("No special handling for event type: #{event_type}")
    end

    render(json: { status: "received", event: event_type, project_id: project.id })
  rescue ActiveRecord::RecordNotFound
    render(json: { error: "Project not found" }, status: :not_found)
  rescue => e
    Rails.logger.error("Webhook processing error: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
    render(json: { error: "Internal server error" }, status: :internal_server_error)
  end

  private

  def process_webhook_command(project, payload, event_type)
    # Check action type for the event
    action = payload["action"]

    # Only process relevant actions
    case event_type
    when "issue_comment", "pull_request_review_comment"
      return unless action == "created"
    when "pull_request_review"
      return unless action == "submitted"
    end

    # Use the new command processor
    processor = GithubWebhookCommandProcessor.new(
      project: project,
      payload: payload,
      event_type: event_type,
    )

    processor.process
  rescue => e
    Rails.logger.error("Error processing #{event_type}: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end
end
