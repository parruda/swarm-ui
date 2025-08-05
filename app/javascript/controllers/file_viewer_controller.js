import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static values = { 
    viewerId: String,
    directory: String 
  }
  
  connect() {
    console.log('File viewer controller connected', {
      viewerId: this.viewerIdValue,
      directory: this.directoryValue,
      element: this.element
    })
    
    this.monacoEditor = null
    this.openFiles = new Map()
    this.currentFile = null
    
    // Load Monaco Editor if not already loaded
    if (!window.monaco) {
      console.log('Loading Monaco Editor...')
      this.loadMonaco().then(() => {
        console.log('Monaco loaded, initializing...')
        this.initializeEditor()
        this.loadFileTree()
      }).catch(error => {
        console.error('Failed to load Monaco:', error)
      })
    } else {
      console.log('Monaco already loaded, initializing...')
      this.initializeEditor()
      this.loadFileTree()
    }
  }
  
  async loadMonaco() {
    return new Promise((resolve) => {
      // Add Monaco loader script if not present
      if (!document.querySelector('script[src*="monaco-editor"]')) {
        const loaderScript = document.createElement('script')
        loaderScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs/loader.min.js'
        document.head.appendChild(loaderScript)
        
        loaderScript.onload = () => {
          require.config({ 
            paths: { 
              'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' 
            }
          })
          
          require(['vs/editor/editor.main'], () => {
            resolve()
          })
        }
      } else {
        // Monaco is loading or loaded
        const checkMonaco = setInterval(() => {
          if (window.monaco) {
            clearInterval(checkMonaco)
            resolve()
          }
        }, 100)
      }
    })
  }
  
  initializeEditor() {
    const editorContainer = this.element.querySelector(`[data-monaco-editor="${this.viewerIdValue}"]`)
    
    this.monacoEditor = monaco.editor.create(editorContainer, {
      theme: 'vs-dark',
      fontSize: 14,
      fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, source-code-pro, monospace',
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      renderWhitespace: 'selection',
      readOnly: false
    })
    
    // Handle editor changes
    this.monacoEditor.onDidChangeModelContent(() => {
      if (this.currentFile && this.openFiles.has(this.currentFile)) {
        const fileData = this.openFiles.get(this.currentFile)
        fileData.modified = true
        fileData.content = this.monacoEditor.getValue()
        this.updateTabModified(this.currentFile, true)
      }
    })
  }
  
  async loadFileTree() {
    console.log('Loading file tree for directory:', this.directoryValue)
    const treeContainer = this.element.querySelector(`[data-file-tree="${this.viewerIdValue}"]`)
    
    if (!treeContainer) {
      console.error('Tree container not found for viewer:', this.viewerIdValue)
      return
    }
    
    try {
      console.log('Fetching files from API...')
      const response = await fetch(`/api/file_viewer/list_files?directory=${encodeURIComponent(this.directoryValue)}`)
      
      console.log('API response:', response.status)
      
      if (!response.ok) {
        treeContainer.innerHTML = `<div class="text-red-400 text-sm p-4">Error loading files: ${response.status}</div>`
        return
      }
      
      const data = await response.json()
      console.log('Files loaded:', data)
      
      if (data.error) {
        treeContainer.innerHTML = `<div class="text-red-400 text-sm p-4">Error: ${data.error}</div>`
        return
      }
      
      this.renderFileTree(data.files, this.directoryValue, treeContainer)
    } catch (error) {
      console.error('Failed to load file tree:', error)
      treeContainer.innerHTML = `<div class="text-red-400 text-sm p-4">Failed to load files: ${error.message}</div>`
    }
  }
  
  renderFileTree(files, basePath, container) {
    container.innerHTML = ''
    
    // Sort files: directories first, then files, alphabetically
    files.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })
    
    files.forEach(file => {
      const itemElement = this.createTreeItem(file, basePath)
      container.appendChild(itemElement)
    })
  }
  
  createTreeItem(file, basePath) {
    const itemContainer = document.createElement('div')
    
    const item = document.createElement('div')
    item.className = 'tree-item flex items-center gap-2 px-2 py-1 hover:bg-gray-700 cursor-pointer text-sm text-gray-300 select-none'
    item.dataset.path = `${basePath}/${file.name}`
    item.dataset.type = file.type
    
    // Icon
    const icon = document.createElement('span')
    icon.className = 'flex-shrink-0'
    if (file.type === 'directory') {
      icon.innerHTML = `<svg class="h-4 w-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
      </svg>`
    } else {
      icon.innerHTML = `<svg class="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
      </svg>`
    }
    
    // Name
    const name = document.createElement('span')
    name.className = 'truncate'
    name.textContent = file.name
    
    item.appendChild(icon)
    item.appendChild(name)
    itemContainer.appendChild(item)
    
    if (file.type === 'directory') {
      // Create children container
      const childrenContainer = document.createElement('div')
      childrenContainer.className = 'pl-4 hidden'
      childrenContainer.dataset.loaded = 'false'
      itemContainer.appendChild(childrenContainer)
      
      // Toggle on click
      item.addEventListener('click', async (e) => {
        e.stopPropagation()
        await this.toggleFolder(item, childrenContainer)
      })
    } else {
      // Open file on click
      item.addEventListener('click', () => this.openFile(item.dataset.path))
    }
    
    return itemContainer
  }
  
  async toggleFolder(folderElement, childrenContainer) {
    const icon = folderElement.querySelector('svg')
    
    if (childrenContainer.classList.contains('hidden')) {
      childrenContainer.classList.remove('hidden')
      
      // Load children if not loaded yet
      if (childrenContainer.dataset.loaded === 'false') {
        await this.loadFolderContents(folderElement.dataset.path, childrenContainer)
        childrenContainer.dataset.loaded = 'true'
      }
      
      // Update icon to open folder
      icon.innerHTML = '<path fill-rule="evenodd" d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v1H8a3 3 0 00-3 3v1.5a1.5 1.5 0 01-3 0V6z" clip-rule="evenodd"></path><path d="M6 12a2 2 0 012-2h8a2 2 0 012 2v2a2 2 0 01-2 2H2h2a2 2 0 002-2v-2z"></path>'
    } else {
      childrenContainer.classList.add('hidden')
      
      // Update icon to closed folder
      icon.innerHTML = '<path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>'
    }
  }
  
  async loadFolderContents(folderPath, container) {
    try {
      const response = await fetch(`/api/file_viewer/list_files?directory=${encodeURIComponent(folderPath)}`)
      
      if (!response.ok) {
        container.innerHTML = `<div class="text-red-400 text-xs p-2">Error: ${response.status}</div>`
        return
      }
      
      const data = await response.json()
      
      if (data.error) {
        container.innerHTML = `<div class="text-red-400 text-xs p-2">Error: ${data.error}</div>`
        return
      }
      
      this.renderFileTree(data.files, folderPath, container)
    } catch (error) {
      console.error('Failed to load folder contents:', error)
      container.innerHTML = `<div class="text-red-400 text-xs p-2">Failed to load folder</div>`
    }
  }
  
  async openFile(filepath) {
    // Check if file is already open
    if (this.openFiles.has(filepath)) {
      this.switchToFile(filepath)
      return
    }
    
    try {
      const response = await fetch(`/api/file_viewer/read_file?filepath=${encodeURIComponent(filepath)}`)
      
      if (!response.ok) {
        alert(`Failed to open file: ${response.status}`)
        return
      }
      
      const data = await response.json()
      
      if (data.error) {
        alert(`Failed to open file: ${data.error}`)
        return
      }
      
      // Add to open files
      this.openFiles.set(filepath, {
        content: data.content,
        language: this.detectLanguage(filepath),
        modified: false
      })
      
      // Create tab
      this.createTab(filepath)
      
      // Switch to this file
      this.switchToFile(filepath)
    } catch (error) {
      console.error('Failed to open file:', error)
      alert('Failed to open file')
    }
  }
  
  createTab(filepath) {
    const tabsContainer = this.element.querySelector(`[data-file-tabs="${this.viewerIdValue}"]`)
    const filename = filepath.split('/').pop()
    
    const tab = document.createElement('div')
    tab.className = 'flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-gray-300 border-r border-gray-700 hover:bg-gray-700 cursor-pointer text-sm'
    tab.dataset.filepath = filepath
    
    const nameSpan = document.createElement('span')
    nameSpan.className = 'truncate max-w-[150px]'
    nameSpan.textContent = filename
    nameSpan.title = filepath
    
    const closeBtn = document.createElement('button')
    closeBtn.className = 'p-0.5 rounded hover:bg-red-600/20'
    closeBtn.innerHTML = `<svg class="h-3 w-3 text-gray-400 hover:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>`
    closeBtn.onclick = (e) => {
      e.stopPropagation()
      this.closeFile(filepath)
    }
    
    tab.appendChild(nameSpan)
    tab.appendChild(closeBtn)
    tab.onclick = () => this.switchToFile(filepath)
    
    tabsContainer.appendChild(tab)
  }
  
  switchToFile(filepath) {
    if (!this.openFiles.has(filepath)) return
    
    this.currentFile = filepath
    const fileData = this.openFiles.get(filepath)
    
    // Update tabs
    const tabs = this.element.querySelectorAll(`[data-file-tabs="${this.viewerIdValue}"] > div`)
    tabs.forEach(tab => {
      if (tab.dataset.filepath === filepath) {
        tab.classList.remove('bg-gray-900', 'text-gray-300')
        tab.classList.add('bg-gray-800', 'text-white')
      } else {
        tab.classList.remove('bg-gray-800', 'text-white')
        tab.classList.add('bg-gray-900', 'text-gray-300')
      }
    })
    
    // Update editor
    const model = monaco.editor.createModel(fileData.content, fileData.language)
    this.monacoEditor.setModel(model)
  }
  
  closeFile(filepath) {
    const fileData = this.openFiles.get(filepath)
    
    if (fileData && fileData.modified) {
      if (!confirm(`File has unsaved changes. Close anyway?`)) {
        return
      }
    }
    
    this.openFiles.delete(filepath)
    
    // Remove tab
    const tab = this.element.querySelector(`[data-file-tabs="${this.viewerIdValue}"] > div[data-filepath="${filepath}"]`)
    if (tab) tab.remove()
    
    // If this was the current file, switch to another open file or clear editor
    if (this.currentFile === filepath) {
      const remainingFiles = Array.from(this.openFiles.keys())
      if (remainingFiles.length > 0) {
        this.switchToFile(remainingFiles[0])
      } else {
        this.currentFile = null
        this.monacoEditor.setValue('')
      }
    }
  }
  
  updateTabModified(filepath, modified) {
    const tab = this.element.querySelector(`[data-file-tabs="${this.viewerIdValue}"] > div[data-filepath="${filepath}"] span`)
    if (tab) {
      const filename = filepath.split('/').pop()
      tab.textContent = modified ? `• ${filename}` : filename
    }
  }
  
  detectLanguage(filepath) {
    const ext = filepath.split('.').pop().toLowerCase()
    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'rb': 'ruby',
      'py': 'python',
      'html': 'html',
      'erb': 'html',
      'css': 'css',
      'scss': 'scss',
      'json': 'json',
      'md': 'markdown',
      'yml': 'yaml',
      'yaml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
      'sh': 'shell',
      'bash': 'shell',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp'
    }
    
    return languageMap[ext] || 'plaintext'
  }
  
  disconnect() {
    if (this.monacoEditor) {
      this.monacoEditor.dispose()
    }
  }
}