const canvas = document.getElementById("circuitCanvas");
const ctx = canvas.getContext("2d");

let scale = 1;
let components = [];
let wires = [];
const gridSize = 20;
let drawingWire = false;
let wirePath = [];
let draggingComponent = null;
let draggingOffset = { x: 0, y: 0 };
let contextMenuComponent = null;
let contextMenuWire = null;
let selecting = false;
let selectionStart = { x: 0, y: 0 };
let selectionEnd = { x: 0, y: 0 };
let selectedItems = [];
const snapRadius = 20; // Define snap radius for easier connection
let panning = false;
let panStart = { x: 0, y: 0 };
let panOffset = { x: 0, y: 0 };
let spacePressed = false;
let mouseDown = false;
let isDragging = false;
let dragStartTime = 0;

let undoStack = [];
let redoStack = [];

let draggingSelection = false;
let selectionOffset = { x: 0, y: 0 };

let initialPositions = [];

let draggingWire = null;
let draggingWirePointIndex = null;

let isRunning = false;

// Increase canvas size
canvas.width = window.innerWidth * 2;
canvas.height = window.innerHeight * 2;

// Draw grid function
function drawGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(panOffset.x, panOffset.y);

    ctx.strokeStyle = "#ccc";
    ctx.lineWidth = 0.5;

    const startX = -panOffset.x % gridSize;
    const startY = -panOffset.y % gridSize;

    for (let x = startX; x < canvas.width / scale; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height / scale);
        ctx.stroke();
    }

    for (let y = startY; y < canvas.height / scale; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width / scale, y);
        ctx.stroke();
    }

    // Draw components
    components.forEach(component => {
        drawRotatedComponent(component);
    });

    // Draw wires
    wires.forEach(wire => drawWire(wire));

    // Draw active wire following mouse
    if (drawingWire && wirePath.length > 0) {
        ctx.strokeStyle = "black";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(wirePath[0].x, wirePath[0].y);

        for (let i = 1; i < wirePath.length; i++) {
            ctx.lineTo(wirePath[i].x, wirePath[i].y);
        }

        ctx.lineTo(mouseX, mouseY);
        ctx.stroke();
    }

    // Draw selection rectangle
    if (selecting) {
        ctx.strokeStyle = "blue";
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(
            Math.min(selectionStart.x, selectionEnd.x),
            Math.min(selectionStart.y, selectionEnd.y),
            Math.abs(selectionEnd.x - selectionStart.x),
            Math.abs(selectionEnd.y - selectionStart.y)
        );
        ctx.setLineDash([]);
    }

    // Draw selected area with transparent light blue color
    if (selectedItems.length > 0 && !draggingSelection && !draggingComponent) {
        ctx.fillStyle = "rgba(173, 216, 230, 0.3)"; // Light blue with transparency
        ctx.fillRect(
            Math.min(selectionStart.x, selectionEnd.x),
            Math.min(selectionStart.y, selectionEnd.y),
            Math.abs(selectionEnd.x - selectionStart.x),
            Math.abs(selectionEnd.y - selectionStart.y)
        );
    }

    ctx.restore();
}

// Draw a component with rotation
function drawRotatedComponent(component) {
    ctx.save();

    // Get center of component
    let centerX = component.x + component.width / 2;
    let centerY = component.y + component.height / 2;

    // Move to center, rotate, then draw the image
    ctx.translate(centerX, centerY);
    ctx.rotate((component.rotation * Math.PI) / 180);
    ctx.drawImage(component.img, -component.width / 2, -component.height / 2, component.width, component.height);

    ctx.restore();

    // Draw connection nodes
    component.nodes.forEach(node => {
        ctx.fillStyle = "red";
        ctx.beginPath();
        ctx.arc(node.x, node.y, 4, 0, 2 * Math.PI);
        ctx.fill();
    });
}

// Draw an orthogonal wire
function drawWire(wire) {
    ctx.strokeStyle = wire.color || "black";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wire.path[0].x, wire.path[0].y);

    for (let i = 1; i < wire.path.length; i++) {
        ctx.lineTo(wire.path[i].x, wire.path[i].y);
    }

    ctx.stroke();
}

// Zoom in & zoom out
canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    scale *= zoomFactor;
    scale = Math.min(Math.max(0.5, scale), 2);
    drawGrid();
});

// Dragging from sidebar
document.querySelectorAll(".component, .logic-component, .pnp-component, .npn-component").forEach(comp => {
    comp.addEventListener("dragstart", (event) => {
        event.dataTransfer.setData("type", event.target.parentElement.getAttribute("data-type"));
        event.dataTransfer.setData("class", event.target.parentElement.className);
    });
});

canvas.addEventListener("dragover", (event) => {
    event.preventDefault();
});

canvas.addEventListener("drop", (event) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("type");
    const componentClass = event.dataTransfer.getData("class");
    const img = document.querySelector(`[data-type="${type}"] img`).cloneNode();

    let x = (event.offsetX - panOffset.x * scale) / scale;
    let y = (event.offsetY - panOffset.y * scale) / scale;

    // Snap to grid
    x = Math.round(x / gridSize) * gridSize;
    y = Math.round(y / gridSize) * gridSize;

    // Define connection nodes
    let nodes = [];
    if (componentClass.includes("logic-component")) {
        nodes = [
            { x: x - 10, y: y + 10 },  // Left top node
            { x: x - 10, y: y + 30 },  // Left bottom node
            { x: x + 80, y: y + 20 }  // Right node
        ];
    } else if (componentClass.includes("npn-component") || componentClass.includes("pnp-component")) {
        nodes = [
            { x: x - 10, y: y + 20 },  // Left node
            { x: x + 40, y: y + 10 },  // Right top node
            { x: x + 40, y: y + 30 }  // Right bottom node
        ];
    } else {
        nodes = [
            { x: x, y: y + 20 },  // Left node
            { x: x + 80, y: y + 20 }  // Right node
        ];
    }

    // Add new component
    const newComponent = { img, x, y, width: 80, height: 40, nodes, rotation: 0 };
    components.push(newComponent);
    updateNodes(newComponent);

    // Push action to undo stack
    undoStack.push({ action: "add", type: "component", component: newComponent });

    // Clear selected items to ensure blue transparent color does not reappear
    selectedItems = [];

    drawGrid();
});

// Track mouse position for live wire drawing
let mouseX = 0, mouseY = 0;
canvas.addEventListener("mousemove", (event) => {
    if (panning) {
        panOffset.x = Math.round((event.offsetX - panStart.x) / scale / gridSize) * gridSize;
        panOffset.y = Math.round((event.offsetY - panStart.y) / scale / gridSize) * gridSize;
        drawGrid();
        return;
    }

    mouseX = Math.round((event.offsetX - panOffset.x * scale) / scale / gridSize) * gridSize;
    mouseY = Math.round((event.offsetY - panOffset.y * scale) / scale / gridSize) * gridSize;

    if (drawingWire && wirePath.length > 0) {
        drawGrid();
    }

    if (draggingComponent) {
        let x = Math.round((event.offsetX - draggingOffset.x - panOffset.x * scale) / scale / gridSize) * gridSize;
        let y = Math.round((event.offsetY - draggingOffset.y - panOffset.y) / scale / gridSize) * gridSize;

        // Update component position
        draggingComponent.x = x;
        draggingComponent.y = y;

        // Update node positions
        updateNodes(draggingComponent);

        // Adjust connected wires
        updateWires();

        drawGrid();
        isDragging = true;
    }

    if (draggingSelection) {
        console.log("Dragging selection...");

        const mouseX = (event.offsetX - panOffset.x * scale) / scale;
        const mouseY = (event.offsetY - panOffset.y * scale) / scale;

        const deltaX = Math.round(mouseX / gridSize) * gridSize - selectionOffset.x;
        const deltaY = Math.round(mouseY / gridSize) * gridSize - selectionOffset.y;

        console.log(`DeltaX: ${deltaX}, DeltaY: ${deltaY}`);

        selectedItems.forEach(item => {
            if (item.path) {
                item.path.forEach(point => {
                    point.x = Math.round((point.x + deltaX) / gridSize) * gridSize;
                    point.y = Math.round((point.y + deltaY) / gridSize) * gridSize;
                });
            } else {
                item.x = Math.round((item.x + deltaX) / gridSize) * gridSize;
                item.y = Math.round((item.y + deltaY) / gridSize) * gridSize;
                updateNodes(item);
            }
        });

        selectionOffset.x = Math.round(mouseX / gridSize) * gridSize;
        selectionOffset.y = Math.round(mouseY / gridSize) * gridSize;

        updateWires();
        drawGrid();
    }

    if (selecting) {
        selectionEnd.x = (event.offsetX - panOffset.x * scale) / scale;
        selectionEnd.y = (event.offsetY - panOffset.y * scale) / scale;
        drawGrid();
    }

    if (draggingWire && draggingWirePointIndex !== null) {
        let x = Math.round((event.offsetX - panOffset.x * scale) / scale / gridSize) * gridSize;
        let y = Math.round((event.offsetY - panOffset.y * scale) / scale / gridSize) * gridSize;

        // Ensure orthogonal movement
        let prevPoint = draggingWire.path[draggingWirePointIndex - 1];
        let nextPoint = draggingWire.path[draggingWirePointIndex + 1];
        if (prevPoint) {
            if (Math.abs(x - prevPoint.x) > Math.abs(y - prevPoint.y)) {
                y = prevPoint.y;
            } else {
                x = prevPoint.x;
            }
        } else if (nextPoint) {
            if (Math.abs(x - nextPoint.x) > Math.abs(y - nextPoint.y)) {
                y = nextPoint.y;
            } else {
                x = nextPoint.x;
            }
        }

        draggingWire.path[draggingWirePointIndex].x = x;
        draggingWire.path[draggingWirePointIndex].y = y;

        updateWires();
        drawGrid();
    }
});

// Handle clicking to start wire, move components, pan grid, or select
canvas.addEventListener("mousedown", (event) => {
    const mouseX = (event.offsetX - panOffset.x * scale) / scale;
    const mouseY = (event.offsetY - panOffset.y * scale) / scale;

    mouseDown = true;
    isDragging = false;
    dragStartTime = Date.now();
    if (event.button === 2 || spacePressed) {
        // Start panning
        panning = true;
        panStart.x = event.offsetX - panOffset.x * scale;
        panStart.y = event.offsetY - panOffset.y * scale;
        return;
    }

    // Check if clicking near a node to start or complete a wire
    for (let comp of components) {
        for (let node of comp.nodes) {
            const dist = Math.sqrt((mouseX - node.x) ** 2 + (mouseY - node.y) ** 2);
            if (dist < snapRadius) {  // Use snap radius for easier connection
                if (!drawingWire) {
                    // Start a new wire
                    drawingWire = true;
                    wirePath = [{ x: node.x, y: node.y, component: comp, nodeIndex: comp.nodes.indexOf(node) }];
                } else {
                    // Complete the wire
                    let lastPoint = wirePath[wirePath.length - 1];
                    let x = Math.round(node.x / gridSize) * gridSize;
                    let y = Math.round(node.y / gridSize) * gridSize;

                    // Ensure orthogonal movement
                    if (Math.abs(x - lastPoint.x) > Math.abs(y - lastPoint.y)) {
                        y = lastPoint.y;
                    } else {
                        x = lastPoint.x;
                    }

                    wirePath.push({ x, y });
                    wirePath.push({ x: node.x, y: node.y, component: comp, nodeIndex: comp.nodes.indexOf(node) });
                    finalizeWire();
                }
                drawGrid();
                return;
            }
        }
    }

    // Check if clicking on a component to move it or toggle switch state
    for (let comp of components) {
        if (
            mouseX >= comp.x &&
            mouseX <= comp.x + comp.width &&
            mouseY >= comp.y &&
            mouseY <= comp.y + comp.height
        ) {
            if (selectedItems.includes(comp)) {
                draggingSelection = true;
                selectionOffset.x = mouseX;
                selectionOffset.y = mouseY;
                initialPositions = selectedItems.map(item => ({
                    item,
                    x: item.x,
                    y: item.y,
                    path: item.path ? item.path.map(point => ({ x: point.x, y: point.y })) : null
                }));
                console.log("Started dragging selection:", initialPositions);
            } else {
                draggingComponent = comp;
                draggingOffset.x = event.offsetX - (comp.x + panOffset.x) * scale;
                draggingOffset.y = event.offsetY - (comp.y + panOffset.y) * scale;
            }
            return;
        }
    }

    // Check if clicking within the selected area to drag the selection
    if (selectedItems.length > 0) {
        const selectionRect = {
            x: Math.min(selectionStart.x, selectionEnd.x),
            y: Math.min(selectionStart.y, selectionEnd.y),
            width: Math.abs(selectionEnd.x - selectionStart.x),
            height: Math.abs(selectionEnd.y - selectionStart.y),
        };

        if (
            mouseX >= selectionRect.x &&
            mouseX <= selectionRect.x + selectionRect.width &&
            mouseY >= selectionRect.y &&
            mouseY <= selectionRect.y + selectionRect.height
        ) {
            draggingSelection = true;
            selectionOffset.x = mouseX;
            selectionOffset.y = mouseY;
            initialPositions = selectedItems.map(item => ({
                item,
                x: item.x,
                y: item.y,
                path: item.path ? item.path.map(point => ({ x: point.x, y: point.y })) : null
            }));
            console.log("Started dragging selection:", initialPositions);
            return;
        }
    }

    // If clicked in the grid, add a waypoint (adjustment point)
    if (drawingWire) {
        let lastPoint = wirePath[wirePath.length - 1];
        let x = Math.round(mouseX / gridSize) * gridSize;
        let y = Math.round(mouseY / gridSize) * gridSize;

        // Ensure orthogonal movement
        if (Math.abs(x - lastPoint.x) > Math.abs(y - lastPoint.y)) {
            y = lastPoint.y;
        } else {
            x = lastPoint.x;
        }

        wirePath.push({ x, y });
        drawGrid();
    }

    // Start rectangular selection
    if (event.button === 0 && !draggingComponent && !drawingWire) {
        selecting = true;
        selectionStart.x = mouseX;
        selectionStart.y = mouseY;
        selectionEnd.x = mouseX;
        selectionEnd.y = mouseY;
        selectedItems = [];
        drawGrid();
    }

    if (event.button === 0 && !draggingComponent && !drawingWire && !selecting) {
        const mouseX = (event.offsetX - panOffset.x * scale) / scale;
        const mouseY = (event.offsetY - panOffset.y * scale) / scale;

        for (let wire of wires) {
            for (let i = 0; i < wire.path.length; i++) {
                const point = wire.path[i];
                const dist = Math.sqrt((mouseX - point.x) ** 2 + (mouseY - point.y) ** 2);
                if (dist < snapRadius) {
                    draggingWire = wire;
                    draggingWirePointIndex = i;
                    return;
                }
            }
        }
    }

    // Check if clicking on a switch in the selected items
    if (selectedItems.length > 0) {
        selectedItems.forEach(item => {
            if (item.img && item.img.alt === "Switch" &&
                mouseX >= item.x &&
                mouseX <= item.x + item.width &&
                mouseY >= item.y &&
                mouseY <= item.y + item.height) {
                toggleSwitch(item);
            }
        });
    }
});

canvas.addEventListener("mouseup", (event) => {
    mouseDown = false;
    const dragDuration = Date.now() - dragStartTime;
    if (!isDragging && dragDuration < 200 && draggingComponent && draggingComponent.img.alt === "Switch") {
        toggleSwitch(draggingComponent);
    }
    draggingComponent = null;
    panning = false;

    if (draggingSelection) {
        console.log("Stopped dragging selection.");

        draggingSelection = false;

        // Capture final positions for undo
        const finalPositions = selectedItems.map(item => ({
            item,
            x: item.x,
            y: item.y,
            path: item.path ? item.path.map(point => ({ x: point.x, y: point.y })) : null
        }));

        console.log("Final positions after dragging selection:", finalPositions);

        // Push action to undo stack
        undoStack.push({
            action: "move",
            initialPositions,
            finalPositions
        });

        redoStack = []; // Clear redo stack

        // Clear selected items to ensure blue transparent color does not reappear
        selectedItems = [];
    }

    if (selecting) {
        selecting = false;
        // Select components and wires within the selection rectangle
        const selectionRect = {
            x: Math.min(selectionStart.x, selectionEnd.x),
            y: Math.min(selectionStart.y, selectionEnd.y),
            width: Math.abs(selectionEnd.x - selectionStart.x),
            height: Math.abs(selectionEnd.y - selectionStart.y),
        };

        selectedItems = components.filter(comp => 
            comp.x + comp.width > selectionRect.x &&
            comp.x < selectionRect.x + selectionRect.width &&
            comp.y + comp.height > selectionRect.y &&
            comp.y < selectionRect.y + selectionRect.height
        );

        wires.forEach(wire => {
            const wireInRect = wire.path.some(point => 
                point.x >= selectionRect.x &&
                point.x <= selectionRect.x + selectionRect.width &&
                point.y >= selectionRect.y &&
                point.y <= selectionRect.y + selectionRect.height
            );
            if (wireInRect) {
                selectedItems.push(wire);
            }
        });

        drawGrid();
    }

    if (draggingWire) {
        draggingWire = null;
        draggingWirePointIndex = null;
    }

    // End dragging of selected items
    if (draggingSelection) {
        draggingSelection = false;
        console.log("Stopped dragging selected items.");
    }
});

// Update wires when components move
function updateWires() {
    wires.forEach(wire => {
        wire.path.forEach(point => {
            if (point.component) {
                let node = point.component.nodes[point.nodeIndex];
                point.x = node.x;
                point.y = node.y;
            }
        });
    });
}

// Update nodes when component is rotated or moved
function updateNodes(component) {
    const centerX = component.x + component.width / 2;
    const centerY = component.y + component.height / 2;

    component.nodes.forEach((node, index) => {
        let offsetX, offsetY;
        if (["And_gate", "Or_gate", "Nand_gate", "Nor_gate", "Xor_gate", "Xnor_gate"].includes(component.img.alt)) {
            offsetX = index === 2 ? component.width / 2 : -component.width / 2;
            offsetY = index === 0 ? -component.height / 3 : (index === 1 ? component.height / 3 : 0);
        } else if (["NPN", "PNP"].includes(component.img.alt)) {
            offsetX = index === 0 ? -component.width / 2 : component.width / 4;
            offsetY = index === 0 ? 0 : (index === 1 ? -component.height / 3 : component.height / 3);
        } else {
            offsetX = index === 0 ? -component.width / 2 : component.width / 2;
            offsetY = 0;
        }

        const rotatedX = offsetX * Math.cos((component.rotation * Math.PI) / 180) - offsetY * Math.sin((component.rotation * Math.PI) / 180);
        const rotatedY = offsetX * Math.sin((component.rotation * Math.PI) / 180) + offsetY * Math.cos((component.rotation * Math.PI) / 180);
        node.x = Math.round((centerX + rotatedX) / gridSize) * gridSize;
        node.y = Math.round((centerY + rotatedY) / gridSize) * gridSize;
    });
}

// Ensure nodes remain connected to components during drag operations
function updateNodesDuringDrag(component, deltaX, deltaY) {
    component.nodes.forEach(node => {
        node.x += deltaX;
        node.y += deltaY;
    });
}

// Context menu for components and wires
canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    const mouseX = (event.offsetX - panOffset.x * scale) / scale;
    const mouseY = (event.offsetY - panOffset.y * scale) / scale;
    contextMenuComponent = null;
    contextMenuWire = null;

    // Check if right-clicked on a component
    for (let comp of components) {
        if (
            mouseX >= comp.x &&
            mouseX <= comp.x + comp.width &&
            mouseY >= comp.y &&
            mouseY <= comp.y + comp.height
        ) {
            contextMenuComponent = comp;
            showContextMenu(event.pageX, event.pageY, true);
            return;
        }
    }

    // Check if right-clicked on a wire (including incomplete wires)
    const isOnWire = checkIfOnWire(mouseX, mouseY);
    if (isOnWire) {
        contextMenuWire = isOnWire;
        showContextMenu(event.pageX, event.pageY, false);
        return;
    }

    // If selection exists, show context menu for selected items
    if (selectedItems.length > 0) {
        showContextMenu(event.pageX, event.pageY, false, true);
    }
});

function checkIfOnWire(mouseX, mouseY) {
    for (let wire of wires) {
        for (let i = 0; i < wire.path.length - 1; i++) {
            const p1 = wire.path[i];
            const p2 = wire.path[i + 1];
            const dist = pointToSegmentDistance(mouseX, mouseY, p1, p2);
            if (dist < 10) {
                return wire;
            }
        }
    }
    return false;
}

// Show context menu
function showContextMenu(x, y, isComponent, isSelection = false) {
    const menu = document.createElement("div");
    menu.className = "context-menu show";
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Clear selected items to ensure blue transparent color does not reappear
    if (!isSelection) {
        selectedItems = [];
    }

    if (isComponent) {
        const rotateOption = document.createElement("div");
        rotateOption.innerText = "Rotate";
        rotateOption.onclick = function() {
            if (contextMenuComponent) {
                const previousRotation = contextMenuComponent.rotation;
                contextMenuComponent.rotation = (contextMenuComponent.rotation + 90) % 360;
                updateNodes(contextMenuComponent);
                updateWires();
                drawGrid();

                // Push action to undo stack
                undoStack.push({
                    action: "rotate",
                    component: contextMenuComponent,
                    previousRotation: previousRotation,
                    newRotation: contextMenuComponent.rotation
                });
                redoStack = []; // Clear redo stack
            }
            document.body.removeChild(menu);
        };
        
        const duplicateOption = document.createElement("div");
        duplicateOption.innerText = "Duplicate";
        duplicateOption.onclick = function() {
            if (contextMenuComponent) {
                const newComp = { ...contextMenuComponent, x: contextMenuComponent.x + gridSize * 3, y: contextMenuComponent.y + gridSize * 3 };
                newComp.nodes = newComp.nodes.map(node => ({ x: node.x, y: node.y }));
                components.push(newComp);
                updateNodes(newComp);

                // Push action to undo stack
                undoStack.push({ action: "add", type: "component", component: newComp });
                redoStack = []; // Clear redo stack

                drawGrid();
            }
            document.body.removeChild(menu);
        };
        
        const deleteOption = document.createElement("div");
        deleteOption.innerText = "Delete";
        deleteOption.onclick = function() {
            console.log("Delete option clicked for component");
            if (contextMenuComponent) {
                deleteComponent(contextMenuComponent);
            }
            document.body.removeChild(menu);
        };

        menu.appendChild(rotateOption);
        menu.appendChild(duplicateOption);
        menu.appendChild(deleteOption);
    } else if (!isSelection) {
        const deleteOption = document.createElement("div");
        deleteOption.innerText = "Delete Wire";
        deleteOption.onclick = function() {
            console.log("Delete option clicked for wire");
            if (contextMenuWire) {
                deleteWire(contextMenuWire);
            }
            document.body.removeChild(menu);
        };
        
        const colorOption = document.createElement("div");
        colorOption.innerText = "Color";
        colorOption.className = "submenu";

        // Submenu for colors
        const colorMenu = document.createElement("div");
        colorMenu.className = "submenu-options";

        const colors = ["Red", "Green", "Black", "Blue", "Yellow"];
        colors.forEach(color => {
            const colorItem = document.createElement("div");
            colorItem.innerText = color;
            colorItem.style.color = color.toLowerCase();
            colorItem.onclick = function() {
                if (contextMenuWire) {
                    contextMenuWire.color = color.toLowerCase();
                    drawGrid();
                }
                document.body.removeChild(menu);
            };
            colorMenu.appendChild(colorItem);
        });

        colorOption.addEventListener("mouseenter", () => {
            colorMenu.style.display = "block";
        });

        colorOption.addEventListener("mouseleave", () => {
            colorMenu.style.display = "none";
        });

        colorOption.appendChild(colorMenu);
        menu.appendChild(deleteOption);
        menu.appendChild(colorOption);
    } else {
        const deleteOption = document.createElement("div");
        deleteOption.innerText = "Delete";
        deleteOption.onclick = function() {
            console.log("Delete option clicked for selected items");
            deleteSelectedItems();
            document.body.removeChild(menu);
        };

        menu.appendChild(deleteOption);
    }

    document.body.appendChild(menu);
}

// Hide context menu
document.addEventListener("click", () => {
    const menus = document.querySelectorAll(".context-menu");
    menus.forEach(menu => {
        document.body.removeChild(menu);
    });
});

function finalizeWire() {
    if (wirePath.length > 1) {
        const newWire = { path: [...wirePath] };
        wires.push(newWire);

        // Push undo action
        undoStack.push({
            action: "add",
            type: "wire",
            wire: newWire
        });

        console.log("Wire Added:", newWire);
        console.log("Undo Stack:", undoStack);
    }

    wirePath = [];
    drawingWire = false;
    drawGrid();
}

function deleteWire(wire) {
    const index = wires.indexOf(wire);
    if (index !== -1) {
        wires.splice(index, 1);

        // Push undo action
        undoStack.push({
            action: "delete",
            type: "wire",
            wire: wire
        });

        console.log("Wire Deleted:", wire);
        console.log("Undo Stack:", undoStack);
    }

    drawGrid();
}

function deleteComponent(component) {
    components = components.filter(comp => comp !== component);
    wires = wires.filter(wire => !wire.path.some(point => point.component === component));

    // Push undo action
    undoStack.push({
        action: "delete",
        type: "component",
        component: component
    });

    console.log("Component Deleted:", component);
    console.log("Undo Stack:", component);

    drawGrid();
}

// Keyboard shortcuts for rotate, delete, undo, redo, and cancel wire drawing
document.addEventListener("keydown", (event) => {
    if (event.key === "r" && contextMenuComponent) {
        contextMenuComponent.rotation = (contextMenuComponent.rotation + 90) % 360;
        updateNodes(contextMenuComponent);
        updateWires();
        drawGrid();
    } else if (event.key === "Delete") {
        deleteSelectedItems();
    } else if (event.key === " ") {
        spacePressed = true;
    } else if (event.ctrlKey && event.key === "z") {
        undo();
    } else if (event.ctrlKey && event.key === "y") {
        redo();
    } else if (event.key === "Escape" && drawingWire) {
        // Cancel wire drawing
        drawingWire = false;
        wirePath = [];
        drawGrid();
    }
});

document.addEventListener("keyup", (event) => {
    if (event.key === " ") {
        spacePressed = false;
    }
});

// Function to delete selected items
function deleteSelectedItems() {
    console.log("deleteSelectedItems called");
    if (contextMenuComponent) {
        console.log("Deleting context menu component");
        deleteComponent(contextMenuComponent);
    } else if (contextMenuWire) {
        console.log("Deleting context menu wire");
        deleteWire(contextMenuWire);
    } else if (selectedItems.length > 0) {
        console.log("Deleting selected items:", selectedItems);
        const deletedItems = [];
        selectedItems.forEach(item => {
            if (item.path) {
                deleteWire(item);
                deletedItems.push({ type: "wire", item });
            } else {
                deleteComponent(item);
                deletedItems.push({ type: "component", item });
            }
        });
        selectedItems = [];
        undoStack.push({ action: "delete", type: "group", items: deletedItems });
        drawGrid();
    }
}

// Undo function
function undo() {
    if (undoStack.length > 0) {
        const action = undoStack.pop();
        redoStack.push(action);
        console.log("Undo Action:", action);

        if (action.action === "add") {
            if (action.type === "wire") {
                // Undo adding a wire (remove it)
                wires = wires.filter(w => w !== action.wire);
                console.log("Wire Removed:", action.wire);
            } else if (action.type === "component") {
                // Undo adding a component (remove it)
                components = components.filter(comp => comp !== action.component);
                console.log("Component Removed:", action.component);
            }
        } else if (action.action === "delete") {
            if (action.type === "wire") {
                // Undo deleting a wire (restore it)
                wires.push(action.wire);
                console.log("Wire Restored:", action.wire);
            } else if (action.type === "component") {
                // Undo deleting a component (restore it)
                components.push(action.component);
                console.log("Component Restored:", action.component);
            } else if (action.type === "group") {
                // Undo deleting a group (restore it)
                action.items.forEach(({ type, item }) => {
                    if (type === "wire") {
                        wires.push(item);
                        console.log("Wire Restored:", item);
                    } else if (type === "component") {
                        components.push(item);
                        console.log("Component Restored:", item);
                    }
                });
            }
        } else if (action.action === "move") {
            // Undo moving components
            action.initialPositions.forEach(({ item, x, y, path }) => {
                if (path) {
                    item.path.forEach((point, index) => {
                        point.x = path[index].x;
                        point.y = path[index].y;
                    });
                } else {
                    item.x = x;
                    item.y = y;
                    updateNodes(item);
                }
            });
            updateWires();
        } else if (action.action === "rotate") {
            // Undo rotating component
            action.component.rotation = action.previousRotation;
            updateNodes(action.component);
            updateWires();
        } else if (action.action === "toggleSwitch") {
            // Undo toggling switch
            action.component.img.src = `images/switch_${action.previousState}.svg`;
            action.component.img.onload = () => drawGrid();
        }

        // Clear selected items to ensure blue transparent color does not reappear
        selectedItems = [];

        drawGrid();
    }
}

// Redo function
function redo() {
    if (redoStack.length > 0) {
        const action = redoStack.pop();
        undoStack.push(action);
        console.log("Redo Action:", action);

        if (action.action === "add") {
            if (action.type === "wire") {
                // Redo adding a wire (restore it)
                wires.push(action.wire);
                console.log("Wire Restored:", action.wire);
            } else if (action.type === "component") {
                // Redo adding a component (restore it)
                components.push(action.component);
                console.log("Component Restored:", action.component);
            }
        } else if (action.action === "delete") {
            if (action.type === "wire") {
                // Redo deleting a wire (remove it)
                wires = wires.filter(w => w !== action.wire);
                console.log("Wire Removed:", action.wire);
            } else if (action.type === "component") {
                // Redo deleting a component (remove it)
                components = components.filter(comp => comp !== action.component);
                console.log("Component Removed:", action.component);
            } else if (action.type === "group") {
                // Redo deleting a group (remove it)
                action.items.forEach(({ type, item }) => {
                    if (type === "wire") {
                        wires = wires.filter(w => w !== item);
                        console.log("Wire Removed:", item);
                    } else if (type === "component") {
                        components = components.filter(comp => comp !== item);
                        console.log("Component Removed:", item);
                    }
                });
            }
        } else if (action.action === "move") {
            // Redo moving components
            action.finalPositions.forEach(({ item, x, y, path }) => {
                if (path) {
                    item.path.forEach((point, index) => {
                        point.x = path[index].x;
                        point.y = path[index].y;
                    });
                } else {
                    item.x = x;
                    item.y = y;
                    updateNodes(item);
                }
            });
            updateWires();
        } else if (action.action === "rotate") {
            // Redo rotating component
            action.component.rotation = action.newRotation;
            updateNodes(action.component);
            updateWires();
        } else if (action.action === "toggleSwitch") {
            // Redo toggling switch
            action.component.img.src = `images/switch_${action.newState}.svg`;
            action.component.img.onload = () => drawGrid();
        }

        drawGrid();
    }
}

// Calculate distance from point to line segment
function pointToSegmentDistance(px, py, p1, p2) {
    let x = p1.x;
    let y = p1.y;
    const dx = p2.x - x;
    const dy = p2.y - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = p2.x;
            y = p2.y;
        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    return Math.sqrt((px - x) ** 2 + (py - y) ** 2);
}

document.addEventListener("DOMContentLoaded", function() {
    // Initial draw
    drawGrid();
});

function serializeCircuit() {
    const circuitData = {
        components: components.map(comp => ({
            type: comp.img.alt, // Assuming the type is stored in the image's alt attribute
            x: comp.x,
            y: comp.y,
            width: comp.width,
            height: comp.height,
            rotation: comp.rotation,
            nodes: comp.nodes
        })),
        wires: wires.map(wire => ({
            path: wire.path.map(point => ({
                x: point.x,
                y: point.y,
                component: point.component ? { type: point.component.img.alt } : null,
                nodeIndex: point.nodeIndex
            }))
        }))
    };
    return JSON.stringify(circuitData, null, 2);
}

function saveCircuitToFile() {
    const circuitData = serializeCircuit();
    const blob = new Blob([circuitData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit.circ';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

document.getElementById('file-input').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
reader.onload = (e) => {
    try {
        const circuitData = JSON.parse(e.target.result);

        const updatedComponents = circuitData.components.map(comp => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = `images/${comp.type}.svg`;
                img.onload = () => resolve({ ...comp, img });
            });
        });

        Promise.all(updatedComponents).then(componentsWithImages => {
            console.log("Loaded components:", componentsWithImages);
            console.log("Loaded wires:", circuitData.wires);
            
            components = componentsWithImages;
            wires = circuitData.wires;
            drawGrid();
        }).catch(error => {
            console.error("Error loading components:", error);
            alert("Failed to load components from the file.");
        });
    } catch (error) {
        console.error("Error parsing file:", error);
        alert("Failed to open the file. Please ensure it is a valid .circ file.");
    }
};
reader.readAsText(file);
});

document.getElementById('save-button').addEventListener('click', saveCircuitToFile);

document.getElementById('run-button').addEventListener('click', toggleRun);

// Function to toggle switch state
function toggleSwitch(component) {
    const previousState = component.img.src.includes("switch_open.svg") ? "open" : "closed";
    const newState = previousState === "open" ? "closed" : "open";

    component.img.src = `images/switch_${newState}.svg`;
    component.img.onload = () => drawGrid(); // Ensure the image is loaded before redrawing

    // Push action to undo stack
    undoStack.push({
        action: "toggleSwitch",
        component: component,
        previousState: previousState,
        newState: newState
    });

    redoStack = []; // Clear redo stack
}

function toggleRun() {
    isRunning = !isRunning;
    components.forEach(component => {
        if (component.img.alt === "Led") {
            const newImg = new Image();
            newImg.onload = () => {
                component.img.src = newImg.src;
                drawGrid();
            };
            newImg.src = isRunning ? "images/led_red.svg" : "images/led.svg"; // Toggle between red-filled LED image and normal
        }
    });
}

// Initial draw
drawGrid();
