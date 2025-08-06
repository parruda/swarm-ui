# frozen_string_literal: true

class WebhookCommandsController < ApplicationController
  before_action :set_project

  def edit
    @commands = @project.webhook_commands_with_validation
    @swarm_files = @project.find_swarm_files

    respond_to do |format|
      format.html { render(layout: false) }
    end
  end

  def update
    commands = params[:commands] || []

    # Normalize and validate commands
    normalized_commands = commands.map do |cmd|
      next if cmd[:command].blank? || cmd[:swarm_path].blank?

      {
        "command" => @project.normalize_webhook_command(cmd[:command]),
        "swarm_path" => cmd[:swarm_path],
      }
    end.compact

    @project.update!(webhook_commands: normalized_commands)

    redirect_to(
      project_path(@project, tab: "github"),
      notice: "Webhook commands updated successfully",
    )
  rescue => e
    redirect_to(
      project_path(@project, tab: "github"),
      alert: "Failed to update webhook commands: #{e.message}",
    )
  end

  private

  def set_project
    @project = Project.find(params[:project_id])
  end
end

