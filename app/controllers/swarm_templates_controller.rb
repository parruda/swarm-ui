# frozen_string_literal: true

class SwarmTemplatesController < ApplicationController
  before_action :set_project, only: []
  before_action :set_swarm_template, only: [:show, :edit, :update, :destroy, :duplicate, :preview_yaml, :launch_session, :export]

  def index
    # Check if we're in a project context
    @project = Project.find(params[:project_id]) if params[:project_id]

    @swarm_templates = if @project
      @project.swarm_templates.includes(:project).ordered
    else
      SwarmTemplate.includes(:project).ordered
    end

    # Apply search filter for swarms
    if params[:search].present?
      search_term = "%#{params[:search]}%"
      @swarm_templates = @swarm_templates.where(
        "name LIKE ? OR description LIKE ?",
        search_term,
        search_term,
      )
    end

    # Apply tag filter
    @swarm_templates = @swarm_templates.with_tag(params[:tag]) if params[:tag].present?

    # Get all unique tags for the filter UI
    @all_tags = SwarmTemplate.all_tags

    # Always load instance templates for the count
    @instance_templates = InstanceTemplate.ordered.includes(:swarm_template_instances)

    # Apply search filter for instance templates
    if params[:instance_search].present?
      search_term = "%#{params[:instance_search]}%"
      @instance_templates = @instance_templates.where(
        "name LIKE ? OR description LIKE ?",
        search_term,
        search_term,
      )
    end

    # Apply tag filter for instance templates
    @instance_templates = @instance_templates.with_tag(params[:instance_tag]) if params[:instance_tag].present?

    # Get all unique tags for instance templates filter UI
    @all_instance_tags = InstanceTemplate.all_tags

    # Show instance templates if tab is selected
    if params[:tab] == "instance-templates"
      @instance_templates = @instance_templates.includes(:swarm_template_instances)
    end
  end

  def library
    @system_templates = SwarmTemplate.system.includes(:swarm_template_instances).ordered
    @general_templates = SwarmTemplate.general_purpose.custom.includes(:swarm_template_instances).ordered
  end

  def show
    @instance_templates = @swarm_template.instance_templates.includes(:swarm_template_instances)
  end

  def new
    @project = Project.find(params[:project_id]) if params[:project_id]

    if @project
      # For project files, use simple data structure
      @swarm_data = {
        name: '',
        yaml_content: '',
        visual_data: {
          project_id: @project.id,
          project_name: @project.name,
          project_path: @project.path,
          is_new_file: true
        }
      }
      @instance_templates = InstanceTemplate.ordered
      render("visual_file_editor")
    else
      # For non-project swarms, use the model
      @swarm_template = SwarmTemplate.new
      @instance_templates = InstanceTemplate.ordered
      render(:visual_new)
    end
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
        format.html { redirect_to(@swarm_template, notice: "Swarm template was successfully created.") }
        format.json { render json: { redirect_url: swarm_template_path(@swarm_template) } }
      end
    else
      respond_to do |format|
        format.html do
          @instance_templates = InstanceTemplate.ordered
          render(:new, status: :unprocessable_entity)
        end
        format.json { render json: { errors: @swarm_template.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def edit
    # Redirect edit to the visual builder with existing data
    @instance_templates = InstanceTemplate.ordered
    render(:visual_new)
  end

  def update
    if @swarm_template.update(swarm_template_params)
      respond_to do |format|
        format.html { redirect_to(@swarm_template, notice: "Swarm template was successfully updated.") }
        format.json { render json: { redirect_url: swarm_template_path(@swarm_template) } }
      end
    else
      respond_to do |format|
        format.html do
          @instance_templates = InstanceTemplate.ordered
          render(:visual_new, status: :unprocessable_entity)
        end
        format.json { render json: { errors: @swarm_template.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def destroy
    project = @swarm_template.project
    @swarm_template.destroy!
    
    # Redirect to project swarm templates if it belongs to a project, otherwise to general swarm templates
    if project
      redirect_to(project_swarm_templates_path(project), notice: "Swarm template was successfully deleted.")
    else
      redirect_to(swarm_templates_path, notice: "Swarm template was successfully deleted.")
    end
  end

  def duplicate
    new_template = @swarm_template.duplicate_for(
      project: @swarm_template.project,
      name: "Copy of #{@swarm_template.name}",
    )

    if new_template.save
      # Copy all instance associations
      @swarm_template.swarm_template_instances.each do |sti|
        new_template.swarm_template_instances.create!(
          instance_template: sti.instance_template,
          instance_key: sti.instance_key,
          overrides: sti.overrides,
          position: sti.position,
        )
      end

      redirect_to(
        edit_swarm_template_path(new_template),
        notice: "Swarm template was successfully duplicated.",
      )
    else
      redirect_back(
        fallback_location: @swarm_template,
        alert: "Failed to duplicate swarm template.",
      )
    end
  end

  def preview_yaml
    @yaml_content = @swarm_template.to_yaml

    respond_to do |format|
      format.html { render(partial: "yaml_preview", locals: { yaml_content: @yaml_content }) }
      format.text { render(plain: @yaml_content) }
      format.json { render(json: { yaml: @yaml_content }) }
    end
  end

  def export
    @yaml_content = @swarm_template.to_yaml

    respond_to do |format|
      format.yaml do
        send_data(
          @yaml_content,
          filename: "#{@swarm_template.name.parameterize}.yaml",
          type: "text/yaml",
        )
      end
      format.json do
        render(json: {
          name: @swarm_template.name,
          yaml: @yaml_content,
        })
      end
    end
  end

  def launch_session
    # Find appropriate project
    project = @swarm_template.project || current_project

    unless project
      redirect_back(
        fallback_location: @swarm_template,
        alert: "No project available for this swarm template",
      )
      return
    end

    # Generate YAML content with default environment variables
    env_vars = build_environment_variables(@swarm_template, project)
    yaml_content = @swarm_template.apply_environment_variables(env_vars)

    # Create a temporary file to store the generated YAML
    temp_dir = Rails.root.join("tmp", "swarm_templates")
    FileUtils.mkdir_p(temp_dir)

    temp_file_path = temp_dir.join("swarm_#{@swarm_template.id}_#{Time.current.to_i}.yaml")
    File.write(temp_file_path, yaml_content)

    # Track template usage
    @swarm_template.increment!(:usage_count)

    # Redirect to new session with pre-filled data
    redirect_to(
      new_session_path(
        project_id: project.id,
        session: {
          swarm_name: @swarm_template.swarm_name,
          configuration_path: temp_file_path.to_s,
          use_worktree: params[:use_worktree] || project.default_use_worktree,
          initial_prompt: params[:initial_prompt],
        },
      ),
      notice: "Ready to launch session from swarm template.",
    )
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
