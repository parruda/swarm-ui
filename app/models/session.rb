# frozen_string_literal: true

class Session < ApplicationRecord
  # Encryption
  encrypts :environment_variables

  # Validations
  validates :session_id, presence: true, uniqueness: true
  validates :status, inclusion: { in: ["active", "stopped", "archived"] }

  # Scopes
  scope :active, -> { where(status: "active") }
  scope :stopped, -> { where(status: "stopped") }
  scope :archived, -> { where(status: "archived") }
  scope :recent, -> { order(started_at: :desc) }

  # Callbacks
  before_validation :calculate_duration, if: :ended_at_changed?
  before_validation :set_project_folder_name
  before_validation :set_session_path

  # Broadcast redirect when session stops
  after_update_commit :broadcast_redirect_if_stopped

  def terminal_url(new_session: false)
    # Build the JSON payload for the ttyd session
    payload = {
      tmux_session_name: "swarm-ui-#{session_id}",
      working_dir: project_path,
      swarm_file: configuration_path,
      use_worktree: use_worktree,
      session_id: session_id,
      new_session: new_session,
      openai_api_key: Setting.openai_api_key,
      environment_variables: environment_variables,
    }

    # Base64 encode the payload (URL-safe)
    encoded_payload = Base64.urlsafe_encode64(payload.to_json, padding: false)

    # Break encoded payload into 100 character chunks
    # because ttyd don't support long arguments
    chunks = encoded_payload.scan(/.{1,100}/)

    # Build query parameters for each chunk
    query_params = chunks.map { |chunk| "arg=#{chunk}" }.join("&")

    # Build the complete iframe URL
    ttyd_port = ENV.fetch("TTYD_PORT", "8999")
    "http://127.0.0.1:#{ttyd_port}/?#{query_params}"
  end

  private

  def calculate_duration
    return unless ended_at

    # Use resumed_at if available, otherwise use started_at
    start_time = resumed_at || started_at
    return unless start_time

    self.duration_seconds = (ended_at - start_time).to_i
  end

  def set_project_folder_name
    return unless project_path.present?

    # Convert project path to folder name format
    # Remove first / and replace all remaining / or \ with +
    folder_name = project_path.dup
    folder_name = folder_name[1..] if folder_name.start_with?("/")
    folder_name = folder_name[2..] if folder_name.match?(/^[A-Z]:/) # Windows drive letter
    self.project_folder_name = folder_name.gsub(%r{[/\\]}, "+")
  end

  def set_session_path
    return unless project_folder_name.present? && session_id.present?

    # Generate session path: ~/.claude-swarm/sessions/PROJECT_FOLDER/SESSION_ID
    home = ENV["CLAUDE_SWARM_HOME"] || File.expand_path("~/.claude-swarm")
    self.session_path = File.join(home, "sessions", project_folder_name, session_id)
  end

  def broadcast_redirect_if_stopped
    return unless saved_change_to_status? && status == "stopped" && status_before_last_save != "stopped"

    broadcast_prepend_to(
      "session_#{id}",
      target: "session_redirect",
      html: "<script>window.location.href = '#{Rails.application.routes.url_helpers.sessions_path}';</script>",
    )
  end
end
