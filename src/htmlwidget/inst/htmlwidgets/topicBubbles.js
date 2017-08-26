HTMLWidgets.widget({


// Variables global to the `HTMLWidgets` instance.
//------------------------------------------------------------------------------

    name: "topicBubbles",
    type: "output",

    PAGE_MARGIN: 30,
    DIAMETER: null,
    FONT_SIZE: 11,

    // `selNode` is the one the user clicks on first.
    selNode: null,
    // `nodesToMove` is an array of nodes the user intends to move. If `selNode`
    // is a leaf node, then `nodesToMove` is an array with just `selNode`.
    // Otherwise, `nodesToMove` is an array with `selNode`'s children.
    nodeToMove: null,
    // `newParent` is the group the user selects after selecting a node to move.
    newParent: null,
    // `nodeInFocus` is used to check whether to zoom in or out, depending on
    // whether or not the user has already zoomed in.
    nodeInFocus: null,

    // This data structure tracks the (x, y, r) data for each node. We call
    // `d3.pack(root).descendants()` to get the new (x, y, r) data with which
    // to update the cache, but the circles are resized and repositioned using
    // the cache only. This prevents having to re-render the circles and
    // re-bind the data.
    nodeXYRCache: {},
    currCoords: null,

    // Used to know when the user has changed the number of clusters. In this
    // scenario, we just completely re-initialize the widget.
    nClusters: null,

    el: null,
    svg: null,


// Main functions.
//------------------------------------------------------------------------------

    /* Creates the `svg` element, a `d3.pack` instance with the correct size
     * parameters, and the depth-to-color mapping function.
     */
    initialize: function(el, width, height) {
        var self = this,
            NODE_PADDING = 20,
            SVG_R,
            D3PACK_W;

        self.el = el;
        self.DIAMETER = width;
        SVG_R = self.DIAMETER / 2;
        D3PACK_W = self.DIAMETER - self.PAGE_MARGIN;

        // Create `svg` and root `g` elements.
        self.svg = d3.select(el)
            .append("svg")
            .attr("width", self.DIAMETER)
            .attr("height", self.DIAMETER);
        self.rootG = self.svg.append("g")
            .attr("transform", "translate(" + SVG_R + "," + SVG_R + ")");

        // Create persistent `d3.pack` instance with radii accounting for
        // padding.
        self.pack = d3.pack()
            .size([D3PACK_W, D3PACK_W])
            .padding(NODE_PADDING);

        // Set depth-to-color mapping function.
        self.colorMap = d3.scaleLinear()
            .domain([0, 1])
            .range(["hsl(155,30%,82%)", "hsl(155,66%,25%)"])
            .interpolate(d3.interpolateHcl);
    },

    /* Removes all svg elements and then re-renders everything from scratch.
     */
    reInitialize: function() {
        var self = this;
        d3.select(self.el).selectAll("*").remove();
        self.initialize(self.el, self.DIAMETER, self.DIAMETER);
        self.renderInitialClusters();
    },

    resize: function(el, width, height) {
        this.initialize(el, width, height);
    },

    renderValue: function(el, rawData) {
        var self = this,
            nClustersHasChanged = self.nClusters !== null
                && self.nClusters !== self.data.children.length;
        // Shiny calls this function before the user uploads any data. We want
        // to just early-return in this case.
        if (rawData.data == null) { return; }
        self.data = self.getTreeFromRawData(rawData);
        if (nClustersHasChanged) {
            self.reInitialize();
        } else {
            self.nClusters = self.data.children.length;
            this.renderInitialClusters();
        }
    },

    renderInitialClusters: function() {
        var self = this,
            root,
            descendants,
            // Used for managing single- vs. double-clicks.
            DBLCLICK_DELAY = 250,
            nClicks = 0,
            timer = null;

        root = d3.hierarchy(self.data)
            .sum(function(d) { return d.weight; })
            .sort(function(a, b) { return b.value - a.value; });

        self.nodeInFocus = root;
        descendants = self.pack(root).descendants();

        descendants.forEach(function(node) {
            self.nodeXYRCache[node.data.id] = {
                x: node.x,
                y: node.y,
                r: node.r
            };
        });

        self.nodes = self.rootG.selectAll("g")
            .data(descendants)
            .enter()
            .append("g")
            .attr("class", function() { return "node" });

        self.circles = self.nodes.append("circle")
            .style("pointer-events", "visible")
            .attr("class", function(d) {
                if (d.parent) {
                    return d.children ? "circle-middle" : "circle-leaf";
                } else {
                    return "circle-root";
                }
            })
            .style("fill", function(d) {
                return self.colorNode.call(self, d);
            });

        self.nodes
            .append("text")
            .attr("class", "label")
            .each(function(d) {
                var sel = d3.select(this),
                    len = d.data.terms.length;
                //d.data.terms.forEach(function(term, i) {
                //    sel.append("tspan")
                //        .text(function() { return term; })
                //        .attr("x", 0)
                //        .attr("text-anchor", "middle")
                //        // This data is used for dynamic sizing of text.
                //        .attr("data-term-index", i)
                //        .attr("data-term-len", len);
                //});
                sel.text(d.data.id);
            });

        self.circles
            .filter(function() {
                return d3.select(this).classed("circle-leaf");
            })
            .on("click", function(d) {
                d3.event.stopPropagation();
                self.selectCluster(d);
            })
            .on("mouseover", function(d) {
                d3.select(this)
                    .style("fill", self.colorNode.call(self, d, true));
            })
            .on("mouseout", function(d) {
                d3.select(this)
                    .style("fill", self.colorNode.call(self, d, false));
            });

        self.circles
            .filter(function() {
                return d3.select(this).classed("circle-middle");
            })
            .on("dblclick", function() {
                // Prevent double-click in deference to single-click handler.
                d3.event.stopPropagation();
            })
            .on("click", function(d) {
                d3.event.stopPropagation();
                nClicks++;
                if (nClicks === 1) {
                    timer = setTimeout(function() {
                        // Single click: user selected a cluster.
                        self.selectCluster(d);
                        nClicks = 0;
                    }, DBLCLICK_DELAY);
                } else {
                    // Double click: zoom.
                    clearTimeout(timer);
                    nClicks = 0;
                    if (self.nodeInFocus !== d) {
                        self.zoom(d);
                    } else if (self.nodeInFocus === d) {
                        self.zoom(root);
                    }
                }
            })
            .on("mouseover", function(d) {
                d3.select(this)
                    .style("fill", self.colorNode.call(self, d, true));
            })
            .on("mouseout", function(d) {
                d3.select(this)
                    .style("fill", self.colorNode.call(self, d, false));
            });

        // Zoom out when the user clicks the outermost circle.
        self.svg.style("background", "#fff")
            .on("click", function() { self.zoom(root); });

        self.zoomTo([root.x, root.y, root.r * 2 + self.PAGE_MARGIN], false);
    },

    selectCluster: function(node) {
        var self = this;
        if (!self.selNode) {
           self.selectNewNode(node);
        } else {
            self.selectAndMoveNode(node);
        }
        self.circles.style("fill", function(d) {
            return self.colorNode.call(self, d);
        });
    },

    selectNewNode: function(node) {
        var self = this;
        self.selNode = node;
        self.nodesToMove = null;
        self.newParent = null;
    },

    selectAndMoveNode: function(node) {
        var self = this,
            sameNodeSelected = self.selNode.data.id === node.data.id,
            newParentNodeSelected = self.selNode.parent !== node,
            nodeToMoveIsLeafNode = typeof self.selNode.children === 'undefined',
            newParentID,
            oldParentID;

        if (sameNodeSelected) {
            self.selNode = null;
        } else if (newParentNodeSelected) {
            self.newParent = node;
            newParentID = self.newParent.data.id;
            if (nodeToMoveIsLeafNode) {
                oldParentID = self.selNode.parent.data.id;
                self.nodesToMove = [self.selNode];
            } else {
                oldParentID = self.selNode.data.id;
                self.nodesToMove = self.selNode.children;
            }
            console.log(self.nodesToMove);

            self.traverseTree(self.data, function(n) {
                self.updateNodeChildren(n, oldParentID, newParentID);
            });

            // SUBTLE BUT CRITICAL
            // ===================
            // When we call `descendants()`, D3 adds new `parent` fields
            // that do not exist in the original data. We must manually
            // update these references.
            var nodeToMoveIDs = [];
            self.nodesToMove.forEach(function(node) {
                nodeToMoveIDs.push(node.data.id);
            });

            self.traverseTree(self.data, function(x) {
                if (nodeToMoveIDs.indexOf(x.id) >= 0) {
                    debugger;
                }
            });

            self.selNode = null;
            self.nodesToMove = null;
            self.newParent = null;
            self.moveTopicBetweenClusters(self.data);
        }
    },

    moveTopicBetweenClusters: function() {
        var self = this,
            root;

        root = d3.hierarchy(self.data)
            .sum(function(d) { return d.weight; })
            .sort(function(a, b) { return b.value - a.value; });

        self.pack(root).descendants().forEach(function(node) {
            self.nodeXYRCache[node.data.id] = {
                x: node.x,
                y: node.y,
                r: node.r
            };
        });

        self.nodeInFocus = root;
        // `zoomTo` performs the actual move. It uses the data stored in
        // `nodeXYRCache` for a smooth transition of existing `circle`
        // elements.
        self.zoomTo([root.x, root.y, root.r * 2 + self.PAGE_MARGIN], true);
    },

    /* This function "zooms" to center of coordinates. It is important to
     * realize that "zoom" in this context actually means setting the (x, y, r)
     * data for the circles.
     */
    zoomTo: function(coords, transition) {
        var self = this,
            k = self.DIAMETER / coords[2],
            nodes, circles;

        self.currCoords = coords;

        if (transition) {
            circles = self.circles
                .transition()
                .duration(3000)
                .on("end", function() {
                    d3.select(this)
                        .transition()
                        .duration(1000)
                        .style("fill", function(d) {
                            return self.colorNode.call(self, d);
                        });
                });
            nodes = self.nodes.transition().duration(3000);
        } else {
            circles = self.circles;
            nodes = self.nodes;
        }

        nodes.attr("transform", function(d) {
            var c = self.nodeXYRCache[d.data.id];
            return "translate(" + (c.x - coords[0]) * k + "," + (c.y - coords[1]) * k + ")";
        });
        circles.attr("r", function(d) {
            var c = self.nodeXYRCache[d.data.id];
            return c.r * k;
        });

        nodes.selectAll("tspan")
            .attr("y", function(d) {
                var that = d3.select(this),
                    i = +that.attr("data-term-index"),
                    len = +that.attr("data-term-len");
                // `- (len / 2) + 0.75` shifts the term down appropriately.
                // `15 * k` spaces them out appropriately.
                return (self.FONT_SIZE * (k/2) + 3) * 1.2 * (i - (len / 2) + 0.75);
            })
            .style("font-size", function(d) {
                return (self.FONT_SIZE * (k/2) + 3) + "px";
            });
    },

    /* Zoom to node.
     */
    zoom: function(node) {
        var self = this,
            c = self.nodeXYRCache[node.data.id];
        self.nodeInFocus = node;
        d3.transition()
            .duration(1000)
            .tween("zoom", function(d) {
                var coords = [c.x, c.y, c.r * 2 + self.PAGE_MARGIN],
                    i = d3.interpolateZoom(self.currCoords, coords);
                return function(t) {
                    self.zoomTo(i(t), false);
                };
            });
    },

    /* Traverse the underlying tree data structure and apply a callback
     * function to every node.
     */
    traverseTree: function(node, processNode) {
        var self = this;
        processNode(node);
        // We never update leaf nodes. We update the children of parent/middle
        // nodes.
        if (typeof node.children !== 'undefined') {
            node.children.forEach(function(childNode) {
                self.traverseTree(childNode, processNode)
            });
        }
    },

    /* Update node's children depending on whether it is the new or old parent.
     */
    updateNodeChildren: function(node, oldParentID, newParentID) {
        var self = this,
            newChildren;

        // Remove nodes-to-move from old parent.
        if (node.id === oldParentID) {
            // In this scenario, the user selected a leaf node
            // Remove `nodesToMove` from old parent.
            if (self.nodesToMove.length === 1) {
                newChildren = [];
                node.children.forEach(function(child) {
                    if (child.id !== self.nodesToMove[0].data.id) {
                        newChildren.push(child);
                    }
                });
                node.children = newChildren;
            }
            // In this scenario, the user selected a group of topics;
            // `oldParentID` refers to the selected group; and we're moving all
            // of that group's children.
            else {
                node.children = [];
            }
        }

        // Add nodes-to-move to new parent.
        else if (node.id === newParentID) {
            self.nodesToMove.forEach(function(nodeToMove) {
                nodeToMove.parent = self.newParent;
                node.children.push(nodeToMove.data);
            });
        }
    },

    /* Convert R dataframe to tree.
     */
    getTreeFromRawData: function(x) {
        var self = this,
            data = {id: "root", children: [], terms: []},
            srcData = HTMLWidgets.dataframeToD3(x.data);

        // For each data row add to the output tree.
        srcData.forEach(function(d) {
            var parent = self.findParent(data, d.parentID, d.nodeID);

            // Leaf node.
            if (d.weight === 0) {
                parent.children.push({
                    id: d.nodeID,
                    terms: [],
                    children: []
                });
            } else if (parent !== null && parent.hasOwnProperty("children")) {
                parent.children.push({
                    id: d.nodeID,
                    terms: d.title.split(" "),
                    weight: d.weight
                });
            }
        });

        return data;
    },


// Helper functions.
//------------------------------------------------------------------------------

    /* Helper function to add hierarchical structure to data.
     */
    findParent: function(branch, parentID, nodeID) {
        var self = this;
        if (parentID === 0) {
            parentID = "root";
        }
        var rv = null;
        if (branch.id == parentID) {
            rv = branch;
        } else if (rv === null && branch.children !== undefined) {
            branch.children.forEach(function(child) {
                if (rv === null) {
                    rv = self.findParent(child, parentID, nodeID);
                }
            });
        }
        return rv;
    },

    /* Helper function to correctly color any node.
     */
    colorNode: function(node, hover) {
        var self = this,
            isSelNode = self.selNode
                && self.selNode.data.id === node.data.id;

        if (isSelNode) {
            return "rgb(255, 0, 0)";
        } else if (hover) {
            if (node.depth === 1) {
                return self.colorMap(1.2);
            } else if (self.selNode) {
                return "rgb(255, 255, 255)";
            } else {
                return "rgb(220, 220, 220)";
            }
        } else if (node.children) {
            return self.colorMap(node.depth);
        } else {
            return "rgb(255, 255, 255)";
        }
    }
});

