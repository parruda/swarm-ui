// MCP Server management for SwarmVisualBuilder
export default class MCPManager {
  constructor(controller) {
    this.controller = controller
  }

  // Filter MCP servers in the left panel
  filterMcpServers(e) {
    const searchTerm = e.target.value.toLowerCase()
    const mcpServers = this.controller.mcpServersListTarget.querySelectorAll('[data-mcp-card]')
    
    mcpServers.forEach(card => {
      const name = card.dataset.mcpName.toLowerCase()
      const type = card.dataset.mcpType.toLowerCase()
      const element = card.querySelector('p')
      const description = element ? element.textContent.toLowerCase() : ''
      
      const matches = name.includes(searchTerm) || 
                     type.includes(searchTerm) || 
                     description.includes(searchTerm)
      
      card.style.display = matches ? 'block' : 'none'
    })
  }

  // Add MCP server to a node
  addMcpToNode(nodeId, mcpData) {
    const node = this.controller.nodeManager.findNode(nodeId)
    if (!node) return
    
    // Initialize mcps array if not exists
    if (!node.data.mcps) {
      node.data.mcps = []
    }
    
    // Check if this MCP is already added
    const exists = node.data.mcps.some(mcp => mcp.name === mcpData.name)
    if (exists) {
      return
    }
    
    // Convert server_type to type for claude-swarm compatibility
    const mcpConfig = {
      name: mcpData.config.name,
      type: mcpData.config.type === 'stdio' || mcpData.config.type === 'sse' ? mcpData.config.type : mcpData.type
    }
    
    // Add type-specific fields
    if (mcpConfig.type === 'stdio') {
      if (mcpData.config.command) mcpConfig.command = mcpData.config.command
      if (mcpData.config.args && mcpData.config.args.length > 0) mcpConfig.args = mcpData.config.args
      if (mcpData.config.env && Object.keys(mcpData.config.env).length > 0) mcpConfig.env = mcpData.config.env
    } else if (mcpConfig.type === 'sse') {
      if (mcpData.config.url) mcpConfig.url = mcpData.config.url
      if (mcpData.config.headers && Object.keys(mcpData.config.headers).length > 0) mcpConfig.headers = mcpData.config.headers
    }
    
    // Add to node's MCP list
    node.data.mcps.push(mcpConfig)
    
    // Update the node's visual representation
    this.updateNodeVisual(node)
    
    // Update properties panel if this node is selected
    if (this.controller.selectedNode?.id === nodeId) {
      this.controller.showNodeProperties(node)
    }
    
    // Update YAML preview
    this.controller.updateYamlPreview()
  }

  // Remove MCP server from node
  removeMcpFromNode(e) {
    const nodeId = parseInt(e.currentTarget.dataset.nodeId)
    const mcpName = e.currentTarget.dataset.mcpName
    
    const node = this.controller.nodeManager.findNode(nodeId)
    if (!node || !node.data.mcps) return
    
    // Remove the MCP
    node.data.mcps = node.data.mcps.filter(mcp => mcp.name !== mcpName)
    
    // Update the node's visual representation
    this.updateNodeVisual(node)
    
    // Update properties panel
    if (this.controller.selectedNode?.id === nodeId) {
      this.controller.showNodeProperties(node)
    }
    
    // Update YAML preview
    this.controller.updateYamlPreview()
  }

  // Update node's visual representation with MCP count
  updateNodeVisual(node) {
    if (!node.element) return
    
    const mcpCount = node.data.mcps?.length || 0
    
    // Find the node-tags container
    const tagsContainer = node.element.querySelector('.node-tags')
    if (!tagsContainer) return
    
    // Update MCP badge
    let mcpBadge = tagsContainer.querySelector('.bg-purple-100, .dark\\:bg-purple-900')
    
    if (mcpCount > 0) {
      if (!mcpBadge) {
        // Create new MCP badge
        mcpBadge = document.createElement('span')
        mcpBadge.className = 'node-tag bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300'
        
        // Insert after provider tag but before vibe tag if it exists
        const vibeTag = tagsContainer.querySelector('.vibe-tag')
        if (vibeTag) {
          tagsContainer.insertBefore(mcpBadge, vibeTag)
        } else {
          tagsContainer.appendChild(mcpBadge)
        }
      }
      mcpBadge.textContent = `MCP: ${mcpCount}`
      mcpBadge.title = `${mcpCount} MCP server${mcpCount > 1 ? 's' : ''}`
    } else if (mcpBadge) {
      // Remove MCP badge if no MCPs
      mcpBadge.remove()
    }
  }

  // Initialize MCP drag and drop
  initializeMcpDragAndDrop() {
    if (!this.controller.hasMcpServersListTarget) return
    
    this.controller.mcpServersListTarget.addEventListener('dragstart', (e) => {
      if (e.target.hasAttribute('data-mcp-card')) {
        const mcpData = {
          id: e.target.dataset.mcpId,
          name: e.target.dataset.mcpName,
          type: e.target.dataset.mcpType,
          config: JSON.parse(e.target.dataset.mcpConfig)
        }
        e.dataTransfer.setData('mcp', JSON.stringify(mcpData))
        e.dataTransfer.setData('type', 'mcp')
        e.dataTransfer.effectAllowed = 'copy'
        
        // Add visual indicator that we're dragging an MCP
        this.controller.isDraggingMcp = true
        this.controller.container.classList.add('dragging-mcp')
      }
    })
  }

  // Handle MCP drop highlighting
  handleMcpDragOver(e) {
    if (!this.controller.isDraggingMcp) return
    
    // Find the node under the cursor
    const element = document.elementFromPoint(e.clientX, e.clientY)
    const nodeEl = element?.closest('.swarm-node')
    
    // Clear previous highlights
    this.controller.viewport.querySelectorAll('.swarm-node.mcp-drop-target').forEach(n => {
      n.classList.remove('mcp-drop-target')
    })
    
    // Highlight the target node if found
    if (nodeEl) {
      nodeEl.classList.add('mcp-drop-target')
      e.dataTransfer.dropEffect = 'copy'
    } else {
      e.dataTransfer.dropEffect = 'none'
    }
  }

  // Cleanup after MCP drag ends
  cleanupMcpDrag() {
    // Clean up any remaining highlights
    this.controller.viewport.querySelectorAll('.swarm-node.mcp-drop-target').forEach(n => {
      n.classList.remove('mcp-drop-target')
    })
    this.controller.container.classList.remove('dragging-mcp')
    this.controller.isDraggingMcp = false
  }
}