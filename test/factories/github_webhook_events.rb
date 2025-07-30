# frozen_string_literal: true

FactoryBot.define do
  factory :github_webhook_event do
    project
    event_type { "issue_comment" }
    enabled { true }

    trait :disabled do
      enabled { false }
    end

    trait :pull_request_review do
      event_type { "pull_request_review" }
    end

    trait :pull_request_review_comment do
      event_type { "pull_request_review_comment" }
    end
  end
end
