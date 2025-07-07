# frozen_string_literal: true

class InstanceTemplate < ApplicationRecord
  # Constants
  PROVIDERS = ["claude", "openai"].freeze
  CLAUDE_MODELS = ["opus", "sonnet", "haiku"].freeze
  OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "o1", "o1-mini", "o3-mini"].freeze
  API_VERSIONS = ["chat_completion", "responses"].freeze
  REASONING_EFFORTS = ["low", "medium", "high"].freeze

  # Validations
  validates :name, presence: true, uniqueness: true
  validates :provider, inclusion: { in: PROVIDERS }
  validates :model, presence: true
  validates :api_version, inclusion: { in: API_VERSIONS }, if: :openai?
  validates :reasoning_effort, inclusion: { in: REASONING_EFFORTS }, allow_nil: true
  validate :model_matches_provider
  validate :reasoning_effort_for_o_series_only

  # Scopes
  scope :claude, -> { where(provider: "claude") }
  scope :openai, -> { where(provider: "openai") }
  scope :with_worktree, -> { where(worktree: true) }
  scope :vibe_mode, -> { where(vibe: true) }

  # Instance methods
  def claude?
    provider == "claude"
  end

  def openai?
    provider == "openai"
  end

  def o_series?
    model&.start_with?("o1", "o3")
  end

  private

  def model_matches_provider
    return unless provider && model

    valid_models = claude? ? CLAUDE_MODELS : OPENAI_MODELS
    unless valid_models.include?(model)
      errors.add(:model, "#{model} is not valid for #{provider} provider")
    end
  end

  def reasoning_effort_for_o_series_only
    return unless reasoning_effort.present? && !o_series?

    errors.add(:reasoning_effort, "can only be set for o-series models")
  end
end
