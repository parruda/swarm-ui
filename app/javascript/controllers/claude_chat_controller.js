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
    
    // Listen for Turbo Stream events to detect new messages
    this.handleTurboStreamRender = this.handleTurboStreamRender.bind(this)
    document.addEventListener('turbo:before-stream-render', this.handleTurboStreamRender)
    
    // Listen for chat tab becoming visible
    this.handleChatTabVisible = this.handleChatTabVisible.bind(this)
    window.addEventListener('chat:tabVisible', this.handleChatTabVisible)
    
    // Hide welcome message on first interaction
    this.welcomeHidden = false
    
    // Track if we're waiting for a response
    this.isWaitingForResponse = false
    
    // Set up auto-scroll after a small delay to ensure DOM is ready
    setTimeout(() => this.setupAutoScroll(), 100)
  }
  
  disconnect() {
    window.removeEventListener('canvas:refresh', this.handleCanvasRefresh)
    window.removeEventListener('session:update', this.handleSessionUpdate)
    window.removeEventListener('chat:complete', this.handleChatComplete)
    window.removeEventListener('chat:tabVisible', this.handleChatTabVisible)
    document.removeEventListener('turbo:before-stream-render', this.handleTurboStreamRender)
    
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
  
  handleTurboStreamRender(event) {
    // Check if this stream is for our chat
    const streamElement = event.target
    if (streamElement && streamElement.getAttribute('target') === 'chat_messages') {
      // Check if this is a user message (sent by us)
      const html = streamElement.innerHTML || ''
      const isUserMessage = html.includes('role="user"') || html.includes('bg-blue-600') || html.includes('text-right')
      
      if (isUserMessage) {
        // Force scroll for user messages
        requestAnimationFrame(() => {
          this.scrollToBottom()
          setTimeout(() => this.scrollToBottom(), 50)
          setTimeout(() => this.scrollToBottom(), 150)
        })
      } else {
        // Auto-scroll for other messages (only if near bottom)
        requestAnimationFrame(() => {
          setTimeout(() => {
            this.autoScrollIfNeeded()
          }, 50)
        })
      }
    }
  }
  
  handleChatTabVisible(event) {
    // When chat tab becomes visible, check if we should scroll
    setTimeout(() => {
      // Force recalculation of scroll position when tab becomes visible
      this.autoScrollIfNeeded()
    }, 100)
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
    
    // ALWAYS force scroll to bottom when user sends a message
    // Do it multiple times to ensure it happens after all DOM updates
    this.forceScrollToBottom()
    
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
      const hasNewNodes = mutations.some(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if any added nodes are actual elements (not text nodes)
          return Array.from(mutation.addedNodes).some(node => node.nodeType === Node.ELEMENT_NODE)
        }
        return false
      })
      
      if (hasNewNodes) {
        // Use requestAnimationFrame to ensure DOM is updated
        requestAnimationFrame(() => {
          setTimeout(() => {
            this.autoScrollIfNeeded()
          }, 50)
        })
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
    // Find the scroll container by looking for the overflow-y-auto class
    // Start from messages target and go up
    let element = this.messagesTarget
    while (element && element !== document.body) {
      const styles = window.getComputedStyle(element)
      if (styles.overflowY === 'auto' || styles.overflowY === 'scroll') {
        return element
      }
      element = element.parentElement
    }
    // Fallback to parent element
    return this.messagesTarget.parentElement
  }
  
  isNearBottom() {
    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return true // Default to true if no container
    
    const threshold = 100 // Increased threshold - pixels from bottom to consider "near bottom"
    
    // Check if scrolled near the bottom
    const scrollPosition = scrollContainer.scrollTop + scrollContainer.clientHeight
    const scrollHeight = scrollContainer.scrollHeight
    
    const distanceFromBottom = scrollHeight - scrollPosition
    const nearBottom = distanceFromBottom <= threshold
    
    // Debug logging
    if (this.debugScroll) {
      console.log('Scroll check:', {
        scrollTop: scrollContainer.scrollTop,
        clientHeight: scrollContainer.clientHeight,
        scrollHeight: scrollContainer.scrollHeight,
        distanceFromBottom,
        nearBottom,
        threshold
      })
    }
    
    return nearBottom
  }
  
  autoScrollIfNeeded() {
    if (!this.hasMessagesTarget) return
    
    // Check if we should scroll
    const shouldScroll = this.isNearBottom()
    
    if (shouldScroll) {
      // Scroll to bottom
      this.scrollToBottom()
    }
  }
  
  scrollToBottom() {
    const scrollContainer = this.getScrollContainer()
    if (!scrollContainer) return
    
    // Use instant scroll for better responsiveness
    scrollContainer.scrollTop = scrollContainer.scrollHeight
    
    // Alternatively, for smooth scrolling (may cause issues with rapid messages):
    // scrollContainer.scrollTo({
    //   top: scrollContainer.scrollHeight,
    //   behavior: 'smooth'
    // })
  }
  
  forceScrollToBottom() {
    // Force scroll to bottom multiple times to ensure it happens
    // This is used when user sends a message - we ALWAYS want to scroll
    
    // Immediate scroll
    this.scrollToBottom()
    
    // After next frame
    requestAnimationFrame(() => {
      this.scrollToBottom()
    })
    
    // After a short delay for DOM updates
    setTimeout(() => {
      this.scrollToBottom()
    }, 50)
    
    // After a longer delay for Turbo Stream updates
    setTimeout(() => {
      this.scrollToBottom()
    }, 200)
    
    // One more time after everything should be settled
    setTimeout(() => {
      this.scrollToBottom()
    }, 500)
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