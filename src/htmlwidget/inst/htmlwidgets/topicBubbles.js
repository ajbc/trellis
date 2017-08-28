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
    nodesToMove: null,
    // `newParent` is the group the user selects after selecting a node to move.
    newParent: null,
    // `nodeInFocus` is used to check whether to zoom in or out, depending on
    // whether or not the user has already zoomed in.
    nodeInFocus: null,
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
    initialize: function (el, width, height) {
        var self = this,
            NODE_PADDING = 20,
            SVG_R = width / 2,
            D3PACK_W = width - self.PAGE_MARGIN;

        self.el = el;
        self.DIAMETER = width;

        // Create `svg` and root `g` elements.
        self.g = d3.select(el)
            .append("svg")
            .attr("width", self.DIAMETER)
            .attr("height", self.DIAMETER)
            .append("g")
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
    reInitialize: function () {
        var self = this;
        d3.select(self.el).selectAll("*").remove();
        self.initialize(self.el, self.DIAMETER, self.DIAMETER);
        self.update(false);
    },

    resize: function (el, width, height) {
        this.initialize(el, width, height);
    },

    renderValue: function (el, rawData) {
        // Shiny calls this function before the user uploads any data. We want
        // to just early-return in this case.
        if (rawData.data == null) { return; }

        var self = this,
            nClustersChanged;

        self.data = self.getTreeFromRawData(rawData);
        nClustersChanged = self.nClusters !== null
            && self.nClusters !== self.data.children.length;
        if (nClustersChanged) {
            self.reInitialize();
        } else {
            self.nClusters = self.data.children.length;
            this.update(false);
        }
    },

    update: function (useTransition) {
        var self = this,
            DBLCLICK_DELAY = 250,
            nClicks = 0,
            root,
            nodes,
            circles,
            constancyFn,
            text,
            timer;

        root = d3.hierarchy(self.data)
            .sum(function (d) { return d.weight; })
            .sort(function (a, b) { return b.value - a.value; });
        nodes = self.pack(root).descendants();

        // This is a critical function. We need to give D3 permanent IDs for
        // each node so that it knows which data goes with which bubble. See:
        // https://bost.ocks.org/mike/constancy/
        constancyFn = function (node) {
            return node.data.id;
        };

        circles = self.g.selectAll('circle')
            .data(nodes, constancyFn);

        circles.enter()
            .append('circle')
            .attr('class', function (d) {
                return d.data.id;
            })
            .on("dblclick", function () {
                // Prevent double-click in deference to single-click handler.
                d3.event.stopPropagation();
            })
            .on("click", function (d) {
                d3.event.stopPropagation();
                if (d.data.id === 'root') {
                    return;
                }
                nClicks++;
                if (nClicks === 1) {
                    timer = setTimeout(function () {
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
            .on("mouseover", function (d) {
                d3.select(this).style("fill", self.colorNode.call(self, d, true));
            })
            .on("mouseout", function (d) {
                d3.select(this).style("fill", self.colorNode.call(self, d, false));
            })
            .style("fill", function (d) {
                return self.colorNode.call(self, d);
            });

        text = self.g.selectAll('text')
            .data(nodes, constancyFn);

        text.enter()
            .append('text')
            .style('fill', 'blue')
            .each(function (d) {
                var sel = d3.select(this),
                    len = d.data.terms.length;
                d.data.terms.forEach(function(term, i) {
                    sel.append("tspan")
                        .text(function() { return term; })
                        .attr("x", 0)
                        .attr("text-anchor", "middle")
                        // This data is used for dynamic sizing of text.
                        .attr("data-term-index", i)
                        .attr("data-term-len", len);
                });
            })
            .style("font-size", "12px");

        circles.raise();
        text.raise();

        circles.exit().remove();

        // Zoom out when the user clicks the outermost circle.
        self.g.on("click", function() {
            self.zoom(root);
        });

        self.positionAndResizeNodes(
            [root.x, root.y, root.r * 2 + self.PAGE_MARGIN],
            useTransition
        );
    },

    selectCluster: function (node) {
        var self = this;
        if (!self.selNode) {
            self.selNode = node;
            self.nodesToMove = null;
            self.newParent = null;
        } else {
            self.moveNode(node);
        }
        d3.selectAll("circle").style("fill", function (d) {
            return self.colorNode.call(self, d);
        });
    },

    moveNode: function (node) {
        var self = this,
            sameNodeSelected = self.selNode.data.id === node.data.id,
            newParentNodeSelected = self.selNode.parent !== node
                || (self.selNode.children.length > 1),
            nodeToMoveIsLeafNode = typeof self.selNode.children === 'undefined',
            newParentID,
            oldParentID,
            removeSelNode;

        if (sameNodeSelected) {
            self.selNode = null;
        } else if (newParentNodeSelected) {
            self.newParent = node;
            newParentID = self.newParent.data.id;
            if (nodeToMoveIsLeafNode) {
                oldParentID = self.selNode.parent.data.id;
                self.nodesToMove = [self.selNode.data];
                removeSelNode = false;
            } else {
                oldParentID = self.selNode.data.id;
                var nodesToMove = [];
                self.selNode.children.forEach(function (node) {
                    nodesToMove.push(node.data);
                });
                self.nodesToMove = nodesToMove;
                removeSelNode = true;
            }

            self.traverseTree(self.data, function (n) {
                self.updateNodeChildren(n, oldParentID, newParentID);
            });

            if (removeSelNode) {
                self.traverseTree(self.data, function (n) {
                    self.removeNode(n, self.selNode.data.id, self.selNode.parent.data.id);
                });
            }

            self.selNode = null;
            self.nodesToMove = null;
            self.newParent = null;
            self.update(true);
        }
    },

    /* This function "zooms" to center of coordinates. It is important to
     * realize that "zoom" in this context actually means setting the (x, y, r)
     * data for the circles.
     */
    positionAndResizeNodes: function (coords, transition) {
        var self = this,
            k = self.DIAMETER / coords[2],
            circles = d3.selectAll("circle"),
            text = d3.selectAll('text');
        self.currCoords = coords;

        if (transition) {
            circles = circles.transition().duration(3000);
            text = text.transition().duration(3000);
        }

        circles.attr("transform", function (d) {
            return "translate(" + (d.x - coords[0]) * k + "," + (d.y - coords[1]) * k + ")";
        });
        circles.attr("r", function (d) {
            return d.r * k;
        });
        text.attr("transform", function (d) {
            return "translate(" + (d.x - coords[0]) * k + "," + (d.y - coords[1]) * k + ")";
        });

        text.selectAll("tspan")
            .attr("y", function() {
                var that = d3.select(this),
                    i = +that.attr("data-term-index"),
                    len = +that.attr("data-term-len");
                // `- (len / 2) + 0.75` shifts the term down appropriately.
                // `15 * k` spaces them out appropriately.
                return (self.FONT_SIZE * (k/2) + 3)* 1.2 * (i - (len / 2) + 0.75);
            })
            .style("font-size", function() {
                return (self.FONT_SIZE * (k/2) + 3) + "px";
            });
    },

    /* Zoom to node.
     */
    zoom: function (node) {
        var self = this,
            coords = [node.x, node.y, node.r * 2 + self.PAGE_MARGIN];
        self.nodeInFocus = node;
        d3.transition()
            .duration(1000)
            .tween("zoom", function () {
                var interp = d3.interpolateZoom(self.currCoords, coords);
                return function (t) {
                    self.positionAndResizeNodes(interp(t), true);
                };
            });
    },

    /* Update node's children depending on whether it is the new or old parent.
     */
    updateNodeChildren: function (node, oldParentID, newParentID) {
        var self = this,
            newChildren;

        // Remove nodes-to-move from old parent.
        if (node.id === oldParentID) {
            // In this scenario, the user selected a leaf node
            // Remove `nodesToMove` from old parent.
            if (self.nodesToMove.length === 1) {
                newChildren = [];
                node.children.forEach(function (child) {
                    if (child.id !== self.nodesToMove[0].id) {
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
            self.nodesToMove.forEach(function (nodeToMove) {
                node.children.push(nodeToMove);
            });
        }
    },

    removeNode: function (node, nodeToRemoveID, nodeToRemoveParentID) {
        var newChildren = [];
        if (node.id === nodeToRemoveParentID) {
            node.children.forEach(function (child) {
                if (child.id !== nodeToRemoveID) {
                    newChildren.push(child);
                }
            });
            node.children = newChildren;
        }
    },

// Helper functions.
//------------------------------------------------------------------------------

    /* Helper function to correctly color any node.
     */
    colorNode: function (node, hover) {
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
    },

    /* Traverse the underlying tree data structure and apply a callback
     * function to every node.
     */
    traverseTree: function (node, processNode) {
        var self = this;
        processNode(node);
        if (typeof node.children !== 'undefined') {
            node.children.forEach(function (childNode) {
                self.traverseTree(childNode, processNode)
            });
        }
    },

    /* Convert R dataframe to tree.
     */
    getTreeFromRawData: function (x) {
        var self = this,
            data = {id: "root", children: [], terms: []},
            srcData = HTMLWidgets.dataframeToD3(x.data);

        // For each data row add to the output tree.
        srcData.forEach(function (d) {
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

    /* Helper function to add hierarchical structure to data.
     */
    findParent: function (branch, parentID, nodeID) {
        var self = this;
        if (parentID === 0) {
            parentID = "root";
        }
        var rv = null;
        if (branch.id == parentID) {
            rv = branch;
        } else if (rv === null && branch.children !== undefined) {
            branch.children.forEach(function (child) {
                if (rv === null) {
                    rv = self.findParent(child, parentID, nodeID);
                }
            });
        }
        return rv;
    }
});
