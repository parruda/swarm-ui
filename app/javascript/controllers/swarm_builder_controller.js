import { Controller } from "@hotwired/stimulus"

export default class extends Controller {
  static targets = [
    "configData",
    "instancesContainer", 
    "yamlPreview",
    "instancePickerModal",
    "templatesTab",
    "customTab",
    "customInstanceForm",
    "instanceConfigModal",
    "instanceConfigForm"
  ]
  
  connect() {
    this.instances = {}
    this.connections = {}
    this.nextInstanceId = 1
    
    // Load existing config if editing
    const existingConfig = this.getExistingConfig()
    if (existingConfig && existingConfig.swarm && existingConfig.swarm.instances) {
      this.loadExistingInstances(existingConfig.swarm.instances)
    }
    
    this.updateYamlPreview()
    
    // Listen for name changes
    const nameField = document.querySelector('#swarm_template_name')
    if (nameField) {
      nameField.addEventListener('input', () => {
        this.updateConfigData()
        this.updateYamlPreview()
      })
    }
  }
  
  getExistingConfig() {
    try {
      return JSON.parse(this.configDataTarget.value || '{}')
    } catch (e) {
      console.error('Failed to parse config data:', e)
      return {}
    }
  }
  
  loadExistingInstances(instances) {
    Object.entries(instances).forEach(([key, config]) => {
      // Extract connections from config
      const connections = config.connections || []
      const instanceConfig = { ...config }
      delete instanceConfig.connections // Remove from config as we track separately
      
      this.instances[key] = {
        id: this.nextInstanceId++,
        key: key,
        config: instanceConfig
      }
      
      if (connections.length > 0) {
        this.connections[key] = connections
      }
    })
    
    this.renderInstances()
  }
  
  // Instance Picker Modal
  openInstancePicker() {
    this.instancePickerModalTarget.classList.remove("hidden")
  }
  
  closeInstancePicker() {
    this.instancePickerModalTarget.classList.add("hidden")
  }
  
  switchTab(event) {
    const tab = event.currentTarget.dataset.tab
    
    // Update tab styles
    event.currentTarget.parentElement.querySelectorAll("button").forEach(btn => {
      btn.classList.remove("border-orange-500", "text-orange-600", "dark:text-orange-400")
      btn.classList.add("border-transparent", "text-gray-500", "dark:text-gray-400")
    })
    
    event.currentTarget.classList.remove("border-transparent", "text-gray-500", "dark:text-gray-400")
    event.currentTarget.classList.add("border-orange-500", "text-orange-600", "dark:text-orange-400")
    
    // Show/hide tab content
    if (tab === "templates") {
      this.templatesTabTarget.classList.remove("hidden")
      this.customTabTarget.classList.add("hidden")
    } else {
      this.templatesTabTarget.classList.add("hidden")
      this.customTabTarget.classList.remove("hidden")
    }
  }
  
  selectInstanceTemplate(event) {
    const templateEl = event.currentTarget
    const templateId = templateEl.dataset.templateId
    const templateName = templateEl.dataset.templateName
    const templateConfig = JSON.parse(templateEl.dataset.templateConfig)
    
    // Generate unique instance key
    const baseKey = templateName.toLowerCase().replace(/[^a-z]/g, '_')
    let instanceKey = baseKey
    let counter = 1
    
    while (this.instances[instanceKey]) {
      instanceKey = `${baseKey}_${counter}`
      counter++
    }
    
    // Add instance with template config
    this.addInstance(instanceKey, {
      ...templateConfig,
      instance_template_id: templateId
    })
    
    this.closeInstancePicker()
  }
  
  addCustomInstance(event) {
    event.preventDefault()
    
    const form = this.customInstanceFormTarget
    const formData = new FormData(form)
    
    const instanceKey = formData.get('instance_key')
    const config = {
      description: formData.get('description'),
      provider: formData.get('provider'),
      model: formData.get('model'),
      directory: formData.get('directory') || '.',
      allowed_tools: formData.getAll('allowed_tools[]')
    }
    
    if (!instanceKey || !config.description) {
      alert('Instance key and description are required')
      return
    }
    
    if (this.instances[instanceKey]) {
      alert('An instance with this key already exists')
      return
    }
    
    this.addInstance(instanceKey, config)
    form.reset()
    this.closeInstancePicker()
  }
  
  addInstance(key, config) {
    this.instances[key] = {
      id: this.nextInstanceId++,
      key: key,
      config: config
    }
    
    this.renderInstances()
    this.updateConfigData()
    this.updateYamlPreview()
  }
  
  removeInstance(event) {
    const instanceKey = event.currentTarget.dataset.instanceKey
    
    // Remove instance
    delete this.instances[instanceKey]
    
    // Remove connections to/from this instance
    Object.keys(this.connections).forEach(fromKey => {
      this.connections[fromKey] = this.connections[fromKey]?.filter(toKey => toKey !== instanceKey)
      if (this.connections[fromKey]?.length === 0) {
        delete this.connections[fromKey]
      }
    })
    delete this.connections[instanceKey]
    
    this.renderInstances()
    this.updateConfigData()
    this.updateYamlPreview()
  }
  
  renderInstances() {
    if (Object.keys(this.instances).length === 0) {
      this.instancesContainerTarget.innerHTML = `
        <div class="text-center py-8 text-gray-500 dark:text-gray-400">
          <svg class="h-12 w-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <p>No instances added yet. Click "Add Instance" to begin.</p>
        </div>
      `
      return
    }
    
    let html = ''
    let isFirst = true
    
    Object.entries(this.instances).forEach(([key, instance]) => {
      const config = instance.config
      const isMain = isFirst // First instance is main by default
      isFirst = false
      
      html += `
        <div class="relative rounded-lg border ${isMain ? 'border-orange-500 dark:border-orange-400' : 'border-gray-300 dark:border-gray-600'} bg-white dark:bg-gray-700 px-4 py-4 shadow-sm">
          ${isMain ? '<div class="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-2 py-1 rounded">Main</div>' : ''}
          
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100">${key}</h4>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">${config.description || 'No description'}</p>
              
              <div class="mt-2 flex flex-wrap gap-2">
                <span class="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:text-blue-200">
                  ${config.model || 'sonnet'}
                </span>
                <span class="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-200">
                  ${config.directory || '.'}
                </span>
                ${(config.allowed_tools || []).length > 0 ? `
                  <span class="inline-flex items-center rounded-full bg-green-100 dark:bg-green-900 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:text-green-200">
                    ${config.allowed_tools.length} tools
                  </span>
                ` : ''}
              </div>
              
              <!-- Connections -->
              <div class="mt-3">
                <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Connects to:</label>
                <div class="flex flex-wrap gap-1">
                  ${Object.keys(this.instances)
                    .filter(k => k !== key)
                    .map(targetKey => {
                      const isConnected = this.connections[key]?.includes(targetKey)
                      return `
                        <button type="button"
                                data-action="click->swarm-builder#toggleConnection"
                                data-from-key="${key}"
                                data-to-key="${targetKey}"
                                class="inline-flex items-center rounded px-2 py-1 text-xs font-medium transition-colors ${
                                  isConnected 
                                    ? 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200' 
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }">
                          ${targetKey}
                        </button>
                      `
                    }).join('')}
                </div>
              </div>
            </div>
            
            <div class="ml-4 flex-shrink-0">
              <button type="button"
                      data-action="click->swarm-builder#removeInstance"
                      data-instance-key="${key}"
                      class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      `
    })
    
    this.instancesContainerTarget.innerHTML = html
  }
  
  toggleConnection(event) {
    const fromKey = event.currentTarget.dataset.fromKey
    const toKey = event.currentTarget.dataset.toKey
    
    if (!this.connections[fromKey]) {
      this.connections[fromKey] = []
    }
    
    const index = this.connections[fromKey].indexOf(toKey)
    if (index > -1) {
      this.connections[fromKey].splice(index, 1)
      if (this.connections[fromKey].length === 0) {
        delete this.connections[fromKey]
      }
    } else {
      // Check for circular dependency
      if (this.wouldCreateCycle(fromKey, toKey)) {
        alert('This connection would create a circular dependency')
        return
      }
      this.connections[fromKey].push(toKey)
    }
    
    this.renderInstances()
    this.updateConfigData()
    this.updateYamlPreview()
  }
  
  wouldCreateCycle(from, to) {
    // Simple DFS to detect cycles
    const visited = new Set()
    const recursionStack = new Set()
    
    const hasCycle = (node) => {
      visited.add(node)
      recursionStack.add(node)
      
      const neighbors = this.connections[node] || []
      
      // Check if adding this edge would create a cycle
      if (node === from) {
        neighbors.push(to)
      }
      
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor)) return true
        } else if (recursionStack.has(neighbor)) {
          return true
        }
      }
      
      recursionStack.delete(node)
      return false
    }
    
    // Start DFS from all nodes
    for (const node of Object.keys(this.instances)) {
      if (!visited.has(node)) {
        if (hasCycle(node)) return true
      }
    }
    
    return false
  }
  
  updateConfigData() {
    const instances = {}
    const instanceKeys = Object.keys(this.instances)
    
    // Build instances config
    instanceKeys.forEach(key => {
      const instance = this.instances[key]
      const config = { ...instance.config }
      
      // Add connections if any
      if (this.connections[key]?.length > 0) {
        config.connections = this.connections[key]
      }
      
      instances[key] = config
    })
    
    const configData = {
      version: 1,
      swarm: {
        name: document.querySelector('#swarm_template_name')?.value || 'Untitled Swarm',
        main: instanceKeys[0] || null, // First instance is main
        instances: instances
      }
    }
    
    this.configDataTarget.value = JSON.stringify(configData)
  }
  
  updateYamlPreview() {
    const config = JSON.parse(this.configDataTarget.value || '{}')
    
    // Simple YAML generation (in production, use a proper YAML library)
    let yaml = 'version: 1\n'
    yaml += 'swarm:\n'
    yaml += `  name: "${config.swarm?.name || ''}"\n`
    
    if (config.swarm?.main) {
      yaml += `  main: ${config.swarm.main}\n`
    }
    
    yaml += '  instances:\n'
    
    Object.entries(config.swarm?.instances || {}).forEach(([key, instance]) => {
      yaml += `    ${key}:\n`
      yaml += `      description: "${instance.description || ''}"\n`
      
      if (instance.model) yaml += `      model: ${instance.model}\n`
      if (instance.provider && instance.provider !== 'claude') yaml += `      provider: ${instance.provider}\n`
      if (instance.directory && instance.directory !== '.') yaml += `      directory: "${instance.directory}"\n`
      
      if (instance.allowed_tools?.length > 0) {
        yaml += '      allowed_tools:\n'
        instance.allowed_tools.forEach(tool => {
          yaml += `        - ${tool}\n`
        })
      }
      
      if (instance.connections?.length > 0) {
        yaml += '      connections:\n'
        instance.connections.forEach(conn => {
          yaml += `        - ${conn}\n`
        })
      }
    })
    
    this.yamlPreviewTarget.textContent = yaml
  }
}