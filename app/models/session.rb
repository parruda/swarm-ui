# frozen_string_literal: true

class Session < ApplicationRecord
  # Validations
  validates :session_id, presence: true, uniqueness: true
  validates :status, inclusion: { in: ["active", "completed", "failed"] }

  # Scopes
  scope :active, -> { where(status: "active") }
  scope :completed, -> { where(status: "completed") }
  scope :failed, -> { where(status: "failed") }
  scope :recent, -> { order(started_at: :desc) }

  # Callbacks
  before_validation :calculate_duration, if: :ended_at_changed?

  def terminal_url
    # Build the JSON payload for the ttyd session
    payload = {
      tmux_session_name: "swarm-ui-#{session_id}",
      working_dir: project_path,
      swarm_file: configuration_path,
      use_worktree: use_worktree,
      session_id: session_id,
    }

    # Base64 encode the payload (URL-safe)
    encoded_payload = Base64.urlsafe_encode64(payload.to_json, padding: false)

    # Break encoded payload into 100 character chunks
    # because ttyd don't support long arguments
    chunks = encoded_payload.scan(/.{1,100}/)

    # Build query parameters for each chunk
    query_params = chunks.map { |chunk| "arg=#{chunk}" }.join("&")

    # Build the complete iframe URL
    "http://127.0.0.1:8999/?#{query_params}"
  end

  private

  def calculate_duration
    return unless started_at && ended_at

    self.duration_seconds = (ended_at - started_at).to_i
  end
end
