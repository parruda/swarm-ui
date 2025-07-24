import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  async pull(event) {
    event.preventDefault()
    event.stopPropagation() // Prevent dropdown from closing
    
    const button = event.currentTarget
    const directory = button.dataset.gitActionsDirectoryParam
    const instanceName = button.dataset.gitActionsInstanceParam
    const sessionId = button.dataset.gitActionsSessionParam
    
    // Disable button and show loading state
    const originalContent = button.innerHTML
    button.disabled = true
    button.innerHTML = `
      <svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Pulling...
    `
    
    try {
      const response = await fetch(`/sessions/${sessionId}/git_pull`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ directory, instance_name: instanceName })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success message
        this.showNotification(`Successfully pulled ${data.commits_pulled} commit${data.commits_pulled === 1 ? '' : 's'} for ${instanceName}`, 'success')
        
        // Trigger a git status refresh after a short delay
        setTimeout(() => {
          // The git status will be automatically updated by the background job
        }, 1000)
      } else {
        // Show error message
        this.showNotification(data.error || "Failed to pull changes", 'error')
        
        if (data.has_conflicts) {
          // Show additional help for conflicts
          this.showNotification("Please resolve conflicts using your preferred git tool", 'warning')
        }
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
    } finally {
      // Restore button
      button.disabled = false
      button.innerHTML = originalContent
    }
  }
  
  async push(event) {
    event.preventDefault()
    event.stopPropagation() // Prevent dropdown from closing
    
    const button = event.currentTarget
    const directory = button.dataset.gitActionsDirectoryParam
    const instanceName = button.dataset.gitActionsInstanceParam
    const sessionId = button.dataset.gitActionsSessionParam
    
    // Disable button and show loading state
    const originalContent = button.innerHTML
    button.disabled = true
    button.innerHTML = `
      <svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Pushing...
    `
    
    try {
      const response = await fetch(`/sessions/${sessionId}/git_push`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ directory, instance_name: instanceName })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success message
        this.showNotification(`Successfully pushed ${data.commits_pushed} commit${data.commits_pushed === 1 ? '' : 's'} for ${instanceName}`, 'success')
        
        // Trigger a git status refresh after a short delay
        setTimeout(() => {
          // The git status will be automatically updated by the background job
        }, 1000)
      } else {
        // Show error message
        this.showNotification(data.error || "Failed to push changes", 'error')
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
    } finally {
      // Restore button
      button.disabled = false
      button.innerHTML = originalContent
    }
  }
  
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg transform transition-all duration-300 translate-x-full`
    
    // Set color based on type
    const colors = {
      success: 'bg-green-500 text-white',
      error: 'bg-red-500 text-white',
      warning: 'bg-yellow-500 text-white',
      info: 'bg-blue-500 text-white'
    }
    
    notification.classList.add(...(colors[type] || colors.info).split(' '))
    
    notification.innerHTML = `
      <div class="flex items-center space-x-3">
        <span class="text-sm font-medium">${message}</span>
        <button class="ml-4 text-white/80 hover:text-white" data-action="click->git-actions#closeNotification">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    `
    
    // Add to DOM
    document.body.appendChild(notification)
    
    // Animate in
    requestAnimationFrame(() => {
      notification.classList.remove('translate-x-full')
    })
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      this.removeNotification(notification)
    }, 5000)
  }
  
  closeNotification(event) {
    const notification = event.currentTarget.closest('.fixed')
    this.removeNotification(notification)
  }
  
  removeNotification(notification) {
    notification.classList.add('translate-x-full')
    setTimeout(() => {
      notification.remove()
    }, 300)
  }
}