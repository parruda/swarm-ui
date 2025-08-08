# frozen_string_literal: true

require "test_helper"
require "tempfile"

class McpServersControllerTest < ActionDispatch::IntegrationTest
  setup do
    @mcp_server = create(:mcp_server)
    @stdio_server = create(:mcp_server, :stdio)
    @sse_server = create(:mcp_server, :sse)
  end

  # Index tests
  test "should get index" do
    get mcp_servers_url
    assert_response :success
    assert_select "h1", /MCP Servers/
  end

  test "index displays all servers" do
    get mcp_servers_url
    assert_response :success

    assert_select "h3 a", text: @mcp_server.name
    assert_select "h3 a", text: @stdio_server.name
    assert_select "h3 a", text: @sse_server.name
  end

  test "index filters by search query" do
    unique_server = create(:mcp_server, name: "unique_test_server", description: "Special server")

    get mcp_servers_url, params: { search: "unique" }
    assert_response :success

    assert_select "h3 a", text: unique_server.name
    assert_select "h3 a", text: @mcp_server.name, count: 0
  end

  test "index filters by tag" do
    tagged_server = create(:mcp_server, :with_tags)

    get mcp_servers_url, params: { tag: "development" }
    assert_response :success

    assert_select "h3 a", text: tagged_server.name
    assert_select "h3 a", text: @mcp_server.name, count: 0
  end

  test "index filters by server type" do
    get mcp_servers_url, params: { server_type: "sse" }
    assert_response :success

    assert_select "h3 a", text: @sse_server.name
    assert_select "h3 a", text: @stdio_server.name, count: 0
  end

  # Show tests
  test "should show mcp_server" do
    get mcp_server_url(@mcp_server)
    assert_response :success
    assert_select "h1", /#{@mcp_server.name}/
  end

  # New tests
  test "should get new" do
    get new_mcp_server_url
    assert_response :success
    assert_select "h1", /New MCP Server/
    assert_select "form"
  end

  # Edit tests
  test "should get edit" do
    get edit_mcp_server_url(@mcp_server)
    assert_response :success
    assert_select "h1", /Edit MCP Server/
    assert_select "form"
  end

  # Create tests
  test "should create stdio mcp_server" do
    assert_difference("McpServer.count") do
      post mcp_servers_url, params: {
        mcp_server: {
          name: "new_stdio_server",
          description: "Test STDIO server",
          server_type: "stdio",
          command: "/usr/bin/node",
          args: ["server.js"],
          env_text: "NODE_ENV=production\nDEBUG=true",
          tags_string: "nodejs, production",
        },
      }
    end

    assert_redirected_to mcp_server_url(McpServer.last)
    follow_redirect!
    assert_select "div", /MCP server was successfully created/

    server = McpServer.last
    assert_equal "new_stdio_server", server.name
    assert_equal "stdio", server.server_type
    assert_equal "/usr/bin/node", server.command
    assert_equal ["server.js"], server.args
    assert_equal({ "NODE_ENV" => "production", "DEBUG" => "true" }, server.env)
    assert_equal ["nodejs", "production"], server.tags
  end

  test "should create sse mcp_server" do
    assert_difference("McpServer.count") do
      post mcp_servers_url, params: {
        mcp_server: {
          name: "new_sse_server",
          description: "Test SSE server",
          server_type: "sse",
          url: "https://api.example.com/mcp",
          headers_text: "Authorization: Bearer token123\nContent-Type: application/json",
          tags_string: "api, remote",
        },
      }
    end

    assert_redirected_to mcp_server_url(McpServer.last)

    server = McpServer.last
    assert_equal "new_sse_server", server.name
    assert_equal "sse", server.server_type
    assert_equal "https://api.example.com/mcp", server.url
    assert_equal({ "Authorization" => "Bearer token123", "Content-Type" => "application/json" }, server.headers)
    assert_equal ["api", "remote"], server.tags
  end

  test "create with invalid params renders new" do
    assert_no_difference("McpServer.count") do
      post mcp_servers_url, params: {
        mcp_server: {
          name: "invalid-name!", # Invalid characters
          server_type: "stdio",
          # Missing required command for stdio
        },
      }
    end

    assert_response :unprocessable_entity
    assert_select "h1", /New MCP Server/
  end

  # Update tests
  test "should update mcp_server" do
    patch mcp_server_url(@mcp_server), params: {
      mcp_server: {
        description: "Updated description",
        tags_string: "updated, test",
      },
    }

    assert_redirected_to mcp_server_url(@mcp_server)
    @mcp_server.reload
    assert_equal "Updated description", @mcp_server.description
    assert_equal ["updated", "test"], @mcp_server.tags
  end

  test "update with invalid params renders edit" do
    patch mcp_server_url(@stdio_server), params: {
      mcp_server: {
        command: "", # Required field for stdio
      },
    }

    assert_response :unprocessable_entity
    assert_select "h1", /Edit MCP Server/
  end

  # Destroy tests
  test "should destroy mcp_server" do
    assert_difference("McpServer.count", -1) do
      delete mcp_server_url(@mcp_server)
    end

    assert_redirected_to mcp_servers_url
    follow_redirect!
    assert_select "div", /MCP server was successfully deleted/
  end

  # Duplicate tests
  test "should duplicate mcp_server" do
    assert_difference("McpServer.count", 1) do
      post duplicate_mcp_server_url(@mcp_server)
    end

    assert_redirected_to edit_mcp_server_url(McpServer.last)

    duplicated = McpServer.last
    assert_equal "#{@mcp_server.name}_copy", duplicated.name
    assert_equal @mcp_server.server_type, duplicated.server_type
    assert_equal @mcp_server.command, duplicated.command
  end

  test "duplicate generates unique name" do
    # Create first copy
    post duplicate_mcp_server_url(@mcp_server)
    first_copy = McpServer.last
    assert_equal "#{@mcp_server.name}_copy", first_copy.name

    # Create second copy
    post duplicate_mcp_server_url(@mcp_server)
    second_copy = McpServer.last
    assert_equal "#{@mcp_server.name}_copy_a", second_copy.name
  end

  # Export tests
  test "should export single server" do
    get export_mcp_server_url(@mcp_server, format: :json)
    assert_response :success

    assert_equal "application/json", response.content_type
    assert_includes response.headers["Content-Disposition"], "attachment"
    assert_includes response.headers["Content-Disposition"], "mcp_server_#{@mcp_server.name.parameterize}.json"

    json = JSON.parse(response.body)
    assert_equal @mcp_server.name, json["name"]
    assert_equal @mcp_server.server_type, json["server_type"]
  end

  test "should export all servers" do
    get export_all_mcp_servers_url(format: :json)
    assert_response :success

    assert_equal "application/json", response.content_type
    assert_includes response.headers["Content-Disposition"], "attachment"

    json = JSON.parse(response.body)
    assert_kind_of Array, json
    assert json.length >= 3 # At least our setup servers
  end

  # Import tests - Different MCP file formats
  test "imports SwarmUI native format single server" do
    file_content = {
      name: "swarmui_server",
      description: "Native format server",
      server_type: "stdio",
      command: "/usr/bin/python",
      args: ["-m", "server"],
      env: { "DEBUG" => "true" },
      tags: ["native"],
    }.to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 1) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)
    follow_redirect!
    assert_select("div", /Successfully imported 1 server/)

    server = McpServer.find_by(name: "swarmui_server")
    assert_not_nil(server)
    assert_equal("Native format server", server.description)
    assert_equal("stdio", server.server_type)
    assert_equal(["-m", "server"], server.args)
  ensure
    file&.close
    file&.unlink
  end

  test "imports SwarmUI native format array" do
    file_content = [
      {
        name: "server_one",
        server_type: "stdio",
        command: "/usr/bin/node",
      },
      {
        name: "server_two",
        server_type: "sse",
        url: "https://example.com/mcp",
      },
    ].to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 2) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)
    assert(McpServer.exists?(name: "server_one"))
    assert(McpServer.exists?(name: "server_two"))
  ensure
    file&.close
    file&.unlink
  end

  test "imports Cursor IDE format" do
    file_content = {
      "mcpServers" => {
        "vault-mcp" => {
          "type" => "streamable-http",
          "url" => "https://vault.example.com/mcp",
          "headers" => {
            "Authorization" => "Bearer token123",
          },
        },
        "data-portal-mcp" => {
          "type" => "stdio",
          "command" => "/opt/homebrew/bin/uvx",
          "args" => ["data-portal-mcp"],
          "env" => {},
        },
      },
    }.to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 2) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)

    # Check vault server (converted from streamable-http to sse)
    vault_server = McpServer.find_by(name: "vault_mcp")
    assert_not_nil(vault_server)
    assert_equal("sse", vault_server.server_type)
    assert_equal("https://vault.example.com/mcp", vault_server.url)
    assert_equal({ "Authorization" => "Bearer token123" }, vault_server.headers)
    assert_includes(vault_server.tags, "cursor-import")

    # Check data portal server
    data_server = McpServer.find_by(name: "data_portal_mcp")
    assert_not_nil(data_server)
    assert_equal("stdio", data_server.server_type)
    assert_equal("/opt/homebrew/bin/uvx", data_server.command)
    assert_equal(["data-portal-mcp"], data_server.args)
    assert_includes(data_server.tags, "cursor-import")
  ensure
    file&.close
    file&.unlink
  end

  test "imports VS Code format" do
    file_content = {
      "mcp" => {
        "servers" => {
          "time-server" => {
            "command" => "python",
            "args" => ["-m", "mcp_server_time"],
            "env" => { "PYTHONPATH" => "/usr/local/lib" },
          },
          "filesystem-server" => {
            "command" => "node",
            "args" => ["fs-server.js"],
            "env" => {},
          },
        },
        "inputs" => [],
      },
    }.to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 2) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)

    # Check time server
    time_server = McpServer.find_by(name: "time_server")
    assert_not_nil(time_server)
    assert_equal("stdio", time_server.server_type)
    assert_equal("python", time_server.command)
    assert_equal(["-m", "mcp_server_time"], time_server.args)
    assert_equal({ "PYTHONPATH" => "/usr/local/lib" }, time_server.env)
    assert_includes(time_server.tags, "vscode-import")

    # Check filesystem server
    fs_server = McpServer.find_by(name: "filesystem_server")
    assert_not_nil(fs_server)
    assert_equal("stdio", fs_server.server_type)
    assert_equal("node", fs_server.command)
    assert_includes(fs_server.tags, "vscode-import")
  ensure
    file&.close
    file&.unlink
  end

  test "import handles duplicate names" do
    create(:mcp_server, name: "duplicate_test")

    file_content = {
      name: "duplicate_test",
      server_type: "stdio",
      command: "/usr/bin/test",
    }.to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 1) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)

    # Should create with _copy suffix
    imported = McpServer.find_by(name: "duplicate_test_copy")
    assert_not_nil(imported)
  ensure
    file&.close
    file&.unlink
  end

  test "import handles invalid JSON" do
    file = Tempfile.new(["import", ".json"])
    file.write("{ invalid json }")
    file.rewind

    assert_no_difference("McpServer.count") do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)
    follow_redirect!
    assert_select("div", /Invalid JSON file/)
  ensure
    file&.close
    file&.unlink
  end

  test "import handles missing file" do
    post import_mcp_servers_url

    assert_redirected_to mcp_servers_url
    follow_redirect!
    assert_select "div", /Please select a file to import/
  end

  test "import reports partial success with errors" do
    file_content = [
      {
        name: "valid_server",
        server_type: "stdio",
        command: "/usr/bin/test",
      },
      {
        name: "missing_command_server",
        server_type: "stdio",
        # Missing required command for stdio type
      },
    ].to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 1) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)
    follow_redirect!
    assert_select("div", /Imported 1 server.*Errors:/)

    assert(McpServer.exists?(name: "valid_server"))
    assert_not(McpServer.exists?(name: "missing_command_server"))
  ensure
    file&.close
    file&.unlink
  end

  test "imports Cursor format with nil mcpServers value" do
    file_content = {
      "mcpServers" => nil,
    }.to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_no_difference("McpServer.count") do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)
    follow_redirect!
    assert_select("div", /Successfully imported 0 server/)
  ensure
    file&.close
    file&.unlink
  end

  test "imports VS Code format with SSE servers" do
    file_content = {
      "mcp" => {
        "servers" => {
          "api-server" => {
            "url" => "https://api.example.com/sse",
            "headers" => {
              "Authorization" => "Bearer secret",
            },
            "env" => {
              "API_KEY" => "xyz123",
            },
          },
          "stdio-server" => {
            "command" => "node",
            "args" => ["server.js"],
          },
        },
      },
    }.to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 2) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)

    # Check SSE server is correctly detected
    api_server = McpServer.find_by(name: "api_server")
    assert_not_nil(api_server)
    assert_equal("sse", api_server.server_type)
    assert_equal("https://api.example.com/sse", api_server.url)
    assert_equal({ "Authorization" => "Bearer secret" }, api_server.headers)
    assert_equal({ "API_KEY" => "xyz123" }, api_server.env)

    # Check stdio server
    stdio_server = McpServer.find_by(name: "stdio_server")
    assert_not_nil(stdio_server)
    assert_equal("stdio", stdio_server.server_type)
    assert_equal("node", stdio_server.command)
  ensure
    file&.close
    file&.unlink
  end

  test "import handles file size limit" do
    large_data = {
      name: "test_server",
      server_type: "stdio",
      command: "/usr/bin/test",
      description: "x" * (11 * 1024 * 1024), # More than 10MB
    }

    file = Tempfile.new(["import", ".json"])
    file.write(large_data.to_json)
    file.rewind

    assert_no_difference("McpServer.count") do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)
    follow_redirect!
    assert_select("div", /File size exceeds maximum/)
  ensure
    file&.close
    file&.unlink
  end

  test "import sanitizes names with uppercase and special characters" do
    file_content = [
      {
        name: "Test-Server.123",
        server_type: "stdio",
        command: "/usr/bin/test",
      },
      {
        name: "UPPERCASE_SERVER",
        server_type: "stdio",
        command: "/usr/bin/test",
      },
      {
        name: "123-starts-with-number",
        server_type: "stdio",
        command: "/usr/bin/test",
      },
    ].to_json

    file = Tempfile.new(["import", ".json"])
    file.write(file_content)
    file.rewind

    assert_difference("McpServer.count", 3) do
      post(import_mcp_servers_url, params: {
        file: Rack::Test::UploadedFile.new(file.path, "application/json"),
      })
    end

    assert_redirected_to(mcp_servers_url)

    # Check names were sanitized correctly (numbers removed)
    assert(McpServer.exists?(name: "test_server"))
    assert(McpServer.exists?(name: "uppercase_server"))
    assert(McpServer.exists?(name: "starts_with_number"))
  ensure
    file&.close
    file&.unlink
  end

  # Parameter filtering tests
  test "create filters unpermitted parameters" do
    assert_difference("McpServer.count", 1) do
      post mcp_servers_url, params: {
        mcp_server: {
          name: "filtered_server",
          server_type: "stdio",
          command: "/usr/bin/test",
          id: 999, # Should be ignored
          created_at: Time.current, # Should be ignored
          updated_at: Time.current, # Should be ignored
        },
      }
    end

    server = McpServer.last
    assert_not_equal 999, server.id
    assert_equal "filtered_server", server.name
  end

  # Routes tests
  test "mcp server routes" do
    assert_routing(
      { method: "get", path: "/mcp_servers" },
      { controller: "mcp_servers", action: "index" },
    )
    assert_routing(
      { method: "get", path: "/mcp_servers/new" },
      { controller: "mcp_servers", action: "new" },
    )
    assert_routing(
      { method: "post", path: "/mcp_servers" },
      { controller: "mcp_servers", action: "create" },
    )
    assert_routing(
      { method: "get", path: "/mcp_servers/1" },
      { controller: "mcp_servers", action: "show", id: "1" },
    )
    assert_routing(
      { method: "get", path: "/mcp_servers/1/edit" },
      { controller: "mcp_servers", action: "edit", id: "1" },
    )
    assert_routing(
      { method: "patch", path: "/mcp_servers/1" },
      { controller: "mcp_servers", action: "update", id: "1" },
    )
    assert_routing(
      { method: "delete", path: "/mcp_servers/1" },
      { controller: "mcp_servers", action: "destroy", id: "1" },
    )
  end

  test "custom mcp server routes" do
    assert_routing(
      { method: "post", path: "/mcp_servers/1/duplicate" },
      { controller: "mcp_servers", action: "duplicate", id: "1" },
    )
    assert_routing(
      { method: "get", path: "/mcp_servers/1/export" },
      { controller: "mcp_servers", action: "export", id: "1" },
    )
    assert_routing(
      { method: "get", path: "/mcp_servers/export_all" },
      { controller: "mcp_servers", action: "export_all" },
    )
    assert_routing(
      { method: "post", path: "/mcp_servers/import" },
      { controller: "mcp_servers", action: "import" },
    )
  end
end
