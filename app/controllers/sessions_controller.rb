# frozen_string_literal: true

class SessionsController < ApplicationController
  before_action :set_session, only: [:show]

  def index
    @sessions = Session.recent
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
    # Build the JSON payload for the ttyd session
    payload = {
      tmux_session_name: "swarm-ui-#{@session.session_id}",
      working_dir: @session.project_path,
      swarm_file: @session.configuration_path,
      use_worktree: @session.use_worktree,
      session_id: @session.session_id,
    }

    # Base64 encode the payload (URL-safe)
    encoded_payload = Base64.urlsafe_encode64(payload.to_json, padding: false)

    # Break encoded payload into 100 character chunks
    # because ttyd don't support long arguments
    chunks = encoded_payload.scan(/.{1,100}/)

    # Build query parameters for each chunk
    query_params = chunks.map { |chunk| "arg=#{chunk}" }.join("&")

    # Build the complete iframe URL
    @terminal_url = "http://127.0.0.1:8999/?#{query_params}"
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
