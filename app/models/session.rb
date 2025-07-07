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

  private

  def calculate_duration
    return unless started_at && ended_at

    self.duration_seconds = (ended_at - started_at).to_i
  end
end
