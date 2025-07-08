# frozen_string_literal: true

class SessionsController < ApplicationController
  before_action :set_session, only: [:show, :kill]

  def index
    @filter = params[:filter] || "active"

    @sessions = case @filter
    when "active"
      Session.active.recent
    when "stopped"
      Session.stopped.recent
    when "all"
      Session.recent
    else
      Session.active.recent
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
      redirect_to(session_path(@session, new_session: true))
    else
      render(:new, status: :unprocessable_entity)
    end
  end

  def show
    @terminal_url = @session.terminal_url(new_session: params[:new_session])
  end

  def kill
    if @session.status != "active"
      redirect_to(sessions_path, alert: "Session is not active.")
      return
    end

    # Kill the tmux session
    tmux_session_name = "swarm-ui-#{@session.session_id}"
    system("tmux", "kill-session", "-t", tmux_session_name)

    # Update session status
    rails_root = Rails.root.to_s
    status_script = File.join(rails_root, "bin", "update_session_status")
    system(status_script, @session.session_id, "stopped")

    redirect_to(sessions_path, notice: "Session has been killed.")
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
      :configuration,
      :configuration_path,
      :metadata,
      :use_worktree,
      :session_id,
      :status,
    )
  end
end
