# frozen_string_literal: true

require "open3"

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

    # Handle different event types
    case event_type
    when "issue_comment"
      handle_issue_comment(project, payload)
    when "pull_request_review_comment"
      handle_pr_review_comment(project, payload)
    when "pull_request_review"
      handle_pr_review(project, payload)
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

  def handle_issue_comment(project, payload)
    # Only process new comments
    return unless payload["action"] == "created"

    comment_body = payload["comment"]["body"]
    user_login = payload["comment"]["user"]["login"]

    # Only process comments from configured GitHub user
    return unless user_login == Setting.github_username

    # Check for custom webhook commands first
    webhook_command = project.find_webhook_command(comment_body)

    if webhook_command
      # Extract arguments after the command
      command = webhook_command["command"]
      prompt = comment_body.strip.sub(/^#{Regexp.escape(command)}\s*/, "")
      # Convert relative path to absolute path
      swarm_path = File.join(project.path, webhook_command["swarm_path"])

      Rails.logger.info("Processing custom command #{command} with swarm #{swarm_path}")
    else
      # Fall back to default /swarm command
      match = comment_body&.match(%r{^/swarm\s+(.+)}mi)
      return unless match

      prompt = match[1].strip
      # Ensure default_config_path returns absolute path
      swarm_path = project.default_config_path
      swarm_path = File.join(project.path, swarm_path) unless swarm_path.start_with?("/")
    end

    issue = payload["issue"]
    issue_title = issue["title"]

    # Determine if it's an issue or PR
    is_pr = issue.key?("pull_request")
    issue_number = is_pr ? nil : issue["number"]
    pr_number = is_pr ? issue["number"] : nil
    issue_type = is_pr ? "pull_request" : "issue"

    Rails.logger.info("Processing /swarm comment from #{user_login} for #{issue_type} ##{issue["number"]}: #{prompt}")

    # Find or create session - now includes swarm_path for uniqueness
    # Only active sessions are returned, stopped sessions will trigger new session creation
    existing_session = BackgroundSessionService.find_existing_github_session(project, issue_number, pr_number, swarm_path)

    if existing_session
      Rails.logger.info("Found existing active session #{existing_session.id} for #{issue_type} ##{issue["number"]}")

      # Send to existing active session
      BackgroundSessionService.send_comment_to_session(existing_session, prompt, user_login: user_login)

      Rails.logger.info("Successfully processed comment for session #{existing_session.id}")
    else
      # Create new session - the initial_prompt will be used when the session starts
      session = BackgroundSessionService.find_or_create_session(
        project: project,
        issue_number: issue_number,
        pr_number: pr_number,
        issue_type: issue_type,
        initial_prompt: prompt,
        user_login: user_login,
        issue_title: issue_title,
        start_background: true,
        swarm_path: swarm_path,
      )

      if session.persisted?
        Rails.logger.info("Successfully created and started session #{session.id}")

        # Add thumbs up reaction to acknowledge session creation
        if project.github_configured?
          comment_url = payload["comment"]["url"]
          GithubReactionService.add_thumbs_up_to_comment(project.github_repo_full_name, comment_url)
        end
      else
        Rails.logger.error("Failed to create session for #{issue_type} ##{issue["number"]}")
      end
    end
  rescue => e
    Rails.logger.error("Error handling issue comment: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end

  def handle_pr_review_comment(project, payload)
    # Only process new review comments
    return unless payload["action"] == "created"

    comment_body = payload["comment"]["body"]
    user_login = payload["comment"]["user"]["login"]

    # Only process comments from configured GitHub user
    return unless user_login == Setting.github_username

    # Check for custom webhook commands first
    webhook_command = project.find_webhook_command(comment_body)

    if webhook_command
      # Extract arguments after the command
      command = webhook_command["command"]
      prompt = comment_body.strip.sub(/^#{Regexp.escape(command)}\s*/, "")
      # Convert relative path to absolute path
      swarm_path = File.join(project.path, webhook_command["swarm_path"])

      Rails.logger.info("Processing custom command #{command} with swarm #{swarm_path}")
    else
      # Fall back to default /swarm command
      match = comment_body&.match(%r{^/swarm\s+(.+)}mi)
      return unless match

      prompt = match[1].strip
      # Ensure default_config_path returns absolute path
      swarm_path = project.default_config_path
      swarm_path = File.join(project.path, swarm_path) unless swarm_path.start_with?("/")
    end
    pr = payload["pull_request"]
    pr_title = pr["title"]

    # Add context about the specific code being reviewed
    code_context = []
    if payload["comment"]["path"]
      code_context << "File: #{payload["comment"]["path"]}"
      code_context << "Line: #{payload["comment"]["line"]}" if payload["comment"]["line"]
    end

    full_prompt = code_context.any? ? "#{prompt}\n\nContext:\n#{code_context.join("\n")}" : prompt

    Rails.logger.info("Processing /swarm review comment from #{user_login} for PR ##{pr["number"]}: #{prompt}")

    # Find or create session - now includes swarm_path for uniqueness
    # Only active sessions are returned, stopped sessions will trigger new session creation
    existing_session = BackgroundSessionService.find_existing_github_session(project, nil, pr["number"], swarm_path)

    if existing_session
      Rails.logger.info("Found existing active session #{existing_session.id} for PR ##{pr["number"]}")

      # Send to existing active session
      BackgroundSessionService.send_comment_to_session(existing_session, full_prompt, user_login: user_login)

      Rails.logger.info("Successfully processed review comment for session #{existing_session.id}")
    else
      # Create new session - the initial_prompt will be used when the session starts
      session = BackgroundSessionService.find_or_create_session(
        project: project,
        pr_number: pr["number"],
        issue_type: "pull_request",
        initial_prompt: full_prompt,
        user_login: user_login,
        issue_title: pr_title,
        start_background: true,
        swarm_path: swarm_path,
      )

      if session.persisted?
        Rails.logger.info("Successfully created and started session #{session.id}")

        # Add thumbs up reaction to acknowledge session creation
        if project.github_configured?
          comment_url = payload["comment"]["url"]
          GithubReactionService.add_thumbs_up_to_pr_review_comment(project.github_repo_full_name, comment_url)
        end
      end
    end
  rescue => e
    Rails.logger.error("Error handling PR review comment: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end

  def handle_pr_review(project, payload)
    # Only process submitted reviews
    return unless payload["action"] == "submitted"

    review_body = payload["review"]["body"]
    user_login = payload["review"]["user"]["login"]

    # Only process reviews from configured GitHub user
    return unless user_login == Setting.github_username

    # Check for custom webhook commands first
    webhook_command = project.find_webhook_command(review_body)

    if webhook_command
      # Extract arguments after the command
      command = webhook_command["command"]
      prompt = review_body.strip.sub(/^#{Regexp.escape(command)}\s*/, "")
      # Convert relative path to absolute path
      swarm_path = File.join(project.path, webhook_command["swarm_path"])

      Rails.logger.info("Processing custom command #{command} with swarm #{swarm_path}")
    else
      # Fall back to default /swarm command
      match = review_body&.match(%r{^/swarm\s+(.+)}mi)
      return unless match

      prompt = match[1].strip
      # Ensure default_config_path returns absolute path
      swarm_path = project.default_config_path
      swarm_path = File.join(project.path, swarm_path) unless swarm_path.start_with?("/")
    end
    pr = payload["pull_request"]
    pr_title = pr["title"]
    review_state = payload["review"]["state"] # approved, changes_requested, commented

    # Add review state context
    full_prompt = "PR Review (#{review_state}): #{prompt}"

    Rails.logger.info("Processing /swarm review from #{user_login} for PR ##{pr["number"]}: #{prompt}")

    # Find or create session - now includes swarm_path for uniqueness
    # Only active sessions are returned, stopped sessions will trigger new session creation
    existing_session = BackgroundSessionService.find_existing_github_session(project, nil, pr["number"], swarm_path)

    if existing_session
      Rails.logger.info("Found existing active session #{existing_session.id} for PR ##{pr["number"]}")

      # Send to existing active session
      BackgroundSessionService.send_comment_to_session(existing_session, full_prompt, user_login: user_login)

      Rails.logger.info("Successfully processed review for session #{existing_session.id}")
    else
      # Create new session - the initial_prompt will be used when the session starts
      session = BackgroundSessionService.find_or_create_session(
        project: project,
        pr_number: pr["number"],
        issue_type: "pull_request",
        initial_prompt: full_prompt,
        user_login: user_login,
        issue_title: pr_title,
        start_background: true,
        swarm_path: swarm_path,
      )

      if session.persisted?
        Rails.logger.info("Successfully created and started session #{session.id}")

        # For PR reviews, we can't directly react to the review comment
        # but we can post a comment on the PR acknowledging the session
        if project.github_configured?
          pr_number = pr["number"]
          acknowledgment = "👍 SwarmUI session started for this review request."

          cmd = [
            "gh",
            "pr",
            "comment",
            pr_number.to_s,
            "--repo",
            project.github_repo_full_name,
            "--body",
            acknowledgment,
          ]

          Open3.capture3(*cmd)
        end
      end
    end
  rescue => e
    Rails.logger.error("Error handling PR review: #{e.message}")
    Rails.logger.error(e.backtrace.join("\n"))
  end
end
