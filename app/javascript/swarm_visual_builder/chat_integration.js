// Chat integration functionality for SwarmVisualBuilder
export default class ChatIntegration {
  constructor(controller) {
    this.controller = controller
  }

  // Switch to chat tab
  switchToChat() {
    if (!this.controller.hasChatTabTarget) return
    
    this.controller.chatTabTarget.classList.remove('hidden')
    this.controller.propertiesTabTarget.classList.add('hidden')
    this.controller.yamlPreviewTabTarget.classList.add('hidden')
    
    this.controller.chatTabButtonTarget.classList.add('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.controller.chatTabButtonTarget.classList.remove('text-gray-500', 'dark:text-gray-400')
    
    this.controller.propertiesTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.controller.propertiesTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    this.controller.yamlTabButtonTarget.classList.remove('text-orange-600', 'dark:text-orange-400', 'border-b-2', 'border-orange-600', 'dark:border-orange-400')
    this.controller.yamlTabButtonTarget.classList.add('text-gray-500', 'dark:text-gray-400')
    
    // Dispatch event to notify chat controller that tab is now visible
    window.dispatchEvent(new CustomEvent('chat:tabVisible'))
  }

  // Enable chat after saving file
  enableChatAfterSave(filePath) {
    // Find the chat tab element
    if (!this.controller.chatTabTarget) {
      return
    }
    
    // The chat controller might be on the chatTabTarget itself or a child
    let chatElement = this.controller.chatTabTarget.querySelector('[data-controller="claude-chat"]')
    if (!chatElement && this.controller.chatTabTarget.dataset.controller === 'claude-chat') {
      chatElement = this.controller.chatTabTarget
    }
    
    if (!chatElement) {
      return
    }
    
    const chatController = this.controller.application.getControllerForElementAndIdentifier(chatElement, 'claude-chat')
    if (!chatController) {
      return
    }
    
    // Update the file path value in the chat controller
    chatController.filePathValue = filePath
    
    // Update the project ID in the chat controller (in case it wasn't set)
    if (this.controller.projectIdValue) {
      chatController.projectIdValue = this.controller.projectIdValue
    }
    
    // Update the hidden form fields
    const filePathField = chatElement.querySelector('input[name="file_path"]')
    if (filePathField) {
      filePathField.value = filePath
    }
    
    const projectIdField = chatElement.querySelector('input[name="project_id"]')
    if (projectIdField && this.controller.projectIdValue) {
      projectIdField.value = this.controller.projectIdValue
    }
    
    // Update the status text
    const statusElement = chatElement.querySelector('[data-claude-chat-target="status"]')
    if (statusElement) {
      statusElement.textContent = 'Ready'
    }
    
    // Check if the chat controller is waiting for a response
    const isWaitingForResponse = chatController.isWaitingForResponse || false
    
    // Always enable the input field (user can type while waiting)
    const inputElement = chatElement.querySelector('[data-claude-chat-target="input"]')
    if (inputElement) {
      inputElement.disabled = false
      inputElement.readOnly = false
      inputElement.placeholder = 'Ask Claude to help build your swarm... (⌘+Enter to send)'
      // Remove disabled styling classes
      inputElement.classList.remove('opacity-50', 'cursor-not-allowed')
    }
    
    // Only enable the send button if Claude is not currently processing
    if (!isWaitingForResponse) {
      // Enable the send button
      const sendButton = chatElement.querySelector('[data-claude-chat-target="sendButton"]')
      if (sendButton) {
        sendButton.disabled = false
        // Update classes for the submit button
        sendButton.classList.remove('opacity-50', 'cursor-not-allowed')
        if (!sendButton.classList.contains('hover:bg-orange-700')) {
          sendButton.classList.add('hover:bg-orange-700', 'dark:hover:bg-orange-700')
        }
      }
    }
    
    // Show the welcome message instead of the "save first" message
    const messagesElement = chatElement.querySelector('[data-claude-chat-target="messages"]')
    if (messagesElement) {
      // Check for the warning message (could be different selectors)
      const warningMessage = messagesElement.querySelector('.text-yellow-600, .text-yellow-400, [class*="yellow"]')
      if (warningMessage || messagesElement.textContent.includes('save') || messagesElement.textContent.includes('Save')) {
        messagesElement.innerHTML = `
          <div id="welcome_message" class="text-center py-8">
            <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600">
              <svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
                <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
              </svg>
            </div>
            <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-gray-100">Start a Conversation</h3>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
              Ask me to help you build your swarm configuration. I can add instances, configure connections, and explain best practices.
            </p>
          </div>
        `
      }
    }
    
    // Force re-evaluation of the chat controller's state
    if (chatController && typeof chatController.checkEnabledState === 'function') {
      chatController.checkEnabledState()
    }
    
    // Dispatch a custom event to notify that chat is now enabled
    chatElement.dispatchEvent(new CustomEvent('chat:enabled', { 
      detail: { filePath: filePath, projectId: this.controller.projectIdValue },
      bubbles: true 
    }))
  }

  // Notify chat about selection changes
  notifySelectionChange() {
    // Create event with selected nodes data
    const selectedNodesData = this.controller.selectedNodes.map(node => ({
      id: node.id,
      name: node.data.name || 'Unnamed Instance',
      model: node.data.model || 'Unknown Model',
      type: node.type
    }))
    
    // Dispatch event for chat controller to listen to
    window.dispatchEvent(new CustomEvent('nodes:selectionChanged', {
      detail: {
        selectedNodes: selectedNodesData,
        count: this.controller.selectedNodes.length
      }
    }))
  }

  // Get context for selected nodes
  getSelectedNodesContext() {
    // Return context string for selected nodes
    if (this.controller.selectedNodes.length === 0) return null
    
    const nodeDescriptions = this.controller.selectedNodes.map(node => {
      const name = node.data.name || 'Unnamed Instance'
      const model = node.data.model || 'Unknown Model'
      return `- ${name} (${model})`
    }).join('\n')
    
    return `\n\n[Context: This message is about the following selected instance${this.controller.selectedNodes.length > 1 ? 's' : ''}:\n${nodeDescriptions}]`
  }

  // Handle clear selection request from chat
  handleClearSelection() {
    this.controller.deselectAll()
  }
}