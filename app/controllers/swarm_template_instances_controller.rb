# frozen_string_literal: true

class SwarmTemplateInstancesController < ApplicationController
  before_action :set_swarm_template
  before_action :set_instance, only: [:show, :edit, :update, :destroy, :update_connections]

  def index
    @instances = @swarm_template.swarm_template_instances.includes(:instance_template).ordered
  end

  def show
  end

  def new
    @instance = @swarm_template.swarm_template_instances.build
    @instance_templates = InstanceTemplate.ordered
  end

  def create
    @instance = @swarm_template.swarm_template_instances.build(instance_params)

    if @instance.save
      update_swarm_template_config

      respond_to do |format|
        format.html { redirect_to(@swarm_template, notice: "Instance added successfully.") }
        format.json { render(json: @instance, status: :created) }
      end
    else
      @instance_templates = InstanceTemplate.ordered

      respond_to do |format|
        format.html { render(:new, status: :unprocessable_entity) }
        format.json { render(json: @instance.errors, status: :unprocessable_entity) }
      end
    end
  end

  def edit
    @instance_templates = InstanceTemplate.ordered
  end

  def update
    if @instance.update(instance_params)
      update_swarm_template_config

      respond_to do |format|
        format.html { redirect_to(@swarm_template, notice: "Instance updated successfully.") }
        format.json { render(json: @instance) }
      end
    else
      @instance_templates = InstanceTemplate.ordered

      respond_to do |format|
        format.html { render(:edit, status: :unprocessable_entity) }
        format.json { render(json: @instance.errors, status: :unprocessable_entity) }
      end
    end
  end

  def destroy
    @instance.destroy!
    update_swarm_template_config

    respond_to do |format|
      format.html { redirect_to(@swarm_template, notice: "Instance removed successfully.") }
      format.json { head(:no_content) }
    end
  end

  def update_connections
    connections = params[:connections] || []

    # Validate connections don't create circular dependencies
    if creates_circular_dependency?(@instance.instance_key, connections)
      respond_to do |format|
        format.html { redirect_back(fallback_location: @swarm_template, alert: "Circular dependency detected.") }
        format.json { render(json: { error: "Circular dependency detected" }, status: :unprocessable_entity) }
      end
      return
    end

    # Update connections in overrides
    @instance.overrides ||= {}
    @instance.overrides["connections"] = connections

    if @instance.save
      update_swarm_template_config

      respond_to do |format|
        format.html { redirect_to(@swarm_template, notice: "Connections updated successfully.") }
        format.json { render(json: { connections: connections }) }
      end
    else
      respond_to do |format|
        format.html { redirect_back(fallback_location: @swarm_template, alert: "Failed to update connections.") }
        format.json { render(json: @instance.errors, status: :unprocessable_entity) }
      end
    end
  end

  private

  def set_swarm_template
    @swarm_template = SwarmTemplate.find(params[:swarm_template_id])
  end

  def set_instance
    @instance = @swarm_template.swarm_template_instances.find(params[:id])
  end

  def instance_params
    params.require(:swarm_template_instance).permit(
      :instance_template_id,
      :instance_key,
      :position,
      overrides: {},
    )
  end

  def update_swarm_template_config
    # Rebuild the swarm config_data from all instances
    instances_config = {}

    @swarm_template.swarm_template_instances.includes(:instance_template).ordered.each do |sti|
      instances_config[sti.instance_key] = sti.full_config
    end

    @swarm_template.config_data ||= { "version" => 1, "swarm" => {} }
    @swarm_template.config_data["swarm"]["instances"] = instances_config

    # Set main instance if not already set and we have instances
    if instances_config.any? && @swarm_template.config_data["swarm"]["main"].blank?
      @swarm_template.config_data["swarm"]["main"] = instances_config.keys.first
    end

    @swarm_template.save!
  end

  def creates_circular_dependency?(source_key, target_keys)
    # Build adjacency list from all connections
    adjacency = {}

    @swarm_template.swarm_template_instances.each do |sti|
      connections = if sti.instance_key == source_key
        target_keys
      else
        sti.connections
      end

      adjacency[sti.instance_key] = connections
    end

    # Check for cycles using DFS
    visited = Set.new
    recursion_stack = Set.new

    adjacency.keys.each do |node|
      if has_cycle?(node, adjacency, visited, recursion_stack)
        return true
      end
    end

    false
  end

  def has_cycle?(node, adjacency, visited, recursion_stack)
    visited.add(node)
    recursion_stack.add(node)

    (adjacency[node] || []).each do |neighbor|
      if !visited.include?(neighbor)
        return true if has_cycle?(neighbor, adjacency, visited, recursion_stack)
      elsif recursion_stack.include?(neighbor)
        return true
      end
    end

    recursion_stack.delete(node)
    false
  end
end
