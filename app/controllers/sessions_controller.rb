# frozen_string_literal: true

class SessionsController < ApplicationController
  before_action :set_session, only: [:show]

  def index
    @filter = params[:filter] || "all"

    @sessions = case @filter
    when "active"
      Session.active.recent
    when "history"
      Session.where.not(status: "active").recent
    else
      Session.recent
    end
  end

  def new
    @session = Session.new
  end

  def create
    @session = Session.new(session_params)
    @session.session_id ||= SecureRandom.uuid
    @session.started_at = Time.current
    @session.status ||= "active"

    if @session.save
      redirect_to(session_path(@session), notice: "Session was successfully created.")
    else
      render(:new, status: :unprocessable_entity)
    end
  end

  def show
  end

  private

  def set_session
    @session = Session.find(params[:id])
  rescue ActiveRecord::RecordNotFound
    redirect_to(sessions_path, alert: "Session not found.")
  end

  def session_params
    params.require(:session).permit(
      :swarm_name,
      :project_path,
      :project_folder_name,
      :configuration,
      :configuration_path,
      :metadata,
      :use_worktree,
      :session_id,
      :status,
    )
  end
end
