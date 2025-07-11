# frozen_string_literal: true

require "yaml"
require "set"

class GitStatusService
  def initialize(session)
    @session = session
  end

  def fetch_all_statuses
    statuses = {}
    seen_directories = Set.new

    instance_directories.each do |instance_name, directories|
      directories.each do |dir|
        # Skip if we've already processed this directory
        normalized_dir = File.expand_path(dir)
        next if seen_directories.include?(normalized_dir)
        next unless Dir.exist?(dir)

        status = fetch_git_status(dir)
        next unless status

        seen_directories.add(normalized_dir)
        status[:instance_name] = instance_name
        statuses[instance_name] ||= []
        statuses[instance_name] << status
      end
    end

    statuses
  end

  private

  def instance_directories
    directories = {}

    # Get session metadata
    metadata = fetch_session_metadata

    # Get instances from metadata's worktree instance_configs
    instances = metadata.dig("worktree", "instance_configs") || {}

    # If no worktree instances, load from the session's config.yml
    if instances.empty? && @session.session_path
      instances = load_instances_from_session_config
    end

    # Collect directories for each instance
    instances.each do |name, config|
      dirs = []

      # Check worktree paths first
      if config["worktree_paths"]&.any?
        dirs.concat(config["worktree_paths"])
      elsif config["directories"]&.any?
        dirs.concat(config["directories"])
      end

      directories[name] = dirs if dirs.any?
    end

    directories
  end

  def fetch_git_status(directory)
    return unless File.directory?(File.join(directory, ".git")) || File.exist?(File.join(directory, ".git"))

    Dir.chdir(directory) do
      branch = %x(git rev-parse --abbrev-ref HEAD 2>/dev/null).strip
      return if branch.empty?

      # Check if this directory is a worktree by examining .git file
      is_worktree = false
      git_path = File.join(directory, ".git")

      if File.file?(git_path)
        # If .git is a file (not a directory), it's likely a worktree
        git_content = File.read(git_path).strip
        is_worktree = git_content.start_with?("gitdir:")
      end

      # Alternative check: see if this directory appears in worktree list from the main repo
      unless is_worktree
        worktree_list = %x(git worktree list 2>/dev/null)
        is_worktree = worktree_list.lines.any? { |line| line.include?(directory) && !line.include?("(bare)") && !line.end_with?("(main)\n") && !line.end_with?("(master)\n") }
      end

      # Get status info
      status_output = %x(git status --porcelain 2>/dev/null)
      has_changes = !status_output.empty?

      # Count different types of changes
      staged = status_output.lines.count { |line| line =~ /^[MADRC]/ }
      modified = status_output.lines.count { |line| line =~ /^.M/ }
      untracked = status_output.lines.count { |line| line =~ /^\?\?/ }

      # Get ahead/behind info
      ahead_behind = %x(git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null).strip
      ahead = 0
      behind = 0

      unless ahead_behind.empty?
        parts = ahead_behind.split("\t")
        ahead = parts[0].to_i if parts[0]
        behind = parts[1].to_i if parts[1]
      end

      {
        directory: directory,
        branch: branch,
        is_worktree: is_worktree,
        has_changes: has_changes,
        staged: staged,
        modified: modified,
        untracked: untracked,
        ahead: ahead,
        behind: behind,
      }
    end
  rescue => e
    Rails.logger.error("Error fetching git status for #{directory}: #{e.message}")
    nil
  end

  def fetch_session_metadata
    return {} unless @session.session_path && Dir.exist?(@session.session_path)

    metadata_file = File.join(@session.session_path, "session_metadata.json")
    if File.exist?(metadata_file)
      JSON.parse(File.read(metadata_file))
    else
      {}
    end
  rescue JSON::ParserError
    {}
  end

  def load_instances_from_session_config
    config_path = File.join(@session.session_path, "config.yml")
    return {} unless File.exist?(config_path)

    begin
      session_config = YAML.load_file(config_path)
      return {} unless session_config && session_config["swarm"] && session_config["swarm"]["instances"]

      # Convert the instances from config.yml to the expected format
      instances = {}
      session_config["swarm"]["instances"].each do |name, config|
        directories = build_instance_directories(config)

        instances[name] = {
          "name" => name,
          "directories" => directories,
          "worktree_config" => { "skip" => true },
        }
      end
      instances
    rescue => e
      Rails.logger.error("Failed to load session config.yml: #{e.message}")
      {}
    end
  end

  def build_instance_directories(config)
    directories = []
    return directories unless config["directory"]

    dir = config["directory"]
    directories << if dir == "."
      @session.project.path
    elsif dir.start_with?("/")
      dir
    else
      File.join(@session.project.path, dir)
    end
    directories
  end
end
