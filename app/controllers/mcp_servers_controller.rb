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
      format.json {
        send_data export_data(@mcp_server).to_json,
                  filename: "mcp_server_#{@mcp_server.name.parameterize}.json",
                  type: 'application/json',
                  disposition: 'attachment'
      }
    end
  end

  def export_all
    @mcp_servers = McpServer.ordered
    
    respond_to do |format|
      format.json {
        data = @mcp_servers.map { |server| export_data(server) }
        send_data data.to_json,
                  filename: "mcp_servers_export_#{Date.current}.json",
                  type: 'application/json',
                  disposition: 'attachment'
      }
    end
  end

  def import
    unless params[:file].present?
      redirect_to mcp_servers_path, alert: "Please select a file to import."
      return
    end

    begin
      file = params[:file]
      json_content = file.read
      data = JSON.parse(json_content)
      
      # Handle both single object and array
      servers_data = data.is_a?(Array) ? data : [data]
      
      imported_count = 0
      errors = []
      
      servers_data.each do |server_data|
        result = import_server(server_data)
        if result[:success]
          imported_count += 1
        else
          errors << result[:error]
        end
      end
      
      if errors.any?
        flash[:alert] = "Imported #{imported_count} server(s). Errors: #{errors.join(', ')}"
      else
        flash[:notice] = "Successfully imported #{imported_count} server(s)."
      end
      
      redirect_to mcp_servers_path
    rescue JSON::ParserError => e
      redirect_to mcp_servers_path, alert: "Invalid JSON file: #{e.message}"
    rescue StandardError => e
      redirect_to mcp_servers_path, alert: "Import failed: #{e.message}"
    end
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
      tags: server.tags
    }
  end

  def import_server(data)
    # Check for duplicate name
    name = data['name'] || data[:name]
    
    if McpServer.exists?(name: name)
      name = "#{name}_imported"
      # Keep adding suffix until we find a unique name
      counter = 1
      while McpServer.exists?(name: name)
        name = "#{data['name'] || data[:name]}_imported_#{counter}"
        counter += 1
      end
    end
    
    server = McpServer.new(
      name: name,
      description: data['description'] || data[:description],
      server_type: data['server_type'] || data[:server_type] || 'stdio',
      command: data['command'] || data[:command],
      url: data['url'] || data[:url],
      args: data['args'] || data[:args] || [],
      env: data['env'] || data[:env] || {},
      headers: data['headers'] || data[:headers] || {},
      tags: data['tags'] || data[:tags] || []
    )
    
    if server.save
      { success: true, server: server }
    else
      { success: false, error: "#{name}: #{server.errors.full_messages.join(', ')}" }
    end
  end
end
