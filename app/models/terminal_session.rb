# frozen_string_literal: true

class TerminalSession < ApplicationRecord
  belongs_to :session

  # Validations
  validates :terminal_id, presence: true, uniqueness: true
  validates :directory, presence: true
  validates :instance_name, presence: true
  validates :name, presence: true
  validates :status, inclusion: { in: ["active", "stopped"] }

  # Scopes
  scope :active, -> { where(status: "active") }
  scope :stopped, -> { where(status: "stopped") }
  scope :ordered, -> { order(:created_at) }

  # Status helpers
  def active?
    status == "active"
  end

  def stopped?
    status == "stopped"
  end

  # Generate tmux session name
  def tmux_session_name
    "swarm-ui-#{session.session_id}-term-#{terminal_id}"
  end

  # Generate terminal URL
  def terminal_url
    # Build the JSON payload for the ttyd terminal session
    payload = {
      mode: "terminal",
      terminal_id: terminal_id,
      tmux_session_name: tmux_session_name,
      working_directory: directory,
      session_id: session.session_id,
    }

    # Base64 encode the payload (URL-safe)
    encoded_payload = Base64.urlsafe_encode64(payload.to_json, padding: false)

    # Break encoded payload into 100 character chunks
    chunks = encoded_payload.scan(/.{1,100}/)

    # Build query parameters for each chunk
    query_params = chunks.map { |chunk| "arg=#{chunk}" }.join("&")

    # Build the complete iframe URL
    ttyd_port = ENV.fetch("TTYD_PORT", "4268")
    "http://127.0.0.1:#{ttyd_port}/?#{query_params}"
  end

  # Callbacks
  before_validation :set_opened_at, on: :create
  after_update_commit :broadcast_terminal_removal, if: :saved_change_to_stopped?

  private

  def set_opened_at
    self.opened_at ||= Time.current
  end

  def saved_change_to_stopped?
    saved_change_to_status? && status == "stopped"
  end

  def broadcast_terminal_removal
    # Broadcast removal of terminal tab when it stops
    Rails.logger.info("Broadcasting terminal removal for terminal_tab_#{terminal_id} to session_#{session_id}_terminals")
    broadcast_remove_to(
      "session_#{session_id}_terminals",
      target: "terminal_tab_#{terminal_id}",
    )
  end
end
