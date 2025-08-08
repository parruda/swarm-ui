import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  async sync(event) {
    const button = event.currentTarget
    const projectId = button.dataset.projectId

    // Disable button and show loading state
    button.disabled = true
    const originalText = button.innerHTML
    button.innerHTML = `
      <svg class="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Syncing...
    `

    try {
      const response = await fetch(`/projects/${projectId}/sync`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': document.querySelector('[name="csrf-token"]').content,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok) {
        if (data.success) {
          // Show success message
          this.showNotification('Repository synced successfully', 'success')

          // Reload the page to show updated Git status
          setTimeout(() => {
            window.location.reload()
          }, 1000)
        } else {
          // Show error message
          this.showNotification(data.error || 'Failed to sync repository', 'error')
        }
      } else {
        this.showNotification('An error occurred while syncing', 'error')
      }
    } catch (error) {
      console.error('Sync error:', error)
      this.showNotification('Network error occurred', 'error')
    } finally {
      // Restore button state
      button.disabled = false
      button.innerHTML = originalText
    }
  }

  showNotification(message, type) {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-x-0 ${
      type === 'success'
        ? 'bg-green-600 text-white'
        : 'bg-red-600 text-white'
    }`

    notification.innerHTML = `
      <div class="flex items-center">
        ${type === 'success'
          ? '<svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>'
          : '<svg class="h-5 w-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>'
        }
        <span>${message}</span>
      </div>
    `

    document.body.appendChild(notification)

    // Animate in
    setTimeout(() => {
      notification.classList.add('translate-x-0')
    }, 10)

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.add('translate-x-full', 'opacity-0')
      setTimeout(() => {
        notification.remove()
      }, 300)
    }, 3000)
  }
}