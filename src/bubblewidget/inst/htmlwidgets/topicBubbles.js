//==============================================================================
// README
//
// Throughout this program, there are two types of nodes: raw data and D3 data.
// The way D3's `hierarchy` functionality works is that it creates a tree from
// the raw data and places each raw data node on a `data` property of each tree
// node. In other words:
//
//     [D3 node].data === [Raw data node]
//
// Any time a node is referenced through D3, for example on a click event, D3
// will pass you a D3 node. View-related properties, such as the (x, y)
// coordinates of a node, are on D3 nodes.
//
// But relationships between nodes are specified by the raw data. D3 just
// updates the view when the raw data changes. For example, if you want to merge
// two nodes, do not touch D3 nodes. Instead, update the raw data and D3 will
// handle rebinding and removing old nodes. For more on this pattern, see:
//
//     https://bl.ocks.org/mbostock/3808218
//
// More concretely, use the function `traveseTree` if you want to inspect every
// raw data node. Then call `update` to update the data binding and view.
//
// Because this distinction is subtle and a little confusing, use the following
// style rules:
//
//     - Use "n" to refer to raw data nodes.
//     - Use "d" to refer to D3 nodes. Note that `d.data === n`.
//     - Avoid "node" unless referring to the concept, e.g. `isRootNode(d)`.
//==============================================================================

HTMLWidgets.widget({


// Variables global to the `HTMLWidgets` instance.
//------------------------------------------------------------------------------

    name: "topicBubbles",
    type: "output",

    PAGE_MARGIN: 10,
    TOP_MARGIN: 75,
    DIAMETER: null,
    FONT_SIZE: 11,

    // The first node the user clicks in the move process.
    sourceD: null,
    draggedNode: null,
    dragSourceX: 0,
    dragSourceY: 0,
    scrollOffset: {x: 0, y: 0},
    scrollOrigin: null,

    // Handlers for d3 events
    zoomHandler: null,
    dragHandler: null,

    // Used for things like deciding whether to zoom in or out or whether or not
    // to show a label.
    nodeInFocus: null,
    currCoords: null,

    // HTML elements
    el: null,
    svg: null,

    // The raw tree data and final arbiter of node relationships. It is
    // converted to hierarchical data using `d3.hierarchy` and this resulting
    // data structure is what backs the visualization.
    treeData: null,


// Main functions.
//------------------------------------------------------------------------------

    /* Creates the `svg` element, a `d3.pack` instance with the correct size
     * parameters, and the depth-to-color mapping function.
     */
    initialize: function (el, width, height) {
        var self = this,
            NODE_PADDING = 20,
            SHORT_EDGE = Math.min(width, height - self.TOP_MARGIN),
            SVG_R = SHORT_EDGE / 2,
            D3PACK_W = SHORT_EDGE - self.PAGE_MARGIN;

        self.el = el;
        self.DIAMETER = SHORT_EDGE;

        var zoomHandler = d3.zoom()
            .scaleExtent([1, 40])
            .translateExtent([[0,0], [self.DIAMETER, self.DIAMETER]])
            .on("zoom", self.zoomHandler(self));

        self.zoomHandler = zoomHandler;

        var svg = d3.select(el)
            .append("svg")
            .attr("width", self.DIAMETER)
            .attr("height", self.DIAMETER)
            .attr("id", "bubbles-svg")
            .call(zoomHandler)
            .on("dblclick.zoom", null);

        self.svg = svg;

        self.g = svg.append("g")
            .attr("id", "bubbles-root")

        // Create persistent `d3.pack` instance with radii accounting for
        // padding.
        self.pack = d3.pack()
            .size([D3PACK_W, D3PACK_W])
            .padding(NODE_PADDING);

        // Set depth-to-color mapping function.
        self.colorMap = d3.scaleLinear()
            .domain([-2, 2])
            .range(["hsl(215,100%,80%)", "hsl(215,70%,50%)"])
            .interpolate(d3.interpolateHcl);

        // Handle Shiny messages
        Shiny.addCustomMessageHandler("nodeDeleted", function(msg) { self.setSource(null); });
        Shiny.addCustomMessageHandler("runtimeClusterFinished", function(msg) { self.setSource(null); })
    },


    zoomHandler: function (selfRef) {
        var handler = function () {
            selfRef.g.attr("transform", "translate(" + d3.event.transform.x + "," + d3.event.transform.y + ")" + "scale(" + d3.event.transform.k + ")");
            try {
                d3.event.sourceEvent.stopPropagation();
            } catch(error) {
                return;
            }
        };

        return handler;
    },

    /* Removes all svg elements and then re-renders everything from scratch.
     */
    reInitialize: function () {
        var self = this;
        d3.select(self.el).selectAll("*").remove();
        self.initialize(self.el, self.DIAMETER, self.DIAMETER);
        self.updateView(false);
    },

    /* Upon resize event, updates the self.el and self.DIAMETER values.
     * Then selects and modifies the width and height attributes of the
     * existing SVG element, as well as the transform attribute of the
     * bubbles-root element.
     */
    resize: function (el, width, height) {
        var self = this,
            SHORT_EDGE = Math.min(width, height - self.TOP_MARGIN),
            SVG_R = SHORT_EDGE / 2
            NODE_PADDING = 20,
            D3PACK_W = SHORT_EDGE - self.PAGE_MARGIN;

        // Update state corresponding to new width
        self.el = el;
        self.DIAMETER = SHORT_EDGE;

        self.pack = d3.pack()
            .size([D3PACK_W, D3PACK_W])
            .padding(NODE_PADDING);
        
        // Modify width and height of existing svg element
        var svgElement = d3.select("#bubbles-svg")
            .attr("width", self.DIAMETER)
            .attr("height", self.DIAMETER);

        // Reset the centering of bubbles-root
        self.g = d3.select("#bubbles-root");
            // .attr("transform", "translate(" + SVG_R + "," + SVG_R + ")");

        // Re-render according to new dimensions, only if data already rendered
        if (self.treeData !== null) {
            self.updateView(false);
        }
    },

    renderValue: function (el, rawData) {
        // Shiny calls this function before the user uploads any data. We want
        // to just early-return in this case.
        if (rawData.data === null) {
            return;
        }

        var self = this;

        self.treeData = self.getTreeFromRawData(rawData);

        self.updateView(true);
    },

    updateView: function (useTransition) {
        var self = this,
            nClicks = 0,
            DBLCLICK_DELAY = 300,
            root,
            nodes,
            circles,
            text,
            timer;

        root = d3.hierarchy(self.treeData)
            .sum(function (n) {
                return n.weight;
            })
            .sort(function (a, b) {
                return b.value - a.value;
            });

        nodes = self.pack(root).descendants();
        self.nodeInFocus = nodes[0];

        // Ref: https://stackoverflow.com/questions/38599930/d3-version-4-workaround-for-drag-origin
        var dragHandler = d3.drag()
            .subject(function (n) { return n; })
            .on("drag", self.activeDragHandler(self))
            .on("end", self.dragEndHandler(self));

        self.dragHandler = dragHandler;

        circles = self.g.selectAll('circle')
            .data(nodes, self.constancy);

        circles.enter()
            .append("circle")
            .attr("class", "node")
            .attr("weight", function (d) {
                return d.data.weight ? d.data.weight : -1;
            })
            .attr("id", function (d) {
                return 'node-' + d.data.id;
            })
            .on("dblclick", function () {
                d3.event.stopPropagation();
            })
            .on("click", function (d) {
                d3.event.stopPropagation();
                self.selectNode(d, false);
            })
            .on("mouseover", function (d) {
                var displayID = !self.sourceD ? "" : self.sourceD.data.id,
                    isRoot = self.isRootNode(d);
                Shiny.onInputChange("topic.active", isRoot ? displayID : d.data.id);
                if (isRoot || self.isGroupInFocus(d)) {
                    return;
                }
                self.setLabelVisibility(d, true);
            })
            .on("mouseout", function (d) {
                var displayID = !self.sourceD ? "" : self.sourceD.data.id;
                Shiny.onInputChange("topic.active", displayID);
                if (self.isRootNode(d)) {
                    return;
                }
                self.setLabelVisibility(d, false);
            })
            .call(dragHandler);

        text = self.g.selectAll('text')
            .data(nodes, self.constancy);

        text.enter()
            .append('text')
            .attr("class", "label")
            .attr("id", function (d) {
                return 'label-' + d.data.id;
            });

        circles.exit().remove();
        text.exit().remove();

        circles.order().raise();
        text.order().raise();

        // This is needed because SVG elements are displayed not based on a
        // tunable Z-index but based on their location in the DOM. This function
        // correctly sorts the nodes based on `treeData`.
        self.sortNodesBasedOnTree();

        self.positionAndResizeNodes(
            [root.x, root.y, root.r * 2 + self.PAGE_MARGIN],
            useTransition
        );
    },


    // Returns a callback function, setting drag status to ``status``
    dragStatusSetter: function (status) {
        var setterCallback = function (n) {
            var nodeID = ["#node", n.data.id].join("-");
            d3.select(nodeID).classed("dragged-node", status);
            var labelID = ["#label", n.data.id].join("-");
            d3.select(labelID).classed("dragged-label", status);

            if (!n.hasOwnProperty("children")) { return; }

            n.children.forEach(function (ch) {
                setterCallback(ch);
            });
        }

        return setterCallback;
    },


    // Pass in reference to "self", as the call() method passes a different "this"
    dragStartHandler: function (selfRef) {
        var handler = function (d) {
            if (d3.event.sourceEvent.altKey) {
                selfRef.dragOffset = {x: 0, y: 0};
                
                var scrollStartStrings = selfRef.g.attr("trasnform").split("(")[1].split(")")[0].split(",");

                selfRef.scrollOrigin = { x: parseFloat($.trim(scrollStartStrings[0])), y: parseFloat($.trim(scrollStartStrings[1])) };
            }
        }

        return handler;
    },


    // Pass in reference to "self", as the call() method passes a different "this"
    activeDragHandler: function (selfRef) {
        var handler = function (d) {
            coords = d3.mouse(this);

            if (d3.event.sourceEvent.altKey) {

                if (selfRef.scrollOrigin === null) {
                    // Set origin, do not update position
                    selfRef.scrollOrigin = { x: d3.event.sourceEvent.clientX, y: d3.event.sourceEvent.clientY }
                } else {
                    // Update based on placed origin and current scale
                    var oldScale = 1;
                    if (selfRef.g.attr("transform").indexOf("scale") >= 0) {
                        // Scale has already been set
                        oldScale = parseFloat(selfRef.g.attr("transform").split("scale(")[1].split(")")[0]);
                    }

                    selfRef.svg.call(selfRef.zoomHandler.translateBy, d3.event.sourceEvent.movementX / oldScale, d3.event.sourceEvent.movementY / oldScale);

                    selfRef.scrollOrigin = { x: d3.event.sourceEvent.clientX, y: d3.event.sourceEvent.clientY }
                }
            } else {
                selfRef.scrollOrigin = null;

                // Handle node dragging
                if (selfRef.isRootNode(d)) { return; }

                if (selfRef.draggedNode === null) {
                    d3.event.sourceEvent.stopPropagation();

                    var nodeID = ["#node", d.data.id].join("-");

                    d3.select(nodeID).data().forEach(selfRef.dragStatusSetter(true));

                    selfRef.draggedNode = d.data.id;

                    selfRef.dragPointer = selfRef.g.append("circle").attr("id", "drag-pointer").attr("r", 10).raise();
                    d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1]);
                }

                d3.event.sourceEvent.stopPropagation();

                d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1])
            }
        }

        return handler;
    },

    // Pass in reference to "self", as the call() method passes a different "this"
    dragEndHandler: function (selfRef) {
        var handler = function (d) {
            selfRef.scrollOrigin = null;

            if (selfRef.draggedNode === null) { return; }
            
            d3.select("#drag-pointer").remove();
            d3.event.sourceEvent.stopPropagation();

            // Calculate values for moving/merging nodes
            var pageX = d3.event.sourceEvent.pageX;
            var pageY = d3.event.sourceEvent.pageY;
            var sourceID = selfRef.draggedNode;
            var target = d3.select(document.elementFromPoint(pageX, pageY)).data()[0];

            d3.select(this).data().forEach(selfRef.dragStatusSetter(false));

            selfRef.draggedNode = null;

            // Move or merge if applicable, AFTER having reset draggedNode/etc.
            if (target) {
                if (selfRef.isLeafNode(target)) {
                    var targetID = target.parent.data.id;
                } else {
                    var targetID = target.data.id;
                }

                var makeNewGroup = d3.event.sourceEvent.shiftKey;
                selfRef.moveOrMerge(selfRef, sourceID, targetID, makeNewGroup);
            }
        }

        return handler;
    },

    setDraggedNode: function (nodeD) {
        return;
    },

    releaseDraggedNode: function (nodeD, makeNewGroup) {
        return;
    },

    selectNode: function (targetD, makeNewGroup) {
        var self = this,
            sourceExists = !!self.sourceD,
            souceSelectedTwice,
            notReallyAMove,
            targetIsSourceChild;

        if (self.isRootNode(targetD) && !sourceExists) {
            self.setSource(targetD);
        } else if (sourceExists) {
            souceSelectedTwice = self.sourceD === targetD;
            targetIsSourceChild = self.aIsChildOfB(targetD, self.sourceD);
            notReallyAMove = self.isLeafNode(self.sourceD)
                && self.sourceD.parent === targetD
                && !makeNewGroup;
        }

        if (souceSelectedTwice) {
            self.setSource(null);
        } else if (!sourceExists
            || self.isLeafNode(targetD)
            || targetIsSourceChild
            || notReallyAMove) {

            self.setSource(targetD);
        } else {
            self.setSource(targetD);
        }
    },

    /* Move or merge source node with target node.
     */
    moveOrMerge: function (selfRef, sourceID, targetID, makeNewGroup) {
        if (sourceID === targetID) {
            return;
        }

        Shiny.onInputChange("updateAssignments", [sourceID, targetID, makeNewGroup, Date.now()]);
    },

    /* This function "zooms" to center of coordinates. It is important to
     * realize that "zoom" in this context actually means setting the (x, y, r)
     * data for the circles.
     */
    positionAndResizeNodes: function (coords, transition) {
        var self = this,
            MOVE_DURATION = 500,
            k = self.DIAMETER / coords[2],
            circles = self.g.selectAll("circle"),
            text = self.g.selectAll('text');
        self.currCoords = coords;

        if (transition) {
            circles = circles.transition().duration(MOVE_DURATION);
            text = text.transition().duration(MOVE_DURATION);
        }

        circles.attr("cx", function (d) {
                return d.x;
            })
            .attr("cy", function (d) {
                return d.y;
            })
            .attr("r", function (d) {
                return d.r;
            })
            .attr("depth", function (d) {
                return d.depth;
            })
            .each(function (d) {
                self.setCircleFill(d);
            });

        text.attr("transform", function (d) {
                var x = d.x,
                    y = d.y;
                return "translate(" + x + "," + y + ")";
            })
            .attr("display", function (d) {
                self.setLabelVisibility(d);
            })
            .attr("depth", function (d) {
                return d.depth;
            })
            .each(function (d) {
                if (!d.data.terms) {
                    return;
                }
                var sel = d3.select(this),
                    len = d.data.terms.length;
                sel.selectAll("*").remove();
                d.data.terms.forEach(function (term, i) {
                    sel.append("tspan")
                        .text(term)
                        .attr("x", 0)
                        .attr("text-anchor", "middle")
                        // This data is used for dynamic sizing of text.
                        .attr("data-term-index", i)
                        .attr("data-term-len", len);
                });
            });

        text.selectAll("tspan")
            .attr("y", function () {
                var that = d3.select(this),
                    i = +that.attr("data-term-index"),
                    len = +that.attr("data-term-len");
                return (self.FONT_SIZE * (k / 2) + 3) * 1.2 * (i - (len / 2) + 0.75);
            })
            .style("font-size", function () {
                return (self.FONT_SIZE * (k / 2) + 3) + "px";
            });
    },

    /* Update node's children depending on whether it is the new or old parent.
     */
    updateNsToMove: function (selfRef, nsToMove, oldParentD, newParentD) {
        var newChildren = [];

        // Remove nodes-to-move from old parent.
        if (nsToMove.length === 1) {
            oldParentD.data.children.forEach(function (child) {
                if (child.id !== nsToMove[0].id) {
                    newChildren.push(child);
                }
            });
            oldParentD.data.children = newChildren;
        } else {
            // In this scenario, the user selected a group of topics
            // (`oldParent`), and we're moving all of that group's children.
            oldParentD.data.children = [];
        }

        // Add nodes-to-move to new parent.
        nsToMove.forEach(function (nToMove) {
            newParentD.data.children.push(nToMove);
        });
    },

    /* Removes child node from its parent.
     */
    removeChildDFromParent: function (childD) {
        var newChildren = [];
        childD.parent.data.children.forEach(function (n) {
            if (n.id !== childD.data.id) {
                newChildren.push(n);
            }
        });
        childD.parent.data.children = newChildren;
    },

    /* Make new group with `target` if node meets criteria.
     */
    createNewGroup: function (newGroupD, childD) {
        var self = this;
        newGroupD.data.children.push({
            id: self.getNewID(),
            children: [childD.data],
            terms: childD.data.terms
        });
    },

    /* Sets `source` with new value, resetting and setting circle and label fill
     * and visibility.
     */
    setSource: function (newVal) {
        var self = this,
            oldVal = self.sourceD;
        self.sourceD = newVal;
        if (oldVal) {
            self.setLabelVisibility(oldVal);
            self.setCircleFill(oldVal);
        }
        if (newVal) {
            self.setLabelVisibility(self.sourceD);
            self.setCircleFill(self.sourceD);
            Shiny.onInputChange("topic.selected", self.sourceD.data.id);
            Shiny.onInputChange("topic.active", self.sourceD.data.id);
        } else {
            Shiny.onInputChange("topic.selected", "");
        }
    },

    /* Correctly color any node.
     */
    setCircleFill: function (d) {
        var self = this,
            isfirstSelNode = self.sourceD
                && self.sourceD.data.id === d.data.id,
            borderColor = null,
            fillColor;
        if (isfirstSelNode) {
            borderColor = "rgb(12, 50, 127)";
            fillColor = "rgb(25, 101, 255)";
        } else if (d.children) {
            fillColor = self.colorMap(d.depth);
        } else {
            fillColor = "rgb(255, 255, 255)";
        }
        d3.select("#node-" + d.data.id)
            .style("fill", fillColor)
            .style("stroke", borderColor)
            .style("stroke-width", 2);
    },

    /* Correctly label any node.
     */
    setLabelVisibility: function (d, hover) {
        var self = this,
            dIs = !!d,
            dIsSource = dIs && self.sourceD && d.data.id === self.sourceD.data.id,
            dInFocus = dIs && d === self.nodeInFocus,
            parentInFocus = dIs && d.depth === self.nodeInFocus.depth + 1,
            isLeaf = dIs && self.isLeafNode(d),
            isInFocus = dIs && d === self.nodeInFocus,
            zoomedOnLeaf = isInFocus && isLeaf && !self.isRootNode(d),
            label = d3.select('#label-' + d.data.id);

        if ((dIsSource && !dInFocus) || parentInFocus || hover || zoomedOnLeaf) {
            label.style("display", "inline");
        } else {
            label.style("display", "none");
        }
    },

    /* Traverse the underlying tree data structure and apply a callback
     * function to every node.
     */
    traverseTree: function (node, processNode) {
        var self = this;
        processNode(node);
        if (typeof node.children !== "undefined") {
            node.children.forEach(function (childNode) {
                self.traverseTree(childNode, processNode)
            });
        }
    },

    /* Convert R dataframe to tree.
     */
    getTreeFromRawData: function (x) {
        var self = this,
            data = {id: 0, children: [], terms: []},
            srcData = HTMLWidgets.dataframeToD3(x.data);

        // Sort srcData by node ID
        srcData.sort(function(left, right) {
            if (left.nodeID < right.nodeID) {
                return -1;
            } else if (left.nodeID > right.nodeID) {
                return 1;
            }

            return 0;
        });

        // Assumes no broken connections, but does NOT assume that there are no empty IDs
        var maxID = srcData[srcData.length-1].nodeID;

        // NOTE(tfs): When assigning to index out of bounds, JS arrays expand and include undefined entries.
        var nodes = [];
        nodes[0] = data;
        for (var i = 0; i < srcData.length; i++) {
            nodes[srcData[i].nodeID] = {id: srcData[i].nodeID, children: [], terms: []};
        }

        var rawPoint;
        var cleanPoint;
        var parent;

        for (var i = 0; i < srcData.length; i++) {
            rawPoint = srcData[i];
            cleanPoint = nodes[rawPoint.nodeID];
            parent = nodes[rawPoint.parentID];

            if (rawPoint.weight === 0) {
                parent.children.push(cleanPoint);
                cleanPoint.terms = rawPoint.title.split(" ");
            } else if (parent !== null && parent.hasOwnProperty("children")) {
                parent.children.push(cleanPoint);
                cleanPoint.terms = rawPoint.title.split(" ");
                cleanPoint.weight = rawPoint.weight;
            }
        }

        return data;
    },

    /* Update the string that informs the Shiny server about the hierarchy of
     * topic assignments
     */
    updateTopicAssignments: function (selfRef, callback) {
        var self = selfRef,
            assignments = [],
            EVENT = "topics";
        self.traverseTree(self.treeData, function (n) {
            if (!n.children) {
                return;
            }
            if (n.weight <= 0 && n.children.length === 0) {
                return;
            }
            n.children.forEach(function (childN) {
                assignments.push(childN.id + ":" + n.id);
            });
        });

        Shiny.onInputChange(EVENT, assignments.join(","));
    },

    updateTopicView: function (newTopics) {
        var self = this;
        self.traverseTree(self.treeData, function (n) {
            var terms = newTopics[n.id];
            if (terms) {
                n.terms = terms.split(' ');
            }
        });
    },

    /* Helper function to add hierarchical structure to data.
        TODO(tfs): Make this more efficient, usable for in-order (or any-order) assignments
     */
    findParent: function (branch, parentID, nodeID) {
        var self = this,
            rv = null;
        if (branch.id === parentID) {
            rv = branch;
        } else if (rv === null && branch.children !== undefined) {
            branch.children.forEach(function (child) {
                if (rv === null) {
                    rv = self.findParent(child, parentID, nodeID);
                }
            });
        }
        return rv;
    },

    /* Finds the maximum node ID and returns the next integer.
     */
    getNewID: function () {
        var self = this,
            maxID = 0;
        self.traverseTree(self.treeData, function (n) {
            if (n.id > maxID) {
                maxID = n.id;
            }
        });
        return maxID + 1;
    },

    /* Returns `true` if the node is the root node, `false` otherwise.
     */
    isRootNode: function (d) {
        return d.data.id === 0;
    },

    /* Returns `true` if the node is a leaf node, `false` otherwise.
     */
    isLeafNode: function (d) {
        var hasChildren = typeof d.data.children !== 'undefined';
        if (hasChildren) {
            return d.data.children.length === 0;
        } else {
            return true;
        }
    },

    /* Returns true if node `a` is a child node of `b`.
     */
    aIsChildOfB: function (aD, bD) {
        var result = false;
        if (bD && bD.data.children && bD.data.children.length > 0) {
            bD.children.forEach(function (d) {
                if (d.data.id === aD.data.id) {
                    result = true;
                }
            });
        }
        return result;
    },

    /* Returns `true` if the node is both in focus and a group rather than a
     * leaf.
     */
    isGroupInFocus: function (d) {
        var self = this,
            isInFocus = d === self.nodeInFocus,
            isGroup = !self.isLeafNode(d);
        return isInFocus && isGroup;
    },

    /* This is a critical function. We need to give D3 permanent IDs for each
     * node so that it knows which data goes with which bubble. See:
     * https://bost.ocks.org/mike/constancy/
     */
    constancy: function (d) {
        return d.data.id;
    },

    /* Walks the tree data and moves each node after its parent.
     */
    sortNodesBasedOnTree: function () {
        var self = this,
            childNode,
            parentNode;

        function insertAfter(newNode, referenceNode) {
            referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
        }

        self.traverseTree(self.treeData, function (n) {
            if (n.children) {
                n.children.forEach(function (child) {
                    childNode = document.getElementById('node-' + child.id);
                    parentNode = document.getElementById('node-' + n.id);
                    insertAfter(childNode, parentNode);

                    childNode = document.getElementById('label-' + child.id);
                    parentNode = document.getElementById('label-' + n.id);
                    insertAfter(childNode, parentNode);
                });
            }
        });
    },

    /* Walks up the tree and removes empty groups, starting with `oldParentD`.
     */
    removeChildlessNodes: function (groupD) {
        var self = this,
            removeGroup;

        removeGroup = !groupD.data.children || groupD.data.children.length === 0;
        if (removeGroup) {
            self.removeChildDFromParent(groupD);
        }
        // Walk up the tree. In principle, `groupD` could be an only child. In
        // this scenario, we want to remove its parent as well. This recursion
        // should continue so long as each new group is an only child.
        if (groupD.parent) {
            self.removeChildlessNodes(groupD.parent);
        }
    }
});
