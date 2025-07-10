# frozen_string_literal: true

class ProjectsController < ApplicationController
  before_action :set_project, only: [:show, :edit, :update, :destroy, :archive, :unarchive]

  def index
    @active_projects = Project.active.ordered
    @archived_projects = Project.archived.ordered
  end

  def show
    # TODO: Enable when Session model has project association
    # @sessions = @project.sessions.includes(:swarm_template).order(created_at: :desc)
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
  end

  def update
    if @project.update(project_params)
      redirect_to(@project, notice: "Project was successfully updated.")
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
end
