# frozen_string_literal: true

class Session < ApplicationRecord
  # Associations
  belongs_to :project
  has_many :terminal_sessions, dependent: :destroy
  has_many :file_viewer_sessions, dependent: :destroy

  # Attributes
  attribute :environment_variables, :json, default: -> { {} }

  # Encryption
  encrypts :environment_variables

  # Validations
  validates :session_id, presence: true, uniqueness: true, format: { with: /\A[a-f0-9\-]{36}\z/, message: "must be a valid UUID" }
  validates :status, inclusion: { in: ["active", "stopped", "archived"] }

  # Scopes
  scope :active, -> { where(status: "active") }
  scope :stopped, -> { where(status: "stopped") }
  scope :archived, -> { where(status: "archived") }
  scope :recent, -> { order(started_at: :desc) }

  # Status helpers
  def active?
    status == "active"
  end

  def stopped?
    status == "stopped"
  end

  def archived?
    status == "archived"
  end

  # Callbacks
  before_validation :calculate_duration, if: :ended_at_changed?
  before_validation :set_project_folder_name
  before_validation :set_session_path

  # Project counter cache callbacks
  after_create :increment_project_counters
  after_update :update_project_active_sessions_count, if: :saved_change_to_status?
  after_update :update_project_last_session_at
  after_destroy :decrement_project_counters

  # Broadcast redirect when session stops
  after_update_commit :broadcast_redirect_if_stopped
  after_update :cleanup_terminals_on_stop, if: :saved_change_to_status?

  def terminal_url(new_session: false)
    # Build the JSON payload for the ttyd session
    payload = {
      tmux_session_name: "swarm-ui-#{session_id}",
      project_path: project.path,
      swarm_file: configuration_path,
      use_worktree: use_worktree,
      session_id: session_id,
      new_session: new_session,
      openai_api_key: Setting.openai_api_key,
      environment_variables: environment_variables,
      initial_prompt: initial_prompt,
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
    return unless project&.path.present?

    # Convert project path to folder name format
    # Remove first / and replace all remaining / or \ with +
    folder_name = project.path.dup
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

    # Redirect to the session info view when session stops
    broadcast_prepend_to(
      "session_#{id}",
      target: "session_redirect",
      html: "<script>window.location.href = '#{Rails.application.routes.url_helpers.session_path(self, view_only: true)}';</script>",
    )
  end

  def increment_project_counters
    project.increment!(:total_sessions_count)
    project.increment!(:active_sessions_count) if status == "active"
  end

  def update_project_active_sessions_count
    if status_before_last_save == "active" && status != "active"
      project.decrement!(:active_sessions_count)
    elsif status_before_last_save != "active" && status == "active"
      project.increment!(:active_sessions_count)
    end
  end

  def update_project_last_session_at
    project.update_column(:last_session_at, Time.current)
  end

  def decrement_project_counters
    project.decrement!(:total_sessions_count)
    project.decrement!(:active_sessions_count) if status == "active"
  end

  def cleanup_terminals_on_stop
    if status == "stopped" && status_before_last_save == "active"
      terminal_sessions.active.each do |terminal|
        # Kill the terminal's tmux session
        system("tmux", "kill-session", "-t", terminal.tmux_session_name)
        terminal.update!(status: "stopped", ended_at: Time.current)
      end
    end
  end
end
