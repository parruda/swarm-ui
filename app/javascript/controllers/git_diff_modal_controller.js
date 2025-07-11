import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "content", "loading", "subtitle"]

  connect() {
    this.boundCloseOnEscape = this.closeOnEscape.bind(this)
    this.boundCloseOnClickOutside = this.closeOnClickOutside.bind(this)
  }

  disconnect() {
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    this.modalTarget.removeEventListener("click", this.boundCloseOnClickOutside)
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
    // Add click listener after a small delay to prevent immediate closing
    setTimeout(() => {
      this.modalTarget.addEventListener("click", this.boundCloseOnClickOutside)
    }, 100)
    
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
            <div class="p-6 overflow-x-auto">
              <div class="flex justify-end mb-4 space-x-2">
                <button id="expandAllBtn" class="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors duration-200">
                  Expand All
                </button>
                <button id="collapseAllBtn" class="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors duration-200">
                  Collapse All
                </button>
              </div>
              <div class="min-w-0">
                ${data.html}
              </div>
            </div>
          `
          
          // Initialize file toggle functionality after content is loaded
          this.initializeFileToggles()
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
      // Reset styles
      backdrop.style = ""
      modalContent.style = ""
    }, 200)
    
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    this.modalTarget.removeEventListener("click", this.boundCloseOnClickOutside)
  }

  closeOnEscape(event) {
    if (event.key === "Escape") {
      this.close()
    }
  }

  closeOnClickOutside(event) {
    // Check if click is on the modal wrapper (outside the content)
    const modalContent = this.modalTarget.querySelector('.rounded-2xl')
    if (!modalContent.contains(event.target)) {
      this.close()
    }
  }

  initializeFileToggles() {
    const container = this.contentTarget
    
    // Setup expand/collapse all buttons
    const expandAllBtn = container.querySelector('#expandAllBtn')
    const collapseAllBtn = container.querySelector('#collapseAllBtn')
    
    if (expandAllBtn) {
      expandAllBtn.addEventListener('click', () => this.expandAllFiles())
    }
    
    if (collapseAllBtn) {
      collapseAllBtn.addEventListener('click', () => this.collapseAllFiles())
    }
    
    // Find all file wrappers and make their headers clickable
    container.querySelectorAll('.d2h-file-wrapper').forEach(fileWrapper => {
      const header = fileWrapper.querySelector('.d2h-file-header')
      if (!header) return
      
      // Make the entire header clickable
      header.style.cursor = 'pointer'
      header.style.userSelect = 'none'
      
      // Check if there's already a Viewed checkbox
      const existingCheckbox = header.querySelector('.d2h-file-collapse')
      
      // Add chevron icon before the checkbox
      const chevron = document.createElement('span')
      chevron.className = 'diff-toggle-chevron'
      chevron.style.cssText = 'margin-right: 10px; display: inline-flex; align-items: center;'
      chevron.innerHTML = `
        <svg class="diff-toggle-icon inline-block w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      `
      
      // Insert chevron before the checkbox or at the end
      if (existingCheckbox) {
        header.insertBefore(chevron, existingCheckbox)
      } else {
        header.appendChild(chevron)
      }
      
      // Get the content (files diff)
      const contentWrapper = fileWrapper.querySelector('.d2h-files-diff')
      if (contentWrapper) {
        // Add click handler to the entire header
        header.addEventListener('click', (e) => {
          // Don't toggle if clicking on the checkbox
          if (e.target.type === 'checkbox' || e.target.classList.contains('d2h-file-collapse')) {
            return
          }
          e.preventDefault()
          e.stopPropagation()
          this.toggleFile(chevron, contentWrapper)
        })
        
        // Start expanded
        contentWrapper.dataset.expanded = 'true'
      }
    })
  }

  toggleFile(chevron, contentWrapper) {
    const icon = chevron.querySelector('.diff-toggle-icon')
    const isExpanded = contentWrapper.dataset.expanded === 'true'
    
    if (isExpanded) {
      // Collapse
      contentWrapper.style.display = 'none'
      contentWrapper.dataset.expanded = 'false'
      if (icon) icon.style.transform = 'rotate(-90deg)'
    } else {
      // Expand
      contentWrapper.style.display = ''
      contentWrapper.dataset.expanded = 'true'
      if (icon) icon.style.transform = 'rotate(0deg)'
    }
  }

  expandAllFiles() {
    this.contentTarget.querySelectorAll('.d2h-file-wrapper').forEach(fileWrapper => {
      const contentWrapper = fileWrapper.querySelector('.d2h-files-diff')
      const icon = fileWrapper.querySelector('.diff-toggle-icon')
      if (contentWrapper) {
        contentWrapper.style.display = ''
        contentWrapper.dataset.expanded = 'true'
        if (icon) icon.style.transform = 'rotate(0deg)'
      }
    })
  }

  collapseAllFiles() {
    this.contentTarget.querySelectorAll('.d2h-file-wrapper').forEach(fileWrapper => {
      const contentWrapper = fileWrapper.querySelector('.d2h-files-diff')
      const icon = fileWrapper.querySelector('.diff-toggle-icon')
      if (contentWrapper) {
        contentWrapper.style.display = 'none'
        contentWrapper.dataset.expanded = 'false'
        if (icon) icon.style.transform = 'rotate(-90deg)'
      }
    })
  }
}