# frozen_string_literal: true

require "test_helper"

class McpServerTest < ActiveSupport::TestCase
  test "valid mcp server" do
    mcp = McpServer.new(
      name: "test_server",
      server_type: "stdio",
      command: "test command",
    )
    assert mcp.valid?
  end

  test "name with lowercase letters and underscores is valid" do
    mcp = McpServer.new(
      name: "test_server_name",
      server_type: "stdio",
      command: "test command",
    )
    assert mcp.valid?
  end

  test "name with dashes is valid" do
    mcp = McpServer.new(
      name: "test-server-name",
      server_type: "stdio",
      command: "test command",
    )
    assert mcp.valid?
  end

  test "name with mixed dashes and underscores is valid" do
    mcp = McpServer.new(
      name: "test-server_name",
      server_type: "stdio",
      command: "test command",
    )
    assert mcp.valid?
  end

  test "name with uppercase letters is invalid" do
    mcp = McpServer.new(
      name: "TestServer",
      server_type: "stdio",
      command: "test command",
    )
    assert_not mcp.valid?
    assert_includes mcp.errors[:name], "can only contain lowercase letters, underscores, and dashes"
  end

  test "name with numbers is invalid" do
    mcp = McpServer.new(
      name: "test123",
      server_type: "stdio",
      command: "test command",
    )
    assert_not mcp.valid?
    assert_includes mcp.errors[:name], "can only contain lowercase letters, underscores, and dashes"
  end

  test "name with spaces is invalid" do
    mcp = McpServer.new(
      name: "test server",
      server_type: "stdio",
      command: "test command",
    )
    assert_not mcp.valid?
    assert_includes mcp.errors[:name], "can only contain lowercase letters, underscores, and dashes"
  end

  test "name with special characters is invalid" do
    mcp = McpServer.new(
      name: "test@server",
      server_type: "stdio",
      command: "test command",
    )
    assert_not mcp.valid?
    assert_includes mcp.errors[:name], "can only contain lowercase letters, underscores, and dashes"
  end

  test "name must be present" do
    mcp = McpServer.new(
      server_type: "stdio",
      command: "test command",
    )
    assert_not mcp.valid?
    assert_includes mcp.errors[:name], "can't be blank"
  end

  test "name must be unique" do
    McpServer.create!(
      name: "unique_name",
      server_type: "stdio",
      command: "test command",
    )

    mcp = McpServer.new(
      name: "unique_name",
      server_type: "stdio",
      command: "test command",
    )
    assert_not mcp.valid?
    assert_includes mcp.errors[:name], "has already been taken"
  end
end