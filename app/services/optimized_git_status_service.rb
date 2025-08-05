# frozen_string_literal: true

require "yaml"
require "set"
require "open3"
require "parallel"

class OptimizedGitStatusService
  def initialize(session)
    @session = session
  end

  def fetch_all_statuses
    statuses = {}
    seen_directories = Set.new
    directory_to_instances = {}

    # First pass: collect unique directories and map to instances
    instance_directories.each do |instance_name, directories|
      directories.each do |dir|
        normalized_dir = File.expand_path(dir)
        next if seen_directories.include?(normalized_dir)
        next unless Dir.exist?(dir)

        seen_directories.add(normalized_dir)
        directory_to_instances[normalized_dir] ||= []
        directory_to_instances[normalized_dir] << instance_name
      end
    end

    # Fetch git status for all directories in parallel
    git_statuses = fetch_git_statuses_parallel(directory_to_instances.keys)

    # Map results back to instances
    git_statuses.each do |status|
      next unless status

      directory_to_instances[status[:directory]].each do |instance_name|
        status_copy = status.dup
        status_copy[:instance_name] = instance_name
        statuses[instance_name] ||= []
        statuses[instance_name] << status_copy
      end
    end

    statuses
  end

  private

  def fetch_git_statuses_parallel(directories)
    # Use Parallel gem or Thread pool to fetch statuses concurrently
    # For now, using threads for simplicity
    results = []
    threads = directories.map do |dir|
      Thread.new do
        Thread.current[:result] = fetch_git_status_optimized(dir)
      end
    end

    threads.each do |thread|
      thread.join
      results << thread[:result]
    end

    results
  end

  def fetch_git_status_optimized(directory)
    return unless File.directory?(File.join(directory, ".git")) || File.exist?(File.join(directory, ".git"))

    # Combine multiple git commands into a single shell script to reduce overhead
    # Sanitize directory path to prevent command injection
    sanitized_directory = InputSanitizer.sanitize_shell_path(directory)
    
    script = <<~BASH
      cd "#{sanitized_directory}" 2>/dev/null || exit 1

      # Get all info in one go
      echo "BRANCH:"
      git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown"

      echo "STATUS:"
      git status --porcelain 2>/dev/null

      echo "AHEAD_BEHIND:"
      git rev-list --left-right --count HEAD...@{upstream} 2>/dev/null || echo "0\t0"

      echo "WORKTREE:"
      if [ -f .git ]; then
        cat .git | grep -q "^gitdir:" && echo "true" || echo "false"
      else
        git worktree list 2>/dev/null | grep -F "#{sanitized_directory}" && echo "true" || echo "false"
      fi
    BASH

    output, _, status = Open3.capture3("bash", "-c", script)
    return unless status.success?

    # Parse the combined output
    sections = output.split(/^(BRANCH|STATUS|AHEAD_BEHIND|WORKTREE):$/)

    branch = sections[2]&.strip || "unknown"
    # Don't strip status_output - spaces are significant in git status!
    status_output = sections[4] || ""
    ahead_behind = sections[6]&.strip || "0\t0"
    is_worktree = sections[8]&.strip == "true"

    # Process status
    # Check if status has actual content (not just whitespace/newlines)
    has_changes = status_output.match?(/\S/) # true if any non-whitespace character
    status_lines = status_output.lines

    # Git status --porcelain format:
    # XY filename
    # X = index (staging area) status
    # Y = working tree status
    #
    # Characters: ' ' (space), M, T, A, D, R, C, U
    # Special: ?? = untracked, !! = ignored
    #
    # Examples:
    # "M " = modified in index (staged), working tree clean
    # " M" = working tree modified (not staged)
    # "MM" = modified in index (staged), then modified again in working tree
    # "A " = added to index (staged)
    # "AM" = added to index, then modified in working tree
    # "??" = untracked

    # Staged: anything with non-space in first position (except ??)
    staged = status_lines.count { |line| line =~ /^[MTADRC]/ }

    # Modified in working tree: anything with M, T, or D in second position
    modified = status_lines.count { |line| line =~ /^.[MTD]/ }

    # Untracked files
    untracked = status_lines.count { |line| line =~ /^\?\?/ }

    # Process ahead/behind
    ahead = 0
    behind = 0
    unless ahead_behind.empty? || ahead_behind == "0\t0"
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
      last_fetched: Time.current,
    }
  rescue => e
    Rails.logger.error("Error fetching git status for #{directory}: #{e.message}")
    nil
  end

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
    elsif dir.start_with?("~")
      File.expand_path(dir)
    elsif dir.start_with?("/")
      dir
    else
      File.join(@session.project.path, dir)
    end
    directories
  end
end
