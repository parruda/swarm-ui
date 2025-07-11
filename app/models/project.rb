# frozen_string_literal: true

class Project < ApplicationRecord
  # Constants
  VCS_TYPES = ["git", "none"].freeze

  # Encryption
  encrypts :environment_variables

  # Associations
  has_many :sessions
  has_many :github_webhook_events, dependent: :destroy
  has_many :github_webhook_processes, dependent: :destroy

  # Nested attributes
  accepts_nested_attributes_for :github_webhook_events, allow_destroy: true

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
  after_save :populate_github_fields_from_remote, if: :saved_change_to_vcs_type?

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
    transaction do
      # Archive all associated sessions that aren't already archived
      sessions.where.not(status: "archived").update_all(status: "archived", ended_at: Time.current)
      
      # Archive the project itself
      update!(archived: true)
    end
  end

  def unarchive!
    update!(archived: false)
  end

  def to_s
    name
  end

  # Git-related methods
  def git_service
    @git_service ||= GitService.new(path)
  end

  def current_branch
    Rails.cache.fetch("project_#{id}_current_branch", expires_in: 1.minute) do
      git_service.current_branch
    end
  end

  def git_dirty?
    Rails.cache.fetch("project_#{id}_git_dirty", expires_in: 1.minute) do
      git_service.dirty?
    end
  end

  def git_status
    Rails.cache.fetch("project_#{id}_git_status", expires_in: 1.minute) do
      return unless git?

      {
        branch: git_service.current_branch,
        dirty: git_service.dirty?,
        status_summary: git_service.status_summary,
        ahead_behind: git_service.ahead_behind,
        last_commit: git_service.last_commit,
        remote_url: git_service.remote_url,
      }
    end
  end

  def clear_git_cache
    Rails.cache.delete("project_#{id}_current_branch")
    Rails.cache.delete("project_#{id}_git_dirty")
    Rails.cache.delete("project_#{id}_git_status")
  end

  # GitHub webhook methods
  def populate_github_fields_from_remote
    return unless git?
    # Check if the github columns exist before using them
    return unless self.class.column_names.include?("github_repo_owner")
    return if github_repo_owner.present? && github_repo_name.present?

    remote_url = git_service.remote_url
    return unless remote_url.present?

    # Parse GitHub URL formats:
    # https://github.com/owner/repo.git
    # git@github.com:owner/repo.git
    if remote_url =~ %r{github\.com[:/]([^/]+)/([^/]+?)(?:\.git)?$}
      update_columns(
        github_repo_owner: ::Regexp.last_match(1),
        github_repo_name: ::Regexp.last_match(2),
      )
    end
  end

  def github_configured?
    # Check if the github columns exist before using them
    return false unless self.class.column_names.include?("github_repo_owner")

    github_repo_owner.present? && github_repo_name.present?
  end

  def github_repo_full_name
    return unless github_configured?

    "#{github_repo_owner}/#{github_repo_name}"
  end

  def webhook_running?
    # Check if the association exists before using it
    return false unless self.class.reflect_on_association(:github_webhook_processes)

    github_webhook_processes.where(status: "running").exists?
  end

  def stop_all_webhooks!
    WebhookProcessService.stop_all_for_project(self)
  end

  def selected_event_names
    github_webhook_events.enabled.pluck(:event_type).sort
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
