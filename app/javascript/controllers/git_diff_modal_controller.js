import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = ["modal", "loading", "content", "subtitle", "approveButton", "rejectButton", "requestChangesButton"]
  
  connect() {
    this.boundCloseOnEscape = this.closeOnEscape.bind(this)
    this.boundCloseOnClickOutside = this.closeOnClickOutside.bind(this)
    
    // Initialize only if not already set
    this.currentSessionId = this.currentSessionId || null
    this.currentDirectory = this.currentDirectory || null
    
    // Try to restore from modal dataset if available
    if (!this.currentSessionId || !this.currentDirectory) {
      const modal = document.querySelector('[data-git-diff-modal-target="modal"]')
      if (modal) {
        this.currentSessionId = this.currentSessionId || modal.dataset.sessionId || null
        this.currentDirectory = this.currentDirectory || modal.dataset.directory || null
      }
    }
    
    // console.log("GitDiffModalController connected, currentSessionId:", this.currentSessionId)
  }
  
  findModalElements() {
    // Use Stimulus targets if available
    if (this.hasModalTarget) {
      this.modal = this.modalTarget
      this.loadingEl = this.hasLoadingTarget ? this.loadingTarget : this.modal.querySelector('[data-git-diff-modal-target="loading"]')
      this.contentEl = this.hasContentTarget ? this.contentTarget : this.modal.querySelector('[data-git-diff-modal-target="content"]')
      this.subtitleEl = this.hasSubtitleTarget ? this.subtitleTarget : this.modal.querySelector('[data-git-diff-modal-target="subtitle"]')
      return this.modal
    }
    
    // Fallback to querySelector if targets not defined
    if (!this.modal) {
      this.modal = document.querySelector('[data-git-diff-modal-target="modal"]')
      if (this.modal) {
        this.loadingEl = this.modal.querySelector('[data-git-diff-modal-target="loading"]')
        this.contentEl = this.modal.querySelector('[data-git-diff-modal-target="content"]')
        this.subtitleEl = this.modal.querySelector('[data-git-diff-modal-target="subtitle"]')
      }
    }
    return this.modal
  }

  disconnect() {
    document.removeEventListener("keydown", this.boundCloseOnEscape)
    if (this.modal) {
      this.modal.removeEventListener("click", this.boundCloseOnClickOutside)
    }
    this.disposeMonacoInstances()
    
    // Clean up resize event listeners
    if (this.resizeCleanup) {
      this.resizeCleanup()
    }
  }

  async open(event) {
    event.preventDefault()
    
    // Find modal elements if not already found
    if (!this.findModalElements()) {
      console.error("Git diff modal not found in DOM")
      return
    }
    
    // Reset buttons when opening modal
    this.resetActionButtons()
    
    // Initialize comments storage for this modal session
    this.comments = {}
    // Also store in modal dataset for persistence
    if (this.modal) {
      this.modal.dataset.comments = JSON.stringify(this.comments)
    }
    
    // Get data from the clicked element (event.currentTarget)
    const clickedElement = event.currentTarget
    const directory = clickedElement.dataset.directory
    const instanceName = clickedElement.dataset.instanceName
    const sessionId = clickedElement.dataset.sessionId
    
    // console.log("Opening modal with data:", { directory, instanceName, sessionId })
    
    // Validate required data
    if (!sessionId || !directory) {
      console.error("Missing required data for git diff modal", { sessionId, directory, instanceName })
      this.showError("Unable to load diff: Missing session or directory information")
      return
    }
    
    this.currentSessionId = sessionId
    this.currentDirectory = directory
    // console.log("Set currentSessionId:", this.currentSessionId, "currentDirectory:", this.currentDirectory)
    
    // Store in data attributes as backup
    if (this.modal) {
      this.modal.dataset.sessionId = sessionId
      this.modal.dataset.directory = directory
    }
    
    // Update subtitle
    if (this.subtitleEl) {
      this.subtitleEl.textContent = `${instanceName} - ${directory.replace(/^.*\//, '')}`
    }

    // Show modal with animation
    this.modal.classList.remove("hidden")
    requestAnimationFrame(() => {
      const backdrop = this.modal.querySelector("div:first-child")
      const modalContent = this.modal.querySelector(".rounded-2xl")
      
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

    this.loadingEl.classList.remove("hidden")
    this.contentEl.innerHTML = ""
    
    document.addEventListener("keydown", this.boundCloseOnEscape)
    setTimeout(() => {
      this.modal.addEventListener("click", this.boundCloseOnClickOutside)
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
        this.loadingEl.classList.add("hidden")
        
        if (data.error) {
          this.showError(data.error)
        } else if (data.has_changes) {
          // Store the session data in case it wasn't properly set
          if (!this.currentSessionId || !this.currentDirectory) {
            console.warn("Session data was not set properly, using fallback")
            this.currentSessionId = sessionId
            this.currentDirectory = directory
          }
          await this.showDiffContent(data)
        } else {
          this.showNoChanges()
        }
      } else {
        this.loadingEl.classList.add("hidden")
        let errorMessage = "Failed to load diff from server"
        
        // Try to get more specific error message
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = errorData.error
          }
        } catch (e) {
          // If response is not JSON, use status text
          errorMessage = `Server error: ${response.status} ${response.statusText}`
        }
        
        this.showError(errorMessage)
      }
    } catch (error) {
      this.loadingEl.classList.add("hidden")
      this.showError(error.message)
    }
  }

  buildFileTree(files) {
    const root = { name: 'root', children: {}, files: [] }
    
    files.forEach((file, index) => {
      const parts = file.path.split('/')
      let current = root
      
      // Build directory structure
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]
        if (!current.children[part]) {
          current.children[part] = {
            name: part,
            children: {},
            files: [],
            path: parts.slice(0, i + 1).join('/')
          }
        }
        current = current.children[part]
      }
      
      // Add file to the current directory
      current.files.push({
        ...file,
        name: parts[parts.length - 1],
        index: index
      })
    })
    
    return root
  }
  
  renderFileTree(node, level = 0, parentExpanded = true) {
    let html = ''
    
    // Render directories first
    Object.keys(node.children).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).forEach(dirName => {
      const dir = node.children[dirName]
      const dirId = `dir-${dir.path.replace(/[^a-zA-Z0-9]/g, '-')}`
      const hasChanges = this.hasChangesInDirectory(dir)
      const fileCount = this.countChangesInDirectory(dir)
      
      html += `
        <div class="directory-item" data-level="${level}">
          <div class="directory-header cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-150 rounded-md px-2 py-1.5 flex items-center group"
               data-action="click->git-diff-modal#toggleDirectory"
               data-directory-id="${dirId}"
               style="padding-left: ${level * 20}px;">
            <svg class="directory-chevron w-3 h-3 mr-1.5 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${parentExpanded ? '' : 'rotate-[-90deg]'}" 
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
            <svg class="w-4 h-4 mr-2 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
            </svg>
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300 select-none">${dirName}</span>
            ${hasChanges ? `
              <span class="ml-auto flex items-center space-x-1">
                <span class="text-xs px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                  ${fileCount}
                </span>
              </span>
            ` : ''}
          </div>
          <div class="directory-content ${parentExpanded ? '' : 'hidden'}" id="${dirId}">
            ${this.renderFileTree(dir, level + 1, parentExpanded)}
          </div>
        </div>
      `
    })
    
    // Sort files by name
    const sortedFiles = [...node.files].sort((a, b) => 
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    )
    
    // Render files
    sortedFiles.forEach(file => {
      const fileIcon = this.getFileIcon(file.name)
      html += `
        <div class="file-item cursor-pointer px-2 py-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-150 group"
             data-file-path="${file.path}"
             data-file-index="${file.index}"
             data-level="${level}"
             style="padding-left: ${(level * 20) + 24}px;">
          <div class="flex items-center justify-between">
            <div class="flex items-center flex-1 overflow-hidden">
              ${fileIcon}
              <span class="file-name-text text-sm text-gray-600 dark:text-gray-300 truncate group-hover:text-gray-900 dark:group-hover:text-gray-100" title="${file.path}">
                ${file.name}
              </span>
            </div>
            <div class="flex items-center space-x-2 flex-shrink-0 ml-2">
              <div class="flex items-center space-x-1 text-xs">
                <span class="text-green-600 dark:text-green-400 font-medium">+${file.additions}</span>
                <span class="text-red-600 dark:text-red-400 font-medium">-${file.deletions}</span>
              </div>
              ${this.getCompactStatusBadge(file.status)}
            </div>
          </div>
        </div>
      `
    })
    
    return html
  }
  
  hasChangesInDirectory(dir) {
    if (dir.files.length > 0) return true
    return Object.values(dir.children).some(child => this.hasChangesInDirectory(child))
  }
  
  countChangesInDirectory(dir) {
    let count = dir.files.length
    Object.values(dir.children).forEach(child => {
      count += this.countChangesInDirectory(child)
    })
    return count
  }
  
  toggleDirectory(event) {
    event.stopPropagation()
    const header = event.currentTarget
    const dirId = header.dataset.directoryId
    const content = document.getElementById(dirId)
    const chevron = header.querySelector('.directory-chevron')
    
    if (content) {
      content.classList.toggle('hidden')
      chevron.classList.toggle('rotate-[-90deg]')
    }
  }

  async showDiffContent(data) {
    // Add marquee animation styles and tree view styles
    const styleId = 'git-diff-marquee-styles'
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(-100% - 20px)); }
        }
        
        .file-item .marquee-animate {
          animation: marquee linear infinite;
        }
        
        .file-item .marquee-container {
          position: relative;
        }
        
        .file-item .marquee-animate::after {
          content: attr(data-text);
          position: absolute;
          left: calc(100% + 20px);
          white-space: nowrap;
        }
        
        .resize-handle:hover .resize-line,
        .resize-handle.resizing .resize-line {
          background: #3b82f6 !important;
        }
        
        .resize-handle.resizing {
          background: rgba(59, 130, 246, 0.1) !important;
        }
        
        .directory-chevron {
          transition: transform 0.2s ease;
        }
        
        .directory-content {
          transition: all 0.2s ease;
        }
        
        .directory-content.hidden {
          display: none;
        }
      `
      document.head.appendChild(style)
    }
    
    // Build the file tree structure
    const fileTree = this.buildFileTree(data.files)
    
    // Create the main content structure with absolute positioning to ensure proper height
    this.contentEl.innerHTML = `
      <div class="flex" style="position: absolute; inset: 0;">
        <!-- File list sidebar -->
        <div class="file-list-sidebar border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0" style="width: 256px; height: 100%; overflow-y: auto; position: relative;" data-git-diff-modal-target="fileList">
          <div class="p-3">
            <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3 px-2">
              Changed Files (${data.files.length})
            </h3>
            <div class="file-tree">
              ${this.renderFileTree(fileTree)}
            </div>
          </div>
        </div>
        
        <!-- Resize handle -->
        <div class="resize-handle" style="
          position: absolute;
          left: 256px;
          top: 0;
          bottom: 0;
          width: 4px;
          background: transparent;
          cursor: col-resize;
          z-index: 10;
          margin-left: -2px;
        " data-git-diff-modal-target="resizeHandle">
          <div style="
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            width: 1px;
            background: transparent;
            transition: background 0.2s;
          " class="resize-line"></div>
        </div>
        
        <!-- Monaco diff container -->
        <div class="flex-1 flex flex-col">
          <!-- Instructions banner -->
          <div class="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-3">
            <div class="flex items-center space-x-2">
              <svg class="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <p class="text-sm text-blue-800 dark:text-blue-200">
                To request changes: Click on line numbers in the right panel (modified version) to add comments, then click "Request Changes" to send them to the session.
              </p>
            </div>
          </div>
          <div id="monaco-diff-container" style="flex: 1;"></div>
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
    const fileList = this.contentEl.querySelector('[data-git-diff-modal-target="fileList"]')
    if (fileList) {
      fileList.querySelectorAll('.file-item').forEach((item) => {
        item.addEventListener('click', async (e) => {
          e.stopPropagation()
          const clickedItem = e.currentTarget
          const index = parseInt(clickedItem.dataset.fileIndex)
          
          // Update active state immediately
          fileList.querySelectorAll('.file-item').forEach(el => {
            el.classList.remove('bg-blue-50', 'dark:bg-blue-900/20')
          })
          clickedItem.classList.add('bg-blue-50', 'dark:bg-blue-900/20')
          
          // Then show the file
          await this.showFile(index)
        })
      })
      
      // Select the first file by default if there are any
      if (data.files.length > 0) {
        const firstFile = fileList.querySelector('.file-item[data-file-index="0"]')
        if (firstFile) {
          firstFile.classList.add('bg-blue-50', 'dark:bg-blue-900/20')
        }
      }
    }
    
    // Update request changes button state after content is loaded
    this.updateRequestChangesButton()
    
    // Setup resize functionality
    this.setupResizeHandle()
  }
  
  setupResizeHandle() {
    const resizeHandle = this.contentEl.querySelector('.resize-handle')
    const fileListSidebar = this.contentEl.querySelector('.file-list-sidebar')
    
    if (!resizeHandle || !fileListSidebar) return
    
    let isResizing = false
    let startX = 0
    let startWidth = 0
    const minWidth = 150
    const maxWidth = 600
    
    const startResize = (e) => {
      isResizing = true
      startX = e.pageX
      startWidth = parseInt(fileListSidebar.style.width, 10)
      
      resizeHandle.classList.add('resizing')
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      
      e.preventDefault()
    }
    
    const doResize = (e) => {
      if (!isResizing) return
      
      const currentX = e.pageX
      const deltaX = currentX - startX
      let newWidth = startWidth + deltaX
      
      // Constrain width
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
      
      // Update sidebar width
      fileListSidebar.style.width = `${newWidth}px`
      
      // Update resize handle position
      resizeHandle.style.left = `${newWidth}px`
      
      e.preventDefault()
    }
    
    const stopResize = () => {
      if (!isResizing) return
      
      isResizing = false
      resizeHandle.classList.remove('resizing')
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    
    // Add event listeners
    resizeHandle.addEventListener('mousedown', startResize)
    document.addEventListener('mousemove', doResize)
    document.addEventListener('mouseup', stopResize)
    
    // Clean up on disconnect
    this.resizeCleanup = () => {
      document.removeEventListener('mousemove', doResize)
      document.removeEventListener('mouseup', stopResize)
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
      
      // Override window.onerror to catch Monaco tokenizer errors
      const originalOnError = window.onerror
      window.onerror = function(message, source, lineno, colno, error) {
        if (message && message.includes('trying to pop an empty stack')) {
          console.warn('Monaco Ruby tokenizer error caught and suppressed:', message)
          return true // Prevent error from bubbling up
        }
        // Call original handler for other errors
        if (originalOnError) {
          return originalOnError.apply(this, arguments)
        }
        return false
      }
    }
  }

  async showFile(index) {
    const file = this.files[index]
    
    // Dispose existing editor if any
    if (this.currentEditor) {
      this.currentEditor.dispose()
    }
    
    // Clear only the comment widgets, not the comment data
    this.clearCommentWidgets()
    
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
      
      // Create diff editor with vibe coding optimized settings
      this.currentEditor = this.monaco.editor.createDiffEditor(container, {
        theme: document.documentElement.classList.contains('dark') ? 'vs-dark' : 'vs',
        automaticLayout: true,
        renderSideBySide: true,
        originalEditable: false,
        renderIndicators: true,  // Show +/- indicators for quick visual understanding
        diffAlgorithm: 'advanced',  // Better detection of moved/refactored code
        renderOverviewRuler: true,  // See all changes at once in scrollbar
        enableSplitViewResizing: false,  // Keep it simple for vibe coding flow
        hideUnchangedRegions: {
          enabled: true,
          revealLineCount: 3,
          minLineCount: 5,
          contextLineCount: 3
        }
      })
      
      // Create models - try Ruby syntax, fall back to text if it fails
      let language = fileData.language
      let originalModel, modifiedModel
      
      try {
        // Try with the actual language first
        originalModel = this.monaco.editor.createModel(
          fileData.original_content || '',
          language
        )
        
        modifiedModel = this.monaco.editor.createModel(
          fileData.modified_content || '',
          language
        )
      } catch (error) {
        // If Ruby syntax fails, fall back to plain text
        console.warn(`Language '${language}' failed, falling back to text mode:`, error)
        
        // Dispose any partially created models
        if (originalModel) originalModel.dispose()
        if (modifiedModel) modifiedModel.dispose()
        
        // Create with plain text
        originalModel = this.monaco.editor.createModel(
          fileData.original_content || '',
          'text'
        )
        
        modifiedModel = this.monaco.editor.createModel(
          fileData.modified_content || '',
          'text'
        )
      }
      
      // Set the diff
      this.currentEditor.setModel({
        original: originalModel,
        modified: modifiedModel
      })
      
      // Initialize comment system for this file
      this.initializeCommentSystem(file)
      
    } catch (error) {
      container.innerHTML = `<div class="p-4 text-red-600">Failed to load file: ${error.message}</div>`
    }
  }

  showError(message) {
    this.contentEl.innerHTML = `
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
    this.contentEl.innerHTML = `
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
    
    // Ensure modal is available
    if (!this.findModalElements()) {
      console.error("Modal not found for closing")
      return
    }
    
    const backdrop = this.modal.querySelector("div:first-child")
    const modalContent = this.modal.querySelector(".rounded-2xl")
    
    // Animate out
    backdrop.style.transition = "opacity 200ms ease-in"
    backdrop.style.opacity = "0"
    
    modalContent.style.transition = "all 200ms ease-in"
    modalContent.style.transform = "scale(0.95)"
    modalContent.style.opacity = "0"
    
    setTimeout(() => {
      this.modal.classList.add("hidden")
      backdrop.style = ""
      modalContent.style = ""
      
      // Clean up Monaco instances
      this.disposeMonacoInstances()
      
      // Reset approve/reject buttons to their original state
      this.resetActionButtons()
      
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
    this.modal.removeEventListener("click", this.boundCloseOnClickOutside)
  }

  closeOnEscape(event) {
    if (event.key === "Escape") {
      this.close()
    }
  }

  closeOnClickOutside(event) {
    const modalContent = this.modal.querySelector('.rounded-2xl')
    
    // Check if clicking on Monaco-related elements
    // Monaco creates various UI elements that might be outside the main container
    const isMonacoElement = event.target.closest('.monaco-editor') ||
                          event.target.closest('.monaco-diff-editor') ||
                          event.target.closest('.monaco-editor-overlaymessage') ||
                          event.target.closest('.monaco-hover') ||
                          event.target.closest('.monaco-menu-container') ||
                          event.target.closest('.context-view-container') ||
                          event.target.closest('.monaco-action-bar') ||
                          event.target.closest('.diff-hidden-lines') ||
                          event.target.closest('.view-overlays') ||
                          event.target.closest('.margin-view-overlays') ||
                          event.target.classList.contains('lines-content') ||
                          event.target.classList.contains('view-line') ||
                          event.target.classList.contains('diff-hidden-lines-action') ||
                          event.target.textContent?.includes('Show unchanged region')
    
    // Check if clicking on comment-related elements
    const isCommentElement = event.target.closest('.comment-widget-container') ||
                           event.target.closest('.comment-display') ||
                           event.target.closest('.comment-form') ||
                           event.target.closest('.comment-input') ||
                           event.target.closest('.submit-comment') ||
                           event.target.closest('.cancel-comment') ||
                           event.target.closest('.delete-comment')
    
    // Only close if clicking outside modal content AND not a Monaco or comment element
    if (!modalContent.contains(event.target) && !isMonacoElement && !isCommentElement) {
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
  
  getCompactStatusBadge(status) {
    const badges = {
      'staged': '<span class="w-2 h-2 bg-green-500 dark:bg-green-400 rounded-full inline-block" title="Staged"></span>',
      'modified': '<span class="w-2 h-2 bg-yellow-500 dark:bg-yellow-400 rounded-full inline-block" title="Modified"></span>',
      'modified+staged': '<span class="w-2 h-2 bg-orange-500 dark:bg-orange-400 rounded-full inline-block" title="Modified & Staged"></span>',
      'untracked': '<span class="w-2 h-2 bg-blue-500 dark:bg-blue-400 rounded-full inline-block" title="Untracked"></span>'
    }
    return badges[status] || ''
  }
  
  getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase()
    const iconMap = {
      // Code files
      'js': '<svg class="w-4 h-4 mr-2 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      'jsx': '<svg class="w-4 h-4 mr-2 text-cyan-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      'ts': '<svg class="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      'tsx': '<svg class="w-4 h-4 mr-2 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      'rb': '<svg class="w-4 h-4 mr-2 text-red-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      'py': '<svg class="w-4 h-4 mr-2 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      // Markup/config files
      'html': '<svg class="w-4 h-4 mr-2 text-orange-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      'erb': '<svg class="w-4 h-4 mr-2 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M12.316 3.051a1 1 0 01.633 1.265l-4 12a1 1 0 11-1.898-.632l4-12a1 1 0 011.265-.633zM5.707 6.293a1 1 0 010 1.414L3.414 10l2.293 2.293a1 1 0 11-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0zm8.586 0a1 1 0 011.414 0l3 3a1 1 0 010 1.414l-3 3a1 1 0 11-1.414-1.414L16.586 10l-2.293-2.293a1 1 0 010-1.414z" clip-rule="evenodd"></path></svg>',
      'css': '<svg class="w-4 h-4 mr-2 text-purple-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h2a1 1 0 100-2h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" clip-rule="evenodd"></path></svg>',
      'scss': '<svg class="w-4 h-4 mr-2 text-pink-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 1 1 0 000 2H6a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h2a1 1 0 100-2h2a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V5z" clip-rule="evenodd"></path></svg>',
      'json': '<svg class="w-4 h-4 mr-2 text-gray-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clip-rule="evenodd"></path></svg>',
      'yml': '<svg class="w-4 h-4 mr-2 text-indigo-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>',
      'yaml': '<svg class="w-4 h-4 mr-2 text-indigo-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>',
      'md': '<svg class="w-4 h-4 mr-2 text-gray-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clip-rule="evenodd"></path></svg>'
    }
    
    // Default file icon
    const defaultIcon = '<svg class="w-4 h-4 mr-2 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>'
    
    return iconMap[ext] || defaultIcon
  }
  
  setupMarqueeAnimation(fileItem) {
    const nameContainer = fileItem.querySelector('.file-name-container')
    const nameText = fileItem.querySelector('.file-name-text')
    const pathContainer = fileItem.querySelector('.file-path-container')
    const pathText = fileItem.querySelector('.file-path-text')
    
    // Helper function to setup marquee for a text element
    const setupTextMarquee = (container, textElement) => {
      if (!container || !textElement) return
      
      const startMarquee = () => {
        // Check if text overflows
        const containerWidth = container.offsetWidth
        const textWidth = textElement.scrollWidth
        
        if (textWidth > containerWidth) {
          // Calculate animation duration based on text length (slower for longer text)
          const duration = Math.max(5, (textWidth / 50)) // 50 pixels per second
          
          // Add data attribute for the ::after pseudo element
          textElement.setAttribute('data-text', textElement.textContent)
          
          // Apply animation
          textElement.classList.add('marquee-animate')
          textElement.style.animationDuration = `${duration}s`
          
          // Add some padding for the repeat
          container.classList.add('marquee-container')
        }
      }
      
      const stopMarquee = () => {
        textElement.classList.remove('marquee-animate')
        textElement.style.animationDuration = ''
        container.classList.remove('marquee-container')
      }
      
      // Add hover listeners to the entire file item
      fileItem.addEventListener('mouseenter', () => {
        // Start animation immediately
        startMarquee()
      })
      
      fileItem.addEventListener('mouseleave', stopMarquee)
    }
    
    // Setup marquee for both file name and path
    setupTextMarquee(nameContainer, nameText)
    setupTextMarquee(pathContainer, pathText)
  }

  disposeMonacoInstances() {
    if (this.currentEditor) {
      this.currentEditor.dispose()
      this.currentEditor = null
    }
  }

  async approve(event) {
    event.preventDefault()
    // console.log('Approve clicked', this.currentSessionId, this.currentDirectory)
    
    // Ensure modal is found
    if (!this.findModalElements()) {
      console.error("Modal not found")
      return
    }
    
    // Fallback to modal data attributes if values are null
    if (!this.currentSessionId && this.modal.dataset.sessionId) {
      this.currentSessionId = this.modal.dataset.sessionId
      // console.log("Using fallback sessionId from modal dataset:", this.currentSessionId)
    }
    if (!this.currentDirectory && this.modal.dataset.directory) {
      this.currentDirectory = this.modal.dataset.directory
      // console.log("Using fallback directory from modal dataset:", this.currentDirectory)
    }
    
    // Final check
    if (!this.currentSessionId || !this.currentDirectory) {
      console.error("Cannot proceed without session ID and directory")
      this.showNotification("Error: Session information is missing", 'error')
      return
    }
    
    const button = event.currentTarget
    const rejectButton = this.modal.querySelector('[data-git-diff-modal-target="rejectButton"]')
    
    // Store original content
    const originalContent = button.innerHTML
    
    // Disable both buttons and show loading state
    button.disabled = true
    rejectButton.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <svg class="h-3.5 w-3.5 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Committing...
    `
    
    try {
      // Call the same commit endpoint used by the commit button
      const url = `/sessions/${this.currentSessionId}/git_commit`
      // console.log("Calling git_commit endpoint:", url)
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({
          directory: this.currentDirectory,
          instance_name: "diff-viewer"
        })
      })
      
      // Check if response is JSON
      const contentType = response.headers.get("content-type")
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text()
        console.error("Non-JSON response:", text)
        throw new Error("Server returned non-JSON response")
      }
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success animation (same as git_actions_controller)
        button.innerHTML = `
          <svg class="h-3.5 w-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          Committed!
        `
        
        // Show success message
        this.showNotification(`Successfully committed changes: ${data.commit_message}`, 'success')
        
        // Close modal after a short delay
        setTimeout(() => {
          this.close()
        }, 1500)
      } else {
        // Show error
        this.showNotification(data.error || "Failed to commit changes", 'error')
        
        // Restore button state
        button.disabled = false
        rejectButton.disabled = false
        button.classList.remove('animate-pulse')
        button.innerHTML = originalContent
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
      
      // Restore button state
      button.disabled = false
      rejectButton.disabled = false
      button.classList.remove('animate-pulse')
      button.innerHTML = originalContent
    }
  }

  async requestChanges(event) {
    event.preventDefault()
    
    // Ensure modal is found
    if (!this.findModalElements()) {
      console.error("Modal not found")
      return
    }
    
    // Try to restore comments from dataset if not available
    if (!this.comments && this.modal && this.modal.dataset.comments) {
      try {
        this.comments = JSON.parse(this.modal.dataset.comments)
      } catch (e) {
        console.error('Failed to parse comments from dataset:', e)
        this.comments = {}
      }
    }
    
    // Collect all comments from all files
    const allComments = []
    
    // Iterate through all files that have comments
    for (const [filePath, fileComments] of Object.entries(this.comments || {})) {
      if (fileComments && fileComments.length > 0) {
        fileComments.forEach(comment => {
          allComments.push({
            file: filePath,
            line: comment.lineNumber,
            text: comment.text,
            side: comment.side
          })
        })
      }
    }
    
    // Check if there are any comments
    if (allComments.length === 0) {
      this.showNotification("No comments to send. Add comments to files first.", 'error')
      return
    }
    
    // Ensure we have session data
    if (!this.currentSessionId && this.modal.dataset.sessionId) {
      this.currentSessionId = this.modal.dataset.sessionId
    }
    
    if (!this.currentSessionId) {
      this.showNotification("Error: Session information is missing", 'error')
      return
    }
    
    // Format the message
    let message = "Please address the comments below:\n\n"
    allComments.forEach(comment => {
      message += `- On file @${comment.file}, line ${comment.line}: ${comment.text}\n`
    })
    
    const button = event.currentTarget
    const originalContent = button.innerHTML
    
    // Show loading state
    button.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <svg class="h-3.5 w-3.5 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Sending...
    `
    
    try {
      // Send to tmux endpoint
      const response = await fetch(`/sessions/${this.currentSessionId}/send_to_tmux`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({
          text: message
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success
        button.innerHTML = `
          <svg class="h-3.5 w-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          Sent!
        `
        
        this.showNotification(`Sent ${allComments.length} comments to terminal`, 'success')
        
        // Close modal after delay
        setTimeout(() => {
          this.close()
        }, 1500)
      } else {
        this.showNotification(data.error || "Failed to send comments", 'error')
        
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

  async reject(event) {
    event.preventDefault()
    
    // Ensure modal is found
    if (!this.findModalElements()) {
      console.error("Modal not found")
      return
    }
    
    // Fallback to modal data attributes if values are null
    if (!this.currentSessionId && this.modal.dataset.sessionId) {
      this.currentSessionId = this.modal.dataset.sessionId
    }
    if (!this.currentDirectory && this.modal.dataset.directory) {
      this.currentDirectory = this.modal.dataset.directory
    }
    
    // Final check
    if (!this.currentSessionId || !this.currentDirectory) {
      console.error("Cannot proceed without session ID and directory")
      this.showNotification("Error: Session information is missing", 'error')
      return
    }
    
    const button = event.currentTarget
    const approveButton = this.modal.querySelector('[data-git-diff-modal-target="approveButton"]')
    
    // Confirm the action
    if (!confirm("Are you sure you want to discard ALL changes? This cannot be undone.")) {
      return
    }
    
    // Store original content
    const originalContent = button.innerHTML
    
    // Disable both buttons and show loading state
    button.disabled = true
    approveButton.disabled = true
    button.classList.add('animate-pulse')
    button.innerHTML = `
      <svg class="h-3.5 w-3.5 animate-spin inline mr-1" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Discarding...
    `
    
    try {
      // Call the git_reset endpoint
      const response = await fetch(`/sessions/${this.currentSessionId}/git_reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "X-CSRF-Token": document.querySelector('[name="csrf-token"]').content
        },
        body: JSON.stringify({
          directory: this.currentDirectory,
          instance_name: "diff-viewer"
        })
      })
      
      const data = await response.json()
      
      if (response.ok && data.success) {
        // Show success animation
        button.innerHTML = `
          <svg class="h-3.5 w-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
          </svg>
          Discarded!
        `
        
        // Show success message
        this.showNotification("All changes have been discarded", 'success')
        
        // Close modal after a short delay
        setTimeout(() => {
          this.close()
        }, 1500)
      } else {
        // Show error
        this.showNotification(data.error || "Failed to discard changes", 'error')
        
        // Restore button state
        button.disabled = false
        approveButton.disabled = false
        button.classList.remove('animate-pulse')
        button.innerHTML = originalContent
      }
    } catch (error) {
      this.showNotification(`Error: ${error.message}`, 'error')
      
      // Restore button state
      button.disabled = false
      approveButton.disabled = false
      button.classList.remove('animate-pulse')
      button.innerHTML = originalContent
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div')
    notification.className = `fixed top-4 right-4 z-[60] rounded-xl shadow-2xl transform transition-all duration-500 translate-x-full overflow-hidden`
    
    // Set color based on type
    const colors = {
      success: 'bg-green-600',
      error: 'bg-red-600',
      info: 'bg-blue-600'
    }
    
    const bgColor = colors[type] || colors.info
    
    notification.innerHTML = `
      <div class="${bgColor} text-white p-4">
        <div class="flex items-center space-x-3">
          <div class="flex-1">
            <p class="text-sm font-medium">${message}</p>
          </div>
        </div>
      </div>
    `
    
    // Add to DOM
    document.body.appendChild(notification)
    
    // Animate in
    requestAnimationFrame(() => {
      notification.classList.remove('translate-x-full')
      notification.classList.add('translate-x-0')
    })
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      notification.classList.add('translate-x-full', 'opacity-0')
      notification.classList.remove('translate-x-0')
      setTimeout(() => {
        notification.remove()
      }, 500)
    }, 5000)
  }
  
  resetActionButtons() {
    // Reset approve button
    const approveButton = this.modal.querySelector('[data-git-diff-modal-target="approveButton"]')
    if (approveButton) {
      approveButton.disabled = false
      approveButton.classList.remove('animate-pulse')
      // Use the same check icon as in the success state
      approveButton.innerHTML = `
        <svg class="h-3.5 w-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
        </svg>
        Approve
      `
    }
    
    // Reset reject button
    const rejectButton = this.modal.querySelector('[data-git-diff-modal-target="rejectButton"]')
    if (rejectButton) {
      rejectButton.disabled = false
      rejectButton.classList.remove('animate-pulse')
      // Use a simple X circle icon for reject
      rejectButton.innerHTML = `
        <svg class="h-3.5 w-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        Reject
      `
    }
    
    // Reset request changes button - but keep it disabled initially
    const requestChangesButton = this.modal.querySelector('[data-git-diff-modal-target="requestChangesButton"]')
    if (requestChangesButton) {
      requestChangesButton.disabled = true
      requestChangesButton.title = "Add comments to request changes"
      
      // Set disabled state styling - matching the pattern from git status buttons
      requestChangesButton.className = 'px-3 py-1.5 text-xs font-medium rounded bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50'
      
      // Reset the content
      requestChangesButton.innerHTML = `
        <svg class="h-3.5 w-3.5 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
        </svg>
        Request Changes
      `
    }
  }
  
  // Comment system implementation
  initializeCommentSystem(file) {
    // Initialize comment storage for this file
    this.comments = this.comments || {}
    this.comments[file.path] = this.comments[file.path] || []
    this.commentWidgets = []
    this.commentDecorations = []
    
    // Get only the modified editor (right side) for comments
    const modifiedEditor = this.currentEditor.getModifiedEditor()
    
    // Add gutter click handler only to the modified editor
    this.setupCommentGutterClick(modifiedEditor, 'modified', file)
    
    // Display existing comments
    this.displayExistingComments(file)
  }
  
  setupCommentGutterClick(editor, side, file) {
    // Add mouse down listener for gutter clicks
    editor.onMouseDown((e) => {
      // Check if click is in the gutter area
      if (e.target.type === this.monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS ||
          e.target.type === this.monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        
        const lineNumber = e.target.position.lineNumber
        
        // Check if there's already a comment widget open
        const existingWidget = this.commentWidgets.find(w => 
          w.lineNumber === lineNumber && w.side === side && !w.isDisposed
        )
        
        if (!existingWidget) {
          // Create a new comment widget
          this.createCommentWidget(editor, lineNumber, side, file)
        }
      }
    })
  }
  
  createCommentWidget(editor, lineNumber, side, file) {
    // Create comment widget container
    const widgetContainer = document.createElement('div')
    widgetContainer.className = 'comment-widget-container'
    widgetContainer.style.cssText = `
      background: ${document.documentElement.classList.contains('dark') ? '#1f2937' : '#ffffff'};
      border: 1px solid ${document.documentElement.classList.contains('dark') ? '#374151' : '#e5e7eb'};
      border-radius: 6px;
      padding: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      width: 400px;
      z-index: 100;
    `
    
    // Create comment form
    widgetContainer.innerHTML = `
      <div class="comment-form">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Add a comment on line ${lineNumber}
          </span>
          <button class="close-comment text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <textarea 
          class="comment-input w-full p-2 border rounded-md text-sm resize-none dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200"
          rows="3"
          placeholder="Leave a comment..."
          style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
        ></textarea>
        <div class="flex justify-end gap-2 mt-2">
          <button class="cancel-comment px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            Cancel
          </button>
          <button class="submit-comment px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            Comment
          </button>
        </div>
      </div>
    `
    
    // Create the widget
    const widget = {
      getId: () => `comment-widget-${lineNumber}-${side}`,
      getDomNode: () => widgetContainer,
      getPosition: () => ({
        preference: [this.monaco.editor.ContentWidgetPositionPreference.BELOW],
        position: {
          lineNumber: lineNumber,
          column: 1
        }
      }),
      lineNumber: lineNumber,
      side: side,
      isDisposed: false
    }
    
    // Add event handlers
    const textarea = widgetContainer.querySelector('.comment-input')
    const submitBtn = widgetContainer.querySelector('.submit-comment')
    const cancelBtn = widgetContainer.querySelector('.cancel-comment')
    const closeBtn = widgetContainer.querySelector('.close-comment')
    
    // Enable/disable submit based on content
    textarea.addEventListener('input', () => {
      submitBtn.disabled = !textarea.value.trim()
    })
    
    // Submit function
    const submitComment = () => {
      const comment = textarea.value.trim()
      if (comment) {
        this.addComment(file, lineNumber, side, comment)
        editor.removeContentWidget(widget)
        widget.isDisposed = true
      }
    }
    
    // Submit handler for button click
    submitBtn.addEventListener('click', submitComment)
    
    // Submit handler for CMD/Ctrl + Enter
    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        submitComment()
      }
    })
    
    // Cancel/close handlers
    const closeWidget = () => {
      editor.removeContentWidget(widget)
      widget.isDisposed = true
    }
    
    cancelBtn.addEventListener('click', closeWidget)
    closeBtn.addEventListener('click', closeWidget)
    
    // Add widget to editor
    editor.addContentWidget(widget)
    this.commentWidgets.push(widget)
    
    // Focus the textarea
    setTimeout(() => textarea.focus(), 100)
  }
  
  addComment(file, lineNumber, side, text) {
    // Add comment to storage
    const comment = {
      id: Date.now(),
      lineNumber,
      side,
      text,
      timestamp: new Date().toISOString(),
      author: 'You' // In a real app, this would be the current user
    }
    
    this.comments[file.path].push(comment)
    
    // Also persist to modal dataset
    if (this.modal) {
      this.modal.dataset.comments = JSON.stringify(this.comments)
    }
    
    // Add decoration to show there's a comment
    this.addCommentDecoration(lineNumber, side)
    
    // Show the comment
    this.displayComment(comment, file)
    
    // Update request changes button state
    this.updateRequestChangesButton()
    
    // TODO: Save to backend
    // this.saveCommentsToBackend(file.path)
    
    // For now, show a notification that comment was added (in memory only)
    this.showNotification('Comment added (session only - not persisted)', 'info')
  }
  
  addCommentDecoration(lineNumber, side) {
    const editor = side === 'original' ? 
      this.currentEditor.getOriginalEditor() : 
      this.currentEditor.getModifiedEditor()
    
    // Create decoration for the line
    const decorationIds = editor.deltaDecorations([], [
      {
        range: new this.monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          linesDecorationsClassName: 'comment-line-decoration',
          overviewRuler: {
            color: '#3b82f6',
            position: this.monaco.editor.OverviewRulerLane.Right
          }
        }
      }
    ])
    
    // Store the decoration with its ID
    this.commentDecorations.push({ 
      decorationId: decorationIds[0], 
      editor,
      lineNumber,
      side
    })
  }
  
  displayComment(comment, file) {
    const editor = comment.side === 'original' ? 
      this.currentEditor.getOriginalEditor() : 
      this.currentEditor.getModifiedEditor()
    
    // Create comment display widget
    const commentDisplay = document.createElement('div')
    commentDisplay.className = 'comment-display'
    commentDisplay.style.cssText = `
      background: ${document.documentElement.classList.contains('dark') ? '#1e293b' : '#f3f4f6'};
      border-left: 3px solid #3b82f6;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 13px;
      line-height: 1.5;
      width: 400px;
    `
    
    commentDisplay.innerHTML = `
      <div>
        <div class="flex items-center gap-2 mb-1">
          <span class="font-medium text-gray-700 dark:text-gray-300">${comment.author}</span>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            ${new Date(comment.timestamp).toLocaleString()}
          </span>
          <button class="delete-comment-${comment.id}" style="margin-left: 8px; color: #9ca3af; background: none; border: none; padding: 2px; cursor: pointer; transition: color 0.2s;" onmouseover="this.style.color='#dc2626'" onmouseout="this.style.color='#9ca3af'">
            <svg style="width: 16px; height: 16px; pointer-events: none;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
          </button>
        </div>
        <div class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${comment.text}</div>
      </div>
    `
    
    // Create zone widget to display the comment first
    const viewZone = {
      afterLineNumber: comment.lineNumber,
      heightInLines: 3,
      domNode: commentDisplay
    }
    
    // Add delete handler BEFORE adding to zones
    const deleteBtn = commentDisplay.querySelector(`.delete-comment-${comment.id}`)
    if (deleteBtn) {
      // Store reference to this controller for the click handler
      const controller = this
      
      deleteBtn.onclick = function(e) {
        e.preventDefault()
        e.stopPropagation()
        controller.deleteComment(comment, file)
        return false
      }
    } else {
      console.error('Delete button not found for comment:', comment.id)
    }
    
    editor.changeViewZones(accessor => {
      const zoneId = accessor.addZone(viewZone)
      // Store the zone ID in the comment object
      comment.zoneId = zoneId
      
      // Try to attach the handler after Monaco has fully rendered
      setTimeout(() => {
        const deleteBtn = document.querySelector(`.delete-comment-${comment.id}`)
        if (deleteBtn) {
          // Remove any existing handlers
          const newBtn = deleteBtn.cloneNode(true)
          deleteBtn.parentNode.replaceChild(newBtn, deleteBtn)
          
          // Attach fresh handler
          newBtn.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            this.deleteComment(comment, file)
          }, true) // Use capture phase
          
          // Test if element is interactive
          newBtn.style.pointerEvents = 'auto'
          newBtn.style.zIndex = '1000'
        }
      }, 100)
    })
  }
  
  displayExistingComments(file) {
    const fileComments = this.comments[file.path] || []
    fileComments.forEach(comment => {
      this.addCommentDecoration(comment.lineNumber, comment.side)
      this.displayComment(comment, file)
    })
  }
  
  deleteComment(comment, file) {
    // Remove from storage
    const fileComments = this.comments[file.path]
    const index = fileComments.findIndex(c => c.id === comment.id)
    if (index > -1) {
      fileComments.splice(index, 1)
    }
    
    // Persist updated comments to modal dataset
    if (this.modal) {
      this.modal.dataset.comments = JSON.stringify(this.comments)
    }
    
    // Update request changes button state
    this.updateRequestChangesButton()
    
    // Get the correct editor
    const editor = comment.side === 'original' ? 
      this.currentEditor.getOriginalEditor() : 
      this.currentEditor.getModifiedEditor()
    
    // Remove view zone
    if (comment.zoneId) {
      editor.changeViewZones(accessor => {
        accessor.removeZone(comment.zoneId)
      })
    }
    
    // If no more comments on this line, remove decoration
    const hasMoreComments = fileComments.some(c => 
      c.lineNumber === comment.lineNumber && c.side === comment.side
    )
    
    if (!hasMoreComments) {
      // Find and remove the decoration for this line
      this.removeCommentDecoration(comment.lineNumber, comment.side)
    }
    
    // Show notification
    this.showNotification('Comment deleted', 'info')
  }
  
  removeCommentDecoration(lineNumber, side) {
    const editor = side === 'original' ? 
      this.currentEditor.getOriginalEditor() : 
      this.currentEditor.getModifiedEditor()
    
    // Find the decoration for this line and side
    const decorationIndex = this.commentDecorations.findIndex(d => 
      d.lineNumber === lineNumber && d.side === side && d.editor === editor
    )
    
    if (decorationIndex > -1) {
      const decoration = this.commentDecorations[decorationIndex]
      // Remove the decoration
      editor.deltaDecorations(decoration.decorationId, [])
      // Remove from our tracking array
      this.commentDecorations.splice(decorationIndex, 1)
    }
  }
  
  clearCommentWidgets() {
    // Clear all comment widgets
    this.commentWidgets?.forEach(widget => {
      if (!widget.isDisposed && widget.editor) {
        widget.editor.removeContentWidget(widget)
      }
    })
    this.commentWidgets = []
    
    // Clear all decorations
    this.commentDecorations?.forEach(({ decorationId, editor }) => {
      if (decorationId && editor) {
        editor.deltaDecorations([decorationId], [])
      }
    })
    this.commentDecorations = []
  }
  
  clearComments() {
    // Clear widgets first
    this.clearCommentWidgets()
    
    // Then clear all comment data
    this.comments = {}
  }
  
  updateRequestChangesButton() {
    const requestChangesButton = this.modal?.querySelector('[data-git-diff-modal-target="requestChangesButton"]')
    if (!requestChangesButton) return
    
    // Count total comments across all files
    let totalComments = 0
    for (const fileComments of Object.values(this.comments || {})) {
      if (Array.isArray(fileComments)) {
        totalComments += fileComments.length
      }
    }
    
    // Update button state based on comment count
    if (totalComments === 0) {
      // Disable button
      requestChangesButton.disabled = true
      requestChangesButton.title = "Add comments to request changes"
      
      // Update classes to show disabled state
      requestChangesButton.className = 'px-3 py-1.5 text-xs font-medium rounded bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed opacity-50'
    } else {
      // Enable button
      requestChangesButton.disabled = false
      requestChangesButton.title = `Send ${totalComments} comment${totalComments > 1 ? 's' : ''} to session`
      
      // Update classes to show enabled state
      requestChangesButton.className = 'px-3 py-1.5 text-xs font-medium rounded bg-yellow-600 hover:bg-yellow-700 text-white transition-colors cursor-pointer'
    }
  }
}