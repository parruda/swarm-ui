require "application_system_test_case"

class DirectoriesTest < ApplicationSystemTestCase
  setup do
    @directory = create(:directory, 
      path: "/home/user/projects/myapp",
      name: "My Application",
      is_git_repository: true
    )
    @swarm_config = create(:swarm_configuration, name: "Default Config")
    
    # Create test directories
    @test_dir = Rails.root.join('tmp', 'test_dirs', 'sample_project')
    @git_dir = Rails.root.join('tmp', 'test_dirs', 'git_project')
    
    FileUtils.mkdir_p(@test_dir)
    FileUtils.mkdir_p(@git_dir)
    FileUtils.mkdir_p(File.join(@git_dir, '.git'))
    
    # Create config files
    File.write(File.join(@test_dir, 'claude-swarm.yml'), "swarm:\n  name: Test")
  end

  teardown do
    FileUtils.rm_rf(Rails.root.join('tmp', 'test_dirs'))
  end

  test "viewing directories list" do
    visit directories_url
    
    assert_selector "h1", text: "Frequently Used Directories"
    assert_text "My Application"
    assert_text "/home/user/projects/myapp"
    assert_selector ".git-badge", text: "Git"
    
    # Should show last accessed time
    assert_text "Last accessed"
  end

  test "adding a new directory" do
    visit directories_url
    click_on "Add Directory"
    
    fill_in "Path", with: @test_dir.to_s
    fill_in "Name", with: "Sample Project"
    select "Default Config", from: "Default Configuration"
    
    click_on "Save Directory"
    
    assert_text "Directory was successfully added"
    assert_current_path directory_path(Directory.last)
    
    new_dir = Directory.last
    assert_equal @test_dir.to_s, new_dir.path
    assert_equal "Sample Project", new_dir.name
    assert_not new_dir.is_git_repository
  end

  test "adding a git repository" do
    visit new_directory_url
    
    fill_in "Path", with: @git_dir.to_s
    # Don't fill in name to test auto-naming
    
    click_on "Save Directory"
    
    assert_text "Directory was successfully added"
    
    new_dir = Directory.last
    assert_equal "git_project", new_dir.name # Auto-named from path
    assert new_dir.is_git_repository
  end

  test "handling invalid directory path" do
    visit new_directory_url
    
    fill_in "Path", with: "/this/path/does/not/exist"
    fill_in "Name", with: "Invalid Directory"
    
    click_on "Save Directory"
    
    assert_text "does not exist or is not accessible"
    assert_selector "form#new_directory"
  end

  test "viewing directory details" do
    # Create sessions and config files for this directory
    session1 = create(:session, 
      session_path: "#{@directory.path}/sessions/20250104_100000",
      swarm_name: "Test Session 1"
    )
    session2 = create(:session, 
      session_path: "#{@directory.path}/sessions/20250104_110000",
      swarm_name: "Test Session 2"
    )
    
    # Mock config files
    Dir.stubs(:glob).with(File.join(@directory.path, '**/claude-swarm.yml')).returns([
      File.join(@directory.path, 'claude-swarm.yml'),
      File.join(@directory.path, 'config/claude-swarm.yml')
    ])
    
    visit directory_url(@directory)
    
    assert_selector "h1", text: "My Application"
    assert_text @directory.path
    
    # Should show recent sessions
    assert_text "Recent Sessions"
    assert_text "Test Session 1"
    assert_text "Test Session 2"
    
    # Should show config files
    assert_text "Configuration Files"
    assert_text "claude-swarm.yml"
    assert_text "config/claude-swarm.yml"
    
    # Action buttons
    assert_link "Launch New Session"
    assert_link "Edit"
  end

  test "editing directory settings" do
    visit directory_url(@directory)
    click_on "Edit"
    
    fill_in "Name", with: "Updated Application"
    select "Default Config", from: "Default Configuration"
    
    click_on "Update Directory"
    
    assert_text "Directory was successfully updated"
    assert_current_path directory_path(@directory)
    
    @directory.reload
    assert_equal "Updated Application", @directory.name
    assert_equal @swarm_config.id, @directory.default_swarm_configuration_id
  end

  test "removing a directory" do
    visit directories_url
    
    within "#directory_#{@directory.id}" do
      accept_confirm do
        click_on "Remove"
      end
    end
    
    assert_text "Directory was successfully removed from quick access"
    assert_no_text "My Application"
  end

  test "launching session from directory" do
    visit directory_url(@directory)
    
    click_on "Launch New Session"
    
    # Should redirect to new session page with directory pre-filled
    assert_current_path new_session_path
    assert_field "Working Directory", with: @directory.path
  end

  test "directory picker in session creation" do
    visit new_session_url
    
    # The directory picker button should be present
    assert_selector "[data-controller='directory-picker']"
    
    # Current implementation is just an input field
    # Testing the actual picker would require JavaScript
    fill_in "Working Directory", with: @test_dir.to_s
    
    assert_field "Working Directory", with: @test_dir.to_s
  end

  test "recent directories ordering" do
    # Create directories with different access times
    old_dir = create(:directory, 
      name: "Old Project",
      path: "/old/project",
      last_accessed_at: 1.week.ago
    )
    recent_dir = create(:directory, 
      name: "Recent Project",
      path: "/recent/project",
      last_accessed_at: 1.hour.ago
    )
    
    visit directories_url
    
    # Recent should appear before old
    dirs = all(".directory-card")
    assert dirs[0].has_text?("Recent Project")
    assert dirs.last.has_text?("Old Project")
  end

  test "empty state for directories" do
    Directory.destroy_all
    
    visit directories_url
    
    assert_text "No directories added yet"
    assert_link "Add your first directory"
  end

  test "directory badges and indicators" do
    regular_dir = create(:directory, 
      name: "Regular Directory",
      path: "/regular/dir",
      is_git_repository: false
    )
    
    visit directories_url
    
    within "#directory_#{@directory.id}" do
      assert_selector ".badge", text: "Git"
    end
    
    within "#directory_#{regular_dir.id}" do
      assert_no_selector ".badge", text: "Git"
    end
  end

  test "default configuration association" do
    @directory.update!(default_swarm_configuration: @swarm_config)
    
    visit directory_url(@directory)
    
    assert_text "Default Configuration: Default Config"
    
    click_on "Launch New Session"
    
    # Should have the default config preselected
    assert_field "Saved Configuration", with: @swarm_config.id
  end

  test "quick access from session page" do
    session = create(:session, session_path: "#{@directory.path}/sessions/test")
    
    visit session_url(session.session_id)
    
    # Should show directory info
    assert_link @directory.name, href: directory_path(@directory)
  end
end