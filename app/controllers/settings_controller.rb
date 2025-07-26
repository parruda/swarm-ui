# frozen_string_literal: true

class SettingsController < ApplicationController
  before_action :load_setting

  def edit
    # Show the settings form
  end

  def update
    if @setting.update(setting_params)
      redirect_to(edit_settings_path, notice: "Settings updated successfully.")
    else
      render(:edit, status: :unprocessable_entity)
    end
  end

  private

  def load_setting
    @setting = Setting.instance
  end

  def setting_params
    params.require(:setting).permit(:openai_api_key, :github_username)
  end
end
