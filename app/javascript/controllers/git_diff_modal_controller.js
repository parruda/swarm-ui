import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "content", "loading", "subtitle"]

  connect() {
    this.boundCloseOnEscape = this.closeOnEscape.bind(this)
    this.boundCloseOnClickOutside = this.closeOnClickOutside.bind(this)
  }

  disconnect() {
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    document.removeEventListener("click", this.boundCloseOnClickOutside)
  }

  async open(event) {
    event.preventDefault()
    
    const directory = event.currentTarget.dataset.directory
    const instanceName = event.currentTarget.dataset.instanceName
    const sessionId = event.currentTarget.dataset.sessionId
    
    // Update subtitle
    if (this.hasSubtitleTarget) {
      this.subtitleTarget.textContent = `${instanceName} - ${directory.replace(/^.*\//, '')}`
    }

    // Show modal with animation
    this.modalTarget.classList.remove("hidden")
    requestAnimationFrame(() => {
      this.modalTarget.classList.add("showing")
      // Add animation classes
      const backdrop = this.modalTarget.querySelector("div:first-child")
      const modalContent = this.modalTarget.querySelector(".rounded-2xl")
      
      backdrop.style.opacity = "0"
      modalContent.style.transform = "scale(0.95)"
      modalContent.style.opacity = "0"
      
      requestAnimationFrame(() => {
        backdrop.style.transition = "opacity 300ms ease-out"
        backdrop.style.opacity = "1"
        
        modalContent.style.transition = "all 300ms cubic-bezier(0.16, 1, 0.3, 1)"
        modalContent.style.transform = "scale(1)"
        modalContent.style.opacity = "1"
      })
    })

    this.loadingTarget.classList.remove("hidden")
    this.contentTarget.innerHTML = ""
    
    document.addEventListener("keydown", this.boundCloseOnEscape)
    document.addEventListener("click", this.boundCloseOnClickOutside)
    
    try {
      const response = await fetch(`/sessions/${sessionId}/git_diff`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({ directory, instance_name: instanceName })
      })
      
      if (response.ok) {
        const data = await response.json()
        this.loadingTarget.classList.add("hidden")
        
        if (data.error) {
          this.contentTarget.innerHTML = `
            <div class="p-8 text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
                <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Error Loading Changes</h3>
              <p class="text-gray-500 dark:text-gray-400">${data.error}</p>
            </div>
          `
        } else if (data.html && data.html.trim()) {
          // Wrap the diff2html output with some padding and overflow control
          this.contentTarget.innerHTML = `
            <div class="p-6 overflow-x-auto" data-controller="diff-file-toggle">
              <div class="flex justify-end mb-4 space-x-2">
                <button data-action="click->diff-file-toggle#expandAll" class="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors duration-200">
                  Expand All
                </button>
                <button data-action="click->diff-file-toggle#collapseAll" class="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors duration-200">
                  Collapse All
                </button>
              </div>
              <div class="min-w-0">
                ${data.html}
              </div>
            </div>
          `
        } else {
          this.contentTarget.innerHTML = `
            <div class="p-8 text-center">
              <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full mb-4">
                <svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
              </div>
              <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Changes</h3>
              <p class="text-gray-500 dark:text-gray-400">This repository has no uncommitted changes.</p>
            </div>
          `
        }
      } else {
        this.loadingTarget.classList.add("hidden")
        this.contentTarget.innerHTML = `
          <div class="p-8 text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
              <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Server Error</h3>
            <p class="text-gray-500 dark:text-gray-400">Failed to load diff from server</p>
          </div>
        `
      }
    } catch (error) {
      this.loadingTarget.classList.add("hidden")
      this.contentTarget.innerHTML = `
        <div class="p-8 text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
            <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Connection Error</h3>
          <p class="text-gray-500 dark:text-gray-400">${error.message}</p>
        </div>
      `
    }
  }

  close(event) {
    if (event) event.preventDefault()
    
    const backdrop = this.modalTarget.querySelector("div:first-child")
    const modalContent = this.modalTarget.querySelector(".rounded-2xl")
    
    // Animate out
    backdrop.style.transition = "opacity 200ms ease-in"
    backdrop.style.opacity = "0"
    
    modalContent.style.transition = "all 200ms ease-in"
    modalContent.style.transform = "scale(0.95)"
    modalContent.style.opacity = "0"
    
    setTimeout(() => {
      this.modalTarget.classList.add("hidden")
      this.modalTarget.classList.remove("showing")
      // Reset styles
      backdrop.style = ""
      modalContent.style = ""
    }, 200)
    
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    document.removeEventListener("click", this.boundCloseOnClickOutside)
  }

  closeOnEscape(event) {
    if (event.key === "Escape") {
      this.close()
    }
  }

  closeOnClickOutside(event) {
    // Check if click is on backdrop
    if (event.target.classList.contains("backdrop-blur-md")) {
      this.close()
    }
  }
}