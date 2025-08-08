# frozen_string_literal: true

class SwarmTemplatesController < ApplicationController
  before_action :set_swarm_template, only: [:edit, :destroy]

  def new
    # Project context is required by routing - params[:project_id] will always be present
    @project = Project.find(params[:project_id])
  end

  def create
    # Require project context for creating new swarm templates
    @project = Project.find(params[:project_id])

    swarm_name = params[:swarm_name]
    if swarm_name.blank?
      redirect_to(new_project_swarm_template_path(@project), alert: "Swarm name is required.")
      return
    end

    # Generate filename from swarm name
    filename = swarm_name.downcase.gsub(/\s+/, "-").gsub(/[^a-z0-9\-_]/, "") + ".yml"
    file_path = File.join(@project.path, filename)

    # Check if file already exists
    if File.exist?(file_path)
      redirect_to(new_project_swarm_template_path(@project), alert: "A file with this name already exists.")
      return
    end

    # Create initial YAML content
    yaml_content = {
      "version" => 1,
      "swarm" => {
        "name" => swarm_name,
        "instances" => {},
      },
    }

    # Write the file
    begin
      File.write(file_path, yaml_content.to_yaml)

      # Redirect to the visual editor
      redirect_to(edit_swarm_file_project_path(@project, file_path: file_path))
    rescue StandardError => e
      redirect_to(new_project_swarm_template_path(@project), alert: "Failed to create swarm file: #{e.message}")
    end
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

  def set_swarm_template
    @swarm_template = SwarmTemplate.find(params[:id])
  end
end
