# frozen_string_literal: true

class GithubWebhookEvent < ApplicationRecord
  # Associations
  belongs_to :project

  # Available GitHub webhook events for SwarmUI
  # Limited to comment-based events that can trigger /swarm commands
  AVAILABLE_EVENTS = [
    "issue_comment",
    "pull_request_review",
    "pull_request_review_comment",
  ].freeze

  # Validations
  validates :event_type, presence: true, inclusion: { in: AVAILABLE_EVENTS }
  validates :event_type, uniqueness: { scope: :project_id }

  # Scopes
  scope :enabled, -> { where(enabled: true) }
  scope :disabled, -> { where(enabled: false) }

  # Common event presets
  class << self
    def common_events
      AVAILABLE_EVENTS
    end
  end
end
