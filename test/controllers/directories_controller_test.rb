require "test_helper"

class DirectoriesControllerTest < ActionDispatch::IntegrationTest
  setup do
    @directory = create(:directory)
    @swarm_configuration = create(:swarm_configuration)
    
    # Create a real test directory
    @test_base = Rails.root.join('tmp', "test_dirs_#{SecureRandom.hex(8)}")
    FileUtils.mkdir_p(@test_base)
    
    @test_dir = @test_base.join('project1')
    FileUtils.mkdir_p(@test_dir)
    
    # Create a git repository test directory
    @git_dir = @test_base.join('git_project')
    FileUtils.mkdir_p(@git_dir)
    FileUtils.mkdir_p(File.join(@git_dir, '.git'))
  end

  teardown do
    FileUtils.rm_rf(@test_base) if @test_base && File.exist?(@test_base)
  end

  test "should get index" do
    get directories_url
    assert_response :success
    assert_not_nil assigns(:directories)
    assert_includes assigns(:directories), @directory
  end

  test "should get new" do
    get new_directory_url
    assert_response :success
    assert_not_nil assigns(:directory)
    assert_not_nil assigns(:swarm_configurations)
  end

  test "should create directory with valid path" do
    assert_difference('Directory.count', 1) do
      post directories_url, params: {
        directory: {
          path: @test_dir.to_s,
          name: "Test Project",
          default_swarm_configuration_id: @swarm_configuration.id
        }
      }
    end

    new_dir = Directory.last
    assert_redirected_to directory_path(new_dir)
    assert_equal @test_dir.to_s, new_dir.path
    assert_equal "Test Project", new_dir.name
    assert_not new_dir.is_git_repository
    assert_not_nil new_dir.last_accessed_at
  end

  test "should create directory and detect git repository" do
    # Ensure no directory exists with this path
    Directory.where(path: @git_dir.to_s).destroy_all
    
    assert_difference('Directory.count', 1) do
      post directories_url, params: {
        directory: {
          path: @git_dir.to_s
        }
      }
    end

    assert_redirected_to directory_path(Directory.last)
    
    new_dir = Directory.last
    assert new_dir.is_git_repository
    assert_equal "git_project", new_dir.name # Auto-set from basename
  end

  test "should not create directory with invalid path" do
    assert_no_difference('Directory.count') do
      post directories_url, params: {
        directory: {
          path: "/nonexistent/path/that/does/not/exist",
          name: "Invalid"
        }
      }
    end

    assert_response :success
    assert_template :new
    assert assigns(:directory).errors[:path].any?
  end

  test "should not create directory pointing to file" do
    # Create a file instead of directory
    file_path = Rails.root.join('tmp', 'test_file.txt')
    File.write(file_path, "test")

    assert_no_difference('Directory.count') do
      post directories_url, params: {
        directory: {
          path: file_path.to_s,
          name: "Not a directory"
        }
      }
    end

    assert_response :success
    assert_template :new
    assert assigns(:directory).errors[:path].any?
  ensure
    FileUtils.rm_f(file_path)
  end

  test "should show directory" do
    # Create some mock sessions for this directory
    session1 = create(:session, session_path: "#{@directory.path}/session1")
    session2 = create(:session, session_path: "#{@directory.path}/session2")
    
    # Create a config file
    config_file = File.join(@directory.path, 'claude-swarm.yml')
    FileUtils.mkdir_p(@directory.path)
    File.write(config_file, "test: config")
    
    original_accessed_at = @directory.last_accessed_at
    
    get directory_url(@directory)
    assert_response :success
    
    @directory.reload
    assert @directory.last_accessed_at > original_accessed_at if original_accessed_at
    
    sessions = assigns(:sessions)
    assert_includes sessions, session1
    assert_includes sessions, session2
    
    config_files = assigns(:config_files)
    assert_includes config_files, 'claude-swarm.yml'
  ensure
    FileUtils.rm_rf(@directory.path) if @directory.path && File.exist?(@directory.path)
  end

  test "should get edit" do
    get edit_directory_url(@directory)
    assert_response :success
    assert_not_nil assigns(:swarm_configurations)
  end

  test "should update directory" do
    original_accessed_at = @directory.last_accessed_at
    
    patch directory_url(@directory), params: {
      directory: {
        name: "Updated Name",
        default_swarm_configuration_id: @swarm_configuration.id
      }
    }

    assert_redirected_to @directory
    @directory.reload
    assert_equal "Updated Name", @directory.name
    assert_equal @swarm_configuration.id, @directory.default_swarm_configuration_id
    assert @directory.last_accessed_at > original_accessed_at if original_accessed_at
  end

  test "should not update directory with invalid params" do
    # Path should not be updatable through params
    original_path = @directory.path
    
    patch directory_url(@directory), params: {
      directory: {
        path: "/new/path"
      }
    }

    @directory.reload
    assert_equal original_path, @directory.path
  end

  test "should destroy directory" do
    assert_difference('Directory.count', -1) do
      delete directory_url(@directory)
    end

    assert_redirected_to directories_url
    assert_equal 'Directory was successfully removed from quick access.', flash[:notice]
  end

  test "should handle directory not found" do
    assert_raises(ActiveRecord::RecordNotFound) do
      get directory_url(id: 'nonexistent')
    end
  end

  test "should order directories by last accessed" do
    # Create directories with different access times
    old_dir = create(:directory, last_accessed_at: 3.days.ago)
    recent_dir = create(:directory, last_accessed_at: 1.hour.ago)
    current_dir = create(:directory, last_accessed_at: Time.current)
    
    get directories_url
    assert_response :success
    
    directories = assigns(:directories)
    # Most recently accessed should be first
    assert_equal current_dir, directories.first
    assert_equal old_dir, directories.last
  end

  test "should list config files in subdirectories" do
    # Create nested config files
    FileUtils.mkdir_p(File.join(@directory.path, 'subdir1'))
    FileUtils.mkdir_p(File.join(@directory.path, 'subdir2', 'nested'))
    
    File.write(File.join(@directory.path, 'claude-swarm.yml'), "root: config")
    File.write(File.join(@directory.path, 'subdir1', 'claude-swarm.yml'), "sub1: config")
    File.write(File.join(@directory.path, 'subdir2', 'nested', 'claude-swarm.yml'), "nested: config")
    
    get directory_url(@directory)
    assert_response :success
    
    config_files = assigns(:config_files)
    assert_equal 3, config_files.length
    assert_includes config_files, 'claude-swarm.yml'
    assert_includes config_files, 'subdir1/claude-swarm.yml'
    assert_includes config_files, 'subdir2/nested/claude-swarm.yml'
  ensure
    FileUtils.rm_rf(@directory.path) if @directory.path && File.exist?(@directory.path)
  end

  test "should set default name from path basename" do
    post directories_url, params: {
      directory: {
        path: @test_dir.to_s
        # Not providing name
      }
    }

    new_dir = Directory.last
    assert_equal "project1", new_dir.name
  end
end