# frozen_string_literal: true

class ProjectTabsController < ApplicationController
  before_action :set_project

  def swarms
    @swarm_files = @project.find_swarm_files
    render(partial: "projects/tabs/swarms", locals: { project: @project, swarm_files: @swarm_files })
  end

  def sessions
    @sessions = @project.sessions.active.order(started_at: :desc)
    render(partial: "projects/tabs/sessions", locals: { project: @project, sessions: @sessions })
  end

  def git
    # Only render if project is a git repository
    unless @project.git?
      head(:not_found)
      return
    end

    render(partial: "projects/tabs/git", locals: { project: @project })
  end

  private

  def set_project
    @project = Project.find(params[:id])
  end
end
