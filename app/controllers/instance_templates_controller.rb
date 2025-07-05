class InstanceTemplatesController < ApplicationController
  before_action :set_instance_template, only: [:show, :edit, :update, :destroy]

  # GET /instance_templates
  # List all instance templates
  def index
    @instance_templates = InstanceTemplate.includes(:swarm_configurations)
                                         .order(:instance_type, :name)
    @templates_by_type = @instance_templates.group_by(&:instance_type)
  end

  # GET /instance_templates/new
  # Form for creating a new instance template
  def new
    @instance_template = InstanceTemplate.new(
      model: 'claude-3-5-sonnet-20241022',
      provider: 'claude',
      temperature: 0.0,
      instance_type: 'backend'
    )
  end

  # POST /instance_templates
  # Create a new instance template
  def create
    @instance_template = InstanceTemplate.new(instance_template_params)
    
    if @instance_template.save
      redirect_to @instance_template, notice: 'Instance template was successfully created.'
    else
      render :new
    end
  end

  # GET /instance_templates/:id
  # Show instance template details
  def show
    @configurations = @instance_template.swarm_configurations.order(:name)
    @yaml_preview = @instance_template.to_yaml_hash
  end

  # GET /instance_templates/:id/edit
  # Edit instance template form
  def edit
  end

  # PATCH/PUT /instance_templates/:id
  # Update an instance template
  def update
    if @instance_template.update(instance_template_params)
      redirect_to @instance_template, notice: 'Instance template was successfully updated.'
    else
      render :edit
    end
  end

  # DELETE /instance_templates/:id
  # Delete an instance template
  def destroy
    if @instance_template.swarm_configurations.any?
      redirect_to instance_templates_url, alert: 'Cannot delete template that is used in configurations.'
    else
      @instance_template.destroy
      redirect_to instance_templates_url, notice: 'Instance template was successfully deleted.'
    end
  end

  private

  def set_instance_template
    @instance_template = InstanceTemplate.find(params[:id])
  end

  def instance_template_params
    params.require(:instance_template).permit(
      :name, :description, :instance_type, :model, :prompt, 
      :vibe, :provider, :temperature, :api_version, 
      :openai_token_env, :base_url,
      :allowed_tools, :disallowed_tools
    ).tap do |permitted|
      # Convert comma-separated strings to proper format for tools
      if permitted[:allowed_tools].present?
        permitted[:allowed_tools] = permitted[:allowed_tools].split(',').map(&:strip).join(',')
      end
      if permitted[:disallowed_tools].present?
        permitted[:disallowed_tools] = permitted[:disallowed_tools].split(',').map(&:strip).join(',')
      end
    end
  end
end