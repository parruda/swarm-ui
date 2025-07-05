class TestChannel < ApplicationCable::Channel
  def subscribed
    Rails.logger.info "TestChannel subscribed successfully!"
    stream_from "test_channel_#{params[:session_id]}" if params[:session_id]
    stream_from "test_channel_global"
    
    # Send initial message
    transmit({ message: "Welcome to TestChannel!", status: "connected" })
    
    Rails.logger.info "TestChannel streams set up"
  end

  def unsubscribed
    Rails.logger.info "TestChannel unsubscribed"
  end
  
  def receive(data)
    Rails.logger.info "TestChannel received: #{data.inspect}"
    transmit({ echo: data, timestamp: Time.now.to_i })
  end
end