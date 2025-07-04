import { Controller } from "@hotwired/stimulus"
import consumer from "../channels/consumer"

// Output viewer controller for non-interactive session output
// Streams and displays output from background Claude Swarm processes
export default class extends Controller {
  connect() {
    console.log("Output viewer controller connected")
    this.sessionId = this.element.dataset.sessionId
    this.outputContent = document.getElementById('output-content')
    this.autoScrollEnabled = true
    
    // Load existing output first
    this.loadExistingOutput()
    
    // Then set up streaming
    this.setupOutputStreaming()
  }

  disconnect() {
    if (this.subscription) {
      this.subscription.unsubscribe()
    }
  }

  // Set up WebSocket subscription for output streaming
  setupOutputStreaming() {
    if (!this.sessionId) {
      console.error("No session ID provided for output viewer")
      return
    }
    
    this.subscription = consumer.subscriptions.create(
      { 
        channel: "OutputChannel",
        session_id: this.sessionId 
      },
      {
        connected: () => {
          console.log("Output streaming connected")
        },
        
        disconnected: () => {
          console.log("Output streaming disconnected")
          this.showDisconnectionWarning()
        },
        
        received: (data) => {
          if (data.line) {
            this.appendLine(data.line)
          }
          if (data.status === 'completed') {
            this.markCompleted()
          }
        }
      }
    )
  }

  // Load existing output from the server
  async loadExistingOutput() {
    try {
      const response = await fetch(`/sessions/${this.sessionId}/output`)
      if (response.ok) {
        const text = await response.text()
        if (text && this.outputContent) {
          // Split by newlines and add each as a separate div
          const lines = text.split('\n')
          lines.forEach(line => {
            if (line) {
              const lineElement = document.createElement('div')
              lineElement.textContent = line
              lineElement.className = 'whitespace-pre-wrap'
              this.outputContent.appendChild(lineElement)
            }
          })
          this.scrollToBottom()
        }
      } else {
        console.error("Failed to load output:", response.statusText)
      }
    } catch (error) {
      console.error("Failed to load output:", error)
      this.showError("Failed to load existing output")
    }
  }

  // Append a new line of output
  appendLine(line) {
    if (this.outputContent) {
      const lineElement = document.createElement('div')
      lineElement.textContent = line
      lineElement.className = 'whitespace-pre-wrap'
      
      // Simple syntax highlighting for common patterns
      if (line.includes('ERROR') || line.includes('Error')) {
        lineElement.classList.add('text-red-400')
      } else if (line.includes('WARNING') || line.includes('Warning')) {
        lineElement.classList.add('text-yellow-400')
      } else if (line.includes('SUCCESS') || line.includes('✓')) {
        lineElement.classList.add('text-green-400')
      }
      
      this.outputContent.appendChild(lineElement)
      
      if (this.autoScrollEnabled) {
        this.scrollToBottom()
      }
    }
  }

  // Mark session as completed
  markCompleted() {
    const statusIndicator = this.element.querySelector('.animate-pulse')?.parentElement
    if (statusIndicator) {
      statusIndicator.innerHTML = '✓ Completed'
      statusIndicator.classList.remove('text-yellow-400')
      statusIndicator.classList.add('text-green-400')
    }
    
    // Add completion message to output
    this.appendLine('\n--- Session completed ---')
  }

  // Scroll to bottom of output
  scrollToBottom() {
    this.element.scrollTop = this.element.scrollHeight
  }

  // Show error message
  showError(message) {
    if (this.outputContent) {
      const errorElement = document.createElement('div')
      errorElement.textContent = `Error: ${message}`
      errorElement.className = 'text-red-400 font-semibold'
      this.outputContent.appendChild(errorElement)
    }
  }

  // Show disconnection warning
  showDisconnectionWarning() {
    const warningElement = document.createElement('div')
    warningElement.textContent = '⚠ Connection lost. Output streaming has stopped.'
    warningElement.className = 'text-yellow-400 font-semibold mt-2'
    
    if (this.outputContent) {
      this.outputContent.appendChild(warningElement)
    }
  }
}