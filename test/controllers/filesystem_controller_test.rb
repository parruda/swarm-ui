# frozen_string_literal: true

require "test_helper"

class FilesystemControllerTest < ActionDispatch::IntegrationTest
  setup do
    @test_dir = File.join(ENV["HOME"], "test_filesystem_#{SecureRandom.hex}")
    FileUtils.mkdir_p(@test_dir)

    # Create test directory structure
    FileUtils.mkdir_p(File.join(@test_dir, "subdir1"))
    FileUtils.mkdir_p(File.join(@test_dir, "subdir2"))
    FileUtils.touch(File.join(@test_dir, "file.txt")) # Should be ignored (not a directory)
    FileUtils.mkdir_p(File.join(@test_dir, ".hidden")) # Should be ignored (hidden)

    # Create a valid swarm config
    @valid_config = {
      "version" => 1,
      "swarm" => {
        "name" => "Test Swarm",
        "main" => "coordinator",
        "instances" => {
          "coordinator" => {
            "description" => "Main coordinator",
          },
          "worker" => {
            "description" => "Worker instance",
          },
        },
      },
    }

    # Create test YAML files
    FileUtils.mkdir_p(File.join(@test_dir, "configs"))
    File.write(File.join(@test_dir, "configs", "valid_swarm.yml"), @valid_config.to_yaml)
    File.write(File.join(@test_dir, "configs", "invalid.yaml"), "invalid: yaml")
    File.write(File.join(@test_dir, "configs", "not_swarm.yml"), { "foo" => "bar" }.to_yaml)
  end

  teardown do
    FileUtils.rm_rf(@test_dir) if File.exist?(@test_dir)
  end

  # Browse action tests
  test "browse returns directories in home directory" do
    get filesystem_browse_url, params: { path: @test_dir }
    assert_response :success

    json = JSON.parse(@response.body)
    assert_equal @test_dir, json["current_path"]

    # Should include subdirectories but not files or hidden directories
    entry_names = json["entries"].map { |e| e["name"] }
    assert_includes entry_names, "subdir1"
    assert_includes entry_names, "subdir2"
    assert_not_includes entry_names, "file.txt"
    assert_not_includes entry_names, ".hidden"

    # All entries should be directories
    json["entries"].each do |entry|
      assert entry["is_directory"]
    end
  end

  test "browse defaults to home directory when no path given" do
    get filesystem_browse_url
    assert_response :success

    json = JSON.parse(@response.body)
    assert_equal ENV["HOME"], json["current_path"]
  end

  test "browse denies access outside home directory" do
    get filesystem_browse_url, params: { path: "/etc" }
    assert_response :forbidden

    json = JSON.parse(@response.body)
    assert_equal "Access denied", json["error"]
  end

  test "browse handles non-existent path gracefully" do
    get filesystem_browse_url, params: { path: File.join(@test_dir, "nonexistent") }
    assert_response :success

    json = JSON.parse(@response.body)
    assert_empty json["entries"]
  end

  test "browse handles path traversal attempts" do
    get filesystem_browse_url, params: { path: "#{@test_dir}/../../../etc" }
    assert_response :forbidden

    json = JSON.parse(@response.body)
    assert_equal "Access denied", json["error"]
  end

  test "browse expands relative paths correctly" do
    # Change to test directory and use relative path
    Dir.chdir(@test_dir) do
      get filesystem_browse_url, params: { path: "." }
      assert_response :success

      json = JSON.parse(@response.body)
      # Should have expanded to full path
      assert json["current_path"].start_with?(ENV["HOME"])
    end
  end

  # Scan swarm configs tests
  test "scan_swarm_configs finds valid swarm config files" do
    get filesystem_scan_swarm_configs_url, params: { path: @test_dir }
    assert_response :success

    json = JSON.parse(@response.body)
    config_paths = json["configs"].map { |c| c["relative_path"] }

    assert_includes config_paths, "configs/valid_swarm.yml"
    assert_not_includes config_paths, "configs/invalid.yaml"
    assert_not_includes config_paths, "configs/not_swarm.yml"
  end

  test "scan_swarm_configs returns empty array for directory without configs" do
    empty_dir = File.join(@test_dir, "empty")
    FileUtils.mkdir_p(empty_dir)

    get filesystem_scan_swarm_configs_url, params: { path: empty_dir }
    assert_response :success

    json = JSON.parse(@response.body)
    assert_empty json["configs"]
  end

  test "scan_swarm_configs requires path parameter" do
    get filesystem_scan_swarm_configs_url
    assert_response :success

    json = JSON.parse(@response.body)
    assert_empty json["configs"]
  end

  test "scan_swarm_configs validates directory exists" do
    get filesystem_scan_swarm_configs_url, params: { path: File.join(@test_dir, "nonexistent") }
    assert_response :bad_request

    json = JSON.parse(@response.body)
    assert_equal "Invalid directory", json["error"]
  end

  test "scan_swarm_configs denies access outside home directory" do
    get filesystem_scan_swarm_configs_url, params: { path: "/etc" }
    assert_response :bad_request

    json = JSON.parse(@response.body)
    assert_equal "Invalid directory", json["error"]
  end

  test "scan_swarm_configs validates swarm config structure" do
    # Create configs with various invalid structures
    invalid_configs = {
      "no_version.yml" => { "swarm" => { "name" => "Test" } },
      "wrong_version.yml" => { "version" => 2, "swarm" => {} },
      "no_swarm.yml" => { "version" => 1 },
      "swarm_not_hash.yml" => { "version" => 1, "swarm" => "not a hash" },
      "no_name.yml" => { "version" => 1, "swarm" => { "main" => "test", "instances" => {} } },
      "no_main.yml" => { "version" => 1, "swarm" => { "name" => "Test", "instances" => {} } },
      "no_instances.yml" => { "version" => 1, "swarm" => { "name" => "Test", "main" => "test" } },
      "empty_instances.yml" => { "version" => 1, "swarm" => { "name" => "Test", "main" => "test", "instances" => {} } },
      "main_not_exist.yml" => {
        "version" => 1,
        "swarm" => {
          "name" => "Test",
          "main" => "missing",
          "instances" => { "other" => { "description" => "Other" } },
        },
      },
      "no_description.yml" => {
        "version" => 1,
        "swarm" => {
          "name" => "Test",
          "main" => "test",
          "instances" => { "test" => {} },
        },
      },
    }

    invalid_dir = File.join(@test_dir, "invalid_configs")
    FileUtils.mkdir_p(invalid_dir)

    invalid_configs.each do |filename, content|
      File.write(File.join(invalid_dir, filename), content.to_yaml)
    end

    get filesystem_scan_swarm_configs_url, params: { path: invalid_dir }
    assert_response :success

    json = JSON.parse(@response.body)
    # None of the invalid configs should be included
    assert_empty json["configs"]
  end

  test "scan_swarm_configs handles malformed YAML gracefully" do
    File.write(File.join(@test_dir, "configs", "malformed.yml"), "{ invalid yaml: }")

    get filesystem_scan_swarm_configs_url, params: { path: @test_dir }
    assert_response :success

    json = JSON.parse(@response.body)
    config_paths = json["configs"].map { |c| c["relative_path"] }

    # Should still return valid configs, ignoring malformed ones
    assert_includes config_paths, "configs/valid_swarm.yml"
    assert_not_includes config_paths, "configs/malformed.yml"
  end

  test "scan_swarm_configs returns full and relative paths" do
    get filesystem_scan_swarm_configs_url, params: { path: @test_dir }
    assert_response :success

    json = JSON.parse(@response.body)
    config = json["configs"].find { |c| c["relative_path"] == "configs/valid_swarm.yml" }

    assert_not_nil config
    assert_equal File.join(@test_dir, "configs", "valid_swarm.yml"), config["path"]
    assert_equal "configs/valid_swarm.yml", config["relative_path"]
  end
end
