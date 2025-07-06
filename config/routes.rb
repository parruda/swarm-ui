Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Mount ActionCable
  mount ActionCable.server => '/cable'

  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  # Can be used by load balancers and uptime monitors to verify that the app is live.
  get "up" => "rails/health#show", as: :rails_health_check

  # Render dynamic PWA files from app/views/pwa/* (remember to link manifest in application.html.erb)
  # get "manifest" => "rails/pwa#manifest", as: :pwa_manifest
  # get "service-worker" => "rails/pwa#service_worker", as: :pwa_service_worker
  
  # Return empty service worker to avoid 404 errors
  get "service-worker.js" => proc { [200, { "Content-Type" => "text/javascript" }, [""]] }

  # Defines the root path route ("/")
  root "sessions#index"
  
  resources :sessions do
    collection do
      get :restore
      post :do_restore
    end
    member do
      get :logs
      get :output
    end
    resource :terminal, only: [:show] do
      get :test
      get :test2
    end
  end
  
  resources :configurations do
    member do
      post :clone
      get :export
    end
  end
  
  resources :instance_templates
  resources :directories
  
  # API endpoints for session discovery
  namespace :api do
    resources :sessions, only: [:index] do
      collection do
        get :discover
        get :browse_directory
      end
    end
  end
end
