# frozen_string_literal: true

class Project < ApplicationRecord
  # Constants
  VCS_TYPES = ["git", "none"].freeze
  IMPORT_STATUSES = ["pending", "importing", "completed", "failed"].freeze

  # Attributes
  attribute :environment_variables, :json, default: -> { {} }
  attribute :webhook_commands, :json, default: -> { [] }

  # Encryption
  encrypts :environment_variables

  # Associations
  has_many :sessions
  has_many :github_webhook_events, dependent: :destroy
  has_many :github_webhook_processes, dependent: :destroy
  has_many :swarm_templates, dependent: :destroy

  # Nested attributes
  accepts_nested_attributes_for :github_webhook_events, allow_destroy: true

  # Validations
  validates :name, presence: true
  validates :path, presence: true, uniqueness: true, unless: :importing?
  validates :vcs_type, inclusion: { in: VCS_TYPES, allow_nil: true }
  validates :import_status, inclusion: { in: IMPORT_STATUSES, allow_nil: true }
  validates :git_url, presence: true, if: :importing?
  validate :path_must_exist, unless: :importing?

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
  after_save :notify_webhook_change, if: :saved_change_to_github_webhook_enabled?

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

      # Fetch from remote to ensure ahead/behind counts are up-to-date
      git_service.fetch

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

  # Webhook command methods
  def find_webhook_command(text)
    return unless webhook_commands.present?

    webhook_commands.find do |cmd|
      command = cmd["command"]
      # Ensure command starts with /
      command = "/#{command}" unless command.start_with?("/")
      text.strip.start_with?(command)
    end
  end

  def webhook_commands_with_validation
    return [] unless webhook_commands.present?

    available_swarms = find_swarm_files.map { |f| f[:relative_path] }

    webhook_commands.map do |cmd|
      cmd.merge(
        "valid" => available_swarms.include?(cmd["swarm_path"]),
      )
    end
  end

  def has_orphaned_webhook_commands?
    webhook_commands_with_validation.any? { |cmd| !cmd["valid"] }
  end

  def orphaned_webhook_commands
    webhook_commands_with_validation.reject { |cmd| cmd["valid"] }
  end

  def normalize_webhook_command(command)
    command.start_with?("/") ? command : "/#{command}"
  end

  # Import-related methods
  def importing?
    import_status.in?(["pending", "importing"])
  end

  def import_completed?
    import_status == "completed"
  end

  def import_failed?
    import_status == "failed"
  end

  def start_import!
    update!(import_status: "importing", import_started_at: Time.current, import_error: nil)
  end

  def complete_import!(path)
    update!(import_status: "completed", import_completed_at: Time.current, path: path, import_error: nil)
  end

  def fail_import!(error)
    update!(import_status: "failed", import_error: error, import_completed_at: Time.current)
  end

  def detect_vcs_type
    return unless path.present?
    return unless File.directory?(path)

    self.vcs_type = File.directory?(File.join(path, ".git")) ? "git" : "none"
  end

  # Find all swarm YAML files in the project directory
  def find_swarm_files
    return [] unless File.directory?(path)

    swarm_files = []

    # Scan directory for YAML files
    Dir.glob(File.join(path, "**/*.{yml,yaml}")).each do |file|
      next unless valid_swarm_config?(file)

      begin
        config = YAML.load_file(file)
        swarm = config["swarm"]

        swarm_files << {
          path: file,
          relative_path: file.sub("#{path}/", ""),
          name: swarm["name"],
          instance_count: swarm["instances"].size,
          main_instance: swarm["main"],
          instances: swarm["instances"].keys,
        }
      rescue StandardError => e
        Rails.logger.warn("Error reading swarm file #{file}: #{e.message}")
      end
    end

    swarm_files.sort_by { |f| f[:relative_path] }
  end

  private

  def valid_swarm_config?(file_path)
    return false unless File.exist?(file_path)

    begin
      config = YAML.load_file(file_path)

      # Basic structure checks
      return false unless config.is_a?(Hash)
      return false unless config["version"] == 1
      return false unless config["swarm"].is_a?(Hash)

      swarm = config["swarm"]
      return false unless swarm["name"].is_a?(String)
      return false unless swarm["instances"].is_a?(Hash)
      return false if swarm["instances"].empty?

      # Check main instance exists if specified
      if swarm["main"].present?
        return false unless swarm["instances"].key?(swarm["main"])
      end

      # Check each instance has description
      swarm["instances"].each do |_name, instance|
        return false unless instance.is_a?(Hash)
        return false unless instance["description"].is_a?(String)
      end

      true
    rescue Psych::SyntaxError
      false
    rescue StandardError
      false
    end
  end

  def notify_webhook_change
    return unless self.class.column_names.include?("github_webhook_enabled")

    message = {
      project_id: id,
      enabled: github_webhook_enabled,
      operation: "UPDATE",
    }.to_json

    RedisClient.publish(WebhookManager::WEBHOOK_CHANGES_CHANNEL, message)
    Rails.logger.info("Published webhook change notification for project #{id}: #{github_webhook_enabled}")
  rescue => e
    Rails.logger.error("Failed to publish webhook change notification: #{e.message}")
    # Don't let Redis failures break the save
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
