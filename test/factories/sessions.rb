FactoryBot.define do
  factory :session do
    sequence(:session_id) { |n| Time.now.strftime("%Y%m%d_%H%M%S") + "_#{n}" }
    session_path { File.expand_path("~/.claude-swarm/sessions/#{session_id}") }
    status { "active" }
    mode { "interactive" }
    tmux_session { "claude-swarm-#{session_id}" }
    swarm_name { "test-swarm" }
    working_directory { "/tmp/test" }
    worktree_path { "/tmp/worktree" }
    
    swarm_configuration { nil }
    
    transient do
      configuration_hash { nil }
    end
    
    after(:build) do |session, evaluator|
      if evaluator.configuration_hash
        session.define_singleton_method(:configuration_hash) do
          evaluator.configuration_hash
        end
      end
    end
    
    trait :non_interactive do
      mode { "non-interactive" }
      tmux_session { nil }
      pid { 12345 }
      output_file { "/tmp/test_output.log" }
    end
    
    trait :completed do
      status { "completed" }
    end
    
    trait :with_configuration do
      association :swarm_configuration
    end
  end
end