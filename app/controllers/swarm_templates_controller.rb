# frozen_string_literal: true

class SwarmTemplatesController < ApplicationController
  before_action :set_project, only: []
  before_action :set_swarm_template, only: [:edit, :update, :destroy]


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
    redirect_to projects_path, alert: "Please select a project to create a swarm template."
  end

  def create
    @project = Project.find(params[:project_id]) if params[:project_id]
    @swarm_template = @project ? @project.swarm_templates.build(swarm_template_params) : SwarmTemplate.new(swarm_template_params)

    if @swarm_template.save
      # Handle instance creation from instances_data if present
      if params[:swarm_template][:instances_data].present?
        create_instances_from_data(params[:swarm_template][:instances_data])
      end

      respond_to do |format|
        format.html { redirect_to(project_path(@project), notice: "Swarm template was successfully created.") }
        format.json { render(json: { redirect_url: project_path(@project) }) }
      end
    else
      respond_to do |format|
        format.html do
          @instance_templates = InstanceTemplate.ordered
          render(:new, status: :unprocessable_entity)
        end
        format.json { render(json: { errors: @swarm_template.errors.full_messages }, status: :unprocessable_entity) }
      end
    end
  end

  def edit
    # Require project context for editing
    unless @swarm_template.project
      redirect_to projects_path, alert: "This swarm template cannot be edited without a project context."
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

  def update
    if @swarm_template.update(swarm_template_params)
      respond_to do |format|
        format.html { redirect_to(project_path(@swarm_template.project), notice: "Swarm template was successfully updated.") }
        format.json { render(json: { redirect_url: project_path(@swarm_template.project) }) }
      end
    else
      respond_to do |format|
        format.html do
          @instance_templates = InstanceTemplate.ordered
          # Prepare data for visual_file_editor on error
          @swarm_data = {
            name: @swarm_template.name,
            yaml_content: @swarm_template.yaml_content,
            visual_data: @swarm_template.visual_data || {
              project_id: @swarm_template.project&.id,
              project_name: @swarm_template.project&.name,
              project_path: @swarm_template.project&.path,
              is_file_edit: true,
              file_path: @swarm_template.config_data&.dig("file_path"),
            },
          }
          @project = @swarm_template.project
          render("visual_file_editor", status: :unprocessable_entity)
        end
        format.json { render(json: { errors: @swarm_template.errors.full_messages }, status: :unprocessable_entity) }
      end
    end
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

  def create_instances_from_data(instances_data_json)
    instances_data = JSON.parse(instances_data_json)

    instances_data.each do |instance_data|
      # Check if an identical instance template already exists
      existing_template = find_or_create_instance_template(instance_data)

      # Create the association with the swarm template
      @swarm_template.swarm_template_instances.create!(
        instance_template: existing_template,
        instance_key: instance_data["key"],
      )
    end
  rescue JSON::ParserError => e
    Rails.logger.error("Failed to parse instances_data: #{e.message}")
  end

  def find_or_create_instance_template(instance_data)
    # Build the config hash for the instance template
    config = {
      "provider" => instance_data["provider"],
      "model" => instance_data["model"],
      "directory" => instance_data["directory"],
      "system_prompt" => instance_data["system_prompt"],
      "vibe" => instance_data["vibe"],
      "allowed_tools" => instance_data["allowed_tools"],
    }

    # Add temperature only if present
    config["temperature"] = instance_data["temperature"] if instance_data["temperature"].present?

    # For OpenAI, ensure vibe is true and allowed_tools includes all
    if config["provider"] == "openai"
      config["vibe"] = true
      config["allowed_tools"] = InstanceTemplate::AVAILABLE_TOOLS.dup
    end

    # Try to find an existing instance template with the same configuration
    existing = InstanceTemplate.find_by(
      name: instance_data["name"],
      description: instance_data["description"],
    )

    # Check if the existing template has identical configuration
    if existing && existing.config == config
      return existing
    end

    # Create a new instance template
    instance_template = InstanceTemplate.new(
      name: instance_data["name"],
      description: instance_data["description"],
      config: config,
      tags: [], # You can extend this to parse tags from the instance data if needed
    )

    # If the name already exists, make it unique
    if !instance_template.valid? && instance_template.errors[:name].present?
      counter = 1
      original_name = instance_data["name"]
      while !instance_template.valid? && instance_template.errors[:name].present?
        instance_template.name = "#{original_name}_#{counter}"
        counter += 1
        instance_template.valid? # Re-validate to check uniqueness
      end
    end

    instance_template.save!
    instance_template
  end

  def set_project
    @project = Project.find(params[:project_id]) if params[:project_id]
  end

  def set_swarm_template
    @swarm_template = SwarmTemplate.find(params[:id])
  end

  def swarm_template_params
    permitted = params.require(:swarm_template).permit(
      :name,
      :description,
      :project_id,
      :public,
      :config_data,
      :yaml_content,
      :visual_data,
      :tags,
      tags: [],
      metadata: {},
    )

    # Parse config_data from JSON string to hash
    if permitted[:config_data].is_a?(String)
      begin
        permitted[:config_data] = JSON.parse(permitted[:config_data])
      rescue JSON::ParserError => e
        Rails.logger.error("Failed to parse config_data: #{e.message}")
        permitted[:config_data] = {}
      end
    end

    permitted
  end

  def current_project
    @project || Project.first # Fallback for general templates
  end

  def build_environment_variables(swarm_template, project)
    # Start with params
    env_vars = params.fetch(:environment_variables, {}).to_unsafe_h

    # Add project environment variables (lower priority)
    if project&.environment_variables.present?
      env_vars = project.environment_variables.merge(env_vars)
    end

    # Add default values for common variables
    env_vars["PROJECT_DIR"] ||= project.path
    env_vars["PROJECT_NAME"] ||= project.name
    env_vars["SWARM_NAME"] ||= swarm_template.name

    # Add intelligent defaults based on project structure
    if Dir.exist?(File.join(project.path, "frontend"))
      env_vars["FRONTEND_DIR"] ||= "./frontend"
    end

    if Dir.exist?(File.join(project.path, "backend"))
      env_vars["BACKEND_DIR"] ||= "./backend"
    end

    if Dir.exist?(File.join(project.path, "docs"))
      env_vars["DOCS_DIR"] ||= "./docs"
    end

    env_vars
  end
end
