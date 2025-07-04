class DirectoriesController < ApplicationController
  before_action :set_directory, only: [:show, :edit, :update, :destroy]

  # GET /directories
  # List frequently used directories
  def index
    @directories = Directory.includes(:default_swarm_configuration)
                           .order(last_accessed_at: :desc)
  end

  # GET /directories/new
  # Form for adding a new directory
  def new
    @directory = Directory.new
    @swarm_configurations = SwarmConfiguration.order(:name)
  end

  # POST /directories
  # Save a new directory
  def create
    @directory = Directory.new(directory_params)
    
    # Check if path exists and is accessible
    if File.exist?(@directory.path) && File.directory?(@directory.path)
      # Detect if it's a Git repository
      @directory.is_git_repository = File.exist?(File.join(@directory.path, '.git'))
      
      # Set name from path if not provided
      @directory.name ||= File.basename(@directory.path)
      
      # Update last accessed time
      @directory.last_accessed_at = Time.current
      
      if @directory.save
        redirect_to @directory, notice: 'Directory was successfully added.'
      else
        @swarm_configurations = SwarmConfiguration.order(:name)
        render :new
      end
    else
      @directory.errors.add(:path, 'does not exist or is not accessible')
      @swarm_configurations = SwarmConfiguration.order(:name)
      render :new
    end
  end

  # GET /directories/:id
  # Show directory details
  def show
    # Update last accessed timestamp
    @directory.touch(:last_accessed_at)
    
    # Find sessions launched from this directory
    @sessions = Session.where("session_path LIKE ?", "#{@directory.path}%")
                      .order(created_at: :desc)
                      .limit(10)
    
    # List available config files
    @config_files = Dir.glob(File.join(@directory.path, '**/claude-swarm.yml'))
                       .map { |f| f.sub(@directory.path + '/', '') }
  end

  # GET /directories/:id/edit
  # Edit directory settings
  def edit
    @swarm_configurations = SwarmConfiguration.order(:name)
  end

  # PATCH/PUT /directories/:id
  # Update directory settings
  def update
    if @directory.update(directory_params)
      # Update last accessed timestamp
      @directory.touch(:last_accessed_at)
      redirect_to @directory, notice: 'Directory was successfully updated.'
    else
      @swarm_configurations = SwarmConfiguration.order(:name)
      render :edit
    end
  end

  # DELETE /directories/:id
  # Remove a directory from quick access
  def destroy
    @directory.destroy
    redirect_to directories_url, notice: 'Directory was successfully removed from quick access.'
  end

  private

  def set_directory
    @directory = Directory.find(params[:id])
  end

  def directory_params
    params.require(:directory).permit(:path, :name, :default_swarm_configuration_id)
  end
end