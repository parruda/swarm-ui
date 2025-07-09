# frozen_string_literal: true

class Project < ApplicationRecord
  # Constants
  VCS_TYPES = ["git", "none"].freeze

  # Encryption
  encrypts :environment_variables

  # Associations
  has_many :sessions

  # Validations
  validates :name, presence: true
  validates :path, presence: true, uniqueness: true
  validates :vcs_type, inclusion: { in: VCS_TYPES, allow_nil: true }
  validate :path_must_exist

  # Scopes
  scope :active, -> { where(archived: false) }
  scope :archived, -> { where(archived: true) }
  scope :with_git, -> { where(vcs_type: "git") }
  scope :ordered, -> { order(name: :asc) }
  scope :recent, -> { order(last_session_at: :desc) }

  # Callbacks
  before_validation :detect_vcs_type, on: :create
  before_validation :normalize_path

  # Class methods
  class << self
    def find_by_path(path)
      normalized_path = File.expand_path(path)
      find_by(path: normalized_path)
    end
  end

  # Instance methods
  def git?
    vcs_type == "git"
  end

  def active?
    !archived
  end

  def has_active_sessions?
    sessions.active.exists?
  end

  def update_session_counts!
    update!(
      total_sessions_count: sessions.count,
      active_sessions_count: sessions.active.count,
      last_session_at: sessions.maximum(:created_at),
    )
  end

  def archive!
    update!(archived: true)
  end

  def unarchive!
    update!(archived: false)
  end

  def to_s
    name
  end

  private

  def detect_vcs_type
    return unless path.present?
    return unless File.directory?(path)

    self.vcs_type = File.directory?(File.join(path, ".git")) ? "git" : "none"
  end

  def normalize_path
    return unless path.present?

    self.path = File.expand_path(path)
  end

  def path_must_exist
    return unless path.present?

    unless File.directory?(path)
      errors.add(:path, "must be a valid directory")
    end
  end
end
