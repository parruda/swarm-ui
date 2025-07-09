# frozen_string_literal: true

class SessionsController < ApplicationController
  before_action :set_session, only: [:show, :kill, :archive, :unarchive, :clone, :info, :log_stream, :instances]

  def index
    @filter = params[:filter] || "active"

    @sessions = case @filter
    when "active"
      Session.active.recent
    when "stopped"
      Session.stopped.recent
    when "archived"
      Session.archived.recent
    when "all"
      Session.recent
    else
      Session.active.recent
    end
  end

  def new
    @session = Session.new
    # Check if we're cloning from another session
    if params[:clone_from].present?
      @clone_source = Session.find_by(id: params[:clone_from])
      if @clone_source
        @session.project_path = @clone_source.project_path
        @session.configuration_path = @clone_source.configuration_path
        @session.use_worktree = @clone_source.use_worktree
        @session.environment_variables = @clone_source.environment_variables
        @focus_name_field = true
      end
    end
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

  def archive
    if @session.status != "stopped"
      redirect_to(sessions_path, alert: "Only stopped sessions can be archived.")
      return
    end

    @session.update!(status: "archived")
    redirect_to(sessions_path(filter: "archived"), notice: "Session has been archived.")
  end

  def unarchive
    if @session.status != "archived"
      redirect_to(sessions_path, alert: "Only archived sessions can be unarchived.")
      return
    end

    @session.update!(status: "stopped")
    redirect_to(sessions_path(filter: "stopped"), notice: "Session has been unarchived.")
  end

  def clone
    redirect_to(new_session_path(clone_from: @session.id))
  end

  def info
    # Get session metadata from claude-swarm session directory
    @session_metadata = fetch_session_metadata
    @instance_hierarchy = build_instance_hierarchy
    @total_cost = calculate_total_cost

    # Load swarm configuration to get team name
    @swarm_config = load_swarm_config

    render(partial: "session_info")
  end

  def log_stream
    tailer = LogTailer.new(@session)
    @logs = tailer.read_existing_logs

    render(partial: "log_stream")
  end

  def instances
    # Get session metadata
    @metadata = fetch_session_metadata

    # Get instances from metadata's worktree instance_configs
    @instances = @metadata.dig("worktree", "instance_configs") || {}

    # Load swarm configuration to get additional instance details
    @swarm_config = load_swarm_config

    render(partial: "instance_info")
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
      :environment_variables,
    )
  end

  def fetch_session_metadata
    return {} unless @session.session_path && Dir.exist?(@session.session_path)

    metadata_file = File.join(@session.session_path, "session_metadata.json")
    if File.exist?(metadata_file)
      JSON.parse(File.read(metadata_file))
    else
      {}
    end
  rescue JSON::ParserError
    {}
  end

  def build_instance_hierarchy
    log_file = session_log_file
    return [] unless log_file && File.exist?(log_file)

    costs = Hash.new(0)
    call_counts = Hash.new(0)

    File.foreach(log_file) do |line|
      event = JSON.parse(line)
      instance_name = event["instance"]

      if event["event"]["type"] == "result" && event["event"]["total_cost_usd"]
        costs[instance_name] += event["event"]["total_cost_usd"]
        call_counts[instance_name] += 1
      end
    rescue JSON::ParserError
      next
    end

    costs.map do |name, cost|
      {
        name: name,
        cost: cost,
        calls: call_counts[name],
      }
    end.sort_by { |i| -i[:cost] }
  end

  def calculate_total_cost
    log_file = session_log_file
    return 0 unless log_file && File.exist?(log_file)

    total = 0
    File.foreach(log_file) do |line|
      event = JSON.parse(line)
      if event["event"]["type"] == "result" && event["event"]["total_cost_usd"]
        total += event["event"]["total_cost_usd"]
      end
    rescue JSON::ParserError
      next
    end

    total
  end

  def session_log_file
    @session.session_path ? File.join(@session.session_path, "session.log.json") : nil
  end

  def load_swarm_config
    return {} unless @session.configuration_path && File.exist?(@session.configuration_path)

    # Try to parse as JSON first
    config_content = File.read(@session.configuration_path)
    JSON.parse(config_content)
  rescue JSON::ParserError
    # If JSON parsing fails, try YAML
    require "yaml"
    YAML.load_file(@session.configuration_path) || {}
  rescue => e
    Rails.logger.error("Failed to load swarm config: #{e.message}")
    {}
  end
end
