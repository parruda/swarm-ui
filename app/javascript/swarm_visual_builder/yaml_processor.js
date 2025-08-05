// YAML processing for SwarmVisualBuilder
import jsyaml from "js-yaml"

export default class YamlProcessor {
  constructor(controller) {
    this.controller = controller
  }

  // Update YAML preview
  updateYamlPreview() {
    const swarmData = this.buildSwarmData()
    const yaml = this.generateReadableYaml(swarmData)
    this.controller.yamlPreviewTarget.querySelector('pre').textContent = yaml
  }

  // Generate readable YAML with proper multiline formatting
  generateReadableYaml(data) {
    // Use js-yaml with custom options for better formatting
    const yaml = jsyaml.dump(data, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
      quotingType: '"',
      forceQuotes: false
    })
    
    // Post-process to ensure proper | formatting for multiline strings
    const lines = yaml.split('\n')
    const processedLines = []
    let i = 0
    
    while (i < lines.length) {
      const line = lines[i]
      
      // Check if this is a prompt or description field with a long value in quotes
      const quotedMatch = line.match(/^(\s*)(prompt|description):\s*["'](.*)["']\s*$/)
      if (quotedMatch) {
        const indent = quotedMatch[1]
        const field = quotedMatch[2]
        const value = quotedMatch[3]
        
        // If the value is long or contains special characters, use | literal style
        if (value.length > 60 || value.includes('\\n')) {
          // Unescape the string
          const unescapedValue = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'")
          
          processedLines.push(`${indent}${field}: |`)
          
          // Split into lines and add with proper indentation
          const valueLines = unescapedValue.split('\n')
          valueLines.forEach(valueLine => {
            processedLines.push(`${indent}  ${valueLine}`)
          })
          
          i++
          continue
        }
      }
      
      // Check for multiline string indicators from js-yaml (both > and |)
      const multilineMatch = line.match(/^(\s*)(prompt|description):\s*[|>]-?\s*$/)
      if (multilineMatch) {
        const indent = multilineMatch[1]
        const field = multilineMatch[2]
        
        // Replace > with | to use literal style instead of folded style
        processedLines.push(`${indent}${field}: |`)
        i++
        
        // Include the indented content lines
        while (i < lines.length && lines[i].match(/^\s+/)) {
          processedLines.push(lines[i])
          i++
        }
        continue
      }
      
      processedLines.push(line)
      i++
    }
    
    return processedLines.join('\n')
  }

  // Build swarm data structure for YAML export
  buildSwarmData() {
    const instances = {}
    
    // Determine main instance key first
    const mainNodeId = this.controller.mainNodeId || (this.controller.nodeManager.getNodes()[0]?.id)
    
    // Build instances
    this.controller.nodeManager.getNodes().forEach(node => {
      const key = node.data.name.toLowerCase().replace(/\s+/g, '_')
      this.controller.nodeKeyMap.set(node.id, key)
      
      // Check if this is the main instance
      const isMainInstance = node.id === mainNodeId
      
      // Create instance with proper structure
      const instance = {}
      
      // REQUIRED: description field
      const description = node.data.description || node.data.config?.description || `Instance for ${node.data.name}`
      instance.description = description
      
      // Optional fields only added if they have values
      const model = node.data.model || node.data.config?.model
      if (model && model !== 'sonnet') {
        instance.model = model
      }
      
      const provider = node.data.provider || node.data.config?.provider
      // IMPORTANT: Main instance cannot have provider field in the YAML (claude-swarm rule)
      if (!isMainInstance && provider && provider !== 'claude') {
        instance.provider = provider
      }
      
      if (node.data.directory || node.data.config?.directory) {
        instance.directory = node.data.directory || node.data.config.directory
      }
      
      // Use 'prompt' instead of 'system_prompt' for claude-swarm compliance
      if (node.data.system_prompt) {
        instance.prompt = node.data.system_prompt
      }
      
      // Handle OpenAI-specific fields
      if (provider === 'openai') {
        // Check if it's an o-series model
        const isOSeries = model && /^o\d/.test(model)
        
        // Temperature not allowed for o-series models
        if (!isOSeries && (node.data.temperature || node.data.config?.temperature)) {
          instance.temperature = parseFloat(node.data.temperature || node.data.config.temperature)
        }
        
        // Reasoning effort only for o-series models
        if (isOSeries && (node.data.reasoning_effort || node.data.config?.reasoning_effort)) {
          instance.reasoning_effort = node.data.reasoning_effort || node.data.config.reasoning_effort
        }
      }
      
      // Handle vibe mode and allowed tools (not for OpenAI instances)
      if (provider !== 'openai') {
        if (node.data.vibe || node.data.config?.vibe) {
          instance.vibe = true
        } else if (node.data.allowed_tools?.length > 0 || node.data.config?.allowed_tools?.length > 0) {
          instance.allowed_tools = node.data.allowed_tools || node.data.config.allowed_tools
        }
      }
      
      // Add MCP servers if present
      if (node.data.mcps && node.data.mcps.length > 0) {
        instance.mcps = node.data.mcps
      }
      
      instances[key] = instance
    })
    
    // Build connections - connections go on the source node listing destinations
    this.controller.connectionManager.getConnections().forEach(conn => {
      const fromKey = this.controller.nodeKeyMap.get(conn.from)
      const toKey = this.controller.nodeKeyMap.get(conn.to)
      
      if (fromKey && toKey) {
        if (!instances[fromKey].connections) {
          instances[fromKey].connections = []
        }
        // Avoid duplicates
        if (!instances[fromKey].connections.includes(toKey)) {
          instances[fromKey].connections.push(toKey)
        }
      }
    })
    
    // Build final structure compliant with claude-swarm
    const swarmName = this.controller.nameInputTarget.value || 'my_swarm'
    const mainKey = this.controller.mainNodeId ? this.controller.nodeKeyMap.get(this.controller.mainNodeId) : Object.keys(instances)[0]
    
    // Create proper claude-swarm YAML structure
    const result = {
      version: 1,
      swarm: {
        name: swarmName,
        instances: instances
      }
    }
    
    // Only add main key if there are instances and a main is defined
    if (mainKey && Object.keys(instances).length > 0) {
      result.swarm.main = mainKey
    }
    
    // Note: tags are NOT included in the YAML - they're for SwarmUI database only
    
    return result
  }

  // Import YAML file
  async importYaml() {
    this.controller.importInputTarget.click()
  }
  
  // Import from YAML string (for paste functionality)
  async importFromYamlString(yamlContent) {
    try {
      const data = jsyaml.load(yamlContent)
      await this.loadFromYamlData(data)
    } catch (error) {
      console.error('Import error:', error)
      alert('Failed to import YAML: ' + error.message)
    }
  }

  async handleImportFile(e) {
    const file = e.target.files[0]
    if (!file) return
    
    const content = await file.text()
    
    try {
      const data = jsyaml.load(content)
      await this.loadFromYamlData(data)
    } catch (error) {
      console.error('Import error:', error)
      alert('Failed to import file: ' + error.message)
    }
    
    // Reset input
    e.target.value = ''
  }

  // Load swarm data from parsed YAML
  async loadFromYamlData(data) {
    // Handle claude-swarm format (version: 1, swarm: {...})
    let swarmData = null
    let swarmName = null
    let tags = []
    
    if (data.version === 1 && data.swarm) {
      // Standard claude-swarm format
      swarmData = data.swarm
      swarmName = swarmData.name || this.controller.nameInputTarget.value || 'imported_swarm'
    } else {
      // Legacy format or SwarmUI export format - look for first object with instances
      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object' && value.instances) {
          swarmData = value
          swarmName = key
          // Extract tags if present (SwarmUI-specific)
          if (value.tags) {
            tags = value.tags
          }
          break
        }
      }
    }
    
    if (!swarmData || !swarmData.instances) {
      console.error('Invalid swarm data format')
      return
    }
    
    // Clear existing canvas (skip confirmation for programmatic refresh)
    this.controller.clearAll(true)
    
    // Set name and tags
    if (swarmName) {
      this.controller.nameInputTarget.value = swarmName
    }
    if (tags.length > 0) {
      this.controller.tags = tags
      this.controller.renderTags()
    }
    
    // Import nodes
    const importedNodes = this.controller.nodeManager.importNodes(swarmData)
    
    // Render all nodes
    importedNodes.forEach(node => {
      this.controller.renderNode(node)
    })
    
    // Set main node if specified
    if (swarmData.main) {
      const mainNode = importedNodes.find(n => 
        n.data.name.toLowerCase().replace(/\s+/g, '_') === swarmData.main
      )
      if (mainNode) {
        this.controller.setMainNode(mainNode.id)
      }
    }
    
    // Create connections
    Object.entries(swarmData.instances).forEach(([instanceKey, instanceData]) => {
      if (instanceData.connections) {
        const fromNode = importedNodes.find(n => 
          n.data.name.toLowerCase().replace(/\s+/g, '_') === instanceKey
        )
        
        if (fromNode) {
          instanceData.connections.forEach(toKey => {
            const toNode = importedNodes.find(n => 
              n.data.name.toLowerCase().replace(/\s+/g, '_') === toKey
            )
            
            if (toNode) {
              const { fromSide, toSide } = this.controller.connectionManager.findBestSocketPair(fromNode, toNode)
              this.controller.connectionManager.createConnection(fromNode.id, fromSide, toNode.id, toSide)
            }
          })
        }
      }
    })
    
    // Auto-layout and update
    await this.controller.autoLayout()
    
    // Center view on imported nodes if any
    if (importedNodes.length > 0) {
      const bounds = this.controller.nodeManager.getNodesBounds()
      const centerX = (bounds.minX + bounds.maxX) / 2 + this.controller.canvasCenter
      const centerY = (bounds.minY + bounds.maxY) / 2 + this.controller.canvasCenter
      
      const containerRect = this.controller.container.getBoundingClientRect()
      this.controller.container.scrollLeft = centerX * this.controller.zoomLevel - containerRect.width / 2
      this.controller.container.scrollTop = centerY * this.controller.zoomLevel - containerRect.height / 2
    }
    
    this.updateYamlPreview()
  }

  // Handle canvas refresh when Claude modifies the file
  async handleCanvasRefresh(event) {
    const filePath = event.detail?.filePath
    if (!filePath || filePath !== this.controller.filePathValue) return
    
    // Debounce multiple refresh requests
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout)
    }
    
    // Set a flag to prevent duplicate refreshes
    if (this.controller.isRefreshing) {
      return
    }
    
    // Wait a bit to collect all refresh events, then execute once
    this.refreshTimeout = setTimeout(async () => {
      // Prevent duplicate refreshes
      if (this.controller.isRefreshing) return
      this.controller.isRefreshing = true
      
      // Reload the file content from server
      try {
        const response = await fetch(`/api/swarm_files/read?path=${encodeURIComponent(filePath)}`)
        if (!response.ok) throw new Error('Failed to read file')
        
        const data = await response.json()
        if (data.yaml_content) {
          // Parse and reload the YAML content
          const yamlData = jsyaml.load(data.yaml_content)
          await this.loadFromYamlData(yamlData)
          this.updateYamlPreview()
          
          // Show a brief notification
          this.controller.uiComponents.showNotification('Canvas refreshed with latest changes')
        }
      } catch (error) {
        console.error('Error refreshing canvas:', error)
      } finally {
        // Reset the flag after a delay to allow for the next refresh
        setTimeout(() => {
          this.controller.isRefreshing = false
        }, 1000)
      }
    }, 500) // Wait 500ms to debounce multiple events
  }
}