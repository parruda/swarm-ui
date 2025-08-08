# frozen_string_literal: true

require "open3"

class GithubWebhookCommandProcessor
  attr_reader :project, :payload, :event_type

  def initialize(project:, payload:, event_type:)
    @project = project
    @payload = payload
    @event_type = event_type
  end

  def process
    return unless valid_user?
    return unless command_present?

    extract_command_and_prompt
    return unless @swarm_path

    process_session
  end

  private

  def valid_user?
    user_login == Setting.github_username
  end

  def user_login
    case event_type
    when "issue_comment"
      payload["comment"]["user"]["login"]
    when "pull_request_review_comment"
      payload["comment"]["user"]["login"]
    when "pull_request_review"
      payload["review"]["user"]["login"]
    end
  end

  def comment_body
    case event_type
    when "issue_comment"
      payload["comment"]["body"]
    when "pull_request_review_comment"
      payload["comment"]["body"]
    when "pull_request_review"
      payload["review"]["body"]
    end
  end

  def command_present?
    comment_body.present?
  end

  def extract_command_and_prompt
    webhook_command = project.find_webhook_command(comment_body)

    if webhook_command
      # Custom webhook command found
      command = webhook_command["command"]
      @prompt = comment_body.strip.sub(/^#{Regexp.escape(command)}\s*/, "")
      # Convert to absolute path
      @swarm_path = project.resolve_swarm_path(webhook_command["swarm_path"])

      Rails.logger.info("Processing custom command #{command} with swarm #{@swarm_path}")
    elsif project.default_config_path.present?
      # No custom command found, but project has a default config
      # Use the entire comment as the prompt
      @prompt = comment_body.strip
      # Convert to absolute path
      @swarm_path = project.resolve_swarm_path(project.default_config_path)

      Rails.logger.info("No command prefix found, using default swarm #{@swarm_path}")
    else
      # No custom command and no default config
      Rails.logger.info("No webhook command matched and no default config for project #{project.id}")
      @swarm_path = nil
    end
  end

  def process_session
    build_context
    log_processing

    existing_session = find_existing_session

    if existing_session
      handle_existing_session(existing_session)
    else
      create_new_session
    end
  end

  def build_context
    case event_type
    when "issue_comment"
      @github_entity = payload["issue"]
      @is_pr = @github_entity.key?("pull_request")
      @issue_number = @is_pr ? nil : @github_entity["number"]
      @pr_number = @is_pr ? @github_entity["number"] : nil
      @issue_type = @is_pr ? "pull_request" : "issue"
      @entity_title = @github_entity["title"]
      @full_prompt = @prompt
    when "pull_request_review_comment"
      @github_entity = payload["pull_request"]
      @is_pr = true
      @issue_number = nil
      @pr_number = @github_entity["number"]
      @issue_type = "pull_request"
      @entity_title = @github_entity["title"]
      @full_prompt = build_review_comment_prompt
    when "pull_request_review"
      @github_entity = payload["pull_request"]
      @is_pr = true
      @issue_number = nil
      @pr_number = @github_entity["number"]
      @issue_type = "pull_request"
      @entity_title = @github_entity["title"]
      @full_prompt = build_review_prompt
    end
  end

  def build_review_comment_prompt
    code_context = []
    if payload["comment"]["path"]
      code_context << "File: #{payload["comment"]["path"]}"
      code_context << "Line: #{payload["comment"]["line"]}" if payload["comment"]["line"]
    end

    code_context.any? ? "#{@prompt}\n\nContext:\n#{code_context.join("\n")}" : @prompt
  end

  def build_review_prompt
    review_state = payload["review"]["state"] # approved, changes_requested, commented
    "PR Review (#{review_state}): #{@prompt}"
  end

  def log_processing
    entity_descriptor = @issue_type == "pull_request" ? "PR" : "Issue"
    entity_number = @pr_number || @issue_number
    Rails.logger.info("Processing command from #{user_login} for #{entity_descriptor} ##{entity_number}: #{@prompt}")
  end

  def find_existing_session
    BackgroundSessionService.find_existing_github_session(
      project,
      @issue_number,
      @pr_number,
      @swarm_path,
    )
  end

  def handle_existing_session(session)
    entity_descriptor = @issue_type == "pull_request" ? "PR" : "Issue"
    entity_number = @pr_number || @issue_number

    Rails.logger.info("Found existing active session #{session.id} for #{entity_descriptor} ##{entity_number}")
    BackgroundSessionService.send_comment_to_session(session, @full_prompt, user_login: user_login)
    Rails.logger.info("Successfully processed comment for session #{session.id}")
  end

  def create_new_session
    session = BackgroundSessionService.find_or_create_session(
      project: project,
      issue_number: @issue_number,
      pr_number: @pr_number,
      issue_type: @issue_type,
      initial_prompt: @full_prompt,
      user_login: user_login,
      issue_title: @entity_title,
      start_background: true,
      swarm_path: @swarm_path,
    )

    if session.persisted?
      Rails.logger.info("Successfully created and started session #{session.id}")
      add_github_acknowledgment(session)
    else
      entity_descriptor = @issue_type == "pull_request" ? "PR" : "Issue"
      entity_number = @pr_number || @issue_number
      Rails.logger.error("Failed to create session for #{entity_descriptor} ##{entity_number}")
    end
  end

  def add_github_acknowledgment(session)
    return unless project.github_configured?

    case event_type
    when "issue_comment"
      comment_url = payload["comment"]["url"]
      GithubReactionService.add_thumbs_up_to_comment(project.github_repo_full_name, comment_url)
    when "pull_request_review_comment"
      comment_url = payload["comment"]["url"]
      GithubReactionService.add_thumbs_up_to_pr_review_comment(project.github_repo_full_name, comment_url)
    when "pull_request_review"
      # For PR reviews, we can't directly react to the review comment
      # but we can post a comment on the PR acknowledging the session
      pr_number = @github_entity["number"]
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
