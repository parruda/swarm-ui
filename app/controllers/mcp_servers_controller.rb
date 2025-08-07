# frozen_string_literal: true

class McpServersController < ApplicationController
  before_action :set_mcp_server, only: [:show, :edit, :update, :destroy, :duplicate, :export]

  def index
    @mcp_servers = McpServer.ordered

    # Apply search filter
    if params[:search].present?
      @mcp_servers = @mcp_servers.search(params[:search])
    end

    # Apply tag filter
    if params[:tag].present?
      @mcp_servers = @mcp_servers.with_tag(params[:tag])
    end

    # Apply type filter
    if params[:server_type].present?
      @mcp_servers = @mcp_servers.by_type(params[:server_type])
    end

    # Get all unique tags for filtering
    @all_tags = McpServer.pluck(:tags).flatten.uniq.compact.sort

    respond_to do |format|
      format.html
      format.json { render(json: @mcp_servers.map(&:to_mcp_config)) }
    end
  end

  def show
    respond_to do |format|
      format.html
      format.json { render(json: @mcp_server.to_mcp_config) }
    end
  end

  def new
    @mcp_server = McpServer.new(server_type: "stdio")
  end

  def edit
  end

  def create
    @mcp_server = McpServer.new(mcp_server_params)

    if @mcp_server.save
      redirect_to(@mcp_server, notice: "MCP server was successfully created.")
    else
      render(:new, status: :unprocessable_entity)
    end
  end

  def update
    if @mcp_server.update(mcp_server_params)
      redirect_to(@mcp_server, notice: "MCP server was successfully updated.")
    else
      render(:edit, status: :unprocessable_entity)
    end
  end

  def destroy
    @mcp_server.destroy!
    redirect_to(mcp_servers_url, notice: "MCP server was successfully deleted.")
  end

  def duplicate
    @new_server = @mcp_server.duplicate

    if @new_server.save
      redirect_to(edit_mcp_server_path(@new_server), notice: "MCP server was successfully duplicated.")
    else
      redirect_to(@mcp_server, alert: "Failed to duplicate MCP server.")
    end
  end

  def export
    respond_to do |format|
      format.json do
        send_data(
          export_data(@mcp_server).to_json,
          filename: "mcp_server_#{@mcp_server.name.parameterize}.json",
          type: "application/json",
          disposition: "attachment",
        )
      end
    end
  end

  def export_all
    @mcp_servers = McpServer.ordered

    respond_to do |format|
      format.json do
        data = @mcp_servers.map { |server| export_data(server) }
        send_data(
          data.to_json,
          filename: "mcp_servers_export_#{Date.current}.json",
          type: "application/json",
          disposition: "attachment",
        )
      end
    end
  end

  def import
    unless params[:file].present?
      redirect_to(mcp_servers_path, alert: "Please select a file to import.")
      return
    end

    result = McpServerImporter.import(params[:file])

    if result[:success]
      flash[:notice] = "Successfully imported #{result[:imported_count]} server(s)."
    elsif result[:errors].any?
      flash[:alert] = if result[:imported_count] > 0
        "Imported #{result[:imported_count]} server(s). Errors: #{result[:errors].join(", ")}"
      else
        result[:errors].join(", ")
      end
    end

    redirect_to(mcp_servers_path)
  end

  private

  def set_mcp_server
    @mcp_server = McpServer.find(params[:id])
  end

  def mcp_server_params
    params.require(:mcp_server).permit(
      :name,
      :description,
      :server_type,
      :command,
      :url,
      :tags_string,
      args: [],
      env: {},
      headers: {},
    ).tap do |p|
      # Process arrays and hashes from form data
      if params[:mcp_server][:args].is_a?(String)
        p[:args] = params[:mcp_server][:args].split(",").map(&:strip).reject(&:blank?)
      end

      # Convert env from key=value text to hash
      if params[:mcp_server][:env_text].present?
        p[:env] = parse_env_text(params[:mcp_server][:env_text])
      end

      # Convert headers from key=value text to hash
      if params[:mcp_server][:headers_text].present?
        p[:headers] = parse_headers_text(params[:mcp_server][:headers_text])
      end
    end
  end

  def parse_env_text(text)
    text.split("\n").each_with_object({}) do |line, hash|
      next if line.strip.blank? || line.strip.start_with?("#")

      key, value = line.split("=", 2)
      hash[key.strip] = value&.strip if key.present?
    end
  end

  def parse_headers_text(text)
    text.split("\n").each_with_object({}) do |line, hash|
      next if line.strip.blank?

      key, value = line.split(":", 2)
      hash[key.strip] = value&.strip if key.present?
    end
  end

  def export_data(server)
    {
      name: server.name,
      description: server.description,
      server_type: server.server_type,
      command: server.command,
      url: server.url,
      args: server.args,
      env: server.env,
      headers: server.headers,
      tags: server.tags,
    }
  end
end
