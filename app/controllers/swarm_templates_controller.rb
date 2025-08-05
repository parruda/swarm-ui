# frozen_string_literal: true

class SwarmTemplatesController < ApplicationController
  before_action :set_project, only: []
  before_action :set_swarm_template, only: [:edit, :destroy]

  def new
    # Require project context for creating new swarm templates
    @project = Project.find(params[:project_id])

    # For project files, use simple data structure
    @swarm_data = {
      name: "",
      yaml_content: "",
      visual_data: {
        project_id: @project.id,
        project_name: @project.name,
        project_path: @project.path,
        is_new_file: true,
      },
    }
    @instance_templates = InstanceTemplate.ordered
    render("visual_file_editor")
  rescue ActiveRecord::RecordNotFound
    redirect_to(projects_path, alert: "Please select a project to create a swarm template.")
  end

  def edit
    # Require project context for editing
    unless @swarm_template.project
      redirect_to(projects_path, alert: "This swarm template cannot be edited without a project context.")
      return
    end

    @instance_templates = InstanceTemplate.ordered

    # For project-based swarms, use the file editor view
    @swarm_data = {
      name: @swarm_template.name,
      yaml_content: @swarm_template.yaml_content,
      visual_data: @swarm_template.visual_data || {
        project_id: @swarm_template.project.id,
        project_name: @swarm_template.project.name,
        project_path: @swarm_template.project.path,
        is_file_edit: true,
        file_path: @swarm_template.config_data&.dig("file_path"),
      },
    }
    @project = @swarm_template.project
    render("visual_file_editor")
  end

  def destroy
    project = @swarm_template.project
    @swarm_template.destroy!

    # Redirect to project swarm templates if it belongs to a project, otherwise to general swarm templates
    if project
      redirect_to(project_path(project), notice: "Swarm template was successfully deleted.")
    else
      redirect_to(projects_path, notice: "Swarm template was successfully deleted.")
    end
  end

  private

  def set_project
    @project = Project.find(params[:project_id]) if params[:project_id]
  end

  def set_swarm_template
    @swarm_template = SwarmTemplate.find(params[:id])
  end
end
