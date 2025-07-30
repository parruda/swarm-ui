# frozen_string_literal: true

FactoryBot.define do
  factory :terminal_session do
    association :session
    sequence(:terminal_id) { |n| "terminal-#{n}-#{SecureRandom.hex(4)}" }
    sequence(:instance_name) { |n| "instance-#{n}" }
    sequence(:name) { |n| "Terminal #{n}" }
    directory { "/tmp/test" }
    status { "active" }
    opened_at { Time.current }

    trait :stopped do
      status { "stopped" }
      ended_at { opened_at + 30.minutes }
    end

    trait :with_path do
      directory { "/home/user/project/src" }
    end
  end
end
