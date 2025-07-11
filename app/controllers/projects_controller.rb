# frozen_string_literal: true

class ProjectsController < ApplicationController
  before_action :set_project, only: [:show, :edit, :update, :destroy, :archive, :unarchive, :sync, :toggle_webhook, :webhook_status]

  def index
    @active_projects = Project.active.ordered
    @archived_projects = Project.archived.ordered
  end

  def show
    # Only show active sessions on project show page
    @sessions = @project.sessions.active.order(started_at: :desc)

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

    if @project.save
      redirect_to(@project, notice: "Project was successfully created.")
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
    if params[:project].key?(:webhook_events)
      handle_webhook_events
    end

    if @project.update(project_params)
      redirect_to(edit_project_path(@project), notice: "Project was successfully updated.")
    else
      render(:edit, status: :unprocessable_entity)
    end
  end

  def destroy
    @project.archive!
    redirect_to(projects_url, notice: "Project was successfully archived.")
  end

  def archive
    @project.archive!
    redirect_to(projects_url, notice: "Project was successfully archived.")
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

    # Ensure default webhook events exist
    if @project.github_webhook_events.empty?
      GithubWebhookEvent.create_defaults_for_project(@project)
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

  private

  def set_project
    @project = Project.find(params[:id])
  end

  def project_params
    permitted = params.require(:project).permit(
      :name,
      :path,
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
    selected_events = params[:project][:webhook_events] || []

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

    # If events changed and webhook is running, notify to restart
    if events_changed && @project.github_webhook_enabled? && @project.webhook_running?
      ActiveRecord::Base.connection.execute(
        "NOTIFY webhook_events_changed, '#{@project.id}'",
      )
    end
  end
end
