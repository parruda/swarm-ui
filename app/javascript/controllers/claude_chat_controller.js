import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["messages", "input", "sendButton", "status", "form", "conversationIdField"]
  static values = { 
    projectId: String, 
    filePath: String,
    conversationId: String 
  }
  
  connect() {
    
    // Generate conversation ID if not present (use UUID format)
    if (!this.conversationIdValue || !this.isValidUUID(this.conversationIdValue)) {
      this.conversationIdValue = this.generateUUID()
      if (this.hasConversationIdFieldTarget) {
        this.conversationIdFieldTarget.value = this.conversationIdValue
      }
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
  }
  
  disconnect() {
    window.removeEventListener('canvas:refresh', this.handleCanvasRefresh)
    window.removeEventListener('session:update', this.handleSessionUpdate)
    window.removeEventListener('chat:complete', this.handleChatComplete)
  }
  
  handleCanvasRefresh(event) {
    if (event.detail?.filePath === this.filePathValue) {
      this.refreshCanvas()
    }
  }
  
  handleSessionUpdate(event) {
    // Update the conversation ID with the actual session ID from Claude
    if (event.detail?.sessionId) {
      this.conversationIdValue = event.detail.sessionId
      if (this.hasConversationIdFieldTarget) {
        this.conversationIdFieldTarget.value = event.detail.sessionId
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
    // Clear input immediately after sending
    this.inputTarget.value = ""
    
    // Scroll to bottom to see the new message
    this.scrollToBottom()
    
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
  
  scrollToBottom() {
    if (this.hasMessagesTarget) {
      // Smooth scroll to bottom
      this.messagesTarget.scrollTo({
        top: this.messagesTarget.scrollHeight,
        behavior: 'smooth'
      })
    }
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