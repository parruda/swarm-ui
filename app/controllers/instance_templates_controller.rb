# frozen_string_literal: true

class InstanceTemplatesController < ApplicationController
  before_action :set_instance_template, only: [:show, :edit, :update, :destroy, :duplicate]

  def index
    @instance_templates = InstanceTemplate.includes(:swarm_template_instances).ordered
    @instance_templates = @instance_templates.by_category(params[:category]) if params[:category].present?
    
    respond_to do |format|
      format.html
      format.json { 
        render json: @instance_templates.to_json(
          methods: [:model, :provider],
          include: [],
          only: [:id, :name, :description, :category, :tags, :config, :system_prompt]
        )
      }
    end
  end

  def library
    @system_templates = InstanceTemplate.system.ordered
    @categories = InstanceTemplate::CATEGORIES
  end

  def show
    @swarm_templates = @instance_template.swarm_templates.includes(:project)
  end

  def new
    @instance_template = InstanceTemplate.new(
      config: {
        "model" => "sonnet",
        "provider" => "claude",
        "directory" => ".",
        "allowed_tools" => ["Read", "Edit", "Write", "Bash"],
      },
    )
  end

  def create
    @instance_template = InstanceTemplate.new(instance_template_params)

    respond_to do |format|
      if @instance_template.save
        format.html { redirect_to(@instance_template, notice: "Instance template was successfully created.") }
        format.json { 
          render json: @instance_template.to_json(
            methods: [:model, :provider],
            include: [],
            only: [:id, :name, :description, :category, :tags, :config, :system_prompt]
          ), 
          status: :created 
        }
      else
        format.html { render(:new, status: :unprocessable_entity) }
        format.json { render json: { errors: @instance_template.errors.full_messages }, status: :unprocessable_entity }
      end
    end
  end

  def edit
  end

  def update
    if @instance_template.update(instance_template_params)
      redirect_to(@instance_template, notice: "Instance template was successfully updated.")
    else
      render(:edit, status: :unprocessable_entity)
    end
  end

  def destroy
    if @instance_template.swarm_template_instances.any?
      redirect_back(
        fallback_location: instance_templates_path,
        alert: "Cannot delete instance template that is in use by swarm templates.",
      )
    else
      @instance_template.destroy!
      redirect_to(instance_templates_path, notice: "Instance template was successfully deleted.")
    end
  end

  def duplicate
    new_template = @instance_template.duplicate("Copy of #{@instance_template.name}")

    if new_template.save
      redirect_to(
        edit_instance_template_path(new_template),
        notice: "Instance template was successfully duplicated.",
      )
    else
      redirect_back(
        fallback_location: @instance_template,
        alert: "Failed to duplicate instance template.",
      )
    end
  end

  private

  def set_instance_template
    @instance_template = InstanceTemplate.find(params[:id])
  end

  def instance_template_params
    permitted_params = params.require(:instance_template).permit(
      :name,
      :description,
      :system_prompt,
      :category,
      :tags_string,
      tags: [],
      metadata: {}
    )
    
    # Convert to hash for manipulation
    permitted = permitted_params.to_h
    
    # Handle config separately since it has nested arrays
    if params[:instance_template][:config]
      config_params = params[:instance_template][:config].permit(
        :provider,
        :model,
        :directory,
        :vibe,
        :worktree,
        :temperature,
        :api_version,
        :reasoning_effort,
        :openai_token_env,
        :base_url,
        allowed_tools: []
      )
      permitted[:config] = config_params.to_h
    end

    # Process tags from comma-separated string or keep array if directly provided
    if permitted[:tags_string].present?
      permitted[:tags] = permitted[:tags_string].split(",").map(&:strip).map(&:downcase).uniq
      permitted.delete(:tags_string)
    elsif permitted[:tags_string] == ""
      permitted[:tags] = []
      permitted.delete(:tags_string)
    elsif permitted[:tags].present? && permitted[:tags].is_a?(Array)
      # Tags provided as array from API - ensure they're normalized
      permitted[:tags] = permitted[:tags].map(&:to_s).map(&:strip).map(&:downcase).uniq
    end

    # Process config to handle checkbox and special values
    if permitted[:config].present?
      # Convert vibe checkbox value to boolean (handle both form and JSON input)
      if permitted[:config][:vibe].present?
        permitted[:config][:vibe] = case permitted[:config][:vibe]
        when true, "true", "1" then true
        when false, "false", "0", nil then false
        else false
        end
      else
        permitted[:config][:vibe] = false
      end
      
      # Handle worktree similarly
      if permitted[:config].key?(:worktree)
        permitted[:config][:worktree] = case permitted[:config][:worktree]
        when true, "true", "1" then true
        else false
        end
      end

      # Handle allowed_tools array (ensure it's an array)
      if permitted[:config][:allowed_tools].nil?
        permitted[:config][:allowed_tools] = []
      elsif permitted[:config][:allowed_tools].is_a?(String)
        permitted[:config][:allowed_tools] = [permitted[:config][:allowed_tools]]
      end

      # Clear allowed_tools if vibe mode is on or provider is openai
      if permitted[:config][:vibe] || permitted[:config][:provider] == "openai"
        permitted[:config][:allowed_tools] = []
      end

      # Ensure OpenAI instances always have vibe mode
      if permitted[:config][:provider] == "openai"
        permitted[:config][:vibe] = true
      end
    end

    permitted
  end
end
