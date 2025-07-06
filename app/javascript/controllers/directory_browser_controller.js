import { Controller } from "@hotwired/stimulus"

// Directory browser modal controller
export default class extends Controller {
  static targets = ["modal", "path", "entries", "selectedPath", "input"]
  
  connect() {
    console.log("Directory browser controller connected")
    this.currentPath = null
  }

  // Open the directory browser modal
  open(event) {
    event.preventDefault()
    this.modalTarget.classList.remove("hidden")
    
    // Start from home directory or current value
    const startPath = this.inputTarget.value || null
    this.browse(startPath)
  }

  // Close the directory browser modal
  close(event) {
    if (event) event.preventDefault()
    this.modalTarget.classList.add("hidden")
  }

  // Close modal when clicking outside
  closeOnClickOutside(event) {
    if (event.target === this.modalTarget) {
      this.close()
    }
  }

  // Browse to a specific directory
  async browse(path = null) {
    try {
      const url = new URL('/api/sessions/browse_directory', window.location.origin)
      if (path) url.searchParams.append('path', path)
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
      
      if (response.ok) {
        const data = await response.json()
        this.currentPath = data.data.current_path
        this.updateDisplay(data.data)
      } else {
        console.error('Failed to browse directory')
      }
    } catch (error) {
      console.error('Error browsing directory:', error)
    }
  }

  // Update the display with directory contents
  updateDisplay(data) {
    // Update current path display
    this.pathTarget.textContent = data.current_path
    this.selectedPathTarget.textContent = data.current_path
    
    // Clear and populate entries
    this.entriesTarget.innerHTML = ''
    
    data.entries.forEach(entry => {
      const div = document.createElement('div')
      div.className = 'flex items-center p-2 hover:bg-gray-100 cursor-pointer rounded'
      
      // Icon
      const icon = document.createElement('svg')
      icon.className = 'w-5 h-5 mr-2 text-gray-500'
      icon.innerHTML = entry.is_parent 
        ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 17l-5-5m0 0l5-5m-5 5h12"></path>'
        : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>'
      icon.setAttribute('fill', 'none')
      icon.setAttribute('viewBox', '0 0 24 24')
      icon.setAttribute('stroke', 'currentColor')
      
      // Name
      const name = document.createElement('span')
      name.className = 'flex-1'
      name.textContent = entry.name
      
      div.appendChild(icon)
      div.appendChild(name)
      
      // Click handler
      div.addEventListener('click', () => {
        this.browse(entry.path)
      })
      
      this.entriesTarget.appendChild(div)
    })
  }

  // Navigate to home directory
  goHome(event) {
    event.preventDefault()
    this.browse(null)
  }

  // Select the current directory
  selectDirectory(event) {
    event.preventDefault()
    this.inputTarget.value = this.currentPath
    
    // Trigger input event for configuration loader
    const inputEvent = new Event('input', { bubbles: true })
    this.inputTarget.dispatchEvent(inputEvent)
    
    this.close()
  }
}