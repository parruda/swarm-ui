# frozen_string_literal: true

require "English"
require "yaml"
require "shellwords"
require "open3"

class SessionsController < ApplicationController
  before_action :set_session, only: [:show, :kill, :archive, :unarchive, :clone, :info, :log_stream, :instances, :git_diff, :diff_file_contents, :git_pull, :git_push, :git_stage, :git_commit, :git_reset, :send_to_tmux, :create_terminal, :terminals, :kill_terminal, :refresh_git_status]

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
        # Prefill environment variables from project
        @session.environment_variables = project.environment_variables.dup if project.environment_variables.present?
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
        @session.initial_prompt = @clone_source.initial_prompt
        @focus_name_field = true
      end
    end

    # Check if we're launching from a swarm template
    if params[:session].present?
      session_params = params[:session].permit(:swarm_name, :configuration_path, :use_worktree, :initial_prompt)
      @session.assign_attributes(session_params)
      @focus_name_field = @session.swarm_name.blank?
    end
  end

  def create
    @session = Session.new(session_params)
    @session.session_id ||= SecureRandom.uuid
    @session.started_at = Time.current
    @session.status ||= "active"

    # Convert environment_variables from text format to Hash
    if params[:session][:environment_variables].is_a?(String)
      env_hash = {}
      params[:session][:environment_variables].split("\n").each do |line|
        line = line.strip
        next if line.empty?

        key, value = line.split("=", 2)
        env_hash[key] = value if key && value
      end
      @session.environment_variables = env_hash
    end

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

    # Load swarm configuration to get team name and main instance
    @swarm_config = load_swarm_config
    @main_instance_name = if @swarm_config && @swarm_config["swarm"]
      # Get the team name if available, otherwise use first instance name
      @swarm_config["swarm"]["team_name"] ||
        @swarm_config["swarm"]["instances"]&.keys&.first ||
        "Claude Swarm"
    else
      "Claude Swarm"
    end

    # Fetch git status for active sessions
    if @session.active?
      # Try to get cached status first
      cache_key = GitStatusMonitorJob.cache_key(@session.id)
      @git_statuses = Rails.cache.read(cache_key)

      if @git_statuses.nil?
        # No cache, fetch fresh
        git_service = OptimizedGitStatusService.new(@session)
        @git_statuses = git_service.fetch_all_statuses
        Rails.cache.write(cache_key, @git_statuses, expires_in: 5.minutes)
      end

      # Start the background monitoring job
      GitStatusMonitorJob.perform_later(@session.id)
    end
  end

  def kill
    if @session.status != "active"
      redirect_to(sessions_path, alert: "Session is not active.")
      return
    end

    # Kill all terminal sessions first
    @session.terminal_sessions.active.each do |terminal|
      system("tmux", "kill-session", "-t", terminal.tmux_session_name)
      terminal.update!(status: "stopped", ended_at: Time.current)
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
    File.join(directory, file_path)

    # Check if file exists
    file_exists = File.exist?(File.join(safe_dir, file_path))

    # Get current content (modified version)
    modified_content = if file_exists
      File.read(File.join(safe_dir, file_path))
    else
      ""
    end

    # Escape file path for shell
    escaped_path = Shellwords.escape(file_path)

    # Get git status for this specific file
    git_status, _, _ = Open3.capture3("git status --porcelain #{escaped_path}", chdir: safe_dir)
    git_status = git_status.strip

    # Determine file status and get appropriate content
    original_content = ""

    if git_status.start_with?("??")
      # Untracked file - show empty vs working directory
      original_content = ""
      # modified_content already has the working directory content
    elsif git_status.match?(/^[AM]M/)
      # File has both staged and unstaged changes
      # Show HEAD vs working directory (to see all changes)
      original_content, _, _ = Open3.capture3("git show HEAD:#{escaped_path}", chdir: safe_dir)
      # modified_content already has the working directory content
    elsif git_status.match?(/^[AM]\s/)
      # File is only staged (not modified in working directory)
      # This means working directory matches staged version
      # Show HEAD vs working directory (which equals staged)
      original_content, _, status = Open3.capture3("git show HEAD:#{escaped_path}", chdir: safe_dir)
      unless status.success?
        # New file, show empty vs working directory
        original_content = ""
      end
      # modified_content already has the working directory content
    elsif git_status.match?(/^\sM/)
      # File is only modified (not staged)
      # Show HEAD vs working directory
      original_content, _, _ = Open3.capture3("git show HEAD:#{escaped_path}", chdir: safe_dir)
      # modified_content already has the working directory content
    else
      # Default: show HEAD vs working directory
      original_content, _, _ = Open3.capture3("git show HEAD:#{escaped_path}", chdir: safe_dir)
      # modified_content already has the working directory content
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
    # Get unstaged changes
    unstaged_diff, unstaged_err, _ = Open3.capture3("git diff --no-ext-diff", chdir: safe_dir)
    unstaged_diff += unstaged_err unless unstaged_err.empty?
    unstaged_files = parse_diff_files(unstaged_diff)

    # Get staged changes
    staged_diff, staged_err, _ = Open3.capture3("git diff --cached --no-ext-diff", chdir: safe_dir)
    staged_diff += staged_err unless staged_err.empty?
    staged_files = parse_diff_files(staged_diff)

    # Get untracked files
    untracked_list, _, _ = Open3.capture3("git ls-files --others --exclude-standard", chdir: safe_dir)
    untracked_files = untracked_list.strip.split("\n").reject(&:empty?).map do |path|
      full_path = File.join(safe_dir, path)
      {
        path: path,
        old_path: path,
        additions: File.readable?(full_path) ? File.readlines(full_path).count : 0,
        deletions: 0,
        status: "untracked",
      }
    end

    # Merge all files with status indicators
    all_files = []

    # Add unstaged files
    unstaged_files.each do |file|
      file[:status] = "modified"
      all_files << file
    end

    # Add staged files (avoiding duplicates)
    staged_files.each do |file|
      existing = all_files.find { |f| f[:path] == file[:path] }
      if existing
        existing[:status] = "modified+staged"
      else
        file[:status] = "staged"
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
  rescue => e
    Rails.logger.error("Git diff error: #{e.message}")
    render(json: { error: "Failed to generate diff: #{e.message}" }, status: :internal_server_error)
  end

  def git_pull
    directory = params[:directory]
    params[:instance_name]
    operation_success = false

    unless directory.present? && File.directory?(directory)
      render(json: { error: "Invalid directory" }, status: :bad_request)
      return
    end

    # Security check - ensure directory belongs to this session
    Rails.logger.debug("[GitPull] Checking directory authorization for: #{directory}")
    unless directory_belongs_to_session?(directory)
      Rails.logger.error("[GitPull] Unauthorized access to directory: #{directory} for session: #{@session.id}")
      render(json: { error: "Unauthorized access to directory" }, status: :forbidden)
      return
    end

    # Use lock to prevent concurrent git operations
    GitOperationLockService.with_lock(@session.id, directory) do
      Rails.logger.debug("[GitPull] Starting git pull operation in: #{directory}")

      # First, check if the repository is clean
      status_output, _, _ = Open3.capture3("git status --porcelain", chdir: directory)
      unless status_output.empty?
        render(
          json: {
            success: false,
            error: "Cannot pull: repository has uncommitted changes",
            has_uncommitted_changes: true,
          },
          status: :unprocessable_entity,
        )
        return
      end

      # Check if there are actually commits to pull
      fetch_result, fetch_err, fetch_status = Open3.capture3("git fetch", chdir: directory)
      unless fetch_status.success?
        render(
          json: {
            success: false,
            error: "Failed to fetch from remote: #{fetch_err.empty? ? fetch_result : fetch_err}",
          },
          status: :unprocessable_entity,
        )
        return
      end

      # Get the number of commits behind
      behind_output, _, _ = Open3.capture3("git rev-list --count HEAD..@{upstream}", chdir: directory)
      behind_count = behind_output.strip.to_i

      if behind_count == 0
        render(json: {
          success: false,
          error: "Nothing to pull from remote",
        })
        return
      end

      # Attempt to pull
      pull_result, pull_err, pull_status = Open3.capture3("git pull --no-rebase", chdir: directory)
      pull_output = pull_result + pull_err

      if pull_status.success?
        operation_success = true
        render(json: {
          success: true,
          commits_pulled: behind_count,
          message: "Successfully pulled #{behind_count} commit#{behind_count == 1 ? "" : "s"}",
        })
      elsif pull_output.include?("CONFLICT") || pull_output.include?("Automatic merge failed")
        # Check if it's a merge conflict
        Open3.capture3("git merge --abort", chdir: directory)

        render(
          json: {
            success: false,
            error: "Pull failed due to merge conflicts. Please use a git tool to resolve conflicts.",
            has_conflicts: true,
            details: pull_output,
          },
          status: :unprocessable_entity,
        )
      # Abort the merge
      else
        render(
          json: {
            success: false,
            error: "Pull failed: #{pull_output}",
          },
          status: :unprocessable_entity,
        )
      end
    end # end of lock block

    # Trigger git status update with force refresh after operation
    GitStatusMonitorJob.perform_later(@session.id, force_update: true) if operation_success
  rescue => e
    if e.message.include?("Another git operation is in progress")
      render(json: { error: e.message }, status: :conflict)
    else
      Rails.logger.error("Git pull error: #{e.message}")
      render(json: { error: "Failed to pull: #{e.message}" }, status: :internal_server_error)
    end
  end

  def git_push
    directory = params[:directory]
    params[:instance_name]
    operation_success = false

    unless directory.present? && File.directory?(directory)
      render(json: { error: "Invalid directory" }, status: :bad_request)
      return
    end

    # Security check - ensure directory belongs to this session
    Rails.logger.debug("[GitPush] Checking directory authorization for: #{directory}")
    unless directory_belongs_to_session?(directory)
      Rails.logger.error("[GitPush] Unauthorized access to directory: #{directory} for session: #{@session.id}")
      render(json: { error: "Unauthorized access to directory" }, status: :forbidden)
      return
    end

    # Use lock to prevent concurrent git operations
    GitOperationLockService.with_lock(@session.id, directory) do
      Rails.logger.debug("[GitPush] Starting git push operation in: #{directory}")

      # Check if there are actually commits to push
      ahead_output, _, _ = Open3.capture3("git rev-list --count @{upstream}..HEAD", chdir: directory)
      ahead_count = ahead_output.strip.to_i

      if ahead_count == 0
        render(json: {
          success: false,
          error: "No commits to push",
        })
        return
      end

      # Attempt to push
      push_result, push_err, push_status = Open3.capture3("git push", chdir: directory)
      push_output = push_result + push_err

      if push_status.success?
        operation_success = true
        render(json: {
          success: true,
          commits_pushed: ahead_count,
          message: "Successfully pushed #{ahead_count} commit#{ahead_count == 1 ? "" : "s"}",
        })
      elsif push_output.include?("rejected")
        # Check common push failure reasons
        if push_output.include?("non-fast-forward")
          render(
            json: {
              success: false,
              error: "Push rejected: Remote has changes that you don't have locally. Pull first.",
              needs_pull: true,
              details: push_output,
            },
            status: :unprocessable_entity,
          )
        else
          render(
            json: {
              success: false,
              error: "Push rejected by remote",
              details: push_output,
            },
            status: :unprocessable_entity,
          )
        end
      elsif push_output.include?("Could not read from remote repository")
        render(
          json: {
            success: false,
            error: "Authentication failed or no access to remote repository",
            details: push_output,
          },
          status: :unprocessable_entity,
        )
      else
        render(
          json: {
            success: false,
            error: "Push failed: #{push_output}",
          },
          status: :unprocessable_entity,
        )
      end
    end # end of lock block

    # Trigger git status update with force refresh after operation
    GitStatusMonitorJob.perform_later(@session.id, force_update: true) if operation_success
  rescue => e
    if e.message.include?("Another git operation is in progress")
      render(json: { error: e.message }, status: :conflict)
    else
      Rails.logger.error("Git push error: #{e.message}")
      render(json: { error: "Failed to push: #{e.message}" }, status: :internal_server_error)
    end
  end

  def git_stage
    directory = params[:directory]
    params[:instance_name]
    operation_success = false

    unless directory.present? && File.directory?(directory)
      render(json: { error: "Invalid directory" }, status: :bad_request)
      return
    end

    # Security check - ensure directory belongs to this session
    Rails.logger.debug("[GitStage] Checking directory authorization for: #{directory}")
    unless directory_belongs_to_session?(directory)
      Rails.logger.error("[GitStage] Unauthorized access to directory: #{directory} for session: #{@session.id}")
      render(json: { error: "Unauthorized access to directory" }, status: :forbidden)
      return
    end

    # Use lock to prevent concurrent git operations
    GitOperationLockService.with_lock(@session.id, directory) do
      Rails.logger.debug("[GitStage] Starting git stage operation in: #{directory}")

      # Get status before staging
      status_before, _, _ = Open3.capture3("git status --porcelain", chdir: directory)
      unstaged_count = status_before.lines.count { |line| line =~ /^[ M?]/ }

      if unstaged_count == 0
        render(json: {
          success: false,
          error: "No unstaged changes",
        })
        return
      end

      # Stage all changes
      stage_result, stage_err, stage_status = Open3.capture3("git add .", chdir: directory)
      stage_output = stage_result + stage_err

      if stage_status.success?
        operation_success = true

        # Get status after staging to count staged files
        status_after, _, _ = Open3.capture3("git status --porcelain", chdir: directory)
        staged_count = status_after.lines.count { |line| line =~ /^[AM]/ }

        render(json: {
          success: true,
          files_staged: staged_count,
          message: "Successfully staged all changes",
        })
      else
        render(
          json: {
            success: false,
            error: "Failed to stage changes: #{stage_output}",
          },
          status: :unprocessable_entity,
        )
      end
    end # end of lock block

    # Trigger git status update with force refresh after staging
    GitStatusMonitorJob.perform_later(@session.id, force_update: true) if operation_success
  rescue => e
    if e.message.include?("Another git operation is in progress")
      render(json: { error: e.message }, status: :conflict)
    else
      Rails.logger.error("Git stage error: #{e.message}")
      render(json: { error: "Failed to stage: #{e.message}" }, status: :internal_server_error)
    end
  end

  def git_commit
    directory = params[:directory]
    params[:instance_name]
    operation_success = false

    unless directory.present? && File.directory?(directory)
      render(json: { error: "Invalid directory" }, status: :bad_request)
      return
    end

    # Security check - ensure directory belongs to this session
    Rails.logger.debug("[GitCommit] Checking directory authorization for: #{directory}")
    unless directory_belongs_to_session?(directory)
      Rails.logger.error("[GitCommit] Unauthorized access to directory: #{directory} for session: #{@session.id}")
      render(json: { error: "Unauthorized access to directory" }, status: :forbidden)
      return
    end

    # Use lock to prevent concurrent git operations
    GitOperationLockService.with_lock(@session.id, directory) do
      Rails.logger.debug("[GitCommit] Starting git commit operation in: #{directory}")

      # Check if there are changes to commit
      status_output, _, _ = Open3.capture3("git status --porcelain", chdir: directory)
      if status_output.empty?
        render(json: {
          success: false,
          error: "No changes to commit",
        })
        return
      end

      # Get the diff for Claude
      diff_output, _, _ = Open3.capture3("git diff", chdir: directory)
      staged_diff, _, _ = Open3.capture3("git diff --cached", chdir: directory)
      untracked_files, _, _ = Open3.capture3("git ls-files --others --exclude-standard", chdir: directory)
      untracked_files = untracked_files.strip

      # Combine all changes for Claude
      all_changes = "## Unstaged changes:\n#{diff_output}\n\n## Staged changes:\n#{staged_diff}\n\n## Untracked files:\n#{untracked_files}"

      # Use Claude to generate commit message
      claude_prompt = "Generate a concise git commit message for the following changes:\n\n#{all_changes}"
      Shellwords.escape(claude_prompt)

      # Call Claude CLI to generate commit message
      commit_message, commit_err, commit_status = Open3.capture3("claude", "-p", claude_prompt)

      unless commit_status.success?
        render(
          json: {
            success: false,
            error: "Failed to generate commit message with Claude: #{commit_err.empty? ? commit_message : commit_err}",
          },
          status: :unprocessable_entity,
        )
        return
      end

      # Clean up the commit message (remove any extra whitespace)
      commit_message = commit_message.strip

      # Stage all changes
      stage_result, stage_err, stage_status = Open3.capture3("git add .", chdir: directory)
      unless stage_status.success?
        render(
          json: {
            success: false,
            error: "Failed to stage changes: #{stage_err.empty? ? stage_result : stage_err}",
          },
          status: :unprocessable_entity,
        )
        return
      end

      # Commit with the generated message
      Shellwords.escape(commit_message)
      commit_result, commit_err, commit_status = Open3.capture3("git", "commit", "-m", commit_message, chdir: directory)

      if commit_status.success?
        operation_success = true
        render(json: {
          success: true,
          commit_message: commit_message,
          message: "Successfully committed changes",
        })
      else
        render(
          json: {
            success: false,
            error: "Failed to commit: #{commit_err.empty? ? commit_result : commit_err}",
          },
          status: :unprocessable_entity,
        )
      end
    end # end of lock block

    # Trigger git status update with force refresh after operation
    GitStatusMonitorJob.perform_later(@session.id, force_update: true) if operation_success
  rescue => e
    if e.message.include?("Another git operation is in progress")
      render(json: { error: e.message }, status: :conflict)
    else
      Rails.logger.error("Git commit error: #{e.message}")
      render(json: { error: "Failed to commit: #{e.message}" }, status: :internal_server_error)
    end
  end

  def git_reset
    directory = params[:directory]
    params[:instance_name]
    operation_success = false

    unless directory.present? && File.directory?(directory)
      render(json: { error: "Invalid directory" }, status: :bad_request)
      return
    end

    # Security check - ensure directory belongs to this session
    unless directory_belongs_to_session?(directory)
      render(json: { error: "Unauthorized access to directory" }, status: :forbidden)
      return
    end

    Dir.chdir(directory) do
      # Reset all tracked files to HEAD
      reset_result = %x(git reset --hard HEAD 2>&1)

      if $CHILD_STATUS.exitstatus != 0
        render(
          json: {
            success: false,
            error: "Failed to reset tracked files: #{reset_result}",
          },
          status: :unprocessable_entity,
        )
        return
      end

      # Clean up untracked files and directories
      clean_result = %x(git clean -fd 2>&1)

      if $CHILD_STATUS.exitstatus != 0
        render(
          json: {
            success: false,
            error: "Failed to clean untracked files: #{clean_result}",
          },
          status: :unprocessable_entity,
        )
        return
      end

      operation_success = true
      render(json: {
        success: true,
        message: "Successfully discarded all changes",
      })
    end

    # Trigger git status update with force refresh after reset
    GitStatusMonitorJob.perform_later(@session.id, force_update: true) if operation_success
  rescue => e
    Rails.logger.error("Git reset error: #{e.message}")
    render(json: { error: "Failed to reset: #{e.message}" }, status: :internal_server_error)
  end

  def create_terminal
    directory = params[:directory]
    instance_name = params[:instance_name]

    unless directory.present? && File.directory?(directory)
      render(json: { error: "Invalid directory" }, status: :bad_request)
      return
    end

    # Security check - ensure directory belongs to this session
    unless directory_belongs_to_session?(directory)
      render(json: { error: "Unauthorized access to directory" }, status: :forbidden)
      return
    end

    # Generate terminal details
    terminal_id = SecureRandom.uuid
    name = File.basename(directory)

    # Check if we already have terminals for this directory
    existing_count = @session.terminal_sessions.active.where(directory: directory).count
    name = "#{name} (#{existing_count + 1})" if existing_count > 0

    # Create terminal session
    terminal = @session.terminal_sessions.create!(
      terminal_id: terminal_id,
      directory: directory,
      instance_name: instance_name,
      name: name,
      status: "active",
      opened_at: Time.current,
    )

    render(json: {
      success: true,
      terminal: {
        id: terminal.terminal_id,
        name: terminal.name,
        directory: terminal.directory,
        instance_name: terminal.instance_name,
        url: terminal.terminal_url,
      },
    })
  rescue => e
    Rails.logger.error("Failed to create terminal: #{e.message}")
    render(json: { error: "Failed to create terminal: #{e.message}" }, status: :internal_server_error)
  end

  def terminals
    @terminals = @session.terminal_sessions.active.ordered
    render(partial: "terminals", locals: { terminals: @terminals })
  end

  def kill_terminal
    terminal_id = params[:terminal_id]
    terminal = @session.terminal_sessions.find_by(terminal_id: terminal_id)

    if terminal.nil?
      render(json: { error: "Terminal not found" }, status: :not_found)
      return
    end

    # Kill the terminal's tmux session
    system("tmux", "kill-session", "-t", terminal.tmux_session_name)

    # Mark the terminal as stopped
    terminal.update!(status: "stopped", ended_at: Time.current)

    render(json: { success: true })
  end

  def refresh_git_status
    unless @session.active?
      head(:unprocessable_entity)
      return
    end

    # Force a fresh fetch
    git_service = OptimizedGitStatusService.new(@session)
    @git_statuses = git_service.fetch_all_statuses

    # Update cache
    cache_key = GitStatusMonitorJob.cache_key(@session.id)
    Rails.cache.write(cache_key, @git_statuses, expires_in: 5.minutes)

    # Also trigger the background job with force update
    GitStatusMonitorJob.perform_later(@session.id, force_update: true)

    # Respond with Turbo Stream
    respond_to do |format|
      format.turbo_stream do
        render(turbo_stream: turbo_stream.update(
          "git-status-display",
          partial: "shared/git_status",
          locals: { session: @session, git_statuses: @git_statuses },
        ))
      end
      format.html { redirect_to(session_path(@session)) }
    end
  end

  def send_to_tmux
    # This method injects text into a running tmux session associated with the current SwarmUI session.
    # It's used by the diff modal's "Request Changes" feature to send code review comments directly
    # to the terminal where the AI agent is running, enabling seamless vibe coding workflows.
    # The method uses tmux's send-keys command with the -l flag to send literal text without
    # shell interpretation, then sends an Enter key to execute the command.
    text = params[:text]

    unless text.present?
      render(json: { error: "Text is required" }, status: :bad_request)
      return
    end

    # Ensure session is active
    unless @session.active?
      render(json: { error: "Session is not active" }, status: :unprocessable_entity)
      return
    end

    # Get tmux session name
    tmux_session_name = "swarm-ui-#{@session.session_id}"

    # Send text to tmux session using -l flag for literal text
    _, stderr, status = Open3.capture3("tmux", "send-keys", "-t", tmux_session_name, "-l", text)

    # Send Enter key separately
    if status.success?
      _, _, status2 = Open3.capture3("tmux", "send-keys", "-t", tmux_session_name, "Enter")
      status = status2 unless status2.success?
    end

    if status.success?
      render(json: {
        success: true,
        message: "Text sent to terminal",
      })
    else
      Rails.logger.error("Failed to send to tmux: #{stderr}")
      render(
        json: {
          success: false,
          error: "Failed to send text to terminal: #{stderr}",
        },
        status: :unprocessable_entity,
      )
    end
  rescue => e
    Rails.logger.error("Send to tmux error: #{e.message}")
    render(json: { error: "Failed to send text: #{e.message}" }, status: :internal_server_error)
  end

  private

  def directory_belongs_to_session?(directory)
    # Collect all directories associated with this session
    all_directories = []

    Rails.logger.debug("[DirectoryAuth] Checking directory: #{directory} for session: #{@session.id}")

    # Get session metadata
    metadata = fetch_session_metadata
    Rails.logger.debug("[DirectoryAuth] Session metadata: #{metadata.inspect}")

    # Get instances from metadata's worktree instance_configs
    instances = metadata.dig("worktree", "instance_configs") || {}
    Rails.logger.debug("[DirectoryAuth] Found #{instances.size} worktree instances")

    # If no worktree instances, load from the session's config.yml
    if instances.empty? && @session.session_path
      config_path = File.join(@session.session_path, "config.yml")
      Rails.logger.debug("[DirectoryAuth] No worktree instances, checking config at: #{config_path}")
      if File.exist?(config_path)
        begin
          session_config = YAML.load_file(config_path)
          if session_config && session_config["swarm"] && session_config["swarm"]["instances"]
            Rails.logger.debug("[DirectoryAuth] Found instances in config.yml")
            session_config["swarm"]["instances"].each do |name, config|
              directories = build_instance_directories(config)
              Rails.logger.debug("[DirectoryAuth] Instance #{name} directories: #{directories.inspect}")
              all_directories.concat(directories)
            end
          end
        rescue => e
          Rails.logger.error("[DirectoryAuth] Failed to load session config.yml: #{e.message}")
        end
      end
    else
      # Process worktree instances
      instances.each do |name, config|
        if config["worktree_paths"]&.any?
          Rails.logger.debug("[DirectoryAuth] Instance #{name} worktree_paths: #{config["worktree_paths"].inspect}")
          all_directories.concat(config["worktree_paths"])
        elsif config["directories"]&.any?
          Rails.logger.debug("[DirectoryAuth] Instance #{name} directories: #{config["directories"].inspect}")
          all_directories.concat(config["directories"])
        end
      end
    end

    # Normalize the directory path
    normalized_dir = File.expand_path(directory)
    Rails.logger.debug("[DirectoryAuth] All session directories: #{all_directories.inspect}")
    Rails.logger.debug("[DirectoryAuth] Normalized target directory: #{normalized_dir}")

    # Check if the directory is in the list of session directories
    result = all_directories.any? { |dir| File.expand_path(dir) == normalized_dir }
    Rails.logger.debug("[DirectoryAuth] Authorization result: #{result}")
    result
  end

  def set_session
    @session = Session.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    respond_to do |format|
      format.html { redirect_to(sessions_path, alert: "Session not found.") }
      format.json { render(json: { error: "Session not found" }, status: :not_found) }
    end
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
      :initial_prompt,
      :github_issue_number,
      :github_pr_number,
      :github_issue_type,
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
        match = line.match(%r{diff --git a/(.*?) b/(.*?)$})
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
