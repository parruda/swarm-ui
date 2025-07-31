// Path rendering and SVG management
export default class PathRenderer {
  constructor(controller) {
    this.controller = controller
  }
  
  // Initialize SVG elements
  init(svg, viewport) {
    this.svg = svg
    this.viewport = viewport
    this.setupMarkers()
  }
  
  setupMarkers() {
    const defs = this.svg.querySelector('defs') || this.createDefs()
    
    // Create arrow marker
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker")
    marker.setAttribute('id', 'arrow')
    marker.setAttribute('viewBox', '0 0 10 10')
    marker.setAttribute('refX', '10')
    marker.setAttribute('refY', '5')
    marker.setAttribute('markerWidth', '6')
    marker.setAttribute('markerHeight', '6')
    marker.setAttribute('orient', 'auto-start-reverse')
    marker.setAttribute('fill', '#f97316')
    
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z')
    marker.appendChild(path)
    
    // Clear existing markers and add new one
    const existingMarker = defs.querySelector('#arrow')
    if (existingMarker) {
      existingMarker.remove()
    }
    defs.appendChild(marker)
  }
  
  createDefs() {
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs")
    this.svg.insertBefore(defs, this.svg.firstChild)
    return defs
  }
  
  // Render all connections
  renderConnections(connections, nodes) {
    const connectionsGroup = this.svg.querySelector('#connections')
    connectionsGroup.innerHTML = ''
    
    connections.forEach((conn, index) => {
      const path = this.createConnectionPath(conn, index, nodes)
      if (path) {
        connectionsGroup.appendChild(path)
      }
    })
  }
  
  createConnectionPath(conn, index, nodes) {
    const fromNode = nodes.find(n => n.id === conn.from)
    const toNode = nodes.find(n => n.id === conn.to)
    
    if (!fromNode || !toNode) return null
    
    const viewportRect = this.viewport.getBoundingClientRect()
    const fromSocket = this.viewport.querySelector(`.swarm-node[data-node-id="${conn.from}"] .socket[data-socket-side="${conn.fromSide}"]`)
    const toSocket = this.viewport.querySelector(`.swarm-node[data-node-id="${conn.to}"] .socket[data-socket-side="${conn.toSide}"]`)
    
    if (!fromSocket || !toSocket) return null
    
    const fromRect = fromSocket.getBoundingClientRect()
    const toRect = toSocket.getBoundingClientRect()
    
    const zoomLevel = this.controller.zoomLevel || 1
    const fromX = (fromRect.left - viewportRect.left + fromRect.width/2) / zoomLevel
    const fromY = (fromRect.top - viewportRect.top + fromRect.height/2) / zoomLevel
    const toX = (toRect.left - viewportRect.left + toRect.width/2) / zoomLevel
    const toY = (toRect.top - viewportRect.top + toRect.height/2) / zoomLevel
    
    // Generate smooth path
    const pathData = this.generateSmartPath(
      fromX, fromY, conn.fromSide,
      toX, toY, conn.toSide
    )
    
    // Create SVG path element
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path")
    path.setAttribute('d', pathData)
    path.setAttribute('stroke', '#f97316')
    path.setAttribute('stroke-width', '2')
    path.setAttribute('fill', 'none')
    path.setAttribute('marker-end', 'url(#arrow)')
    path.style.pointerEvents = 'stroke'
    path.style.cursor = 'pointer'
    path.classList.add('connection')
    path.dataset.connectionIndex = index
    
    return path
  }
  
  generateSmartPath(x1, y1, fromSide, x2, y2, toSide) {
    // Professional smooth curves like Figma/FigJam
    const dx = x2 - x1
    const dy = y2 - y1
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    // Dynamic control offset based on distance
    const baseOffset = Math.max(40, Math.min(200, distance * 0.4))
    
    // Generate smooth curve based on socket configuration
    if (this.isOppositeFlow(fromSide, toSide, dx, dy)) {
      // Smooth S-curve for opposite sides
      return this.generateSmoothSCurve(x1, y1, fromSide, x2, y2, toSide, baseOffset)
    } else if (this.isPerpendicularFlow(fromSide, toSide)) {
      // Single smooth curve for perpendicular connections
      return this.generateSmoothCornerCurve(x1, y1, fromSide, x2, y2, toSide, baseOffset)
    } else {
      // Loop back curve for same-side or awkward connections
      return this.generateLoopbackCurve(x1, y1, fromSide, x2, y2, toSide, baseOffset)
    }
  }
  
  isOppositeFlow(fromSide, toSide, dx, dy) {
    return (fromSide === 'right' && toSide === 'left' && dx > 0) ||
           (fromSide === 'left' && toSide === 'right' && dx < 0) ||
           (fromSide === 'bottom' && toSide === 'top' && dy > 0) ||
           (fromSide === 'top' && toSide === 'bottom' && dy < 0)
  }
  
  isPerpendicularFlow(fromSide, toSide) {
    const horizontal = ['left', 'right']
    const vertical = ['top', 'bottom']
    return (horizontal.includes(fromSide) && vertical.includes(toSide)) ||
           (vertical.includes(fromSide) && horizontal.includes(toSide))
  }
  
  generateSmoothSCurve(x1, y1, fromSide, x2, y2, toSide, offset) {
    // Smooth S-curve for natural opposite flow
    let path = `M ${x1} ${y1}`
    
    if (fromSide === 'right' && toSide === 'left') {
      const midX = (x1 + x2) / 2
      const cp1x = Math.max(x1 + offset, midX)
      const cp2x = Math.min(x2 - offset, midX)
      path += ` C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`
    } else if (fromSide === 'left' && toSide === 'right') {
      const midX = (x1 + x2) / 2
      const cp1x = Math.min(x1 - offset, midX)
      const cp2x = Math.max(x2 + offset, midX)  
      path += ` C ${cp1x} ${y1}, ${cp2x} ${y2}, ${x2} ${y2}`
    } else if (fromSide === 'bottom' && toSide === 'top') {
      const midY = (y1 + y2) / 2
      const cp1y = Math.max(y1 + offset, midY)
      const cp2y = Math.min(y2 - offset, midY)
      path += ` C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`
    } else if (fromSide === 'top' && toSide === 'bottom') {
      const midY = (y1 + y2) / 2 
      const cp1y = Math.min(y1 - offset, midY)
      const cp2y = Math.max(y2 + offset, midY)
      path += ` C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`
    }
    
    return path
  }
  
  generateSmoothCornerCurve(x1, y1, fromSide, x2, y2, toSide, offset) {
    // Single curve for perpendicular connections
    let path = `M ${x1} ${y1}`
    const straightExtension = 20
    const radius = Math.min(offset * 0.5, Math.abs(x2 - x1) * 0.3, Math.abs(y2 - y1) * 0.3)
    
    // Start with a straight segment
    let sx1 = x1, sy1 = y1
    switch (fromSide) {
      case 'right': sx1 = x1 + straightExtension; break
      case 'left': sx1 = x1 - straightExtension; break
      case 'bottom': sy1 = y1 + straightExtension; break
      case 'top': sy1 = y1 - straightExtension; break
    }
    
    // End with a straight segment
    let sx2 = x2, sy2 = y2
    switch (toSide) {
      case 'right': sx2 = x2 + straightExtension; break
      case 'left': sx2 = x2 - straightExtension; break
      case 'bottom': sy2 = y2 + straightExtension; break
      case 'top': sy2 = y2 - straightExtension; break
    }
    
    // Create smooth corner connection with bezier curve
    path = `M ${x1} ${y1} L ${sx1} ${sy1}`
    
    // Calculate control points for smooth bezier curve
    const cp1x = fromSide === 'left' || fromSide === 'right' ? sx1 + (sx2 - sx1) * 0.5 : sx1
    const cp1y = fromSide === 'top' || fromSide === 'bottom' ? sy1 + (sy2 - sy1) * 0.5 : sy1
    const cp2x = toSide === 'left' || toSide === 'right' ? sx2 + (sx1 - sx2) * 0.5 : sx2
    const cp2y = toSide === 'top' || toSide === 'bottom' ? sy2 + (sy1 - sy2) * 0.5 : sy2
    
    path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${sx2} ${sy2}`
    path += ` L ${x2} ${y2}`
    
    return path
  }
  
  generateLoopbackCurve(x1, y1, fromSide, x2, y2, toSide, offset) {
    // Elegant loopback for same-side or backward connections
    let path = `M ${x1} ${y1}`
    const loopOffset = offset * 1.5
    const straightExtension = 20
    
    // Start with straight segment
    let sx1 = x1, sy1 = y1
    switch (fromSide) {
      case 'right': sx1 = x1 + straightExtension; break
      case 'left': sx1 = x1 - straightExtension; break
      case 'bottom': sy1 = y1 + straightExtension; break
      case 'top': sy1 = y1 - straightExtension; break
    }
    
    let sx2 = x2, sy2 = y2
    switch (toSide) {
      case 'right': sx2 = x2 + straightExtension; break
      case 'left': sx2 = x2 - straightExtension; break
      case 'bottom': sy2 = y2 + straightExtension; break
      case 'top': sy2 = y2 - straightExtension; break
    }
    
    path = `M ${x1} ${y1} L ${sx1} ${sy1}`
    
    if ((fromSide === 'right' && toSide === 'left' && x2 <= x1) ||
        (fromSide === 'left' && toSide === 'right' && x2 >= x1)) {
      // Horizontal loopback
      const loopY = Math.min(sy1, sy2) - loopOffset
      path += ` Q ${sx1} ${loopY}, ${(sx1 + sx2) / 2} ${loopY}`
      path += ` Q ${sx2} ${loopY}, ${sx2} ${sy2}`
    } else if ((fromSide === 'bottom' && toSide === 'top' && y2 <= y1) ||
               (fromSide === 'top' && toSide === 'bottom' && y2 >= y1)) {
      // Vertical loopback
      const loopX = Math.min(sx1, sx2) - loopOffset
      path += ` Q ${loopX} ${sy1}, ${loopX} ${(sy1 + sy2) / 2}`
      path += ` Q ${loopX} ${sy2}, ${sx2} ${sy2}`
    } else {
      // General smooth curve
      const cp1x = sx1 + (fromSide === 'right' ? loopOffset : fromSide === 'left' ? -loopOffset : 0)
      const cp1y = sy1 + (fromSide === 'bottom' ? loopOffset : fromSide === 'top' ? -loopOffset : 0)
      const cp2x = sx2 + (toSide === 'right' ? loopOffset : toSide === 'left' ? -loopOffset : 0)
      const cp2y = sy2 + (toSide === 'bottom' ? loopOffset : toSide === 'top' ? -loopOffset : 0)
      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${sx2} ${sy2}`
    }
    
    path += ` L ${x2} ${y2}`
    
    return path
  }
  
  // Create drag preview path
  createDragPath(fromX, fromY, fromSide, toX, toY) {
    // Estimate the best target side based on position
    const dx = toX - fromX
    const dy = toY - fromY
    
    let toSide
    if (Math.abs(dx) > Math.abs(dy)) {
      toSide = dx > 0 ? 'left' : 'right'
    } else {
      toSide = dy > 0 ? 'top' : 'bottom'
    }
    
    return this.generateSmartPath(fromX, fromY, fromSide, toX, toY, toSide)
  }
  
  // Update drag preview
  updateDragPath(pathElement, pathData) {
    pathElement.setAttribute('d', pathData)
  }
}