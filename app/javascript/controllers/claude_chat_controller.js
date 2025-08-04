import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["messages", "input", "sendButton", "status", "form", "trackingIdField", "sessionIdField"]
  static values = { 
    projectId: String, 
    filePath: String,
    conversationId: String 
  }
  
  connect() {
    
    // Generate tracking ID if not present (use UUID format)
    if (!this.conversationIdValue || !this.isValidUUID(this.conversationIdValue)) {
      this.conversationIdValue = this.generateUUID()
    }
    
    // Store the tracking ID for channel subscription (never changes)
    this.trackingId = this.conversationIdValue
    this.sessionId = null  // Will be set when we get a response from Claude
    
    // Set initial tracking ID in form
    if (this.hasTrackingIdFieldTarget) {
      this.trackingIdFieldTarget.value = this.trackingId
    }
    
    // Listen for canvas refresh events
    this.handleCanvasRefresh = this.handleCanvasRefresh.bind(this)
    window.addEventListener('canvas:refresh', this.handleCanvasRefresh)
    
    // Listen for session updates from Claude
    this.handleSessionUpdate = this.handleSessionUpdate.bind(this)
    window.addEventListener('session:update', this.handleSessionUpdate)
    
    // Listen for chat completion
    this.handleChatComplete = this.handleChatComplete.bind(this)
    window.addEventListener('chat:complete', this.handleChatComplete)
    
    // Hide welcome message on first interaction
    this.welcomeHidden = false
    
    // Track if we're waiting for a response
    this.isWaitingForResponse = false
    
    // Set up mutation observer for auto-scroll
    this.setupAutoScroll()
  }
  
  disconnect() {
    window.removeEventListener('canvas:refresh', this.handleCanvasRefresh)
    window.removeEventListener('session:update', this.handleSessionUpdate)
    window.removeEventListener('chat:complete', this.handleChatComplete)
    
    // Clean up mutation observer
    if (this.messageObserver) {
      this.messageObserver.disconnect()
    }
  }
  
  handleCanvasRefresh(event) {
    if (event.detail?.filePath === this.filePathValue) {
      this.refreshCanvas()
    }
  }
  
  handleSessionUpdate(event) {
    // Store the session ID from Claude for resume functionality
    if (event.detail?.sessionId) {
      this.sessionId = event.detail.sessionId
      
      // Update the session ID field in the form for the next message
      if (this.hasSessionIdFieldTarget) {
        this.sessionIdFieldTarget.value = this.sessionId
      }
    }
  }
  
  handleChatComplete(event) {
    // Claude has finished responding
    this.isWaitingForResponse = false
    this.enableInput()
    this.updateStatus("Ready")
  }
  
  handleKeydown(event) {
    // Send on Cmd/Ctrl + Enter
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (!this.isWaitingForResponse) {
        this.formTarget.requestSubmit()
      }
    }
  }
  
  beforeSend() {
    // Don't send if already waiting for response
    if (this.isWaitingForResponse) {
      return false
    }
    
    this.isWaitingForResponse = true
    
    // Session ID field is already updated in handleSessionUpdate
    
    // Hide welcome message on first message
    if (!this.welcomeHidden) {
      const welcomeMessage = document.getElementById("welcome_message")
      if (welcomeMessage) {
        welcomeMessage.style.display = "none"
      }
      this.welcomeHidden = true
    }
    
    // Update status
    this.updateStatus("Claude is typing...")
    
    // Disable form while sending
    this.disableInput()
    
    return true
  }
  
  afterSend() {
    // Clear the input through direct access and through the target
    if (this.hasInputTarget) {
      this.inputTarget.value = ""
    }
    
    // Also try to clear via direct query selector as backup
    const textArea = this.element.querySelector('textarea[name="prompt"]')
    if (textArea) {
      textArea.value = ""
    }
    
    // Always scroll to bottom when user sends a message
    // This ensures they see their message and the response
    setTimeout(() => {
      this.scrollToBottom()
    }, 100)
    
    // Note: We don't re-enable input here anymore
    // It will be re-enabled when we receive the chat:complete event
  }
  
  disableInput() {
    this.inputTarget.disabled = true
    this.sendButtonTarget.disabled = true
    this.inputTarget.classList.add("opacity-50", "cursor-not-allowed")
    this.sendButtonTarget.classList.add("opacity-50", "cursor-not-allowed")
  }
  
  enableInput() {
    this.inputTarget.disabled = false
    this.sendButtonTarget.disabled = false
    this.inputTarget.classList.remove("opacity-50", "cursor-not-allowed")
    this.sendButtonTarget.classList.remove("opacity-50", "cursor-not-allowed")
    this.inputTarget.focus()
  }
  
  updateStatus(text) {
    if (this.hasStatusTarget) {
      this.statusTarget.textContent = text
      
      // Add animation class for typing status
      if (text.includes("typing")) {
        this.statusTarget.innerHTML = `
          <span class="flex items-center gap-1">
            ${text}
            <span class="flex gap-0.5">
              <span class="w-1 h-1 bg-orange-500 rounded-full animate-pulse"></span>
              <span class="w-1 h-1 bg-orange-500 rounded-full animate-pulse" style="animation-delay: 0.2s"></span>
              <span class="w-1 h-1 bg-orange-500 rounded-full animate-pulse" style="animation-delay: 0.4s"></span>
            </span>
          </span>
        `
      }
    }
  }
  
  setupAutoScroll() {
    if (!this.hasMessagesTarget) {
      // Try again after a short delay
      setTimeout(() => this.setupAutoScroll(), 100)
      return
    }
    
    // Create mutation observer to watch for new messages
    this.messageObserver = new MutationObserver((mutations) => {
      // Check if any actual nodes were added (not just text changes)
      const hasNewNodes = mutations.some(mutation => 
        mutation.type === 'childList' && mutation.addedNodes.length > 0
      )
      
      if (hasNewNodes) {
        this.autoScrollIfNeeded()
      }
    })
    
    // Observe changes to the messages container
    this.messageObserver.observe(this.messagesTarget, {
      childList: true,
      subtree: true
    })
    
    // Initially scroll to bottom if chat is empty or near bottom
    this.autoScrollIfNeeded()
  }
  
  getScrollContainer() {
    // The parent div with overflow-y-auto is the actual scroll container
    return this.messagesTarget.parentElement
  }
  
  isNearBottom() {
    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return true // Default to true if no container
    
    const threshold = 50 // pixels from bottom to consider "near bottom"
    
    // Check if scrolled near the bottom
    const scrollPosition = scrollContainer.scrollTop + scrollContainer.clientHeight
    const scrollHeight = scrollContainer.scrollHeight
    
    const nearBottom = scrollHeight - scrollPosition <= threshold
    
    return nearBottom
  }
  
  autoScrollIfNeeded() {
    if (!this.hasMessagesTarget) return
    
    // Add a small delay to ensure content is rendered
    setTimeout(() => {
      // Only scroll if user is already near the bottom
      if (this.isNearBottom()) {
        this.scrollToBottom()
      }
    }, 50)
  }
  
  scrollToBottom() {
    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return
    
    // Smooth scroll to bottom
    scrollContainer.scrollTo({
      top: scrollContainer.scrollHeight,
      behavior: 'smooth'
    })
  }
  
  refreshCanvas() {
    // Dispatch event to refresh the canvas
    const event = new CustomEvent('canvas:refresh', { 
      detail: { filePath: this.filePathValue }
    })
    window.dispatchEvent(event)
    
    // Show a notification that canvas was refreshed
    this.showNotification("Canvas refreshed with latest changes")
  }
  
  showNotification(message) {
    // Create a temporary notification
    const notification = document.createElement('div')
    notification.className = 'fixed bottom-4 right-4 z-50 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg transform transition-all translate-y-0 opacity-100'
    notification.textContent = message
    
    document.body.appendChild(notification)
    
    // Fade out and remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('translate-y-2', 'opacity-0')
      setTimeout(() => notification.remove(), 300)
    }, 3000)
  }
  
  generateConversationId() {
    return this.generateUUID()
  }
  
  generateUUID() {
    // Generate a proper UUID v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0
      const v = c === 'x' ? r : (r & 0x3 | 0x8)
      return v.toString(16)
    })
  }
  
  isValidUUID(str) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    return uuidRegex.test(str)
  }
}