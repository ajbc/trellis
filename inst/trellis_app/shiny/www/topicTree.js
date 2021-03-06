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

// REF: http://bl.ocks.org/shubhgo/80323b7f3881f874c02f
// REF: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
// REF: https://bl.ocks.org/d3noob/b024fcce8b4b9264011a1c3e7c7d70dc


var treeWidget = {


// Variables global to the `HTMLWidgets` instance.
//------------------------------------------------------------------------------

    name: "topicTree",
    type: "output",

    // Constant values
    PAGE_MARGIN: 10,
    TOP_MARGIN: 75,
    BORDER_MARGIN: 10,
    CIRCLE_RADIUS: 7,
    TERMINAL_NODE_RADIUS: 3,
    COLLAPSED_NODE_RADIUS: 10,
    LABEL_FONT_SIZE: 8,
    TEXT_HEIGHT_OFFSET: 2,

    MIN_EDGE_WIDTH: 1,
    MAX_EDGE_WIDTH: 10,

    // Storage of data
    treeData: null,
    maxNodeWeight: 1,

    draggedNode: null,

    // Correct for [0, 0] root using nodeSize
    yOffset: 0,

    initialize: function (el, width, height) {
        var self = this;

        // Ref: https://bl.ocks.org/mbostock/34f08d5e11952a80609169b7917d4172
        // Ref: https://bl.ocks.org/mbostock/4987520
        // Ref: https://bl.ocks.org/emepyc/7218bc9ea76951d6a78b0c7942e07a00
        var zoomHandler = d3.zoom()
            .scaleExtent([0, 40])
            .translateExtent([[-(width/2),-Infinity], [Infinity, Infinity]])
            .on("zoom", self.zoomHandler(self));

        var svg = d3.select(el)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("id", "tree-svg")
            .call(zoomHandler)
            .on("dblclick.zoom", null);

        self.yOffset = (height-(2*self.BORDER_MARGIN)-self.TOP_MARGIN) / 2;

        self.g = svg.append("g")
            .attr("id", "tree-root");

        // Ref: https://github.com/d3/d3-hierarchy/blob/master/README.md#tree
        self.tree = d3.tree()
            .nodeSize([self.CIRCLE_RADIUS, self.CIRCLE_RADIUS])
            .separation(function (left, right) {
                if (left.data.collapsed || right.data.collapsed) {
                    return 3;
                } else {
                    return (left.parent.data.id === right.parent.data.id) ? 2 : 4;
                }
            });

        self.edgeWidthMap = d3.scaleLinear()
                            .domain([0, 1])
                            .range([self.MIN_EDGE_WIDTH, self.MAX_EDGE_WIDTH]);

        Shiny.addCustomMessageHandler("switchMainViewToTree", function(msg) { self.setSourceByID(parseInt(msg)); });

        Shiny.onInputChange("tree.initialized", true);
    },

    zoomHandler: function (selfRef) {
        var handler = function () {
            selfRef.g.attr("transform", "translate(" + d3.event.transform.x + "," + d3.event.transform.y + ")" + "scale(" + d3.event.transform.k + ")");
            d3.event.sourceEvent.stopPropagation();
        };

        return handler;
    },

    resize: function (el, width, height) {
        var self = this;

        // Update state corresponding to new width

        self.tree = d3.tree()
            .nodeSize([self.CIRCLE_RADIUS, self.CIRCLE_RADIUS])
            .separation(function (left, right) {
                if (left.data.collapsed || right.data.collapsed) {
                    return 3;
                } else {
                    return (left.parent.data.id === right.parent.data.id) ? 1 : 4;
                }
            });

        // Modify width and height of existing svg element
        var svgElement = d3.select("#tree-svg")
            .attr("width", width)
            .attr("height", height);

        // Reset the centering of bubbles-root
        self.g = d3.select("#tree-root");

        // Re-render according to new dimensions, only if data already rendered
        if (self.treeData !== null) {
            self.updateTreeView(false);
        }
    },

    renderValue: function (rawData) {
        if (rawData === null) {
            return;
        }

        var self = this;

        // Root of a tree structure
        // self.treeData = self.getTreeFromRawData(rawData);
        self.treeData = self.getTreeFromJSON(rawData);

        self.updateTreeView(true);
    },

    updateTreeView: function (useTransition) {
        var self = this;

        var treeRoot = d3.hierarchy(self.treeData)
                        .sum(function (n) {
                            return n.weight;
                        })
                        .sort(function (a, b) {
                            return b.value - a.value;
                        }),
            nodes = self.tree(treeRoot).descendants();

        var offset = { top: self.BORDER_MARGIN, left: self.BORDER_MARGIN };

        nodes.forEach(function(d) {
            // Flip coordinates
            var tmpX = (d.depth * 180) + offset.top;
            d.y = d.x + offset.left + self.yOffset;
            d.x = tmpX;
        });

        var circles = self.g.selectAll("circle")
            .data(nodes, self.constancy);

        var text = self.g.selectAll("text")
            .data(nodes, self.constancy);

        var paths = self.g.selectAll("path")
            .data(nodes.slice(1), self.constancy);

        var rects = self.g.selectAll("rect")
            .data(nodes.filter(function (d) {
                return (d.data.collapsed || (d.data.children && d.data.children.length > 0));
            }), self.constancy);

        // Ref: https://stackoverflow.com/questions/38599930/d3-version-4-workaround-for-drag-origin
        var dragHandler = d3.drag()
            .subject(function (n) { return n; })
            .on("drag", self.activeDragHandler(self))
            .on("end", self.dragEndHandler(self));


        paths.enter()
            .append("path")
            .attr("class", "tree-link")
            .attr("id", function (d) {
                return "tree-path-" + d.data.id;
            });


        var newRects = rects.enter()
            .append("rect")
            .attr("class", "tree-label-background")
            .attr("id", function (d) {
                return "tree-label-background-" + d.data.id;
            })
            .attr("x", function (d) {
                var margin = 2 + self.COLLAPSED_NODE_RADIUS;
                var x = (d.parent) ? d.parent.x : d.x;
                return x + margin - 2;
            });


        text.enter()
            .append("text")
            .attr("class", "tree-label")
            .attr("id", function (d) {
                return "tree-label-" + d.data.id;
            })
            .attr("x", function (d) {
                var margin = 2 + self.COLLAPSED_NODE_RADIUS;
                var x = (d.parent) ? d.parent.x : d.x;
                return x + margin;
            })
            .attr("y", function (d) {
                var y = (d.parent) ? d.parent.y : d.y;
                return y + self.TEXT_HEIGHT_OFFSET;
            });


        newRects.attr("y", function (d) {
                var textheight = $("#tree-label-"+d.data.id)[0].getBBox().height;
                // Add 4 to adjust for margins. Probably a better way to calculate this.
                var y = (d.parent) ? d.parent.y : d.y;
                return y - textheight + 4;
            });


        // Initialize position to parent node's position, for animations
        circles.enter()
            .append("circle")
            .attr("class", "tree-node")
            .attr("opacity", "1.0")
            .attr("id", function (d) {
                return "tree-node-" + d.data.id;
            })
            .attr("cx", function (d) {
                if (d.parent) {
                    return d.parent.x;
                } else {
                    return d.x;
                }
            })
            .attr("cy", function (d) {
                if (d.parent) {
                    return d.parent.y;
                } else {
                    return d.y;
                }
            })
            .attr("depth", function (d) {
                return d.depth;
            })
            .on("click", self.generateNodeClickHandler(self))
            .on("mouseover", function (d) {
                d3.event.stopPropagation;

                self.raiseNode(self, d.data.id);

                var displayID = !self.sourceD ? "" : self.sourceD.data.id,
                    isRoot = self.isRootNode(d);
                Shiny.onInputChange("topic.active", isRoot ? displayID : d.data.id);
            })
            .on("mouseout", function (d) {
                d3.event.stopPropagation();
                var displayID = !self.sourceD ? "" : self.sourceD.data.id;
                Shiny.onInputChange("topic.active", displayID);
            })
            .call(dragHandler);


        circles.exit().remove();
        text.exit().remove();
        paths.exit().remove();
        rects.exit().remove();

        self.raiseAllRects();
        self.raiseAllLabels();
        self.raiseAllCircles();

        self.resizeAndReposition(useTransition);
    },

    // Returns a callback function, setting drag status to ``status``
    dragStatusSetter: function (status) {
        var setterCallback = function (n) {
            var nodeID = ["#tree-node", n.data.id].join("-");
            d3.select(nodeID).classed("dragged-node", status);
            var labelID = ["#tree-label", n.data.id].join("-");
            d3.select(labelID).classed("dragged-label", status);
            var pathID = ["#tree-path", n.data.id].join("-");
            d3.select(pathID).classed("dragged-path", status);

            if (!n.hasOwnProperty("children")) { return; }

            n.children.forEach(function (ch) {
                setterCallback(ch);
            });
        }

        return setterCallback;
    },

    // Pass in reference to "self", as the call() method passes a different "this"
    activeDragHandler: function (selfRef) {
        var handler = function (d) {
            coords = d3.mouse(this);

            if (selfRef.isRootNode(d)) { return; }

            if (selfRef.draggedNode === null) {
                d3.event.sourceEvent.stopPropagation();

                var nodeID = ["#tree-node", d.data.id].join("-");

                d3.select(nodeID).data().forEach(selfRef.dragStatusSetter(true));

                selfRef.draggedNode = d.data.id;

                selfRef.dragPointer = selfRef.g.append("circle").attr("id", "drag-pointer").attr("r", 10).raise();
                d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1]);
            }

            d3.event.sourceEvent.stopPropagation();

            d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1])
        }

        return handler;
    },

    // Pass in reference to "self", as the call() method passes a different "this"
    dragEndHandler: function (selfRef) {
        var handler = function (d) {
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


    // NOTE(tfs): There must be a cleaner way of appraoching this
    raiseNode: function (selfRef, nodeID) {
        var rootElemNode = $("#tree-root")[0];
        rootElemNode.appendChild($("#tree-node-"+nodeID)[0]);
    },


    raiseRect: function (selfRef, nodeID) {
        var rootElemNode = $("#tree-root")[0];
        if ($("#tree-label-background-"+nodeID).length > 0) {
            rootElemNode.appendChild($("#tree-label-background-"+nodeID)[0]);
        }
    },


    raiseLabel: function (selfRef, nodeID) {
        var rootElemNode = $("#tree-root")[0];
        rootElemNode.appendChild($("#tree-label-"+nodeID)[0]);
    },


    raiseAllCircles: function () {
        var self = this,
            rootElemNode = $("#tree-root")[0];

        self.traverseTree(self.treeData, function (n) {
            var id = n.id;
            self.raiseNode(self, id);
        });
    },


    raiseAllRects: function () {
        var self = this,
            rootElemNode = $("#tree-root")[0];

        self.traverseTree(self.treeData, function (n) {
            var id = n.id;
            self.raiseRect(self, id);
        });
    },


    raiseAllLabels: function () {
        var self = this,
            rootElemNode = $("#tree-root")[0];

        self.traverseTree(self.treeData, function (n) {
            var id = n.id;
            self.raiseLabel(self, id);
        });
    },


    /* Move or merge source node with target node.
     */
    moveOrMerge: function (selfRef, sourceID, targetID, makeNewGroup) {
        if (sourceID === targetID) {
            return;
        }

        Shiny.onInputChange("updateAssignments", [sourceID, targetID, makeNewGroup, Date.now()]);
    },


    resizeAndReposition: function (useTransition = false) {
        var self = this,
            circles = self.g.selectAll("circle"),
            paths = self.g.selectAll("path"),
            text = self.g.selectAll("text"),
            rects = self.g.selectAll("rect"),
            MOVE_DURATION = 500;

        if (useTransition) {
            circles = circles.transition().duration(MOVE_DURATION);
            paths = paths.transition().duration(MOVE_DURATION);
            text = text.transition().duration(MOVE_DURATION);
            rects = rects.transition().duration(MOVE_DURATION);
        }

        paths.attr("d", function (d) {
                return self.shapePath(d, d.parent);
            })
            .attr("stroke-width", function (d) {
                return self.edgeWidthMap(d.data.weight);
            })
            .attr("fill", "none")
            .attr("stroke", "black");

        circles.attr("cx", function (d) {
                return d.x;
            })
            .attr("cy", function (d) {
                return d.y;
            })
            .attr("depth", function (d) {
                return d.depth;
            })
            .each(function (d) {
                var elem = d3.select(this);

                if (d.data.collapsed) {
                    // NOTE(tfs): Might be re-adding this class to some nodes
                    elem.classed("middle-tree-node", false);
                    elem.classed("collapsed-tree-node", true);
                    elem.classed("terminal-tree-node", false);
                    elem.classed("flatten-selected-tree-node", false);
                    elem.attr("r", self.COLLAPSED_NODE_RADIUS);
                } else if (d.data.children && d.data.children.length > 0) {
                    // NOTE(tfs): There is probably a cleaner way to do this
                    elem.classed("middle-tree-node", true);
                    elem.classed("terminal-tree-node", false);
                    elem.classed("collapsed-tree-node", false);
                    elem.classed("flatten-selected-tree-node", false);
                    elem.attr("r", self.CIRCLE_RADIUS);
                } else {
                    elem.classed("middle-tree-node", false);
                    elem.classed("terminal-tree-node", true);
                    elem.classed("collapsed-tree-node", false);
                    elem.classed("flatten-selected-tree-node", false);
                    elem.attr("r", self.TERMINAL_NODE_RADIUS);
                }

                // Override class settings if in flattenMode and selected for flat model
                //   Keep sizing
                if (flattenMode && d.data.flatSelected) {
                    elem.classed("middle-tree-node", false);
                    elem.classed("collapsed-tree-node", false);
                    elem.classed("terminal-tree-node", false);
                    elem.classed("flatten-selected-tree-node", true);
                }
            });

        text.attr("x", function (d) {
                var margin = 2 + self.COLLAPSED_NODE_RADIUS;
                return d.x + margin;
            })
            .attr("y", function (d) {
                return d.y + self.TEXT_HEIGHT_OFFSET;
            })
            .each(function (d) {
                var sel = d3.select(this);

                sel.selectAll("*").remove();

                if (!d.data.terms) {
                    return;
                }

                sel.text(d.data.terms.join(" "))
                    .attr("font-size", self.LABEL_FONT_SIZE);
            });

        rects.attr("x", function (d) {
                var margin = 2 + self.COLLAPSED_NODE_RADIUS;
                return d.x + margin - 2;
            })
            .attr("y", function (d) {
                var textheight = $("#tree-label-"+d.data.id)[0].getBBox().height;
                // Add 4 to adjust for margins. Probably a better way to calculate this.
                return d.y - textheight + 4;
            })
            .attr("width", function (d) {
                var textwidth = $("#tree-label-"+d.data.id)[0].getBBox().width;
                return textwidth + 4;
            })
            .attr("height", function (d) {
                var textheight = $("#tree-label-"+d.data.id)[0].getBBox().height;
                return textheight;
            });
    },


    // Ref: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
    shapePath: function (s, t) {
        var path = "M " + s.x + " " + s.y;
        path += " C " + (s.x + t.x) / 2 + " " + s.y + "," + (s.x + t.x) / 2 + " " + t.y + "," + t.x + " " + t.y;

        return path;
    },


    generateNodeClickHandler: function (selfRef) {
        var treeNodeClickHandler = function (d) {
            d3.event.stopPropagation();

            // Handle Windows and Mac common behaviors
            if (d3.event.ctrlKey || d3.event.altKey) {
                // NOTE(tfs): I think this avoids wierdness with javascript nulls
                if (d.data.collapsed === true) {
                    // Timestamp to ensure an actual change is registered
                    Shiny.onInputChange("expandNode", [d.data.id, Date.now()]);
                } else {
                    // Timestamp to ensure an actual change is registered
                    Shiny.onInputChange("collapseNode", [d.data.id, Date.now()]);
                }
            } else {
                if (flattenMode) {
                    Shiny.onInputChange("flat.node.selection", [d.data.id, Date.now()]);
                } else {
                    selfRef.selectNode(d, false);
                }
            }
        }

        return treeNodeClickHandler;
    },


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
            data = { id: 0, children: [], terms: [], weight: 0, collapsed: false, isLeaf: false, flatSelected: false },
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
            nodes[srcData[i].nodeID] = { id: srcData[i].nodeID, children: [], terms: [], weight: 0, collapsed: false, isLeaf: false, flatSelected: false };
        }

        var rawPoint;
        var cleanPoint;
        var parent;
        var maxWeight = 0;

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

            cleanPoint.collapsed = rawPoint.collapsed;
            cleanPoint.isLeaf = rawPoint.isLeaf;
            cleanPoint.flatSelected = rawPoint.flatSelected;
        }

        // Updates weight properties of nodes
        self.maxNodeWeight = self.findAndSetWeightRecursive(self, data);
        self.edgeWidthMap = d3.scaleLinear()
                                .domain([0, self.maxNodeWeight])
                                .range([self.MIN_EDGE_WIDTH, self.MAX_EDGE_WIDTH]);

        return data;
    },

    /* Convert JSON to tree.
     */
    getTreeFromJSON: function (x) {
        var self = this,
            data = { id: 0, children: [], terms: [], weight: 0, collapsed: false, isLeaf: false, flatSelected: false },
            // srcData = HTMLWidgets.dataframeToD3(x.data);
            srcData = x;

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
            nodes[srcData[i].nodeID] = { id: srcData[i].nodeID, children: [], terms: [], weight: 0, collapsed: false, isLeaf: false, flatSelected: false };
        }

        var rawPoint;
        var cleanPoint;
        var parent;
        var maxWeight = 0;

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

            cleanPoint.collapsed = rawPoint.collapsed;
            cleanPoint.isLeaf = rawPoint.isLeaf;
            cleanPoint.flatSelected = rawPoint.flatSelected;
        }

        // Updates weight properties of nodes
        self.maxNodeWeight = self.findAndSetWeightRecursive(self, data);
        self.edgeWidthMap = d3.scaleLinear()
                                .domain([0, self.maxNodeWeight])
                                .range([self.MIN_EDGE_WIDTH, self.MAX_EDGE_WIDTH]);

        return data;
    },

    // Updates weight properties of nodes in addition to returning weight values
    findAndSetWeightRecursive: function (selfRef, treeNode) {
        if (treeNode.children && treeNode.children.length > 0) {
            var wgt = 0;

            treeNode.children.forEach(function (d) {
                wgt += selfRef.findAndSetWeightRecursive(selfRef, d);
            });

            treeNode.weight = wgt;
            return wgt;
        } else {
            return treeNode.weight;
        }
    },

    /* Returns `true` if the node is the root node, `false` otherwise.
     */
    isRootNode: function (d) {
        return d.data.id === 0;
    },

    /* Returns `true` if the node is a leaf node, `false` otherwise.
     */
    isLeafNode: function (d) {
        return d.data.isLeaf;
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

    /* This is a critical function. We need to give D3 permanent IDs for each
     * node so that it knows which data goes with which bubble. See:
     * https://bost.ocks.org/mike/constancy/
     */
    constancy: function (d) {
        return d.data.id;
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

    setSourceByID: function (id) {
        var self = this;

        if (id === null || isNaN(id)) {
            self.setSource(null);
        } else {
            var newVal = d3.select("#tree-node-"+id).datum();
            self.setSource(newVal);
        }
    },

    setSource: function (newVal) {
        var self = this,
            oldVal = self.sourceD;
        self.sourceD = newVal;

        if (oldVal) {
            d3.select("#tree-node-"+oldVal.data.id).classed("selected", false);
        }
        if (newVal) {
            Shiny.onInputChange("topic.selected", self.sourceD.data.id);
            Shiny.onInputChange("topic.active", self.sourceD.data.id);
            d3.select("#tree-node-"+self.sourceD.data.id).classed("selected", true);
        } else {
            Shiny.onInputChange("topic.selected", "");
        }
    },
};

