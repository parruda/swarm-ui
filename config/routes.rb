# frozen_string_literal: true

Rails.application.routes.draw do
  root "sessions#index"
  
  resources :sessions, only: [:index, :new, :create, :show]
  
  # API endpoints for filesystem navigation
  namespace :api do
    resources :directories, only: [:index] do
      collection do
        get :swarm_files
      end
    end
    
    resource :file_browser, only: [] do
      get :browse
      get :search_swarm_files
    end
  end
  
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker

  # Defines the root path route ("/")
  # root "posts#index"
end
