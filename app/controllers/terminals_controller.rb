class TerminalsController < ApplicationController
  # GET /sessions/:session_id/terminal
  # Display terminal interface for interactive sessions
  def show
    @session = Session.find_by!(session_id: params[:session_id])
    
    # Verify session is in interactive mode
    if @session.mode != 'interactive'
      redirect_to session_path(@session.session_id), alert: 'Terminal is only available for interactive sessions.'
      return
    end
    
    # Check if tmux session exists
    if @session.tmux_session.present?
      tmux_exists = system("tmux has-session -t #{@session.tmux_session} 2>/dev/null")
      unless tmux_exists
        redirect_to session_path(@session.session_id), alert: 'Tmux session no longer exists.'
        return
      end
    else
      redirect_to session_path(@session.session_id), alert: 'No tmux session associated with this session.'
      return
    end
    
    # Pass session data to view for Stimulus controller initialization
    @terminal_config = {
      session_id: @session.session_id,
      tmux_session: @session.tmux_session,
      active: @session.active?
    }
  end
end