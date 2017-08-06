HTMLWidgets.widget({

    name: "topicBubbles",
    type: "output",

    svg: null,
    selectedNode: null,
    currCoords: null,
    nodeInFocus: null,

    BUBBLE_PADDING: 20,
    PAGE_MARGIN: 30,
    DIAMETER: null,

    nodeCoordCache: {},

    initialize: function(el, width, height) {
        var self = this;
        self.DIAMETER = 4000;
        self.svg = d3.select(el)
            .append("svg")
            .attr("width", self.DIAMETER)
            .attr("height", self.DIAMETER);
        self.rootG = self.svg.append("g")
            .attr("transform", "translate(" + self.DIAMETER / 2 + "," + self.DIAMETER / 2 + ")");
        self.pack = d3.pack()
            .size([self.DIAMETER - self.PAGE_MARGIN, self.DIAMETER - self.PAGE_MARGIN])
            .padding(self.BUBBLE_PADDING);
        self.colorMap = d3.scaleLinear()
            .domain([0, 1])
            .range(["hsl(155,30%,82%)", "hsl(155,66%,25%)"])
            .interpolate(d3.interpolateHcl);
    },

    resize: function(el, width, height) {
        this.initialize(el, width, height);
    },

    renderValue: function(el, rawData) {
        var self = this,
            data = self.getTreeFromRawData(rawData);

        var root = d3.hierarchy(data)
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
        self.nodes = self.rootG.selectAll('g')
            .data(descendants)
            .enter()
            .append('g')
            .attr("data-id", function(d) { return d.data.id; })
            .attr('class', function() { return 'node' });

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

        self.nodes.append("text")
            .attr("class", "label")
            //.style("fill-opacity", function(d) {
            //    return d.parent === root ? 1 : 0;
            //})
            //.style("display", function(d) {
            //    return d.parent === root ? "inline" : "none";
            //})
            .each(function(d) {
                var sel = d3.select(this),
                    len = d.data.terms.length;
                d.data.terms.forEach(function(term, i) {
                    sel.append("tspan")
                        .text(function() { return term; })
                        .attr("y", 50 * (i + 0.75 - len / 2))
                        .attr("x", 0)
                        .attr("text-anchor", "middle")
                        // TODO: Should this be dynamic?
                        .style("font-size", "34px");
                });
            });

        // Behavior.
        //---------------------------------------------------------------------
        self.circles.filter(function() {
            return d3.select(this).classed("circle-leaf");
        })
            .on("click", function(d) {
                d3.event.stopPropagation();
                if (self.selectedNode && self.selectedNode.data.id == d.data.id) {
                    self.selectedNode = null;
                    self.newParent = null;
                } else {
                    self.selectedNode = d;
                }
                self.circles.style("fill", function(d) {
                    return self.colorNode.call(self, d);
                });
            });

        self.circles.filter(function() {
            return d3.select(this).classed("circle-middle");
        })
            .on("click", function(d) {
                d3.event.stopPropagation();
                if (self.selectedNode) {
                    self.newParent = d;
                    var newData = self.updateData(data);
                    self.selectedNode = null;
                    self.newParent = null;
                    self.updateView(newData);
                } else if (self.nodeInFocus !== d) {
                    self.zoom(d);
                } else if (self.nodeInFocus === d) {
                    self.zoom(root);
                }
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

        self.nodeInFocus = root;
        var descendants = self.pack(root).descendants();

        descendants.forEach(function(node) {
            self.nodeCoordCache[node.data.id] = {
                x: node.x,
                y: node.y,
                r: node.r
            };
        });

        self.zoomTo([root.x, root.y, root.r * 2 + self.PAGE_MARGIN], true);
    },

    /* Zoom to center of coordinates.
     */
    // IMPORTANT: This function is responsible for setting circle radii and locations.
    zoomTo: function(coords, transition) {
        var self = this,
            k = self.DIAMETER / coords[2];

        self.currCoords = coords;
        var nodes, circles;

        if (transition) {
            circles = self.circles.transition().duration(3000);
            nodes = self.nodes.transition().duration(3000);
        } else {
            circles = self.circles;
            nodes = self.nodes;
        }

        nodes.attr("transform", function(d) {
            var c = self.nodeCoordCache[d.data.id];
            return "translate(" + (c.x - coords[0]) * k + "," + (c.y - coords[1]) * k + ")";
        });
        self.circles
            .transition()
            .duration(3000)
            .attr("r", function(d) {
                var c = self.nodeCoordCache[d.data.id];
                return c.r * k;
            });

        //// Fade the highlight out.
        //self.circles.transition()
        //    .duration(3000 + 1500)
        //    .style("fill", function(d) {
        //        return self.colorNode.call(self, d);
        //    });
    },

    /* Zoom to node.
     */
    zoom: function(node) {
        var self = this;
        self.nodeInFocus = node;

        var transition = d3.transition()
            .duration(d3.event.altKey ? 7500 : 750)
            .tween("zoom", function(d) {
                var coords = [node.x, node.y, node.r * 2 + self.PAGE_MARGIN],
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
        var self = this;
        root.children.forEach(function(middleNode) {
            // Remove the selected node from the old parent.
            if (middleNode.id === self.selectedNode.parent.data.id) {
                var newChildren = [];
                middleNode.children.forEach(function (child) {
                    if (child.id !== self.selectedNode.data.id) {
                        newChildren.push(child);
                    }
                });
                middleNode.children = newChildren;
                console.log('new children set');
            // Add selected node to new parent.
            } else if (middleNode.id === self.newParent.data.id) {
                middleNode.children.push(self.selectedNode.data);
                console.log('new parent set');
            }
        });
        return root;
    },

    /* Convert R dataframe to tree.
     */
    getTreeFromRawData: function(x) {
        var self = this,
            data = {id: "root", children: [], title: "", terms: []},
            srcData = HTMLWidgets.dataframeToD3(x.data);

        // For each data row add to the output tree
        srcData.forEach(function(d) {
            // find parent
            var parent = self.findParent(data, d.parentID, d.nodeID);

            // leaf node
            if (d.weight === 0) {
                parent.children.push({
                    id: d.nodeID,
                    title: "",
                    terms: [],
                    children: []
                });
            } else if (parent !== null) {
                if (parent.hasOwnProperty("children")) {
                    parent.children.push({
                        id: d.nodeID,
                        title: d.title,
                        terms: d.title.split(" "),
                        weight: d.weight
                    });
                }
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
        } else if (rv === null) {
            if (branch.children !== undefined) {
                $.each(branch.children, function(i) {
                    if (rv === null) {
                        rv = self.findParent(branch.children[i], parentID, nodeID);
                    }
                });
            }
        }
        return rv;
    },

    /* Helper function to color each node.
     */
    colorNode: function(node) {
        var self = this,
            isSelectedNode = self.selectedNode && self.selectedNode.data.id === node.data.id;
        if (isSelectedNode) {
            return "rgb(255, 0, 0)";
        } else if (node.children) {
            return self.colorMap(node.depth);
        } else {
            return "rgb(255, 255, 255)";
        }
    }
});

