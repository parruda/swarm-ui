# frozen_string_literal: true

FactoryBot.define do
  factory :swarm_template_instance do
    association :swarm_template
    association :instance_template
    sequence(:instance_key) { |n| "instance_#{("a".."z").to_a[n % 26]}" }
    sequence(:position) { |n| n }
    overrides { {} }

    trait :with_overrides do
      overrides do
        {
          "prompt" => "Overridden prompt",
          "model" => "opus",
          "tools" => ["Read", "Write"],
        }
      end
    end

    trait :with_connections do
      overrides do
        {
          "connections" => ["target_one", "target_two"],
        }
      end
    end

    trait :lead do
      instance_key { "lead" }
      position { 1 }
    end

    trait :worker do
      instance_key { "worker" }
      position { 2 }
    end
  end
end
