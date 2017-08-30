HTMLWidgets.widget({


// Variables global to the `HTMLWidgets` instance.
//------------------------------------------------------------------------------

    name: "topicBubbles",
    type: "output",

    PAGE_MARGIN: 30,
    DIAMETER: null,
    FONT_SIZE: 11,

    // `source` is the node the user clicks on first.
    source: null,
    // `nodesToMove` is an array of nodes the user intends to move. If `source`
    // is a leaf node, then `nodesToMove` is an array with just `source`.
    // Otherwise, `nodesToMove` is an array with `source`'s children.
    nodesToMove: null,
    // `newParent` is the group the user selects after selecting a node to move.
    newParent: null,
    // `nodeInFocus` is used to check whether to zoom in or out, depending on
    // whether or not the user has already zoomed in.
    nodeInFocus: null,
    currCoords: null,

    // Used to know when the user has changed the number of groups. In this
    // scenario, we just completely re-initialize the widget.
    nGroups: null,

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
            .attr("id", "root-node")
            .attr("transform", "translate(" + SVG_R + "," + SVG_R + ")");

        // Create persistent `d3.pack` instance with radii accounting for
        // padding.
        self.pack = d3.pack()
            .size([D3PACK_W, D3PACK_W])
            .padding(NODE_PADDING);

        // Set depth-to-color mapping function.
        self.colorMap = d3.scaleLinear()
            .domain([-1, 1])
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
            nGroupsChanged;

        self.data = self.getTreeFromRawData(rawData);
        nGroupsChanged = self.nGroups !== null
            && self.nGroups !== self.data.children.length;
        if (nGroupsChanged) {
            self.reInitialize();
        } else {
            self.nGroups = self.data.children.length;
            this.update(false);
        }
    },

    update: function (useTransition) {
        var self = this,
            nClicks = 0,
            DBLCLICK_DELAY = 300,
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
            .attr("depth", function(d) {
                return d.depth;
            })
            .attr("id", function(d) {
                return "node-" + d.data.id;
            })
            .attr("class", "node")
            .on("dblclick", function () {
                d3.event.stopPropagation();
            })
            .on("click", function (d) {
                d3.event.stopPropagation();
                var makeNewGroup = d3.event.shiftKey;
                nClicks++;
                if (nClicks === 1) {
                    timer = setTimeout(function () {
                        self.selectNode(d, makeNewGroup);
                        nClicks = 0;
                    }, DBLCLICK_DELAY);
                } else {
                    clearTimeout(timer);
                    nClicks = 0;
                    self.zoom(root, d);
                }
            })
            .on("mouseover", function (d) {
                //Shiny.onInputChange("hover", d.data.id);
                d3.select(this).style("fill", self.colorNode.call(self, d, true));
            })
            .on("mouseout", function (d) {
                //Shiny.onInputChange("hover", d.data.id);
                d3.select(this).style("fill", self.colorNode.call(self, d, false));
            })
            .style("fill", function (d) {
                return self.colorNode.call(self, d);
            });

        text = self.g.selectAll('text')
            .data(nodes, constancyFn);

        text.enter()
            .append('text')
            .attr("class", "label")
            .attr("depth", function(d) {
                return d.depth;
            })
            .style('fill', 'black')
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
            });

        circles.exit().remove();
        text.exit().remove();

        circles.raise();
        text.raise();

        self.positionAndResizeNodes(
            [root.x, root.y, root.r * 2 + self.PAGE_MARGIN],
            useTransition
        );
    },

    /* Zoom on click.
     */
    zoom: function(root, node) {
        var self = this,
            isRoot = node.data.id === 'root',
            userClickedSameNodeTwice = self.nodeInFocus === node,
            userClickedDiffNode = self.nodeInFocus !== node;
        if (isRoot || userClickedSameNodeTwice) {
            self.zoomToNode(root);
        } else if (userClickedDiffNode) {
            self.zoomToNode(node);
        }
    },

    /* Zoom to node utility function.
     */
    zoomToNode: function (node) {
        var self = this,
            ZOOM_DURATION = 500,
            coords = [node.x, node.y, node.r * 2 + self.PAGE_MARGIN];
        self.nodeInFocus = node;
        d3.transition()
            .duration(ZOOM_DURATION)
            .tween("zoom", function () {
                var interp = d3.interpolateZoom(self.currCoords, coords);
                return function (t) {
                    // `tween()` will handle the transition for us, so we can
                    // pass `useTransition = false`.
                    self.positionAndResizeNodes(interp(t), false);
                };
            });
    },

    selectNode: function (target, makeNewGroup) {
        var self = this,
            isRoot = target.data.id === 'root',
            newSource = !self.source,
            targetIsLeaf = typeof target.children === 'undefined',
            targetIsChild = !newSource && self.source.depth < target.depth;
        if (isRoot) {
            return;
        } else if (newSource || targetIsLeaf || targetIsChild) {
            self.source = target;
            self.nodesToMove = null;
            self.newParent = null;
        } else {
            self.moveOrMerge(target, makeNewGroup);
            self.updateAssignments();
        }
        d3.selectAll("circle").style("fill", function (d) {
            return self.colorNode.call(self, d);
        });
    },

    moveOrMerge: function (target, makeNewGroup) {
        var self = this,
            targetIsSource = self.source.data.id === target.data.id,
            sourceIsLeaf = typeof self.source.children === 'undefined',
            mergingNodes = !sourceIsLeaf && self.source.children.length > 1,
            sameParentSel = self.source.parent === target,
            newParentID,
            oldParentID,
            removeSelNode;

        if (targetIsSource || (sameParentSel && !mergingNodes && !makeNewGroup)) {
            self.source = null;
            return;
        }

        if (makeNewGroup) {
            self.traverseTree(self.data, function (node) {
                self.makeNewGroup(node, target);
            });
        } else {
            self.newParent = target;
            newParentID = self.newParent.data.id;
            if (sourceIsLeaf) {
                oldParentID = self.source.parent.data.id;
                self.nodesToMove = [self.source.data];
                removeSelNode = false;
            } else {
                oldParentID = self.source.data.id;
                var nodesToMove = [];
                self.source.children.forEach(function (node) {
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
                    self.removeNode(n, self.source.data.id, self.source.parent.data.id);
                });
            }
        }

        self.update(true);
        self.source = null;
        self.nodesToMove = null;
        self.newParent = null;
    },

    /* This function "zooms" to center of coordinates. It is important to
     * realize that "zoom" in this context actually means setting the (x, y, r)
     * data for the circles.
     */
    positionAndResizeNodes: function (coords, transition) {
        var self = this,
            MOVE_DURATION = 1000,
            k = self.DIAMETER / coords[2],
            circles = d3.selectAll("circle"),
            text = d3.selectAll('text');
        self.currCoords = coords;

        if (transition) {
            circles = circles.transition().duration(MOVE_DURATION);
            text = text.transition().duration(MOVE_DURATION);
        }

        circles.attr("transform", function (d) {
            var x = (d.x - coords[0]) * k,
                y =  (d.y - coords[1]) * k;
            return "translate(" + x + "," + y + ")";
        });
        circles.attr("r", function (d) {
            return d.r * k;
        });
        circles.style("fill", function(d) {
           return self.colorNode.call(self, d);
        });
        text.attr("transform", function (d) {
            var x = (d.x - coords[0]) * k,
                y = (d.y - coords[1]) * k;
            return "translate(" + x + "," + y + ")";
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

    removeNode: function (n, nToRmID, nToRmParentID) {
        var newChildren = [];
        if (n.id === nToRmParentID) {
            n.children.forEach(function (child) {
                if (child.id !== nToRmID) {
                    newChildren.push(child);
                }
            });
            n.children = newChildren;
        }
    },

    makeNewGroup: function (n, target) {
        var self = this,
            nIsTarget = n.id === target.data.id,
            nIsSourceParent = n.id === self.source.parent.data.id,
            newChildren;
        if (nIsTarget) {
            n.children.push({
                id: self.getNewID(),
                children: [self.source.data],
                terms: []
            });
        }
        // This is not an `else if` because the user can make a new group by
        // selecting the source node's current parent as the target node. In
        // this case, `n` can be both the target and the `source` parent.
        if (nIsSourceParent) {
            newChildren = [];
            n.children.forEach(function (child) {
                if (child.id !== self.source.data.id) {
                    newChildren.push(child);
                }
            });
            n.children = newChildren;
        }
    },

// Helper functions.
//------------------------------------------------------------------------------

    /* Helper function to correctly color any node.
     */
    colorNode: function (node, hover) {
        var self = this,
            isSelNode = self.source
                && self.source.data.id === node.data.id;
        if (isSelNode) {
            return "rgb(25, 101, 255)";  // Red.
        } else if (hover && node.depth !== 0) {
            return d3.color(self.colorMap(node.depth))
                .darker()
                .toString();
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
                    terms: d.title.split(" "),
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

    /* Helper function for updateAssignments
     */
    findAssignments: function(node) {
        var self = this,
            assignments = "";

        node.children.forEach(function(d) {
            assignment = "".concat(d.data.id, ":", (node.data.id=="root") ? 0 : node.data.id);
            assignments = assignments.concat(assignment, ",");

            //TODO: check that this works for hierarchy
            if (d.hasOwnProperty("children"))
                assignments = assignments.concat(self.findAssignments(d));
        });

        return assignments;
    },

    /* Update the string that informs the Shiny server about the hierarchy of
     * topic assignemnts
     */
    updateAssignments: function() {
        var self = this;

        var root = d3.hierarchy(self.data);

        //Shiny.onInputChange("topics", self.findAssignments(root));
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
    },

    /* Finds the maximum node ID and returns the next integer.
     */
    getNewID: function () {
        var self = this,
            maxId = 0;
        self.traverseTree(self.data, function (node) {
            if (node.id > maxId) {
                maxId = node.id;
            }
        });
        return maxId + 1;
    }
});
