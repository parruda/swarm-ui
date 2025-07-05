import { Controller } from "@hotwired/stimulus"
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import consumer from "channels/consumer"

// Terminal controller for xterm.js integration
// Manages web-based terminal emulation for interactive Claude Swarm sessions
export default class extends Controller {
  connect() {
    console.log("Terminal controller connected")
    
    // Initialize the terminal
    this.terminal = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4'
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      lineHeight: 1.2
    })
    
    // Add addons
    this.fitAddon = new FitAddon()
    this.terminal.loadAddon(this.fitAddon)
    this.terminal.loadAddon(new WebLinksAddon())
    
    // Open terminal in container
    this.terminal.open(this.element)
    this.fitAddon.fit()
    
    // Remove loading spinner if present
    const loadingElement = this.element.querySelector('.text-center')
    if (loadingElement) {
      loadingElement.remove()
    }
    
    // Show initial message
    this.terminal.writeln('Connecting to terminal...')
    this.terminal.writeln('')
    
    // Set up WebSocket connection
    this.setupWebSocket()
    
    // Handle terminal input
    this.terminal.onData(data => {
      if (this.channel) {
        this.channel.perform('input', { 
          data: btoa(data) // Base64 encode
        })
      }
    })
    
    // Handle resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(this.element)
    
    // Initial resize
    this.handleResize()
  }

  disconnect() {
    console.log("Terminal controller disconnected")
    
    // Clean up resize observer
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
    
    // Unsubscribe from WebSocket
    if (this.subscription) {
      this.subscription.unsubscribe()
    }
    
    // Dispose terminal
    if (this.terminal) {
      this.terminal.dispose()
    }
  }

  // Set up WebSocket connection for terminal I/O
  setupWebSocket() {
    const sessionId = this.element.dataset.sessionId
    
    if (!sessionId) {
      console.error("No session ID provided for terminal")
      this.terminal.writeln('\r\n\x1b[31mError: No session ID provided\x1b[0m\r\n')
      return
    }
    
    console.log(`Creating WebSocket subscription for session: ${sessionId}`)
    
    this.subscription = consumer.subscriptions.create(
      { 
        channel: "TerminalChannel",
        session_id: sessionId 
      },
      {
        connected: () => {
          console.log("Terminal WebSocket connected")
          this.channel = this.subscription
          this.terminal.writeln('\r\n\x1b[32mWebSocket connected!\x1b[0m\r\n')
          
          // Send initial terminal size
          this.handleResize()
        },
        
        disconnected: () => {
          console.log("Terminal WebSocket disconnected")
          this.showConnectionError()
        },
        
        received: (data) => {
          console.log("Received data:", data)
          if (data.type === 'output') {
            const decoded = atob(data.data)
            this.terminal.write(decoded)
          } else if (data.type === 'error') {
            this.showError(data.message)
          }
        },
        
        rejected: () => {
          console.error("WebSocket subscription rejected")
          this.terminal.writeln('\r\n\x1b[31mWebSocket connection rejected by server\x1b[0m\r\n')
        }
      }
    )
  }

  // Handle terminal resize
  handleResize() {
    if (!this.fitAddon || !this.terminal) return
    
    try {
      this.fitAddon.fit()
      const dimensions = this.fitAddon.proposeDimensions()
      
      if (this.channel && dimensions) {
        this.channel.perform('resize', {
          cols: dimensions.cols,
          rows: dimensions.rows
        })
      }
    } catch (error) {
      console.error("Error resizing terminal:", error)
    }
  }

  // Show connection error
  showConnectionError() {
    this.terminal.writeln('\r\n\x1b[31mConnection lost. Please refresh the page.\x1b[0m\r\n')
  }

  // Show error message
  showError(message) {
    this.terminal.writeln(`\r\n\x1b[31mError: ${message}\x1b[0m\r\n`)
  }
}