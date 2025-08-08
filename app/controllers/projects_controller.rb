# frozen_string_literal: true

class ProjectsController < ApplicationController
  before_action :set_project, only: [:show, :edit, :update, :destroy, :archive, :unarchive, :sync, :toggle_webhook, :webhook_status, :git_status, :git_dirty_check, :swarm_count, :edit_swarm_file, :show_swarm_editor, :delete_swarm_file]

  def index
    @filter = params[:filter] || "active"

    @projects = case @filter
    when "archived"
      Project.archived.ordered
    else
      Project.active.ordered
    end

    # For tab counts
    @active_count = Project.active.count
    @archived_count = Project.archived.count
  end

  def show
    # Don't load swarm files synchronously - they'll be loaded async via turbo frame
    # This significantly improves page load time for large projects

    respond_to do |format|
      format.html
      format.json { render(json: @project) }
    end
  end

  def new
    @project = Project.new
  end

  def create
    @project = Project.new(project_params)

    # Handle git import
    if params[:project][:git_url].present?
      # Validate git URL
      service = GitImportService.new(params[:project][:git_url])
      unless service.valid?
        @project.errors.add(:git_url, "is not a valid git repository URL")
        render(:new, status: :unprocessable_entity)
        return
      end

      # Set import status and clear path requirement
      @project.import_status = "pending"
      @project.path = "pending" # Temporary value, will be updated after clone
    end

    if @project.save
      # Queue the import job if it's a git import
      if @project.import_status == "pending"
        ProjectImportJob.perform_later(@project.id)
        redirect_to(projects_path, notice: "Project import has been queued. You will see the status update shortly.")
      else
        redirect_to(@project, notice: "Project was successfully created.")
      end
    else
      render(:new, status: :unprocessable_entity)
    end
  end

  def edit
    # Try to populate GitHub fields if not already set
    @project.populate_github_fields_from_remote if @project.git?
  end

  def update
    # Handle webhook events specially
    webhook_alert = nil
    if params[:project]&.key?(:webhook_events)
      webhook_alert = handle_webhook_events
      # Remove webhook_events from params to avoid unpermitted parameter warning
      params[:project].delete(:webhook_events)
    end

    if @project.update(project_params)
      if webhook_alert
        redirect_to(edit_project_path(@project), alert: webhook_alert)
      else
        redirect_to(edit_project_path(@project), notice: "Project was successfully updated.")
      end
    else
      render(:edit, status: :unprocessable_entity)
    end
  end

  def destroy
    @project.archive!
    redirect_to(projects_url(filter: "archived"), notice: "Project was successfully archived.")
  end

  def archive
    @project.archive!
    redirect_to(projects_url(filter: "archived"), notice: "Project was successfully archived.")
  end

  def unarchive
    @project.unarchive!
    redirect_to(projects_url, notice: "Project was successfully restored.")
  end

  def sync
    unless @project.git?
      render(json: { success: false, error: "Not a Git repository" }, status: :unprocessable_entity)
      return
    end

    result = @project.git_service.sync_with_remote

    # Clear cached git status after sync and trigger a fresh status check with fetch
    if result[:success]
      @project.clear_git_cache
      @project.git_status_with_fetch # This will cache the fetched status
    end

    render(json: result)
  end

  def toggle_webhook
    unless @project.github_configured?
      flash.now[:alert] = "Please configure GitHub repository information first."
      respond_to_toggle_webhook
      return
    end

    # Check if GitHub username is configured
    unless Setting.github_username_configured?
      flash.now[:alert] = "Please configure your GitHub username in Settings before enabling webhooks."
      respond_to_toggle_webhook
      return
    end

    # Check if any events are enabled
    if @project.github_webhook_events.enabled.empty?
      flash.now[:alert] = "Please select at least one webhook event before enabling webhooks."
      respond_to_toggle_webhook
      return
    end

    # Toggle webhook state
    @project.update!(github_webhook_enabled: !@project.github_webhook_enabled)

    message = if @project.github_webhook_enabled?
      "GitHub webhooks enabled. The webhook forwarder will start shortly."
    else
      "GitHub webhooks disabled."
    end

    # Check if the request is from a turbo frame
    if turbo_frame_request?
      flash.now[:notice] = message
      render(:toggle_webhook)
    else
      # Full page reload for non-turbo-frame requests
      redirect_to(edit_project_path(@project), notice: message)
    end
  end

  def webhook_status
    status = if @project.webhook_running?
      process = @project.github_webhook_processes.running.first
      {
        running: true,
        pid: process.pid,
        started_at: process.started_at,
        duration: process.duration,
      }
    else
      { running: false }
    end

    render(json: status)
  end

  def git_status
    unless @project.git?
      render(json: { git: false })
      return
    end

    status = @project.git_status
    render(json: {
      git: true,
      branch: status[:branch],
      dirty: status[:dirty],
      ahead: status.dig(:ahead_behind, :ahead) || 0,
      behind: status.dig(:ahead_behind, :behind) || 0,
    })
  end

  def git_dirty_check
    unless @project.git?
      render(json: { git: false })
      return
    end

    # Quick dirty check without fetch
    render(json: {
      git: true,
      dirty: @project.git_dirty_quick_check,
    })
  end

  def swarm_count
    # Return just the count for the badge
    swarm_files = @project.find_swarm_files
    render(json: { count: swarm_files.size })
  end

  def environment_variables
    project = Project.find(params[:id])
    render(json: { environment_variables: project.environment_variables })
  end

  def edit_swarm_file
    # Redirect to show_swarm_editor to create a proper URL for browser history
    redirect_to(show_swarm_editor_project_path(@project, file_path: params[:file_path], as_template: params[:as_template]))
  end

  def show_swarm_editor
    file_path = params[:file_path]
    as_template = params[:as_template] == "true"

    unless file_path
      redirect_back(fallback_location: @project, alert: "Swarm file not found.")
      return
    end

    # Sanitize and validate the file path
    begin
      resolved_path = InputSanitizer.safe_expand_path(file_path, allowed_base_path: @project.path)

      unless resolved_path && File.exist?(resolved_path)
        redirect_back(fallback_location: @project, alert: "Swarm file not found.")
        return
      end
    rescue SecurityError
      redirect_back(fallback_location: @project, alert: "File access not allowed.")
      return
    end

    # Read the YAML file
    begin
      yaml_content = File.read(resolved_path)
      config = YAML.safe_load(yaml_content, permitted_classes: [Date, Time, DateTime, Symbol])

      # Create a simple data structure for the view (no model needed)
      @swarm_data = {
        name: config["swarm"]["name"],
        yaml_content: yaml_content,
        visual_data: {
          file_path: as_template ? nil : resolved_path, # Clear file path if using as template
          project_id: @project.id,
          project_name: @project.name,
          project_path: @project.path,
          is_file_edit: !as_template, # Not editing if using as template
          is_new_file: as_template, # Creating new file if using as template
        },
      }

      @instance_templates = InstanceTemplate.ordered
      @editing_file = true

      # Render the visual builder
      render("swarm_templates/visual_file_editor")
    rescue StandardError => e
      redirect_back(fallback_location: @project, alert: "Error loading swarm file: #{e.message}")
    end
  end

  def delete_swarm_file
    file_path = params[:file_path]

    unless file_path
      @swarm_files = @project.find_swarm_files
      flash.now[:alert] = "Swarm file not found."
      render(partial: "projects/tabs/swarms", locals: { project: @project, swarm_files: @swarm_files })
      return
    end

    # Sanitize and validate the file path
    begin
      resolved_path = InputSanitizer.safe_expand_path(file_path, allowed_base_path: @project.path)

      unless resolved_path && File.exist?(resolved_path)
        @swarm_files = @project.find_swarm_files
        flash.now[:alert] = "Swarm file not found."
        render(partial: "projects/tabs/swarms", locals: { project: @project, swarm_files: @swarm_files })
        return
      end
    rescue SecurityError
      @swarm_files = @project.find_swarm_files
      flash.now[:alert] = "Cannot delete files outside of project directory."
      render(partial: "projects/tabs/swarms", locals: { project: @project, swarm_files: @swarm_files })
      return
    end

    begin
      File.delete(resolved_path)

      # Clear cache and re-render the swarms tab content
      @project.clear_swarm_files_cache
      @swarm_files = @project.find_swarm_files
      flash.now[:notice] = "Swarm file deleted successfully."
      render(partial: "projects/tabs/swarms", locals: { project: @project, swarm_files: @swarm_files })
    rescue StandardError => e
      @swarm_files = @project.find_swarm_files
      flash.now[:alert] = "Error deleting swarm file: #{e.message}"
      render(partial: "projects/tabs/swarms", locals: { project: @project, swarm_files: @swarm_files })
    end
  end

  def check_file_exists
    file_path = params[:file_path]

    if file_path.blank?
      render(json: { exists: false })
      return
    end

    exists = File.exist?(file_path)
    render(json: { exists: exists })
  end

  def save_swarm_file
    file_path = params[:file_path]
    yaml_content = params[:yaml_content]

    unless file_path && yaml_content
      render(json: { success: false, message: "Missing file path or content" }, status: :unprocessable_entity)
      return
    end

    # Sanitize and validate the file path
    begin
      resolved_path = InputSanitizer.safe_expand_path(file_path)
    rescue SecurityError
      render(json: { success: false, message: "Invalid file path" }, status: :unprocessable_entity)
      return
    end

    # Find the project that owns this file
    project = Project.all.find { |p| InputSanitizer.path_within?(resolved_path, p.path) }

    unless project
      render(json: { success: false, message: "File is not within any project directory" }, status: :unprocessable_entity)
      return
    end

    begin
      # Validate YAML - use safe_load to prevent code execution
      YAML.safe_load(yaml_content, permitted_classes: [Date, Time, DateTime, Symbol])

      # Create directory if it doesn't exist
      dir = File.dirname(resolved_path)

      # Ensure the directory is within the project
      unless InputSanitizer.path_within?(dir, project.path)
        render(json: { success: false, message: "Cannot create directories outside project" }, status: :unprocessable_entity)
        return
      end

      FileUtils.mkdir_p(dir) unless File.directory?(dir)

      # Write to file
      File.write(resolved_path, yaml_content)

      # Clear the swarm files cache for this project
      project.clear_swarm_files_cache

      render(json: {
        success: true,
        message: "Swarm file saved successfully",
        file_path: resolved_path, # Return the file path for the Launch button
        redirect_url: nil, # Don't redirect, stay on the page
      })
    rescue Psych::SyntaxError => e
      render(json: { success: false, message: "Invalid YAML: #{e.message}" }, status: :unprocessable_entity)
    rescue StandardError => e
      render(json: { success: false, message: "Error saving file: #{e.message}" }, status: :unprocessable_entity)
    end
  end

  private

  def set_project
    @project = Project.find(params[:id])
  end

  def respond_to_toggle_webhook
    if turbo_frame_request?
      render(:toggle_webhook)
    else
      redirect_to(edit_project_path(@project))
    end
  end

  def project_params
    permitted = params.require(:project).permit(
      :name,
      :path,
      :git_url,
      :default_config_path,
      :default_use_worktree,
      :github_webhook_enabled,
      :github_repo_owner,
      :github_repo_name,
    )

    # Handle environment variables separately
    # Always process environment_variables if the key exists, even if empty
    # This allows clearing all environment variables
    if params[:project].key?(:environment_variables)
      env_vars = {}
      if params[:project][:environment_variables].present?
        params[:project][:environment_variables].each do |key, var_data|
          # Skip placeholder entry
          next if key == "__placeholder__"
          next unless var_data[:key].present? && var_data[:value].present?

          env_vars[var_data[:key]] = var_data[:value]
        end
      end
      # Always set environment_variables, even if empty (to clear existing ones)
      permitted[:environment_variables] = env_vars
    end

    permitted
  end

  def handle_webhook_events
    # Get all the selected event types from the form
    # Rails sends [""] when no checkboxes are selected due to our hidden field
    selected_events = params[:project][:webhook_events] || []
    selected_events = selected_events.reject(&:blank?)

    # Track if any events changed
    events_changed = false

    # Update existing or create new webhook events
    GithubWebhookEvent::AVAILABLE_EVENTS.each do |event_type|
      webhook_event = @project.github_webhook_events.find_or_initialize_by(event_type: event_type)
      was_enabled = webhook_event.enabled?
      webhook_event.enabled = selected_events.include?(event_type)

      if webhook_event.save! && was_enabled != webhook_event.enabled?
        events_changed = true
      end
    end

    # Reload to get current state after event updates
    @project.reload

    # If no events are selected and webhooks are enabled, disable them
    alert_message = nil
    if selected_events.empty? && @project.github_webhook_enabled?
      @project.update!(github_webhook_enabled: false)
      alert_message = "Webhooks have been disabled because no events were selected."
    end

    # If events changed and webhook is running, notify to restart
    if events_changed && @project.github_webhook_enabled? && @project.webhook_running?
      ActiveRecord::Base.connection.execute(
        "NOTIFY webhook_events_changed, '#{@project.id}'",
      )
    end

    alert_message
  end
end
