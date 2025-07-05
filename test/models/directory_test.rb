require "test_helper"

class DirectoryTest < ActiveSupport::TestCase
  # Test validations
  test "should be valid with valid attributes" do
    directory = build(:directory)
    assert directory.valid?
  end
  
  test "should require path" do
    directory = build(:directory, path: nil)
    assert_not directory.valid?
    assert_includes directory.errors[:path], "can't be blank"
  end
  
  test "should require unique path" do
    existing_directory = create(:directory)
    duplicate_directory = build(:directory, path: existing_directory.path)
    assert_not duplicate_directory.valid?
    assert_includes duplicate_directory.errors[:path], "has already been taken"
  end
  
  test "path can be any valid directory path" do
    paths = [
      "/Users/testuser/projects",
      "/home/user/code",
      "/var/www/apps",
      "~/projects/myapp",
      "/opt/applications"
    ]
    
    paths.each do |path|
      directory = build(:directory, path: path)
      assert directory.valid?, "Should accept #{path} as valid path"
    end
  end
  
  # Test associations
  test "belongs to default_swarm_configuration optionally" do
    directory = create(:directory, default_swarm_configuration: nil)
    assert directory.valid?
    assert_nil directory.default_swarm_configuration
  end
  
  test "can have a default_swarm_configuration" do
    config = create(:swarm_configuration)
    directory = create(:directory, default_swarm_configuration: config)
    assert_equal config, directory.default_swarm_configuration
  end
  
  # Test attributes
  test "has name attribute" do
    directory = create(:directory, name: "My Project")
    assert_equal "My Project", directory.name
  end
  
  test "has is_git_repository boolean attribute" do
    directory = create(:directory, is_git_repository: true)
    assert directory.is_git_repository
    
    directory = create(:directory, is_git_repository: false)
    assert_not directory.is_git_repository
  end
  
  test "has last_accessed_at timestamp" do
    time = 2.hours.ago
    directory = create(:directory, last_accessed_at: time)
    assert_in_delta time.to_i, directory.last_accessed_at.to_i, 1
  end
  
  # Test traits
  test "git_repo trait sets is_git_repository to true" do
    directory = create(:directory, :git_repo)
    assert directory.is_git_repository
  end
  
  test "with_default_config trait creates association" do
    directory = create(:directory, :with_default_config)
    assert_not_nil directory.default_swarm_configuration
    assert_kind_of SwarmConfiguration, directory.default_swarm_configuration
  end
  
  test "recently_accessed trait sets last_accessed_at to recent time" do
    directory = create(:directory, :recently_accessed)
    assert directory.last_accessed_at > 2.hours.ago
    assert directory.last_accessed_at < Time.current
  end
  
  test "old trait sets last_accessed_at to old time" do
    directory = create(:directory, :old)
    assert directory.last_accessed_at < 2.weeks.ago
  end
  
  # Test ordering and scopes (if any)
  test "directories can be ordered by last_accessed_at" do
    old_dir = create(:directory, last_accessed_at: 1.month.ago)
    recent_dir = create(:directory, last_accessed_at: 1.hour.ago)
    current_dir = create(:directory, last_accessed_at: Time.current)
    
    directories = Directory.order(last_accessed_at: :desc)
    
    assert_equal current_dir, directories.first
    assert_equal old_dir, directories.last
  end
  
  # Test default values
  test "is_git_repository defaults to false" do
    directory = Directory.new(path: "/test/path", name: "Test")
    assert_equal false, directory.is_git_repository
  end
  
  # Test path formats
  test "accepts absolute paths" do
    directory = build(:directory, path: "/usr/local/projects")
    assert directory.valid?
  end
  
  test "accepts home directory paths" do
    directory = build(:directory, path: "~/Documents/code")
    assert directory.valid?
  end
  
  test "accepts paths with spaces" do
    directory = build(:directory, path: "/Users/test user/My Projects")
    assert directory.valid?
  end
  
  # Test associations cascade
  test "can exist without default_swarm_configuration" do
    directory = create(:directory)
    config = create(:swarm_configuration)
    directory.update(default_swarm_configuration: config)
    
    # Deleting the config should nullify the association, not delete the directory
    config.destroy
    directory.reload
    
    assert_nil directory.default_swarm_configuration
    assert Directory.exists?(directory.id)
  end
  
  # Test multiple directories can reference same configuration
  test "multiple directories can have same default configuration" do
    config = create(:swarm_configuration)
    dir1 = create(:directory, default_swarm_configuration: config)
    dir2 = create(:directory, default_swarm_configuration: config)
    
    assert_equal config, dir1.default_swarm_configuration
    assert_equal config, dir2.default_swarm_configuration
  end
end