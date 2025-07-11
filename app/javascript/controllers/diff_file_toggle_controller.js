import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  connect() {
    // Find all file wrappers and make their headers clickable
    this.element.querySelectorAll('.d2h-file-wrapper').forEach(fileWrapper => {
      const header = fileWrapper.querySelector('.d2h-file-header')
      if (!header) return
      
      // Make header clickable
      header.style.cursor = 'pointer'
      header.style.userSelect = 'none'
      
      // Add chevron icon
      const chevron = document.createElement('span')
      chevron.className = 'diff-toggle-chevron'
      chevron.style.cssText = 'float: right; margin-top: -2px;'
      chevron.innerHTML = `
        <svg class="diff-toggle-icon inline-block w-4 h-4 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
        </svg>
      `
      header.appendChild(chevron)
      
      // Get the content wrapper within the file wrapper
      const contentWrapper = fileWrapper.querySelector('.d2h-wrapper')
      if (contentWrapper) {
        // Add click handler
        header.addEventListener('click', (e) => {
          e.preventDefault()
          e.stopPropagation()
          this.toggle(header, contentWrapper)
        })
        
        // Start expanded
        contentWrapper.dataset.expanded = 'true'
      }
    })
  }

  toggle(header, contentWrapper) {
    const icon = header.querySelector('.diff-toggle-icon')
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

  // Expand all files
  expandAll(event) {
    event.preventDefault()
    this.element.querySelectorAll('.d2h-file-wrapper').forEach(fileWrapper => {
      const contentWrapper = fileWrapper.querySelector('.d2h-wrapper')
      const icon = fileWrapper.querySelector('.diff-toggle-icon')
      if (contentWrapper) {
        contentWrapper.style.display = ''
        contentWrapper.dataset.expanded = 'true'
        if (icon) icon.style.transform = 'rotate(0deg)'
      }
    })
  }

  // Collapse all files
  collapseAll(event) {
    event.preventDefault()
    this.element.querySelectorAll('.d2h-file-wrapper').forEach(fileWrapper => {
      const contentWrapper = fileWrapper.querySelector('.d2h-wrapper')
      const icon = fileWrapper.querySelector('.diff-toggle-icon')
      if (contentWrapper) {
        contentWrapper.style.display = 'none'
        contentWrapper.dataset.expanded = 'false'
        if (icon) icon.style.transform = 'rotate(-90deg)'
      }
    })
  }
}