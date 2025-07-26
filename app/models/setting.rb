# frozen_string_literal: true

class Setting < ApplicationRecord
  encrypts :openai_api_key

  class << self
    # Singleton pattern - only one settings record
    def instance
      first_or_create!
    end

    # Convenience method to get the API key
    def openai_api_key
      instance.openai_api_key
    end

    # Convenience method to set the API key
    def openai_api_key=(value)
      instance.update!(openai_api_key: value)
    end

    # Convenience method to get the GitHub username
    def github_username
      instance.github_username
    end

    # Convenience method to set the GitHub username
    def github_username=(value)
      instance.update!(github_username: value)
    end

    # Check if GitHub username is configured
    def github_username_configured?
      instance.github_username.present?
    end
  end
end
