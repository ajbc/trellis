HTMLWidgets.widget({

    name: "topicBubbles",
    type: "output",

    PAGE_MARGIN: 30,
    DIAMETER: null,
    FONT_SIZE: 18,

    svg: null,
    selectedNode: null,
    currCoords: null,
    nodeInFocus: null,
    nodeCoordCache: {},

    initialize: function(el, width, height) {
        var self = this,
            BUBBLE_PADDING = 20;

        self.DIAMETER = 4000;
        self.svg = d3.select(el)
            .append("svg")
            .attr("width", self.DIAMETER)
            .attr("height", self.DIAMETER);
        self.rootG = self.svg.append("g")
            .attr("transform", "translate(" + self.DIAMETER / 2 + "," + self.DIAMETER / 2 + ")");
        self.pack = d3.pack()
            .size([self.DIAMETER - self.PAGE_MARGIN, self.DIAMETER - self.PAGE_MARGIN])
            .padding(BUBBLE_PADDING);
        self.colorMap = d3.scaleLinear()
            .domain([0, 1])
            .range(["hsl(155,30%,82%)", "hsl(155,66%,25%)"])
            .interpolate(d3.interpolateHcl);
    },

    resize: function(el, width, height) {
        this.initialize(el, width, height);
    },

    renderValue: function(el, rawData) {
        var self = this;

        self.data = self.getTreeFromRawData(rawData);

        var root = d3.hierarchy(self.data)
            .sum(function(d) { return d.weight; })
            .sort(function(a, b) { return b.value - a.value; });

        self.nodeInFocus = root;
        var descendants = self.pack(root).descendants();

        descendants.forEach(function(node) {
            self.nodeCoordCache[node.data.id] = {
                x: node.x,
                y: node.y,
                r: node.r
            };
        });

        // Data binding.
        //---------------------------------------------------------------------

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

        // Behavior.
        //---------------------------------------------------------------------
        self.circles
            .filter(function() {
                return d3.select(this).classed("circle-leaf");
            })
            .on("click", function(d) {
                d3.event.stopPropagation();
                if (self.selectedNode && self.selectedNode.data.id === d.data.id) {
                    self.selectedNode = null;
                    self.newParent = null;
                } else {
                    self.selectedNode = d;
                    self.newParent = null;
                }
                self.circles.style("fill", function(d) {
                    return self.colorNode.call(self, d);
                });
            })
            .on("mouseover", function(d) {
                d3.select(this).style("fill", function() {
                    return self.colorNode.call(self, d, true);
                });
            })
            .on("mouseout", function(d) {
                d3.select(this).style("fill", function() {
                    return self.colorNode.call(self, d, false);
                });
            });

        self.circles
            .filter(function() {
                return d3.select(this).classed("circle-middle");
            })
            .on("click", function(d) {
                d3.event.stopPropagation();
                if (self.selectedNode && self.selectedNode.parent !== d) {
                    self.newParent = d;
                    var newData = self.updateData(self.data);
                    self.data = newData;
                    self.selectedNode = null;
                    self.newParent = null;
                    self.updateView(self.data);
                } else if (self.nodeInFocus !== d) {
                    self.zoom(d);
                } else if (self.nodeInFocus === d) {
                    self.zoom(root);
                }
            })
            .on("mouseover", function(d) {
                d3.select(this).style("fill", function() {
                    return self.colorNode.call(self, d, true);
                });
            })
            .on("mouseout", function(d) {
                d3.select(this).style("fill", function() {
                    return self.colorNode.call(self, d, false);
                });
            });

        // Zoom out when the user clicks the outermost circle.
        self.svg.style("background", "#fff")
            .on("click", function() { self.zoom(root); });

        self.zoomTo([root.x, root.y, root.r * 2 + self.PAGE_MARGIN], false);
    },

    updateView: function(data) {
        var self = this,
            root;

        root = d3.hierarchy(data)
            .sum(function(d) { return d.weight; })
            .sort(function(a, b) { return b.value - a.value; });

        self.pack(root).descendants().forEach(function(node) {
            self.nodeCoordCache[node.data.id] = {
                x: node.x,
                y: node.y,
                r: node.r
            };
        });

        self.nodeInFocus = root;
        self.zoomTo([root.x, root.y, root.r * 2 + self.PAGE_MARGIN], true);
    },

    /* Zoom to center of coordinates.
     */
    // IMPORTANT: This function is responsible for setting circle radii and locations.
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
            var c = self.nodeCoordCache[d.data.id];
            return "translate(" + (c.x - coords[0]) * k + "," + (c.y - coords[1]) * k + ")";
        });
        circles.attr("r", function(d) {
            var c = self.nodeCoordCache[d.data.id];
            return c.r * k;
        });

        nodes.selectAll("tspan")
            .attr("y", function(d) {
                var that = d3.select(this),
                    i = +that.attr("data-term-index"),
                    len = +that.attr("data-term-len");
                // `- (len / 2) + 0.5` shifts the term down appropriately.
                // `15 * k` spaces them out appropriately.
                return ((35/1.25) * k) * (i - (len / 2) + 0.5);
            })
            .style("font-size", function(d) {
                return (self.FONT_SIZE * (k/2) + 20) + "px";
            });
    },

    /* Zoom to node.
     */
    zoom: function(node) {
        var self = this,
            c = self.nodeCoordCache[node.data.id];
        self.nodeInFocus = node;

        var transition = d3.transition()
            .duration(d3.event.altKey ? 7500 : 750)
            .tween("zoom", function(d) {
                var coords = [c.x, c.y, c.r * 2 + self.PAGE_MARGIN],
                    i = d3.interpolateZoom(self.currCoords, coords);
                return function(t) {
                    self.zoomTo(i(t), false);
                };
            });

        //transition.selectAll("text")
        //    .filter(function(d) {
        //        return d.parent === node || this.style.display === "inline";
        //    })
        //    .style("fill-opacity", function(d) {
        //        return d.parent === node ? 1 : 0;
        //    })
        //    .on("start", function(d) {
        //        if (d.parent === node) this.style.display = "inline";
        //    })
        //    .on("end", function(d) {
        //        if (d.parent !== node) this.style.display = "none";
        //    });
    },

    /* Update underlying tree data structure, changing the selected node"s
     * parent.
     */
    updateData: function(root) {
        var self = this,
            oldParentId = self.selectedNode.parent.data.id,
            newParentId = self.newParent.data.id,
            // TODO: Confirm true specifies deep copy.
            newData = $.extend({}, root, true);

        newData.children.forEach(function(middleNode) {
            // Remove the selected node from the old parent.
            if (middleNode.id === oldParentId) {
                var newChildren = [];
                middleNode.children.forEach(function(child) {
                    if (child.id !== self.selectedNode.data.id) {
                        newChildren.push(child);
                    }
                });
                middleNode.children = newChildren;
            // Add selected node to new parent.
            } else if (middleNode.id === newParentId) {
                middleNode.children.push(self.selectedNode.data);
                // CRITICAL BUT SUBTLE: d3 has references to the parents cached
                // when calling descendants(); we must manually update this
                // reference.
                self.selectedNode.parent = self.newParent;
            }
        });
        return newData;
    },

    /* Convert R dataframe to tree.
     */
    getTreeFromRawData: function(x) {
        var self = this,
            data = {id: "root", children: [], terms: []},
            srcData = HTMLWidgets.dataframeToD3(x.data);

        // For each data row add to the output tree
        srcData.forEach(function(d) {
            // find parent
            var parent = self.findParent(data, d.parentID, d.nodeID);

            // leaf node
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

    /* Helper function to color each node.
     */
    colorNode: function(node, hover) {
        var self = this,
            isSelectedNode = self.selectedNode && self.selectedNode.data.id === node.data.id;

        if (hover) {
            if (node.depth === 1) {
                return self.colorMap(1.2);
            }
            return "rgb(220, 220, 220)";
        } else if (isSelectedNode) {
            return "rgb(255, 0, 0)";
        } else if (node.children) {
            return self.colorMap(node.depth);
        } else {
            return "rgb(255, 255, 255)";
        }
    }
});

