# frozen_string_literal: true

ENV["RAILS_ENV"] ||= "test"

# Configure ActiveRecord encryption for tests
# Need to set these before the Rails app loads
ENV["ACTIVE_RECORD_ENCRYPTION_PRIMARY_KEY"] = "test" * 8 # 32 bytes
ENV["ACTIVE_RECORD_ENCRYPTION_DETERMINISTIC_KEY"] = "test" * 8 # 32 bytes
ENV["ACTIVE_RECORD_ENCRYPTION_KEY_DERIVATION_SALT"] = "test" * 8 # 32 bytes

require_relative "../config/environment"
require "rails/test_help"
require "mocha/minitest"

module ActiveSupport
  class TestCase
    # Run tests in parallel with specified workers
    parallelize(workers: :number_of_processors)

    # Setup all fixtures in test/fixtures/*.yml for all tests in alphabetical order.
    fixtures :all

    # Add more helper methods to be used by all tests here...
    include FactoryBot::Syntax::Methods
  end
end
