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

  # Callbacks
  after_save :notify_events_changed, if: :saved_change_to_enabled?
  after_destroy :notify_events_changed

  # Common event presets
  class << self
    def common_events
      AVAILABLE_EVENTS
    end
  end

  private

  def notify_events_changed
    message = {
      project_id: project_id,
      operation: destroyed? ? "DESTROY" : "UPDATE",
    }.to_json

    RedisClient.publish(WebhookManager::WEBHOOK_EVENTS_CHANNEL, message)
    Rails.logger.info("Published webhook events change notification for project #{project_id}")
  rescue => e
    Rails.logger.error("Failed to publish webhook events change notification: #{e.message}")
    # Don't let Redis failures break the save
  end
end
