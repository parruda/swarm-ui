FactoryBot.define do
  factory :directory do
    sequence(:path) { |n| File.expand_path("~/test_projects/project_#{n}") }
    sequence(:name) { |n| "Test Project #{n}" }
    is_git_repository { false }
    last_accessed_at { Time.current }
    
    # Git repository trait
    trait :git_repo do
      is_git_repository { true }
      path { File.expand_path("~/test_projects/git_repo_#{SecureRandom.hex(4)}") }
      name { "Git Repository" }
    end
    
    # Non-git directory trait
    trait :regular_directory do
      is_git_repository { false }
      path { File.expand_path("~/Documents/regular_project") }
      name { "Regular Project" }
    end
    
    # With default configuration
    trait :with_default_config do
      association :default_swarm_configuration, factory: :swarm_configuration
    end
    
    # Explicit trait without default configuration
    trait :without_default_config do
      default_swarm_configuration { nil }
    end
    
    # Access time traits
    trait :recently_accessed do
      last_accessed_at { 1.hour.ago }
    end
    
    trait :accessed_yesterday do
      last_accessed_at { 1.day.ago }
    end
    
    trait :old do
      last_accessed_at { 1.month.ago }
    end
    
    trait :never_accessed do
      last_accessed_at { nil }
    end
    
    # Real path traits
    trait :home_directory do
      path { File.expand_path("~") }
      name { "Home Directory" }
    end
    
    trait :tmp_directory do
      path { "/tmp/test_swarm_#{SecureRandom.hex(4)}" }
      name { "Temporary Directory" }
    end
    
    # With filesystem setup
    trait :with_files do
      after(:create) do |directory|
        FileUtils.mkdir_p(directory.path)
        
        if directory.is_git_repository
          # Initialize as git repository
          Dir.chdir(directory.path) do
            system("git init --quiet")
            File.write("README.md", "# #{directory.name}\n\nTest repository")
            system("git add . && git commit -m 'Initial commit' --quiet")
          end
        else
          # Just create some files
          File.write(File.join(directory.path, "README.md"), "# #{directory.name}\n\nTest project")
          FileUtils.mkdir_p(File.join(directory.path, "src"))
          File.write(File.join(directory.path, "src", "index.js"), "console.log('Hello World');")
        end
      end
      
      after(:build) do |directory|
        # Ensure the path is properly set for build operations
        directory.path ||= File.expand_path("~/test_projects/build_#{SecureRandom.hex(4)}")
      end
    end
  end
end