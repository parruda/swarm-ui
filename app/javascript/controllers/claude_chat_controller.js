import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["messages", "input", "sendButton", "status", "form", "trackingIdField", "sessionIdField", "nodeContextField"]
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
    this.selectedNodes = []  // Track selected nodes from visual builder
    
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
    
    // Listen for Claude status updates
    this.handleClaudeStatus = this.handleClaudeStatus.bind(this)
    window.addEventListener('claude:status', this.handleClaudeStatus)
    
    // Listen for Turbo Stream events to detect new messages
    this.handleTurboStreamRender = this.handleTurboStreamRender.bind(this)
    document.addEventListener('turbo:before-stream-render', this.handleTurboStreamRender)
    
    // Listen for Turbo form submission end to maintain disabled state
    this.handleTurboSubmitEnd = this.handleTurboSubmitEnd.bind(this)
    document.addEventListener('turbo:submit-end', this.handleTurboSubmitEnd)
    
    // Listen for chat tab becoming visible
    this.handleChatTabVisible = this.handleChatTabVisible.bind(this)
    window.addEventListener('chat:tabVisible', this.handleChatTabVisible)
    
    // Listen for node selection changes from visual builder
    this.handleNodeSelectionChange = this.handleNodeSelectionChange.bind(this)
    window.addEventListener('nodes:selectionChanged', this.handleNodeSelectionChange)
    
    // Listen for chat being enabled after file save
    this.handleChatEnabled = this.handleChatEnabled.bind(this)
    this.element.addEventListener('chat:enabled', this.handleChatEnabled)
    
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
    window.removeEventListener('claude:status', this.handleClaudeStatus)
    window.removeEventListener('chat:tabVisible', this.handleChatTabVisible)
    window.removeEventListener('nodes:selectionChanged', this.handleNodeSelectionChange)
    this.element.removeEventListener('chat:enabled', this.handleChatEnabled)
    document.removeEventListener('turbo:before-stream-render', this.handleTurboStreamRender)
    document.removeEventListener('turbo:submit-end', this.handleTurboSubmitEnd)
    
    // Clean up mutation observer
    if (this.messageObserver) {
      this.messageObserver.disconnect()
    }
  }
  
  handleCanvasRefresh(event) {
    // This event is dispatched when the canvas needs to be refreshed
    // The actual refresh is handled by swarm_visual_builder_controller
    // We just show a notification here
    if (event.detail?.filePath === this.filePathValue) {
      this.showNotification("Canvas refreshed with latest changes")
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
    console.log("Chat complete, setting isWaitingForResponse to false")
    this.isWaitingForResponse = false
    this.enableInput()
    this.updateStatus("Ready")
  }
  
  handleClaudeStatus(event) {
    // Handle status updates from Claude
    const status = event.detail?.status
    if (!status) return
    
    switch(status) {
      case 'working':
        this.updateStatus("Claude is working")
        break
      case 'tool_running':
        this.updateStatus("Running tool")
        break
      case 'thinking':
        this.updateStatus("Claude is thinking")
        break
      default:
        this.updateStatus(status)
    }
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
    // When chat tab becomes visible, focus on the input and check if we should scroll
    setTimeout(() => {
      // Focus on the message input
      if (this.hasInputTarget && !this.inputTarget.disabled) {
        this.inputTarget.focus()
      }
      
      // Force recalculation of scroll position when tab becomes visible
      this.autoScrollIfNeeded()
    }, 100)
  }
  
  handleTurboSubmitEnd(event) {
    // Check if this event is for our form
    const form = event.target
    if (!form || !this.element.contains(form)) {
      return
    }
    
    // If we're waiting for a response, ensure inputs stay disabled
    if (this.isWaitingForResponse) {
      // Turbo has just re-enabled the form, disable it again
      this.disableInput()
      
      // Do it again after a tiny delay to override any async re-enabling
      setTimeout(() => {
        if (this.isWaitingForResponse) {
          this.disableInput()
        }
      }, 1)
      
      // And once more to be absolutely sure
      setTimeout(() => {
        if (this.isWaitingForResponse) {
          this.disableInput()
        }
      }, 50)
    }
  }
  
  handleKeydown(event) {
    // Send on Cmd/Ctrl + Enter
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (!this.isWaitingForResponse) {
        this.formTarget.requestSubmit()
      } else {
        console.log("Blocked Cmd+Enter while waiting for response")
      }
    }
  }
  
  beforeSend() {
    console.log("=== SENDING MESSAGE ===")
    console.log("beforeSend called, isWaitingForResponse:", this.isWaitingForResponse)
    
    // Don't send if already waiting for response
    if (this.isWaitingForResponse) {
      console.log("Already waiting for response, blocking send")
      return false
    }
    
    console.log("Setting isWaitingForResponse to true")
    this.isWaitingForResponse = true
    
    // Session ID field is already updated in handleSessionUpdate
    
    // No need to modify input here - context is already in the hidden field
    
    // Hide welcome message on first message and expand sidebar
    if (!this.welcomeHidden) {
      const welcomeMessage = document.getElementById("welcome_message")
      if (welcomeMessage) {
        welcomeMessage.style.display = "none"
      }
      this.welcomeHidden = true
      
      // Expand the sidebar to max width on first message
      // Use a small delay to ensure DOM is ready
      setTimeout(() => {
        this.expandSidebarToMax()
      }, 100)
    }
    
    // Update status
    this.updateStatus("Claude is typing...")
    
    // Disable form while sending
    console.log("About to disable input from beforeSend")
    this.disableInput()
    
    // Verify it's actually disabled
    setTimeout(() => {
      console.log("Input disabled state:", this.inputTarget.disabled)
      console.log("Button disabled state:", this.sendButtonTarget.disabled)
    }, 10)
    
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
    
    // CRITICAL: Re-disable inputs after Turbo re-enables them
    // Turbo automatically re-enables form elements after submission
    // We need to override this behavior while waiting for Claude
    if (this.isWaitingForResponse) {
      // Immediate re-disable
      this.disableInput()
      
      // Re-disable after a short delay to override Turbo
      setTimeout(() => {
        if (this.isWaitingForResponse) {
          this.disableInput()
        }
      }, 10)
      
      // One more time to be sure
      setTimeout(() => {
        if (this.isWaitingForResponse) {
          this.disableInput()
        }
      }, 100)
    }
  }
  
  disableInput() {
    console.log("Disabling send button only")
    console.log("Send button target exists:", this.hasSendButtonTarget, this.sendButtonTarget)
    
    if (!this.hasSendButtonTarget) {
      console.error("Missing send button target! Cannot disable.")
      return
    }
    
    // Only disable the send button, keep input enabled for typing
    this.sendButtonTarget.disabled = true
    this.sendButtonTarget.classList.add("opacity-50", "cursor-not-allowed")
    
    // Change send button to show loading state
    const originalContent = this.sendButtonTarget.innerHTML
    this.sendButtonTarget.dataset.originalContent = originalContent
    this.sendButtonTarget.innerHTML = `
      <svg class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    `
  }
  
  enableInput() {
    console.log("Enabling send button")
    // Re-enable the send button
    this.sendButtonTarget.disabled = false
    this.sendButtonTarget.classList.remove("opacity-50", "cursor-not-allowed")
    
    // Restore original send button content
    if (this.sendButtonTarget.dataset.originalContent) {
      this.sendButtonTarget.innerHTML = this.sendButtonTarget.dataset.originalContent
      delete this.sendButtonTarget.dataset.originalContent
    }
    
    this.inputTarget.focus()
  }
  
  updateStatus(text) {
    if (this.hasStatusTarget) {
      // Add different styles based on status
      if (text.includes("typing") || text.includes("working") || text.includes("thinking")) {
        // Claude is actively working
        this.statusTarget.innerHTML = `
          <span class="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 font-medium">
            <span class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
            </span>
            ${text}
          </span>
        `
      } else if (text.includes("tool")) {
        // Running a tool
        this.statusTarget.innerHTML = `
          <span class="flex items-center gap-1.5 text-purple-600 dark:text-purple-400 font-medium">
            <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            ${text}
          </span>
        `
      } else if (text === "Ready") {
        this.statusTarget.innerHTML = `
          <span class="flex items-center gap-1.5 text-green-600 dark:text-green-400">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            ${text}
          </span>
        `
      } else {
        // Default status
        this.statusTarget.innerHTML = `
          <span class="text-gray-600 dark:text-gray-400">
            ${text}
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
  
  showNotification(message) {
    // Remove any existing notification
    const existingNotification = document.querySelector('.swarm-notification')
    if (existingNotification) {
      existingNotification.remove()
    }
    
    // Create notification at top of canvas
    const notification = document.createElement('div')
    notification.className = 'swarm-notification fixed top-20 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 transition-all duration-300 translate-y-0 opacity-100'
    notification.innerHTML = `
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
      </svg>
      <span class="font-medium">${message}</span>
    `
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
  
  expandSidebarToMax() {
    // Try direct approach first - find the sidebar element
    const sidebar = document.querySelector('[data-swarm-visual-builder-target="rightSidebar"]')
    if (sidebar) {
      const maxWidth = 800
      const currentWidth = sidebar.offsetWidth
      
      if (currentWidth < maxWidth) {
        sidebar.style.transition = 'width 0.3s ease-out'
        sidebar.style.width = `${maxWidth}px`
        
        setTimeout(() => {
          sidebar.style.transition = ''
        }, 300)
      }
    }
    
    // Also dispatch the event as backup
    window.dispatchEvent(new CustomEvent('sidebar:expandToMax'))
  }
  
  handleNodeSelectionChange(event) {
    // Update selected nodes from visual builder
    this.selectedNodes = event.detail.selectedNodes || []
    
    // Update visual indicator in chat panel
    this.updateSelectionIndicator()
    
    // Update hidden context field if it exists
    this.updateNodeContextField()
  }
  
  updateNodeContextField() {
    // Find or create hidden field for node context
    let contextField = this.element.querySelector('input[name="node_context"]')
    
    if (!contextField && this.hasFormTarget) {
      // Create the hidden field if it doesn't exist
      contextField = document.createElement('input')
      contextField.type = 'hidden'
      contextField.name = 'node_context'
      this.formTarget.appendChild(contextField)
    }
    
    if (contextField) {
      // Set the context value
      contextField.value = this.getSelectedNodesContextString()
    }
  }
  
  updateSelectionIndicator() {
    // Find or create selection indicator element
    let indicator = this.element.querySelector('[data-claude-chat-target="selectionIndicator"]')
    
    if (!indicator) {
      // Create indicator element if it doesn't exist
      const inputArea = this.element.querySelector('.border-t.border-gray-200')
      if (inputArea) {
        indicator = document.createElement('div')
        indicator.dataset.claudeChatTarget = 'selectionIndicator'
        indicator.className = 'px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20'
        inputArea.parentNode.insertBefore(indicator, inputArea)
      }
    }
    
    if (indicator) {
      if (this.selectedNodes.length > 0) {
        // Show selected nodes
        const nodeNames = this.selectedNodes.map(n => 
          `<span class="inline-flex items-center px-2 py-1 mr-2 text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200 rounded-md">
            ${n.name}
          </span>`
        ).join('')
        
        indicator.innerHTML = `
          <div class="flex items-center justify-between">
            <div class="flex items-center flex-wrap gap-1">
              <span class="text-xs font-medium text-gray-600 dark:text-gray-400 mr-2">Context:</span>
              ${nodeNames}
            </div>
            <button data-action="click->claude-chat#clearNodeContext" 
                    class="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
              Clear
            </button>
          </div>
        `
        indicator.style.display = 'block'
      } else {
        // Hide indicator when no nodes selected
        indicator.style.display = 'none'
      }
    }
  }
  
  getSelectedNodesContextString() {
    if (this.selectedNodes.length === 0) return ''
    
    const nodeDescriptions = this.selectedNodes.map(node => 
      `- ${node.name} (${node.model})`
    ).join('\n')
    
    return `\n\n[Context: This message is about the following selected instance${this.selectedNodes.length > 1 ? 's' : ''}:\n${nodeDescriptions}]`
  }
  
  clearNodeContext() {
    // Clear selected nodes
    this.selectedNodes = []
    
    // Update visual indicator
    this.updateSelectionIndicator()
    
    // Clear hidden field
    this.updateNodeContextField()
    
    // Notify visual builder to deselect all nodes
    window.dispatchEvent(new CustomEvent('chat:clearNodeSelection'))
  }
  
  handleChatEnabled(event) {
    // Chat has been enabled after file save
    // Update our values from the event
    if (event.detail?.filePath) {
      this.filePathValue = event.detail.filePath
    }
    if (event.detail?.projectId) {
      this.projectIdValue = event.detail.projectId
    }
    
    // Re-enable all form elements
    this.checkEnabledState()
    
    // Set up Turbo Stream subscription for real-time updates
    this.setupTurboStream()
  }
  
  async setupTurboStream() {
    // Check if Turbo Stream is already set up
    const existingStream = this.element.querySelector('turbo-cable-stream-source')
    if (existingStream) {
      return
    }
    
    // Only set up if we have the required values
    if (!this.projectIdValue || !this.conversationIdValue) {
      return
    }
    
    const streamName = `claude_chat_${this.projectIdValue}_${this.conversationIdValue}`
    
    try {
      // Get the signed stream name from the server
      const response = await fetch('/api/claude_chat/signed_stream_name', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]')?.content || ''
        },
        body: JSON.stringify({
          stream_name: streamName
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Create the turbo-cable-stream-source element
        const turboStream = document.createElement('turbo-cable-stream-source')
        turboStream.setAttribute('channel', 'Turbo::StreamsChannel')
        turboStream.setAttribute('signed-stream-name', data.signed_stream_name)
        
        // Insert it into the chat element
        this.element.insertBefore(turboStream, this.element.firstChild)
      } else {
        console.error('Failed to get signed stream name from server:', response.status)
        this.showError('Failed to set up real-time updates. Messages may not appear immediately.')
      }
    } catch (error) {
      console.error('Failed to set up Turbo Stream:', error)
      this.showError('Failed to set up real-time updates. Messages may not appear immediately.')
    }
  }
  
  showError(message) {
    // Show error message in the status area
    if (this.hasStatusTarget) {
      const originalText = this.statusTarget.textContent
      this.statusTarget.textContent = message
      this.statusTarget.classList.add('text-red-500')
      
      // Reset after 5 seconds
      setTimeout(() => {
        this.statusTarget.textContent = originalText
        this.statusTarget.classList.remove('text-red-500')
      }, 5000)
    }
    
    // Also show in messages area if available
    if (this.hasMessagesTarget) {
      const errorDiv = document.createElement('div')
      errorDiv.className = 'p-3 mb-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg'
      errorDiv.innerHTML = `
        <div class="flex items-center text-red-600 dark:text-red-400">
          <svg class="h-5 w-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
          <span class="text-sm">${message}</span>
        </div>
      `
      this.messagesTarget.appendChild(errorDiv)
      
      // Auto-remove after 10 seconds
      setTimeout(() => errorDiv.remove(), 10000)
    }
  }
  
  checkEnabledState() {
    // Check if we have the required values to enable chat
    const hasFilePath = this.filePathValue && this.filePathValue.length > 0
    
    // Input field management - only disabled if no file path
    if (this.hasInputTarget) {
      if (!hasFilePath) {
        this.inputTarget.disabled = true
        this.inputTarget.readOnly = true
        this.inputTarget.classList.add('opacity-50', 'cursor-not-allowed')
      } else {
        // Keep input enabled even when waiting for response (user can type)
        this.inputTarget.disabled = false
        this.inputTarget.readOnly = false
        this.inputTarget.classList.remove('opacity-50', 'cursor-not-allowed')
        this.inputTarget.placeholder = 'Ask Claude to help build your swarm... (⌘+Enter to send)'
      }
    }
    
    // Send button management - disabled if no file path OR waiting for response
    if (this.hasSendButtonTarget) {
      const buttonEnabled = hasFilePath && !this.isWaitingForResponse
      this.sendButtonTarget.disabled = !buttonEnabled
      
      if (buttonEnabled) {
        this.sendButtonTarget.classList.remove('opacity-50', 'cursor-not-allowed')
        this.sendButtonTarget.classList.add('hover:bg-orange-700', 'dark:hover:bg-orange-700')
      } else {
        this.sendButtonTarget.classList.add('opacity-50', 'cursor-not-allowed')
        this.sendButtonTarget.classList.remove('hover:bg-orange-700', 'dark:hover:bg-orange-700')
      }
    }
    
    // Update status
    if (this.hasStatusTarget) {
      if (this.isWaitingForResponse) {
        // Don't change status when waiting for response - it's managed by other methods
      } else {
        this.statusTarget.textContent = hasFilePath ? 'Ready' : 'Save file to enable chat'
      }
    }
    
    // Re-enable the form
    if (this.hasFormTarget) {
      const form = this.formTarget
      // Make sure form can be submitted
      form.querySelectorAll('input, textarea, button').forEach(el => {
        if (isEnabled && el.name !== 'authenticity_token') {
          el.removeAttribute('disabled')
        }
      })
    }
  }
}