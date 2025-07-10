# frozen_string_literal: true

FactoryBot.define do
  factory :github_webhook_event do
    project
    event_type { "push" }
    enabled { true }
  end
end
