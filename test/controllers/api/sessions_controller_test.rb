require "test_helper"

module Api
  class SessionsControllerTest < ActionDispatch::IntegrationTest
    setup do
      @session = create(:session)
      @directory = Dir.mktmpdir
      
      # Create test YAML files
      File.write(File.join(@directory, "test-swarm.yml"), <<~YAML)
        swarm:
          name: Test Swarm
          main: leader
          instances:
            leader:
              description: Main instance
              model: sonnet
      YAML
      
      File.write(File.join(@directory, "invalid.yml"), <<~YAML)
        not_a_swarm:
          something: else
      YAML
      
      File.write(File.join(@directory, "array-instances.yaml"), <<~YAML)
        swarm:
          name: Array Swarm
          instances:
            - name: worker1
              model: opus
            - name: worker2
              model: haiku
      YAML
    end
    
    teardown do
      FileUtils.rm_rf(@directory) if @directory && Dir.exist?(@directory)
    end
    
    test "should get index" do
      get api_sessions_url, as: :json
      assert_response :success
      
      json = JSON.parse(response.body)
      assert json["success"]
      assert_includes json["data"]["sessions"].map { |s| s["session_id"] }, @session.session_id
    end
    
    test "should filter sessions by status" do
      active_session = create(:session, status: "active")
      terminated_session = create(:session, status: "terminated")
      
      get api_sessions_url(status: "active"), as: :json
      assert_response :success
      
      json = JSON.parse(response.body)
      session_ids = json["data"]["sessions"].map { |s| s["session_id"] }
      assert_includes session_ids, active_session.session_id
      assert_not_includes session_ids, terminated_session.session_id
    end
    
    test "should discover config files" do
      get discover_api_sessions_url(directory_path: @directory), as: :json
      assert_response :success
      
      json = JSON.parse(response.body)
      assert json["success"]
      
      config_files = json["data"]["config_files"]
      assert_equal 2, config_files.size
      
      # Should include valid swarm configs
      paths = config_files.map { |f| f["relative_path"] }
      assert_includes paths, "test-swarm.yml"
      assert_includes paths, "array-instances.yaml"
      
      # Should not include invalid config
      assert_not_includes paths, "invalid.yml"
      
      # Should include swarm names
      names = config_files.map { |f| f["swarm_name"] }
      assert_includes names, "Test Swarm"
      assert_includes names, "Array Swarm"
    end
    
    test "should return empty array for non-existent directory" do
      get discover_api_sessions_url(directory_path: "/non/existent/path"), as: :json
      assert_response :success
      
      json = JSON.parse(response.body)
      assert_empty json["data"]["config_files"]
    end
    
    test "should discover sessions from filesystem" do
      # Create mock discovery service response
      session_path = "/path/to/session"
      SessionDiscoveryService.expects(:list_all_sessions).returns([
        {
          session_id: "20250101_120000",
          session_path: session_path,
          swarm_name: "Discovered Swarm",
          start_time: 1.hour.ago,
          metadata: { mode: "interactive" }
        }
      ])
      
      # Mock session monitor
      monitor = stub(active?: false)
      SessionMonitorService.expects(:new).with(session_path).returns(monitor)
      
      get discover_api_sessions_url, as: :json
      assert_response :success
      
      json = JSON.parse(response.body)
      assert_equal 1, json["data"]["discovered_sessions"].size
      assert_equal "20250101_120000", json["data"]["discovered_sessions"][0]["session_id"]
    end
  end
end