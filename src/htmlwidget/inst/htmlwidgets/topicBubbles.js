HTMLWidgets.widget({

    name: 'topicBubbles',
    type: 'output',

    svg: null,
    data: null,
    selectedNode: null,
    currCoords: null,
    nodeInFocus: null,

    BUBBLE_PADDING: 20,
    PAGE_MARGIN: 30,
    DIAMETER: null,

    initialize: function(el, width, height) {
        d3.select(el)
            .append("svg")
            .attr("width", 3000)
            .attr("height", 3000);
    },

    resize: function(el, width, height) {
        d3.select(el)
            .select("svg")
            .attr("width", 3000)
            .attr("height", 3000);
    },

    renderValue: function(el, x) {
        var self = this,
            svg = d3.select("svg"),
            data = self.getTreeFromRawData(x);
        self.svg = svg;
        self.DIAMETER = +svg.attr("width");
        self.update(data);
    },

    update: function(data) {
        var self = this,
            g = self.svg.append("g")
            .attr("transform", "translate(" + self.DIAMETER / 2 + "," + self.DIAMETER / 2 + ")");

        var color = d3.scaleLinear()
            .domain([-1, 5])
            .range(["hsl(152,80%,80%)", "hsl(228,30%,40%)"])
            .interpolate(d3.interpolateHcl);

        self.pack = d3.pack()
            .size([self.DIAMETER - self.PAGE_MARGIN, self.DIAMETER - self.PAGE_MARGIN])
            .padding(self.BUBBLE_PADDING);

        var root = d3.hierarchy(data)
            .sum(function(d) {
                return d.weight;
            })
            .sort(function(a, b) {
                return b.value - a.value;
            });

        self.nodeInFocus = root;
        var descendants = self.pack(root).descendants();

        function colorNode(node) {
            return node.children ? color(node.depth) : null;
        }

        var circles = g.selectAll("circle")
            .data(descendants)
            .enter()
            .append("circle")
            .attr("class", function(d) {
                if (d.parent) {
                    return d.children ? "node node--middle" : "node node--leaf";
                } else {
                    return "node node--root";
                }
            })
            .attr('data-id', function(d) {
                return d.data.id;
            })
            .style("pointer-events", "visible")
            .style("fill", function(d) {
                if (self.selectedNode && self.selectedNode.data.id === d.data.id) {
                    return 'rgb(255, 0, 0)'
                }
                return colorNode(d);
            });

        // Fade the highlight out.
        circles
            .transition()
            .duration(1500)
            .style("fill", colorNode);

        g.selectAll(".node--middle")
            .on("click", function(d) {
                if (self.selectedNode) {
                    self.newParent = d;
                    var newData = self.updateData(data);
                    self.update(newData);
                    self.selectedNode = null;
                    self.newParent = null;
                } else if (self.nodeInFocus !== d) {
                    self.zoom(d);
                    d3.event.stopPropagation();
                }
            });

        g.selectAll(".node--leaf")
            .on("click", function(d) {
                d3.event.stopPropagation();
                circles.style('fill', colorNode);
                if (self.selectedNode && self.selectedNode.data.id == d.data.id) {
                    self.selectedNode = null;
                } else {
                    var sel = d3.select(this);
                    sel.style('fill', 'rgb(255, 0, 0)');
                    self.selectedNode = d;
                }
            });

        g.selectAll("text")
            .data(descendants)
            .enter()
            .append("text")
            .attr("class", "label")
            .style("fill-opacity", function(d) {
                return d.parent === root ? 1 : 0;
            })
            .style("display", function(d) {
                return d.parent === root ? "inline" : "none";
            })
            .each(function(d) {
                for (var i = 0; i < d.data.terms.length; i++) {
                    d3.select(this).append("tspan")
                        .text(function() {
                            return d.data.terms[i];
                        })
                        .attr("y", 12 * (i + 0.75 - d.data.terms.length / 2))
                        .attr("x", 0)
                        .attr("text-anchor", "middle");
                }
            });

        // Zoom out when the user clicks the outermost circle.
        self.svg.style("background", color(-1))
            .on("click", function() {
                self.zoom(root);
            });

        // Set initial zoom.
        self.zoomTo([root.x, root.y, root.r * 2 + self.PAGE_MARGIN]);
        self.rerender();
    },

    rerender: function() {
        var self = this;
        self.svg.selectAll('circles')
            .transition()
            .duration(5000)
            .attr("cx", function(d) {
                return d.x;
            })
            .attr("cy", function(d) { return d.y; })
            .attr("r", function(d) { return d.r; });
    },

    /* Update underlying tree data structure, changing the selected node's
     * parent.
     */
    updateData: function(data) {
        var self = this,
            copy;

        if (data == null || typeof data !== 'object') return data;

        if (data instanceof Array) {
            copy = [];
            for (var i = 0; i < data.length; i++) {
                copy[i] = self.updateData(data[i]);
            }
            return copy;
        }

        if (data instanceof Object) {
            copy = {};
            for (var prop in data) {
                if (!data.hasOwnProperty(prop)) {
                    continue;
                }

                // Remove the selected node from the old parent.
                if (prop === 'id' && data[prop] === self.selectedNode.parent.data.id) {
                    var newChildren = [];
                    for (var j = 0; j < data.children.length; j++) {
                        var child = data.children[j];
                        if (child.id !== self.selectedNode.data.id) {
                            newChildren.push(child);
                        }
                    }
                    data.children = newChildren;
                }
                // Add the selected node to the new parent.
                if (prop === 'id' && data[prop] === self.newParent.data.id) {
                    data.children.push(self.selectedNode.data);
                }

                copy[prop] = self.updateData(data[prop]);
            }
            return copy;
        }

        throw new Error('Object type not supported.');
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
                    self.zoomTo(i(t));
                };
            });

        transition.selectAll("text")
            .filter(function(d) {
                return d.parent === node || this.style.display === "inline";
            })
            .style("fill-opacity", function(d) {
                return d.parent === node ? 1 : 0;
            })
            .on("start", function(d) {
                if (d.parent === node) this.style.display = "inline";
            })
            .on("end", function(d) {
                if (d.parent !== node) this.style.display = "none";
            });
    },

    /* Zoom to center of coordinates.
     */
    zoomTo: function(coords) {
        var self = this,
            k = self.DIAMETER / coords[2];
        self.currCoords = coords;
        self.svg.selectAll("circle, text")
            .attr("transform", function(d) {
                return "translate(" + (d.x - coords[0]) * k + "," + (d.y - coords[1]) * k + ")";
            });
        self.svg.selectAll("circle")
            .attr("r", function(d) {
                return d.r * k;
            });
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
                if (parent.hasOwnProperty('children')) {
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
    }
});

