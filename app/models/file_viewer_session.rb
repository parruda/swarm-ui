# frozen_string_literal: true

class FileViewerSession < ApplicationRecord
  belongs_to :session

  # Validations
  validates :viewer_id, presence: true, uniqueness: true
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

  # Callbacks
  before_validation :set_opened_at, on: :create
  after_update_commit :broadcast_file_viewer_removal, if: :saved_change_to_stopped?

  private

  def set_opened_at
    self.opened_at ||= Time.current
  end

  def saved_change_to_stopped?
    saved_change_to_status? && status == "stopped"
  end

  def broadcast_file_viewer_removal
    # Broadcast removal of file viewer tab when it stops
    Rails.logger.info("Broadcasting file viewer removal for file_viewer_tab_#{viewer_id} to session_#{session_id}_file_viewers")
    broadcast_remove_to(
      "session_#{session_id}_file_viewers",
      target: "file_viewer_tab_#{viewer_id}",
    )
  end
end
