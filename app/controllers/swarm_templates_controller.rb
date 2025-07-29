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

    @swarm_template = @project ? @project.swarm_templates.build : SwarmTemplate.new
    if params[:visual]
      @instance_templates = InstanceTemplate.ordered
      render(:visual_new)
    else
      @instance_templates = InstanceTemplate.ordered
    end
  end

  def create
    @project = Project.find(params[:project_id]) if params[:project_id]
    @swarm_template = @project ? @project.swarm_templates.build(swarm_template_params) : SwarmTemplate.new(swarm_template_params)

    if @swarm_template.save
      redirect_to(@swarm_template, notice: "Swarm template was successfully created.")
    else
      @instance_templates = InstanceTemplate.ordered
      render(:new, status: :unprocessable_entity)
    end
  end

  def edit
    @instance_templates = InstanceTemplate.ordered
  end

  def update
    if @swarm_template.update(swarm_template_params)
      redirect_to(@swarm_template, notice: "Swarm template was successfully updated.")
    else
      @instance_templates = InstanceTemplate.ordered
      render(:edit, status: :unprocessable_entity)
    end
  end

  def destroy
    @swarm_template.destroy!
    redirect_to(
      project_swarm_templates_path(@swarm_template.project || @project),
      notice: "Swarm template was successfully deleted.",
    )
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
