class ConfigurationsController < ApplicationController
  before_action :set_configuration, only: [:show, :edit, :update, :destroy, :clone, :export]

  # GET /configurations
  # List all saved swarm configurations
  def index
    @configurations = SwarmConfiguration.includes(:instance_templates).order(:name)
  end

  # GET /configurations/new
  # Form for creating a new configuration
  def new
    @configuration = SwarmConfiguration.new
    @configuration.config_yaml = default_yaml_template
    @instance_templates = InstanceTemplate.all.order(:instance_type, :name)
  end

  # POST /configurations
  # Save a new configuration
  def create
    @configuration = SwarmConfiguration.new(configuration_params)
    
    if validate_yaml(@configuration.config_yaml) && @configuration.save
      redirect_to edit_configuration_path(@configuration), notice: 'Configuration was successfully created.'
    else
      @instance_templates = InstanceTemplate.all.order(:instance_type, :name)
      render :new
    end
  end

  # GET /configurations/:id
  # Show configuration details
  def show
    @instance_count = @configuration.instance_count
    @can_launch = @configuration.config_yaml.present?
  end

  # GET /configurations/:id/edit
  # Edit configuration with visual builder and YAML editor
  def edit
    @instance_templates = InstanceTemplate.all.order(:instance_type, :name)
    @parsed_config = @configuration.yaml_config rescue {}
  end

  # PATCH/PUT /configurations/:id
  # Update an existing configuration
  def update
    if validate_yaml(configuration_params[:config_yaml]) && @configuration.update(configuration_params)
      redirect_to @configuration, notice: 'Configuration was successfully updated.'
    else
      @instance_templates = InstanceTemplate.all.order(:instance_type, :name)
      render :edit
    end
  end

  # DELETE /configurations/:id
  # Delete a configuration
  def destroy
    if @configuration.sessions.any?
      redirect_to configurations_url, alert: 'Cannot delete configuration that has been used in sessions.'
    else
      @configuration.destroy
      redirect_to configurations_url, notice: 'Configuration was successfully deleted.'
    end
  end

  # POST /configurations/:id/clone
  # Create a copy of an existing configuration
  def clone
    new_config = @configuration.dup
    new_config.name = "#{@configuration.name} (Copy)"
    new_config.created_at = nil
    new_config.updated_at = nil
    
    if new_config.save
      # Copy instance template associations
      @configuration.swarm_instance_templates.each do |sit|
        new_config.swarm_instance_templates.create(
          instance_template_id: sit.instance_template_id
        )
      end
      
      redirect_to edit_configuration_path(new_config), notice: 'Configuration was successfully cloned.'
    else
      redirect_to configurations_url, alert: 'Failed to clone configuration.'
    end
  end

  # GET /configurations/:id/export
  # Export configuration as YAML file
  def export
    filename = "#{@configuration.name.parameterize}.yml"
    
    send_data @configuration.config_yaml,
              filename: filename,
              type: 'text/yaml',
              disposition: 'attachment'
  end

  private

  def set_configuration
    @configuration = SwarmConfiguration.find(params[:id])
  end

  def configuration_params
    params.require(:swarm_configuration).permit(:name, :description, :config_yaml, :is_template)
  end
  
  def validate_yaml(yaml_content)
    return false if yaml_content.blank?
    
    begin
      YAML.safe_load(yaml_content)
      true
    rescue Psych::SyntaxError => e
      @configuration.errors.add(:config_yaml, "Invalid YAML syntax: #{e.message}")
      false
    end
  end
  
  def default_yaml_template
    <<~YAML
      swarm:
        name: "New Swarm"
        description: "Describe your swarm's purpose"
        auto_continue_count: 3
        before:
          - CLAUDE_MODEL="claude-3-5-sonnet-20241022"
          - CLAUDE_MAX_TOKENS=8192
        instances:
          - name: "Agent1"
            description: "Primary agent"
            model: "${CLAUDE_MODEL}"
            prompt: "You are a helpful assistant."
    YAML
  end
end