import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["buttonContainer"]
  
  connect() {
    // Find all buttons within this controller's element
    const commitButtons = this.element.querySelectorAll('[data-action*="git-actions#commit"]')
    const pullButtons = this.element.querySelectorAll('[data-action*="git-actions#pull"]')
    const pushButtons = this.element.querySelectorAll('[data-action*="git-actions#push"]')
  }
  
  async pull(event) {
    event.preventDefault()
    event.stopPropagation() // Prevent dropdown from closing
    
    const button = event.currentTarget
    const directory = button.dataset.gitActionsDirectoryParam
    const instanceName = button.dataset.gitActionsInstanceParam
    const sessionId = button.dataset.gitActionsSessionParam
    const statusId = button.dataset.gitActionsStatusIdParam
    
    // Disable button and show loading state with animation
    const originalContent = button.innerHTML
    button.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <span class="absolute inset-0 rounded-md bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-200"></span>
      <svg class="h-3.5 w-3.5 animate-spin relative inline-block" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="relative whitespace-nowrap">Pulling...</span>
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
        // Show success message with animation
        this.showNotification(`Successfully pulled ${data.commits_pulled} commit${data.commits_pulled === 1 ? '' : 's'} for ${instanceName}`, 'success')
        
        // Animate button success - keep blue color
        button.innerHTML = `
          <span class="absolute inset-0 rounded-md bg-white opacity-10"></span>
          <svg class="h-3.5 w-3.5 relative inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="relative whitespace-nowrap">Pulled!</span>
        `
        
        // After animation, disable the button with appropriate styling
        setTimeout(() => {
          // Transition to disabled state
          button.classList.remove('bg-blue-500', 'hover:bg-blue-600')
          button.classList.add('bg-gray-300', 'dark:bg-gray-600', 'cursor-not-allowed')
          button.disabled = true
          button.removeAttribute('data-action')
          button.innerHTML = `
            ${this.heroicon('arrow-down-tray', 'h-3.5 w-3.5')}
            <span>Pull</span>
          `
          button.title = "Nothing to pull"
          
          // Update the tooltip if it exists
          const tooltip = button.parentElement.querySelector('.absolute.bottom-full')
          if (tooltip) {
            tooltip.querySelector('span:last-child').textContent = "Nothing to pull"
            const icon = tooltip.querySelector('svg').parentElement
            icon.innerHTML = this.heroicon('check-circle', 'h-3.5 w-3.5 text-green-400')
          }
        }, 1500)
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
      // Restore button only if not successful
      if (!button.classList.contains('from-green-500')) {
        button.disabled = false
        button.classList.remove('animate-pulse')
        button.innerHTML = originalContent
      }
    }
  }
  
  async push(event) {
    event.preventDefault()
    event.stopPropagation() // Prevent dropdown from closing
    
    const button = event.currentTarget
    const directory = button.dataset.gitActionsDirectoryParam
    const instanceName = button.dataset.gitActionsInstanceParam
    const sessionId = button.dataset.gitActionsSessionParam
    const statusId = button.dataset.gitActionsStatusIdParam
    
    // Disable button and show loading state with animation
    const originalContent = button.innerHTML
    button.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <span class="absolute inset-0 rounded-md bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-200"></span>
      <svg class="h-3.5 w-3.5 animate-spin relative inline-block" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="relative whitespace-nowrap">Pushing...</span>
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
        // Show success message with animation
        this.showNotification(`Successfully pushed ${data.commits_pushed} commit${data.commits_pushed === 1 ? '' : 's'} for ${instanceName}`, 'success')
        
        // Animate button success - keep orange color
        button.innerHTML = `
          <span class="absolute inset-0 rounded-md bg-white opacity-10"></span>
          <svg class="h-3.5 w-3.5 relative inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="relative whitespace-nowrap">Pushed!</span>
        `
        
        // After animation, disable the button with appropriate styling
        setTimeout(() => {
          // Transition to disabled state
          button.classList.remove('bg-orange-900', 'hover:bg-orange-800')
          button.classList.add('bg-gray-300', 'dark:bg-gray-600', 'cursor-not-allowed')
          button.disabled = true
          button.removeAttribute('data-action')
          button.innerHTML = `
            ${this.heroicon('arrow-up-tray', 'h-3.5 w-3.5')}
            <span>Push</span>
          `
          button.title = "Nothing to push"
          
          // Update the tooltip if it exists
          const tooltip = button.parentElement.querySelector('.absolute.bottom-full')
          if (tooltip) {
            tooltip.querySelector('span:last-child').textContent = "Nothing to push"
            const icon = tooltip.querySelector('svg').parentElement
            icon.innerHTML = this.heroicon('check-circle', 'h-3.5 w-3.5 text-green-400')
          }
        }, 1500)
      } else {
        // Show error message
        this.showNotification(data.error || "Failed to push changes", 'error')
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
    } finally {
      // Restore button only if not successful
      if (!button.classList.contains('from-green-500')) {
        button.disabled = false
        button.classList.remove('animate-pulse')
        button.innerHTML = originalContent
      }
    }
  }
  
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 z-50 rounded-xl shadow-2xl transform transition-all duration-500 translate-x-full overflow-hidden`
    
    // Set color and icon based on type
    const styles = {
      success: {
        gradient: 'from-emerald-500 to-green-600',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
        ring: 'ring-2 ring-white/20'
      },
      error: {
        gradient: 'from-red-500 to-red-600',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
        ring: 'ring-2 ring-white/20'
      },
      warning: {
        gradient: 'from-amber-500 to-orange-600',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>',
        ring: 'ring-2 ring-white/20'
      },
      info: {
        gradient: 'from-blue-500 to-blue-600',
        icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
        ring: 'ring-2 ring-white/20'
      }
    }
    
    const style = styles[type] || styles.info
    
    notification.innerHTML = `
      <div class="bg-gradient-to-r ${style.gradient} ${style.ring} p-4">
        <div class="flex items-center space-x-3">
          <div class="flex-shrink-0">
            <svg class="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              ${style.icon}
            </svg>
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium text-white">${message}</p>
          </div>
          <button class="flex-shrink-0 ml-4 text-white/80 hover:text-white transition-colors duration-200" data-action="click->git-actions#closeNotification">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="absolute inset-0 bg-white/10 opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none"></div>
    `
    
    // Add to DOM
    document.body.appendChild(notification)
    
    // Animate in with bounce effect
    requestAnimationFrame(() => {
      notification.classList.remove('translate-x-full')
      notification.classList.add('translate-x-0')
      
      // Add a subtle bounce animation
      setTimeout(() => {
        notification.style.animation = 'bounce-subtle 0.3s ease-out'
      }, 300)
    })
    
    // Add CSS animation
    if (!document.querySelector('#git-actions-animations')) {
      const style = document.createElement('style')
      style.id = 'git-actions-animations'
      style.textContent = `
        @keyframes bounce-subtle {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(4px); }
        }
      `
      document.head.appendChild(style)
    }
    
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
    notification.classList.add('translate-x-full', 'opacity-0')
    notification.classList.remove('translate-x-0')
    setTimeout(() => {
      notification.remove()
    }, 500)
  }
  
  async stage(event) {
    event.preventDefault()
    event.stopPropagation() // Prevent dropdown from closing
    
    const button = event.currentTarget
    const directory = button.dataset.gitActionsDirectoryParam
    const instanceName = button.dataset.gitActionsInstanceParam
    const sessionId = button.dataset.gitActionsSessionParam
    const statusId = button.dataset.gitActionsStatusIdParam
    
    // Disable button and show loading state with animation
    const originalContent = button.innerHTML
    button.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <span class="absolute inset-0 rounded-md bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-200"></span>
      <svg class="h-3.5 w-3.5 animate-spin relative inline-block" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="relative whitespace-nowrap">Staging...</span>
    `
    
    try {
      const response = await fetch(`/sessions/${sessionId}/git_stage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ directory, instance_name: instanceName })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success message with animation
        this.showNotification(`Successfully staged ${data.files_staged} file${data.files_staged === 1 ? '' : 's'} for ${instanceName}`, 'success')
        
        // Animate button success - keep purple color
        button.innerHTML = `
          <span class="absolute inset-0 rounded-md bg-white opacity-10"></span>
          <svg class="h-3.5 w-3.5 relative inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="relative whitespace-nowrap">Staged!</span>
        `
        
        // After animation, re-enable the button
        setTimeout(() => {
          button.disabled = false
          button.classList.remove('animate-pulse')
          button.innerHTML = originalContent
        }, 1500)
      } else {
        // Show error message
        this.showNotification(data.error || "Failed to stage changes", 'error')
        
        // Restore button
        button.disabled = false
        button.classList.remove('animate-pulse')
        button.innerHTML = originalContent
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
      
      // Restore button
      button.disabled = false
      button.classList.remove('animate-pulse')
      button.innerHTML = originalContent
    }
  }
  
  async reset(event) {
    event.preventDefault()
    event.stopPropagation() // Prevent dropdown from closing
    
    const button = event.currentTarget
    const directory = button.dataset.gitActionsDirectoryParam
    const instanceName = button.dataset.gitActionsInstanceParam
    const sessionId = button.dataset.gitActionsSessionParam
    const statusId = button.dataset.gitActionsStatusIdParam
    
    // Show confirmation dialog
    if (!confirm(`Are you sure you want to reset all changes in ${instanceName}?\n\nThis will:\n• Discard ALL staged and unstaged changes\n• Remove ALL untracked files\n• Reset to the last commit\n\nThis action cannot be undone!`)) {
      return
    }
    
    // Disable button and show loading state with animation
    const originalContent = button.innerHTML
    button.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <span class="absolute inset-0 rounded-md bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-200"></span>
      <svg class="h-3.5 w-3.5 animate-spin relative inline-block" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="relative whitespace-nowrap">Resetting...</span>
    `
    
    try {
      const response = await fetch(`/sessions/${sessionId}/git_reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ directory, instance_name: instanceName })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success message with animation
        this.showNotification(`Successfully reset all changes in ${instanceName}`, 'success')
        
        // Animate button success - keep red color briefly
        button.innerHTML = `
          <span class="absolute inset-0 rounded-md bg-white opacity-10"></span>
          <svg class="h-3.5 w-3.5 relative inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="relative whitespace-nowrap">Reset!</span>
        `
        
        // After animation, disable the button since there are no changes
        setTimeout(() => {
          // Transition to disabled state
          button.classList.remove('bg-red-600', 'hover:bg-red-700')
          button.classList.add('bg-gray-300', 'dark:bg-gray-600', 'cursor-not-allowed')
          button.disabled = true
          button.removeAttribute('data-action')
          button.innerHTML = `
            ${this.heroicon('arrow-path', 'h-3.5 w-3.5')}
            <span>Reset</span>
          `
          button.title = "No changes to reset"
        }, 1500)
      } else {
        // Show error message
        this.showNotification(data.error || "Failed to reset changes", 'error')
        
        // Restore button
        button.disabled = false
        button.classList.remove('animate-pulse')
        button.innerHTML = originalContent
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
      
      // Restore button
      button.disabled = false
      button.classList.remove('animate-pulse')
      button.innerHTML = originalContent
    }
  }
  
  async commit(event) {
    event.preventDefault()
    event.stopPropagation() // Prevent dropdown from closing
    
    const button = event.currentTarget
    const directory = button.dataset.gitActionsDirectoryParam
    const instanceName = button.dataset.gitActionsInstanceParam
    const sessionId = button.dataset.gitActionsSessionParam
    const statusId = button.dataset.gitActionsStatusIdParam
    
    // Disable button and show loading state with animation
    const originalContent = button.innerHTML
    button.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <span class="absolute inset-0 rounded-md bg-white opacity-0 group-hover:opacity-10 transition-opacity duration-200"></span>
      <svg class="h-3.5 w-3.5 animate-spin relative inline-block" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      <span class="relative whitespace-nowrap">Committing...</span>
    `
    
    try {
      const response = await fetch(`/sessions/${sessionId}/git_commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ directory, instance_name: instanceName })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success message with animation
        this.showNotification(`Successfully committed changes: ${data.commit_message}`, 'success')
        
        // Animate button success - keep green color
        button.innerHTML = `
          <span class="absolute inset-0 rounded-md bg-white opacity-10"></span>
          <svg class="h-3.5 w-3.5 relative inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          <span class="relative whitespace-nowrap">Committed!</span>
        `
        
        // After animation, disable the button with appropriate styling
        setTimeout(() => {
          // Transition to disabled state
          button.classList.remove('bg-green-600', 'hover:bg-green-700')
          button.classList.add('bg-gray-300', 'dark:bg-gray-600', 'cursor-not-allowed')
          button.disabled = true
          button.removeAttribute('data-action')
          button.innerHTML = `
            ${this.heroicon('check', 'h-3.5 w-3.5')}
            <span>Commit</span>
          `
          button.title = "No changes to commit"
        }, 1500)
      } else {
        // Show error message
        this.showNotification(data.error || "Failed to commit changes", 'error')
        
        // Restore button
        button.disabled = false
        button.classList.remove('animate-pulse')
        button.innerHTML = originalContent
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
      
      // Restore button
      button.disabled = false
      button.classList.remove('animate-pulse')
      button.innerHTML = originalContent
    }
  }
  
  heroicon(name, className = '') {
    const icons = {
      'arrow-down-tray': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"></path>',
      'arrow-up-tray': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"></path>',
      'check-circle': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
      'check': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>',
      'plus-circle': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
      'arrow-path': '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"></path>'
    }
    
    return `<svg class="${className}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      ${icons[name] || ''}
    </svg>`
  }
}