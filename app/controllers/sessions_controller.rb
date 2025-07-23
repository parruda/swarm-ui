# frozen_string_literal: true

require "yaml"

class SessionsController < ApplicationController
  before_action :set_session, only: [:show, :kill, :archive, :unarchive, :clone, :info, :log_stream, :instances, :git_diff]

  def index
    @filter = params[:filter] || "active"
    @project_id = params[:project_id]

    # Base query
    @sessions = Session.includes(:project)

    # Apply project filter if provided
    @sessions = @sessions.where(project_id: @project_id) if @project_id.present?

    # Apply status filter
    @sessions = case @filter
    when "active"
      @sessions.active.recent
    when "stopped"
      @sessions.stopped.recent
    when "archived"
      @sessions.archived.recent
    when "all"
      @sessions.recent
    else
      @sessions.active.recent
    end

    # Load all projects for the filter dropdown
    @projects = Project.active.ordered
  end

  def new
    @session = Session.new
    @projects = Project.active.ordered

    # Check if we're starting from a specific project
    if params[:project_id].present?
      project = Project.find_by(id: params[:project_id])
      if project
        @session.project_id = project.id
        @session.configuration_path = project.default_config_path
        @session.use_worktree = project.default_use_worktree
        @focus_name_field = true
      end
    end

    # Check if we're cloning from another session
    if params[:clone_from].present?
      @clone_source = Session.find_by(id: params[:clone_from])
      if @clone_source
        @session.project_id = @clone_source.project_id
        @session.configuration_path = @clone_source.configuration_path
        @session.use_worktree = @clone_source.use_worktree
        @session.environment_variables = @clone_source.environment_variables
        @focus_name_field = true
      end
    end
  end

  def create
    @session = Session.new(session_params)
    @session.session_id ||= SecureRandom.uuid
    @session.started_at = Time.current
    @session.status ||= "active"

    if @session.save
      redirect_to(session_path(@session, new_session: true))
    else
      @projects = Project.active.ordered
      render(:new, status: :unprocessable_entity)
    end
  end

  def show
    # Set terminal URL for active sessions or when resuming a stopped session
    if @session.active? || (@session.stopped? && params[:view_only] != "true")
      @terminal_url = @session.terminal_url(new_session: params[:new_session])
    end

    # Fetch git status for active sessions
    if @session.active?
      git_service = GitStatusService.new(@session)
      @git_statuses = git_service.fetch_all_statuses
    end
  end

  def kill
    if @session.status != "active"
      redirect_to(sessions_path, alert: "Session is not active.")
      return
    end

    # Kill the tmux session
    tmux_session_name = "swarm-ui-#{@session.session_id}"
    system("tmux", "kill-session", "-t", tmux_session_name)

    # Update session status
    rails_root = Rails.root.to_s
    status_script = File.join(rails_root, "bin", "update_session_status")
    system(status_script, @session.session_id, "stopped")

    redirect_to(sessions_path, notice: "Session has been killed.")
  end

  def archive
    if @session.status != "stopped"
      redirect_to(sessions_path, alert: "Only stopped sessions can be archived.")
      return
    end

    @session.update!(status: "archived")
    redirect_to(sessions_path(filter: "archived"), notice: "Session has been archived.")
  end

  def unarchive
    if @session.status != "archived"
      redirect_to(sessions_path, alert: "Only archived sessions can be unarchived.")
      return
    end

    @session.update!(status: "stopped")
    redirect_to(sessions_path(filter: "stopped"), notice: "Session has been unarchived.")
  end

  def clone
    redirect_to(new_session_path(clone_from: @session.id))
  end

  def info
    # Get session metadata from claude-swarm session directory
    @session_metadata = fetch_session_metadata
    @instance_hierarchy = build_instance_hierarchy
    @total_cost = calculate_total_cost

    # Load swarm configuration to get team name
    @swarm_config = load_swarm_config

    render(partial: "session_info")
  end

  def log_stream
    tailer = LogTailer.new(@session)
    @logs = tailer.read_existing_logs

    render(partial: "log_stream")
  end

  def instances
    # Get session metadata
    @metadata = fetch_session_metadata

    # Get instances from metadata's worktree instance_configs
    @instances = @metadata.dig("worktree", "instance_configs") || {}

    # Load swarm configuration to get additional instance details
    @swarm_config = load_swarm_config

    # If no worktree instances, load from the session's config.yml
    if @instances.empty? && @session.session_path
      load_instances_from_session_config
    end

    render(partial: "instance_info")
  end

  def diff_file_contents
    directory = params[:directory]
    file_path = params[:file_path]

    unless directory.present? && file_path.present?
      render(json: { error: "Directory and file path are required" }, status: :bad_request)
      return
    end

    # For SwarmUI, directories are absolute paths managed by the system
    # Just ensure the directory exists and is readable
    unless File.directory?(directory) && File.readable?(directory)
      render(json: { error: "Directory not found or not readable" }, status: :not_found)
      return
    end
    
    safe_dir = directory
    safe_file = File.join(directory, file_path)

    Dir.chdir(safe_dir) do
      # Check if file exists
      file_exists = File.exist?(file_path)
      
      # Get current content (modified version)
      modified_content = if file_exists
        File.read(file_path)
      else
        ""
      end

      # Get git status for this specific file
      git_status = %x(git status --porcelain "#{file_path}" 2>/dev/null).strip
      
      # Determine file status and get appropriate content
      original_content = ""
      
      if git_status.start_with?("??")
        # Untracked file - no original content
        original_content = ""
      else
        # Try to get content from HEAD first
        original_content = %x(git show HEAD:"#{file_path}" 2>/dev/null)
        
        if $?.exitstatus != 0
          # File might be new (staged but not in HEAD)
          staged_content = %x(git show :"#{file_path}" 2>/dev/null)
          
          if $?.exitstatus == 0
            # File is staged but new
            original_content = ""
            # For staged new files, show staged content vs working directory
            if git_status.match?(/^[AM]/)
              original_content = staged_content
            end
          else
            original_content = ""
          end
        elsif git_status.match?(/^[AM]/) && !git_status.match?(/^.M/)
          # File is only staged (not modified in working directory)
          # Show HEAD vs staged version
          modified_content = %x(git show :"#{file_path}" 2>/dev/null)
        end
      end

      # Detect language from file extension
      language = detect_language(file_path)

      render(json: {
        file_path: file_path,
        original_content: original_content,
        modified_content: modified_content,
        language: language,
        status: git_status,
      })
    end
  rescue => e
    Rails.logger.error("Diff file contents error: #{e.message}")
    render(json: { error: "Failed to load file contents: #{e.message}" }, status: :internal_server_error)
  end

  def git_diff
    directory = params[:directory]
    instance_name = params[:instance_name]

    unless directory.present?
      render(json: { error: "Directory is required" }, status: :bad_request)
      return
    end

    # For SwarmUI, directories are absolute paths managed by the system
    # Just ensure the directory exists and is readable
    unless File.directory?(directory) && File.readable?(directory)
      render(json: { error: "Directory not found or not readable" }, status: :not_found)
      return
    end
    
    safe_dir = directory

    # Get git diff and file changes
    Dir.chdir(safe_dir) do
      # Get unstaged changes
      unstaged_diff = %x(git diff --no-ext-diff 2>&1)
      unstaged_files = parse_diff_files(unstaged_diff)
      
      # Get staged changes
      staged_diff = %x(git diff --cached --no-ext-diff 2>&1)
      staged_files = parse_diff_files(staged_diff)
      
      # Get untracked files
      untracked_list = %x(git ls-files --others --exclude-standard 2>&1).strip.split("\n")
      untracked_files = untracked_list.reject(&:empty?).map do |path|
        {
          path: path,
          old_path: path,
          additions: File.readable?(path) ? File.readlines(path).count : 0,
          deletions: 0,
          status: 'untracked'
        }
      end
      
      # Merge all files with status indicators
      all_files = []
      
      # Add unstaged files
      unstaged_files.each do |file|
        file[:status] = 'modified'
        all_files << file
      end
      
      # Add staged files (avoiding duplicates)
      staged_files.each do |file|
        existing = all_files.find { |f| f[:path] == file[:path] }
        if existing
          existing[:status] = 'modified+staged'
        else
          file[:status] = 'staged'
          all_files << file
        end
      end
      
      # Add untracked files
      all_files.concat(untracked_files)

      render(json: {
        instance_name: instance_name,
        directory: directory,
        unstaged_diff: unstaged_diff,
        staged_diff: staged_diff,
        files: all_files,
        has_changes: all_files.any?,
      })
    end
  rescue => e
    Rails.logger.error("Git diff error: #{e.message}")
    render(json: { error: "Failed to generate diff: #{e.message}" }, status: :internal_server_error)
  end

  private

  def set_session
    @session = Session.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    redirect_to(sessions_path, alert: "Session not found.")
  end

  def session_params
    params.require(:session).permit(
      :swarm_name,
      :project_id,
      :configuration,
      :configuration_path,
      :metadata,
      :use_worktree,
      :session_id,
      :status,
      :environment_variables,
    )
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

  def build_instance_hierarchy
    log_file = session_log_file
    return [] unless log_file && File.exist?(log_file)

    costs = Hash.new(0)
    call_counts = Hash.new(0)

    File.foreach(log_file) do |line|
      event = JSON.parse(line)
      instance_name = event["instance"]

      if event["event"]["type"] == "result" && event["event"]["total_cost_usd"]
        costs[instance_name] += event["event"]["total_cost_usd"]
        call_counts[instance_name] += 1
      end
    rescue JSON::ParserError
      next
    end

    costs.map do |name, cost|
      {
        name: name,
        cost: cost,
        calls: call_counts[name],
      }
    end.sort_by { |i| -i[:cost] }
  end

  def calculate_total_cost
    log_file = session_log_file
    return 0 unless log_file && File.exist?(log_file)

    total = 0
    File.foreach(log_file) do |line|
      event = JSON.parse(line)
      if event["event"]["type"] == "result" && event["event"]["total_cost_usd"]
        total += event["event"]["total_cost_usd"]
      end
    rescue JSON::ParserError
      next
    end

    total
  end

  def session_log_file
    @session.session_path ? File.join(@session.session_path, "session.log.json") : nil
  end

  def load_swarm_config
    return {} unless @session.configuration_path && File.exist?(@session.configuration_path)

    # Try to parse as JSON first
    config_content = File.read(@session.configuration_path)
    JSON.parse(config_content)
  rescue JSON::ParserError
    # If JSON parsing fails, try YAML
    require "yaml"
    YAML.load_file(@session.configuration_path) || {}
  rescue => e
    Rails.logger.error("Failed to load swarm config: #{e.message}")
    {}
  end

  def load_instances_from_session_config
    config_path = File.join(@session.session_path, "config.yml")
    return unless File.exist?(config_path)

    begin
      session_config = YAML.load_file(config_path)
      return unless session_config && session_config["swarm"] && session_config["swarm"]["instances"]

      # Convert the instances from config.yml to the expected format
      @instances = {}
      session_config["swarm"]["instances"].each do |name, config|
        directories = build_instance_directories(config)

        @instances[name] = {
          "name" => name,
          "directories" => directories,
          "model" => config["model"],
          "description" => config["description"],
          "connections" => config["connections"],
          "worktree_config" => { "skip" => true }, # No worktree for non-worktree sessions
        }
      end
    rescue => e
      Rails.logger.error("Failed to load session config.yml: #{e.message}")
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

  def detect_language(file_path)
    extension = File.extname(file_path).downcase.delete(".")

    language_map = {
      "rb" => "ruby",
      "py" => "python",
      "js" => "javascript",
      "ts" => "typescript",
      "jsx" => "javascript",
      "tsx" => "typescript",
      "json" => "json",
      "yml" => "yaml",
      "yaml" => "yaml",
      "erb" => "erb",
      "html" => "html",
      "css" => "css",
      "scss" => "scss",
      "sass" => "sass",
      "sql" => "sql",
      "sh" => "shell",
      "bash" => "shell",
      "md" => "markdown",
      "txt" => "plaintext",
      "go" => "go",
      "rs" => "rust",
      "java" => "java",
      "c" => "c",
      "cpp" => "cpp",
      "h" => "c",
      "hpp" => "cpp",
    }

    language_map[extension] || "plaintext"
  end

  def parse_diff_files(diff_output)
    files = []
    return files if diff_output.empty?

    # Parse unified diff format to extract file information
    current_file = nil
    diff_output.lines.each do |line|
      if line.start_with?("diff --git")
        # Extract file paths from diff header
        match = line.match(/diff --git a\/(.*?) b\/(.*?)$/)
        if match
          current_file = {
            path: match[2],
            old_path: match[1],
            additions: 0,
            deletions: 0,
          }
          files << current_file
        end
      elsif current_file && line.start_with?("+") && !line.start_with?("+++")
        current_file[:additions] += 1
      elsif current_file && line.start_with?("-") && !line.start_with?("---")
        current_file[:deletions] += 1
      end
    end

    files
  end
end
