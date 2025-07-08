# frozen_string_literal: true

class VersionChecker < ApplicationRecord
  # Ensure only one record exists
  validates :singleton_guard, uniqueness: true, inclusion: { in: [0] }

  before_validation :set_singleton_guard

  class << self
    def instance
      first_or_create!(singleton_guard: 0)
    end
  end

  def update_available?
    return false if remote_version.blank?

    Gem::Version.new(remote_version) > Gem::Version.new(SwarmUI.version)
  end

  def needs_check?
    checked_at.nil? || checked_at < 1.hour.ago
  end

  private

  def set_singleton_guard
    self.singleton_guard = 0
  end
end
