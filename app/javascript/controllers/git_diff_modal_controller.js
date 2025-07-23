import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "content", "loading", "subtitle", "fileList", "diffContainer"]

  connect() {
    this.boundCloseOnEscape = this.closeOnEscape.bind(this)
    this.boundCloseOnClickOutside = this.closeOnClickOutside.bind(this)
    this.currentSessionId = null
    this.currentDirectory = null
  }

  disconnect() {
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    this.modalTarget.removeEventListener("click", this.boundCloseOnClickOutside)
    this.disposeMonacoInstances()
  }

  async open(event) {
    event.preventDefault()
    
    const directory = event.currentTarget.dataset.directory
    const instanceName = event.currentTarget.dataset.instanceName
    const sessionId = event.currentTarget.dataset.sessionId
    
    this.currentSessionId = sessionId
    this.currentDirectory = directory
    
    // Update subtitle
    if (this.hasSubtitleTarget) {
      this.subtitleTarget.textContent = `${instanceName} - ${directory.replace(/^.*\//, '')}`
    }

    // Show modal with animation
    this.modalTarget.classList.remove("hidden")
    requestAnimationFrame(() => {
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
          this.showError(data.error)
        } else if (data.has_changes) {
          await this.showDiffContent(data)
        } else {
          this.showNoChanges()
        }
      } else {
        this.loadingTarget.classList.add("hidden")
        this.showError("Failed to load diff from server")
      }
    } catch (error) {
      this.loadingTarget.classList.add("hidden")
      this.showError(error.message)
    }
  }

  async showDiffContent(data) {
    // Create the main content structure with full height
    this.contentTarget.innerHTML = `
      <div class="flex" style="height: 100%;">
        <!-- File list sidebar -->
        <div class="w-64 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-y-auto flex-shrink-0" data-git-diff-modal-target="fileList">
          <div class="p-4">
            <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
              Changed Files (${data.files.length})
            </h3>
            <div class="space-y-1">
              ${data.files.map((file, index) => `
                <div class="file-item cursor-pointer p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${index === 0 ? 'bg-gray-100 dark:bg-gray-700' : ''}"
                     data-file-path="${file.path}"
                     data-file-index="${index}">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-sm text-gray-700 dark:text-gray-300 truncate" title="${file.path}">
                      ${file.path.split('/').pop()}
                    </span>
                    <div class="flex items-center space-x-1 text-xs">
                      <span class="text-green-600 dark:text-green-400">+${file.additions}</span>
                      <span class="text-red-600 dark:text-red-400">-${file.deletions}</span>
                    </div>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-xs text-gray-500 dark:text-gray-400 truncate" title="${file.path}">
                      ${file.path}
                    </span>
                    ${this.getStatusBadge(file.status)}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        
        <!-- Monaco diff container -->
        <div class="flex-1">
          <div id="monaco-diff-container" style="height: 100%;"></div>
        </div>
      </div>
    `
    
    // Store file data
    this.files = data.files
    
    // Load Monaco and show first file
    await this.loadMonaco()
    if (data.files.length > 0) {
      await this.showFile(0)
    }
    
    // Add click handlers to file items
    const fileList = this.contentTarget.querySelector('[data-git-diff-modal-target="fileList"]')
    if (fileList) {
      fileList.querySelectorAll('.file-item').forEach((item) => {
        item.addEventListener('click', async (e) => {
          const clickedItem = e.currentTarget
          const index = parseInt(clickedItem.dataset.fileIndex)
          
          // Update active state immediately
          fileList.querySelectorAll('.file-item').forEach(el => {
            el.classList.remove('bg-gray-100', 'dark:bg-gray-700')
          })
          clickedItem.classList.add('bg-gray-100', 'dark:bg-gray-700')
          
          // Then show the file
          await this.showFile(index)
        })
      })
    }
  }

  async loadMonaco() {
    if (!this.monaco) {
      // Set up Monaco environment before importing
      // This disables web workers to avoid the importScripts error
      window.MonacoEnvironment = {
        getWorker: function(workerId, label) {
          return null; // Disable web workers - fallback to main thread
        }
      }
      
      this.monaco = await import("monaco-editor")
    }
  }

  async showFile(index) {
    const file = this.files[index]
    
    // Dispose existing editor if any
    if (this.currentEditor) {
      this.currentEditor.dispose()
    }
    
    // Get container
    const container = document.getElementById('monaco-diff-container')
    
    try {
      // Fetch file contents
      const response = await fetch(`/sessions/${this.currentSessionId}/diff_file_contents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({
          directory: this.currentDirectory,
          file_path: file.path
        })
      })
      
      const fileData = await response.json()
      
      // Create diff editor - minimal config like the working example
      this.currentEditor = this.monaco.editor.createDiffEditor(container, {
        theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
        automaticLayout: true,
        renderSideBySide: true,
        originalEditable: false
      })
      
      // Create models
      const originalModel = this.monaco.editor.createModel(
        fileData.original_content || '',
        fileData.language === 'ruby' ? 'text' : fileData.language
      )
      
      const modifiedModel = this.monaco.editor.createModel(
        fileData.modified_content || '',
        fileData.language === 'ruby' ? 'text' : fileData.language
      )
      
      // Set the diff
      this.currentEditor.setModel({
        original: originalModel,
        modified: modifiedModel
      })
      
    } catch (error) {
      container.innerHTML = `<div class="p-4 text-red-600">Failed to load file: ${error.message}</div>`
    }
  }

  showError(message) {
    this.contentTarget.innerHTML = `
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
            <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Error Loading Changes</h3>
          <p class="text-gray-500 dark:text-gray-400">${message}</p>
        </div>
      </div>
    `
  }

  showNoChanges() {
    this.contentTarget.innerHTML = `
      <div class="flex items-center justify-center h-full">
        <div class="text-center">
          <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full mb-4">
            <svg class="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Changes</h3>
          <p class="text-gray-500 dark:text-gray-400">This repository has no uncommitted changes.</p>
        </div>
      </div>
    `
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
      backdrop.style = ""
      modalContent.style = ""
      
      // Clean up Monaco instances
      this.disposeMonacoInstances()
      
      // Return focus to the terminal iframe
      const iframe = document.querySelector('iframe[title*="Terminal"]')
      if (iframe) {
        iframe.focus()
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true,
          clientX: iframe.getBoundingClientRect().left + 50,
          clientY: iframe.getBoundingClientRect().top + 50
        })
        iframe.dispatchEvent(clickEvent)
      }
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
    const modalContent = this.modalTarget.querySelector('.rounded-2xl')
    if (!modalContent.contains(event.target)) {
      this.close()
    }
  }

  getStatusBadge(status) {
    const badges = {
      'staged': '<span class="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded">staged</span>',
      'modified': '<span class="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded">modified</span>',
      'modified+staged': '<span class="text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 rounded">modified+staged</span>',
      'untracked': '<span class="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded">untracked</span>'
    }
    return badges[status] || ''
  }

  disposeMonacoInstances() {
    if (this.currentEditor) {
      this.currentEditor.dispose()
      this.currentEditor = null
    }
  }
}