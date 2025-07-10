# frozen_string_literal: true

FactoryBot.define do
  factory :project do
    sequence(:name) { |n| "Project #{n}" }
    sequence(:path) { |n| "/tmp/test_projects/project_#{n}_#{SecureRandom.hex(4)}" }
    vcs_type { "git" }
    default_use_worktree { false }
    archived { false }

    # Ensure the directory exists for tests
    after(:build) do |project|
      if project.path.present?
        FileUtils.mkdir_p(project.path)
        if project.git?
          FileUtils.mkdir_p(File.join(project.path, ".git"))
        end
      end
    end

    before(:create) do |project|
      if project.path.present?
        FileUtils.mkdir_p(project.path)
        if project.git?
          FileUtils.mkdir_p(File.join(project.path, ".git"))
        end
      end
    end

    trait :with_default_config do
      default_config_path { "claude-swarm.yml" }
    end

    trait :with_worktree do
      default_use_worktree { true }
    end

    trait :non_git do
      vcs_type { "none" }
      after(:build) do |project|
        # Remove .git directory if it exists
        git_dir = File.join(project.path, ".git")
        FileUtils.rm_rf(git_dir) if File.exist?(git_dir)
      end
    end

    trait :archived do
      archived { true }
    end

    trait :with_sessions do
      transient do
        sessions_count { 3 }
      end

      after(:create) do |project, evaluator|
        create_list(:session, evaluator.sessions_count, project: project)
        project.update_session_counts!
      end
    end

    trait :with_environment_variables do
      environment_variables do
        {
          "CLAUDE_API_KEY" => "test-key-123",
          "PROJECT_ENV" => "development",
        }
      end
    end

    trait :with_preferred_models do
      preferred_models do
        {
          "lead" => "opus",
          "worker" => "sonnet",
          "reviewer" => "haiku",
        }
      end
    end

    trait :with_metadata do
      last_session_at { 2.hours.ago }
      total_sessions_count { 10 }
      active_sessions_count { 2 }
    end
  end
end
