# frozen_string_literal: true

FactoryBot.define do
  factory :github_webhook_process do
    project
    status { "stopped" }
    pid { nil }
    started_at { Time.current }
    stopped_at { Time.current + 1.minute }

    trait :running do
      status { "running" }
      pid { 12345 }
      stopped_at { nil }
    end

    trait :error do
      status { "error" }
    end
  end
end
