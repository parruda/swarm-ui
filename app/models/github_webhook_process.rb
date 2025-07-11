# frozen_string_literal: true

class GithubWebhookProcess < ApplicationRecord
  # Associations
  belongs_to :project

  # Status constants
  STATUSES = ["starting", "running", "stopped", "error"].freeze

  # Validations
  validates :status, inclusion: { in: STATUSES }

  # Scopes
  scope :running, -> { where(status: "running") }
  scope :stopped, -> { where(status: "stopped") }
  scope :with_errors, -> { where(status: "error") }
  scope :recent, -> { order(created_at: :desc) }

  # Instance methods
  def running?
    status == "running"
  end

  def stopped?
    status == "stopped"
  end

  def error?
    status == "error"
  end

  def duration
    return unless started_at

    (stopped_at || Time.current) - started_at
  end

  def stop!
    WebhookProcessService.stop(self)
  end

  # Class methods
  class << self
    def cleanup_old_records(days_to_keep: 7)
      where(status: ["stopped", "error"])
        .where("stopped_at < ?", days_to_keep.days.ago)
        .destroy_all
    end
  end
end
