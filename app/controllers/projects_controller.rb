# frozen_string_literal: true

class ProjectsController < ApplicationController
  before_action :set_project, only: [:show, :edit, :update, :destroy, :archive, :unarchive, :sync, :toggle_webhook, :webhook_status, :git_status, :edit_swarm_file, :delete_swarm_file]

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
    # Only load swarm files count for the badge, not the full data
    # The actual swarm files will be loaded via turbo frame
    @swarm_files = @project.find_swarm_files if request.format.html?

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

    # Clear cached git status after sync
    @project.clear_git_cache if result[:success]

    render(json: result)
  end

  def toggle_webhook
    unless @project.github_configured?
      redirect_back(fallback_location: edit_project_path(@project), alert: "Please configure GitHub repository information first.")
      return
    end

    # Check if GitHub username is configured
    unless Setting.github_username_configured?
      redirect_back(fallback_location: edit_project_path(@project, anchor: "webhook-configuration"), alert: "Please configure your GitHub username in Settings before enabling webhooks.")
      return
    end

    # Check if any events are enabled
    if @project.github_webhook_events.enabled.empty?
      redirect_back(fallback_location: edit_project_path(@project, anchor: "webhook-configuration"), alert: "Please select at least one webhook event before enabling webhooks.")
      return
    end

    # Toggle webhook state
    @project.update!(github_webhook_enabled: !@project.github_webhook_enabled)

    if @project.github_webhook_enabled?
      redirect_back(fallback_location: @project, notice: "GitHub webhooks enabled. The webhook forwarder will start shortly.")
    else
      redirect_back(fallback_location: @project, notice: "GitHub webhooks disabled.")
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

  def environment_variables
    project = Project.find(params[:id])
    render(json: { environment_variables: project.environment_variables })
  end

  def edit_swarm_file
    file_path = params[:file_path]
    as_template = params[:as_template] == "true"

    unless file_path && File.exist?(file_path)
      redirect_back(fallback_location: @project, alert: "Swarm file not found.")
      return
    end

    # Read the YAML file
    begin
      yaml_content = File.read(file_path)
      config = YAML.load(yaml_content)

      # Create a simple data structure for the view (no model needed)
      @swarm_data = {
        name: config["swarm"]["name"],
        yaml_content: yaml_content,
        visual_data: {
          file_path: as_template ? nil : file_path, # Clear file path if using as template
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

    unless file_path && File.exist?(file_path)
      redirect_back(fallback_location: @project, alert: "Swarm file not found.")
      return
    end

    # Security check: ensure file is within project directory
    unless file_path.start_with?(@project.path)
      redirect_back(fallback_location: @project, alert: "Cannot delete files outside of project directory.")
      return
    end

    begin
      File.delete(file_path)
      redirect_to(@project, notice: "Swarm file deleted successfully.")
    rescue StandardError => e
      redirect_back(fallback_location: @project, alert: "Error deleting swarm file: #{e.message}")
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

    # Find the project that owns this file
    project = Project.all.find { |p| file_path.start_with?(p.path) }

    unless project
      render(json: { success: false, message: "File is not within any project directory" }, status: :unprocessable_entity)
      return
    end

    begin
      # Validate YAML
      YAML.load(yaml_content)

      # Create directory if it doesn't exist
      dir = File.dirname(file_path)
      FileUtils.mkdir_p(dir) unless File.directory?(dir)

      # Write to file
      File.write(file_path, yaml_content)

      render(json: {
        success: true,
        message: "Swarm file saved successfully",
        file_path: file_path, # Return the file path for the Launch button
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
    if params[:project][:environment_variables].present?
      env_vars = {}
      params[:project][:environment_variables].each do |_, var_data|
        next unless var_data[:key].present? && var_data[:value].present?

        env_vars[var_data[:key]] = var_data[:value]
      end
      permitted[:environment_variables] = env_vars unless env_vars.empty?
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
