// REF: http://bl.ocks.org/shubhgo/80323b7f3881f874c02f
// REF: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
// REF: https://bl.ocks.org/d3noob/b024fcce8b4b9264011a1c3e7c7d70dc


HTMLWidgets.widget({
    name: "topicTree",
    type: "output",

    PAGE_MARGIN: 10,
    TOP_MARGIN: 75,
    FONT_SIZE: 11,
    BORDER_MARGIN: 10,
    CIRCLE_RADIUS: 7,
    TERMINAL_NODE_RADIUS: 5,
    COLLAPSED_NODE_RADIUS: 10,

    MIN_EDGE_WIDTH: 1,
    MAX_EDGE_WIDTH: 10,

    treeData: null,
    maxNodeWeight: 1,

    initialize: function (el, width, height) {
        var self = this;

        self.el = el;

        self.g = d3.select(el)
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("id", "tree-svg")
            .append("g")
            .attr("id", "tree-root")
            // Maybe a transform, see if it can work without

        // TODO(tfs): This is an ugly way of structuring the corrections for margins, should probably restructure
        self.tree = d3.tree().size([height-(2*self.BORDER_MARGIN)-self.TOP_MARGIN, width-(2*self.BORDER_MARGIN)]);

        self.edgeWidthMap = d3.scaleLinear()
                            .domain([0, 1])
                            .range([self.MIN_EDGE_WIDTH, self.MAX_EDGE_WIDTH]);
    },

    resize: function (el, width, height) {
        console.log("tree resized");
    },

    renderValue: function (el, rawData) {
        if (rawData === null) {
            return;
        }

        var self = this;

        // Root of a tree structure
        self.treeData = self.getTreeFromRawData(rawData);

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
            d.y = d.x + offset.left;
            d.x = tmpX;
        });

        // NOTE(tfs): Slightly worried this will wipe out all the bubbles circles,
        // in which case there MAY be a performance dip. Worth keeping an eye on.
        var circles = self.g.selectAll("circle")
            .data(nodes, self.constancy);

        var text = self.g.selectAll("text")
            .data(nodes, self.constancy);

        var paths = self.g.selectAll("path")
            .data(nodes.slice(1), self.constancy);

        circles.enter()
            .append("circle")
            .attr("class", "tree-node")
            // .attr("r", self.CIRCLE_RADIUS)
            .attr("opacity", "1.0")
            // .attr("fill", "blue")
            .attr("id", function (d) {
                return "tree-node-" + d.data.id;
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
            });

        text.enter()
            .append("text")
            .attr("class", "tree-label")
            .attr("id", function (d) {
                return "tree-label-" + d.data.id;
            });


        paths.enter()
            .append("path")
            .attr("class", "tree-link");


        circles.exit().remove();
        text.exit().remove();
        paths.exit().remove();

        self.raiseAllCircles();

        self.resizeAndReposition(useTransition);

        // Sorts display order so that paths are below circles
        // Ref: https://stackoverflow.com/questions/28243431/how-can-i-make-an-svg-circle-always-appear-above-my-graph-line-path
        // self.g.selectAll("circle, path").sort(function (left, right) {
        //     if (left.type === right.type) {
        //         return 0;
        //     } else {
        //         return left.type === "circle" ? -1 : 1;
        //     }
        // });
    },



    // NOTE(tfs): There must be a cleaner way of appraoching this
    raiseNode: function (selfRef, nodeID) {
        var rootElemNode = $("#tree-root")[0];
        rootElemNode.appendChild($("#tree-node-"+nodeID)[0]);
    },


    raiseAllCircles: function () {
        var self = this,
            rootElemNode = $("#tree-root")[0];

        self.traverseTree(self.treeData, function (n) {
            var id = n.id;
            self.raiseNode(self, id);
        });
    },


    resizeAndReposition: function (useTransition = false) {
        var self = this,
            circles = self.g.selectAll("circle"),
            paths = self.g.selectAll("path"),
            text = self.g.selectAll("text"),
            MOVE_DURATION = 500;

        if (useTransition) {
            circles = circles.transition().duration(MOVE_DURATION);
            paths = paths.transition().duration(MOVE_DURATION);
            text = text.transition().duration(MOVE_DURATION);
        }

        text.attr("transform", function (d) {
                var x = (d.x),
                    y = (d.y);
                // return "translate(" + (x + offset.left) + "," + (y + offset.top) + ")";
                return "translate(" + x + "," + y + ")";
            })

        paths.attr("d", function (d) {
                // exportable = d;
                // var source = {x: d.source.x - self.edgeWidthMap(self.findEdgeSource(d)), y: d.source.y};
                // var target = {x: d.target.x, y: d.target.y};
                return self.shapePath(d, d.parent);
            })
            .attr("stroke-width", function (d) {
                // exportable = self;
                // return self.edgeWidthMap(d.data.weight / d.parent.data.weight);
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

                if (d.data.children && d.data.children.length > 0) {
                    // NOTE(tfs): There is probably a cleaner way to do this
                    elem.classed("middle-tree-node", true);
                    elem.classed("terminal-tree-node", false);
                    elem.classed("collapsed-tree-node", false);
                    elem.attr("r", self.CIRCLE_RADIUS);
                } else {
                    elem.classed("middle-tree-node", false);
                    if (d.data.collapsed) {
                        // NOTE(tfs): Might be re-adding this class to some nodes
                        elem.classed("collapsed-tree-node", true);
                        elem.classed("terminal-tree-node", false);
                        elem.attr("r", self.COLLAPSED_NODE_RADIUS);
                    } else {
                        elem.classed("terminal-tree-node", true);
                        elem.classed("collapsed-tree-node", false);
                        elem.attr("r", self.TERMINAL_NODE_RADIUS);
                    }
                }

                exportable = [elem, d];
            })
    },











    // Ref: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
    shapePath: function (s, t) {

        // TODO(tfs): Copied from Ref for now
        var path = `M ${s.x} ${s.y}
                    C ${(s.x + t.x) / 2} ${s.y},
                      ${(s.x + t.x) / 2} ${t.y},
                      ${t.x} ${t.y}`


        return path;
    },


    // Ref: https://bl.ocks.org/d3noob/43a860bc0024792f8803bba8ca0d5ecd
    collapseNode: function (n) {
        var self = this;
        var d = n.data;

        if (d.children && d.children.length > 0) {
            d.childStore = d.children;
            d.children = [];
            d.collapsed = true;
        }

        d3.select("#tree-node-" + d.id).classed("collapsed-tree-node", true);
    },


    expandNode: function (n) {
        var self = this;
        var d = n.data;

        if (d.childStore && d.childStore.length > 0) {
            d.children = d.childStore;
            d.childStore = null;
            d.collapsed = false;
        }

        d3.select("#tree-node-" + d.id).classed("collapsed-tree-node", false);
    },


    generateNodeClickHandler: function (selfRef) {
        var treeNodeClickHandler = function (n) {
            console.log(d3.event);
            d3.event.stopPropagation();

            // Handle Windows and Mac common behaviors
            if (d3.event.ctrlKey || d3.event.altKey) {
                // NOTE(tfs): I think this avoids wierdness with javascript nulls
                if (n.data.collapsed === true) {
                    selfRef.expandNode(n);
                } else {
                    selfRef.collapseNode(n);
                }

                console.log(n);

                selfRef.updateTreeView(true);
            } else {
                selfRef.selectNode(n, false);
            }
        }

        return treeNodeClickHandler;
    },

    // From: http://bl.ocks.org/shubhgo/80323b7f3881f874c02f
    // findEdgeSource: function (link) {
    //     var targetID = link.target.id;

    //     var numChildren = link.source.children.length;
    //     var widthAbove = 0;

    //     for (var i = 0; i < numChildren; i++) {
    //         if (link.source.children[i].id == targetID) {
    //             widthAbove = widthAbove + link.source.children[i].size/2;
    //             break;
    //         } else {
    //             widthAbove = widthAbove + link.source.children[i].size;
    //         }
    //     }

    //     return link.source.size/2 - widthAbove;
    // },

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
            data = { id: 0, children: [], terms: [], weight: 0 },
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

        // NOTE(tfs): I'm not entirely sure how references work in JS. This could break horribly
        // NOTE(tfs): When assigning to index out of bounds, JS arrays expand and include undefined entries.
        var nodes = [];
        nodes[0] = data;
        for (var i = 0; i < srcData.length; i++) {
            nodes[srcData[i].nodeID] = { id: srcData[i].nodeID, children: [], terms: [], weight: 0 };
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
        }

        // Updates weight properties of nodes
        self.maxNodeWeight = self.findAndSetWeightRecursive(self, data);
        self.edgeWidthMap = d3.scaleLinear()
                                .domain([0, self.maxNodeWeight])
                                .range([self.MIN_EDGE_WIDTH, self.MAX_EDGE_WIDTH]);

        // For each data row add to the output tree.
        // srcData.forEach(function (d) {
        //     var parent = self.findParent(data, d.parentID, d.nodeID);

        //     // Leaf node.
        //     if (d.weight === 0) {
        //         parent.children.push({
        //             id: d.nodeID,
        //             terms: d.title.split(" "),
        //             children: []
        //         });
        //     } else if (parent !== null && parent.hasOwnProperty("children")) {
        //         parent.children.push({
        //             id: d.nodeID,
        //             terms: d.title.split(" "),
        //             weight: d.weight
        //         });
        //     }
        // });



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
        Shiny.addCustomMessageHandler(EVENT, function (newTopics) {
            self.updateTopicView(newTopics);
            callback();
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
            // NOTE(tfs): Experimenting with different control schemes
            // self.moveOrMerge(targetD, makeNewGroup);
            // self.updateTopicAssignments(function() {
            //     self.updateView(true);
            // });

            self.setSource(targetD);
        }
    },

    setSource: function (newVal) {
        var self = this,
            oldVal = self.sourceD;
        self.sourceD = newVal;
        if (oldVal) {
            // self.setLabelVisibility(oldVal);
            // self.setCircleFill(oldVal);
        }
        if (newVal) {
            // self.setLabelVisibility(self.sourceD);
            // self.setCircleFill(self.sourceD);
            Shiny.onInputChange("topic.selected", self.sourceD.data.id);
            Shiny.onInputChange("topic.active", self.sourceD.data.id);
        } else {
            Shiny.onInputChange("topic.selected", "");
            // Shiny.onInputChange("topic.active", ""); // TODO(tfs): Once hover is enabled on the tree, remove this
        }
    },


})


// REFERENCE FROM TOPICBUBBLES
// HTMLWidgets.widget({


// // Variables global to the `HTMLWidgets` instance.
// //------------------------------------------------------------------------------

//     name: "topicBubbles",
//     type: "output",

//     PAGE_MARGIN: 10,
//     TOP_MARGIN: 75,
//     DIAMETER: null,
//     FONT_SIZE: 11,

//     // The first node the user clicks in the move process.
//     sourceD: null,
//     draggedNode: null,
//     dragSourceX: 0,
//     dragSourceY: 0,

//     // Used for things like deciding whether to zoom in or out or whether or not
//     // to show a label.
//     nodeInFocus: null,
//     currCoords: null,

//     // Used to know when the user has changed the number of groups. In this
//     // scenario, we just completely re-initialize the widget.
//     // nGroups: null,

//     el: null,
//     svg: null,

//     // The raw tree data and final arbiter of node relationships. It is
//     // converted to hierarchical data using `d3.hierarchy` and this resulting
//     // data structure is what backs the visualization.
//     treeData: null,


// // Main functions.
// //------------------------------------------------------------------------------

//     /* Creates the `svg` element, a `d3.pack` instance with the correct size
//      * parameters, and the depth-to-color mapping function.
//      */
//     initialize: function (el, width, height) {
//         var self = this,
//             NODE_PADDING = 20,
//             SHORT_EDGE = Math.min(width, height - self.TOP_MARGIN),
//             SVG_R = SHORT_EDGE / 2,
//             D3PACK_W = SHORT_EDGE - self.PAGE_MARGIN;

//         self.el = el;
//         self.DIAMETER = SHORT_EDGE;

//         // Create `svg` and root `g` elements.
//         self.g = d3.select(el)
//             .append("svg")
//             .attr("width", self.DIAMETER)
//             .attr("height", self.DIAMETER)
//             .attr("id", "bubbles-svg")
//             .append("g")
//             .attr("id", "root-node")
//             .attr("transform", "translate(" + SVG_R + "," + SVG_R + ")");

//         // Create persistent `d3.pack` instance with radii accounting for
//         // padding.
//         self.pack = d3.pack()
//             .size([D3PACK_W, D3PACK_W])
//             .padding(NODE_PADDING);

//         // Set depth-to-color mapping function.
//         self.colorMap = d3.scaleLinear()
//             .domain([-2, 2])
//             // .range(["hsl(155,30%,82%)", "hsl(155,66%,25%)"])
//             .range(["hsl(215,100%,80%)", "hsl(215,70%,50%)"])
//             .interpolate(d3.interpolateHcl);

//         // Handle Shiny messages
//         Shiny.addCustomMessageHandler("nodeDeleted", function(msg) { self.setSource(null); });
//         Shiny.addCustomMessageHandler("runtimeClusterFinished", function(msg) { self.setSource(null); })
//     },

//     /* Removes all svg elements and then re-renders everything from scratch.
//      */
//     reInitialize: function () {
//         var self = this;
//         d3.select(self.el).selectAll("*").remove();
//         self.initialize(self.el, self.DIAMETER, self.DIAMETER);
//         self.updateView(false);
//     },

//     /* Upon resize event, updates the self.el and self.DIAMETER values.
//      * Then selects and modifies the width and height attributes of the
//      * existing SVG element, as well as the transform attribute of the
//      * root-node element.
//      */
//     resize: function (el, width, height) {
//         var self = this,
//             SHORT_EDGE = Math.min(width, height - self.TOP_MARGIN),
//             SVG_R = SHORT_EDGE / 2;

//         // Update state corresponding to new width
//         self.el = el;
//         self.DIAMETER = SHORT_EDGE;
        
//         // Modify width and height of existing svg element
//         var svgElement = d3.select("#bubbles-svg")
//             .attr("width", self.DIAMETER)
//             .attr("height", self.DIAMETER);

//         // Reset the centering of root-node
//         self.g = d3.select("#root-node")
//             .attr("transform", "translate(" + SVG_R + "," + SVG_R + ")");

//         // Re-render according to new dimensions, only if data already rendered
//         if (self.treeData !== null) {
//             self.updateView(false);
//         }
//     },

//     renderValue: function (el, rawData) {
//         // Shiny calls this function before the user uploads any data. We want
//         // to just early-return in this case.
//         if (rawData.data === null) {
//             return;
//         }

//         var self = this;

//         self.treeData = self.getTreeFromRawData(rawData);

//         // TODO(tfs): Check to make sure this is accurate for hierarchical (I don't believe it is)
//         // nGroupsChanged = self.nGroups !== null
//         //     && self.nGroups !== self.treeData.children.length;
//         // if (nGroupsChanged) {
//         //     // self.reInitialize();
//         //     self.nGroups = self.treeData.children.length;
//         //     self.updateView(true);
//         // } else {
//         //     self.nGroups = self.treeData.children.length;
//         //     self.updateView(true);
//         // }

//         self.updateView(true);
//     },

//     updateView: function (useTransition) {
//         var self = this,
//             nClicks = 0,
//             DBLCLICK_DELAY = 300,
//             root,
//             nodes,
//             circles,
//             text,
//             timer;

//         root = d3.hierarchy(self.treeData)
//             .sum(function (n) {
//                 return n.weight;
//             })
//             .sort(function (a, b) {
//                 return b.value - a.value;
//             });
//         nodes = self.pack(root).descendants();
//         self.nodeInFocus = nodes[0];

//         // Ref: https://stackoverflow.com/questions/38599930/d3-version-4-workaround-for-drag-origin
//         var dragHandler = d3.drag()
//             .subject(function (n) { return n; })
//             // .on("start", self.dragStartHandler(self))
//             .on("drag", self.activeDragHandler(self))
//             .on("end", self.dragEndHandler(self));

//         circles = self.g.selectAll('circle')
//             .data(nodes, self.constancy);

//         circles.enter()
//             .append("circle")
//             .attr("class", "node")
//             .attr("weight", function (d) {
//                 return d.data.weight ? d.data.weight : -1;
//             })
//             .attr("id", function (d) {
//                 return 'node-' + d.data.id;
//             })
//             .on("dblclick", function () {
//                 d3.event.stopPropagation();
//             })
//             .on("click", function (d) {
//                 d3.event.stopPropagation();
//                 // var makeNewGroup = d3.event.shiftKey;
//                 // nClicks++;
//                 // if (nClicks === 1) {
//                 //     timer = setTimeout(function () {
//                 //         nClicks = 0;
//                 //         self.zoom(root, d);
//                 //     }, DBLCLICK_DELAY);
//                 // } else {
//                 //     clearTimeout(timer);
//                 //     nClicks = 0;
//                 //     self.selectNode(d, makeNewGroup);
//                 // }
//                 self.selectNode(d, false);
//             })
//             // .on("dragstart", function (d) {
//             //     console.log("yo");
//             //     d3.event.stopPropagation();
//             //     console.log(d);
//             // })
//             // .on("drag", function (d) {
//             //     d3.event.stopPropagation();
//             //     console.log(d.x += d3.event.dx, d.y += d3.event.dy);
//             // })
//             // .on("dragend", function(d) {
//             //     d3.event.stopPropagation();
//             //     console.log("ended");
//             // })
//             .on("mouseover", function (d) {
//                 var displayID = !self.sourceD ? "" : self.sourceD.data.id,
//                     isRoot = self.isRootNode(d);
//                 Shiny.onInputChange("topic.active", isRoot ? displayID : d.data.id);
//                 if (isRoot || self.isGroupInFocus(d)) {
//                     return;
//                 }
//                 self.setLabelVisibility(d, true);
//             })
//             .on("mouseout", function (d) {
//                 var displayID = !self.sourceD ? "" : self.sourceD.data.id;
//                 Shiny.onInputChange("topic.active", displayID);
//                 if (self.isRootNode(d)) {
//                     return;
//                 }
//                 self.setLabelVisibility(d, false);
//             })
//             .call(dragHandler);

//         text = self.g.selectAll('text')
//             .data(nodes, self.constancy);

//         text.enter()
//             .append('text')
//             .attr("class", "label")
//             .attr("id", function (d) {
//                 return 'label-' + d.data.id;
//             });

//         circles.exit().remove();
//         text.exit().remove();

//         circles.order().raise();
//         text.order().raise();

//         // This is needed because SVG elements are displayed not based on a
//         // tunable Z-index but based on their location in the DOM. This function
//         // correctly sorts the nodes based on `treeData`.
//         self.sortNodesBasedOnTree();

//         self.positionAndResizeNodes(
//             [root.x, root.y, root.r * 2 + self.PAGE_MARGIN],
//             useTransition
//         );
//     },


//     // Returns a callback function, setting drag status to ``status``
//     dragStatusSetter: function (status) {
//         var setterCallback = function (n) {
//             // exportable = n;
//             var nodeID = ["#node", n.data.id].join("-");
//             d3.select(nodeID).classed("dragged-node", status);
//             var labelID = ["#label", n.data.id].join("-");
//             d3.select(labelID).classed("dragged-label", status);

//             if (!n.hasOwnProperty("children")) { return; }

//             n.children.forEach(function (ch) {
//                 setterCallback(ch);
//             });
//         }

//         return setterCallback;
//     },


//     // Pass in reference to "self", as the call() method passes a different "this"
//     dragStartHandler: function (selfRef) {
//         var handler = function (d) {
//             d3.event.sourceEvent.stopPropagation();

//             // var nodeID = ["#node", d.data.id].join("-");

//             d3.select(this).data().forEach(selfRef.dragStatusSetter(true));

//             selfRef.draggedNode = d.data.id;
//             // selfRef.dragSourceX = d3.select(this).attr("cx");
//             // selfRef.dragSourceY = d3.select(this).attr("cy");
//             // console.log(d);

//             var coords = d3.mouse(this);

//             selfRef.dragPointer = selfRef.g.append("circle").attr("id", "drag-pointer").attr("r", 10).raise();
//             d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1]);
//         }

//         return handler;
//     },


//     // Pass in reference to "self", as the call() method passes a different "this"
//     activeDragHandler: function (selfRef) {
//         var handler = function (d) {
//             coords = d3.mouse(this);

//             if (selfRef.isRootNode(d)) { return; }

//             if (selfRef.draggedNode === null) {
//                 d3.event.sourceEvent.stopPropagation();

//                 var nodeID = ["#node", d.data.id].join("-");

//                 d3.select(nodeID).data().forEach(selfRef.dragStatusSetter(true));

//                 selfRef.draggedNode = d.data.id;

//                 console.log("Started dragging:", d.data.id);

//                 // selfRef.dragSourceX = d3.select(this).attr("cx");
//                 // selfRef.dragSourceY = d3.select(this).attr("cy");
//                 // console.log(d);

//                 // var coords = d3.mouse(this);

//                 selfRef.dragPointer = selfRef.g.append("circle").attr("id", "drag-pointer").attr("r", 10).raise();
//                 d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1]);
//             }

//             // console.log(d3.mouse(this), d3.event.x, d3.event.y, d3.event.sourceEvent.x, d3.event.sourceEvent.y);
//             d3.event.sourceEvent.stopPropagation();

//             // d3.select(this).attr("cx", n.x).attr("cy", n.y);
//             d3.select("#drag-pointer").attr("cx", coords[0]).attr("cy", coords[1])

//             // var labelID = ["#label", this.id.split("-")[1]].join("-");

//             // d3.select(labelID).attr("transform", "translate("+n.x+","+n.y+")");
//         }

//         return handler;
//     },

//     // Pass in reference to "self", as the call() method passes a different "this"
//     dragEndHandler: function (selfRef) {
//         var handler = function (d) {
//             if (selfRef.draggedNode === null) { return; }
            
//             d3.select("#drag-pointer").remove();
//             d3.event.sourceEvent.stopPropagation();

//             // Calculate values for moving/merging nodes
//             var pageX = d3.event.sourceEvent.pageX;
//             var pageY = d3.event.sourceEvent.pageY;
//             var sourceID = selfRef.draggedNode;
//             var target = d3.select(document.elementFromPoint(pageX, pageY)).data()[0];

//             d3.select(this).data().forEach(selfRef.dragStatusSetter(false));

//             selfRef.draggedNode = null;

//             // Move or merge if applicable, AFTER having reset draggedNode/etc.
//             if (target) {
//                 if (selfRef.isLeafNode(target)) {
//                     var targetID = target.parent.data.id;
//                 } else {
//                     var targetID = target.data.id;
//                 }

//                 var makeNewGroup = d3.event.sourceEvent.shiftKey;
//                 var updateNeeded = selfRef.moveOrMerge(selfRef, sourceID, targetID, makeNewGroup);
                
//                 if (updateNeeded) {
//                     selfRef.updateTopicAssignments(selfRef, function() {
//                         self.updateView(true);
//                     });
//                 }
//             }
//         }

//         return handler;
//     },

//     /* Zoom on click.
//      */
//     zoom: function (root, d) {
//         var self = this,
//             userClickedSameNodeTwice = self.nodeInFocus === d,
//             userClickedDiffNode = self.nodeInFocus !== d;
//         if (self.isRootNode(d) || userClickedSameNodeTwice) {
//             self.zoomToNode(root);
//         } else if (userClickedDiffNode) {
//             self.zoomToNode(d);
//         }
//     },

//     /* Zoom to node utility function.
//      */
//     zoomToNode: function (node) {
//         var self = this,
//             ZOOM_DURATION = 500,
//             coords = [node.x, node.y, node.r * 2 + self.PAGE_MARGIN];
//         self.nodeInFocus = node;
//         d3.transition()
//             .duration(ZOOM_DURATION)
//             .tween("zoom", function () {
//                 var interp = d3.interpolateZoom(self.currCoords, coords);
//                 return function (t) {
//                     // `tween()` will handle the transition for us, so we can
//                     // pass `useTransition = false`.
//                     self.positionAndResizeNodes(interp(t), false);
//                 };
//             });
//     },

//     setDraggedNode: function (nodeD) {
//         var self = this;
//     },

//     releaseDraggedNode: function (nodeD, makeNewGroup) {

//     },

//     selectNode: function (targetD, makeNewGroup) {
//         var self = this,
//             sourceExists = !!self.sourceD,
//             souceSelectedTwice,
//             notReallyAMove,
//             targetIsSourceChild;

//         if (self.isRootNode(targetD) && !sourceExists) {
//             self.setSource(targetD);
//         } else if (sourceExists) {
//             souceSelectedTwice = self.sourceD === targetD;
//             targetIsSourceChild = self.aIsChildOfB(targetD, self.sourceD);
//             notReallyAMove = self.isLeafNode(self.sourceD)
//                 && self.sourceD.parent === targetD
//                 && !makeNewGroup;
//         }

//         if (souceSelectedTwice) {
//             self.setSource(null);
//         } else if (!sourceExists
//             || self.isLeafNode(targetD)
//             || targetIsSourceChild
//             || notReallyAMove) {

//             self.setSource(targetD);
//         } else {
//             // NOTE(tfs): Experimenting with different control schemes
//             // self.moveOrMerge(targetD, makeNewGroup);
//             // self.updateTopicAssignments(function() {
//             //     self.updateView(true);
//             // });

//             self.setSource(targetD);
//         }
//     },

//     /* Move or merge source node with target node.
//      */
//     moveOrMerge: function (selfRef, sourceID, targetID, makeNewGroup) {
//         var sourceD = d3.select("#node-"+sourceID).data()[0],
//             targetD = d3.select("#node-"+targetID).data()[0],
//             sourceIsLeaf = selfRef.isLeafNode(sourceD),
//             targetIsSource = sourceD.data.id === targetD.data.id,
//             mergingNodes = sourceD.children && sourceD.children.length > 1,
//             sameParentSel = sourceD.parent === targetD,
//             oldParentD,
//             nsToMove;

//         if (targetIsSource || (sameParentSel && !makeNewGroup)) {
//             return false;
//         }

//         if (makeNewGroup) {
//             oldParentD = sourceD.parent;
//             selfRef.createNewGroup(targetD, sourceD);
//             selfRef.removeChildDFromParent(sourceD);

//             // Any or all of the source's ancestors might be childless now.
//             // Walk up the tree and remove childless nodes.
//             selfRef.removeChildlessNodes(oldParentD);

//             return true;
//         } else {
//             if (sourceIsLeaf) {
//                 nsToMove = [sourceD.data];
//                 oldParentD = sourceD.parent;
//             } else {
//                 nsToMove = [];
//                 sourceD.children.forEach(function (d) {
//                     nsToMove.push(d.data);
//                 });
//                 oldParentD = sourceD;
//             }

//             selfRef.updateNsToMove(selfRef, nsToMove, oldParentD, targetD);
//             if (sourceIsLeaf) {
//                 selfRef.removeChildlessNodes(oldParentD);
//             } else {
//                 selfRef.removeChildDFromParent(sourceD);
//             }

//             return true;
//         }
//     },

//     /* This function "zooms" to center of coordinates. It is important to
//      * realize that "zoom" in this context actually means setting the (x, y, r)
//      * data for the circles.
//      */
//     positionAndResizeNodes: function (coords, transition) {
//         var self = this,
//             MOVE_DURATION = 1000,
//             k = self.DIAMETER / coords[2],
//             circles = self.g.selectAll("circle"),
//             text = self.g.selectAll('text');
//         self.currCoords = coords;

//         if (transition) {
//             circles = circles.transition().duration(MOVE_DURATION);
//             text = text.transition().duration(MOVE_DURATION);
//         }

//         // circles.attr("transform", function (d) {
//         //         var x = (d.x - coords[0]) * k,
//         //             y = (d.y - coords[1]) * k;
//         //         return "translate(" + x + "," + y + ")";
//         //     })
//         circles.attr("cx", function (d) {
//                 return (d.x - coords[0]) * k;
//             })
//             .attr("cy", function (d) {
//                 return (d.y - coords[1]) * k;
//             })
//             .attr("r", function (d) {
//                 return d.r * k;
//             })
//             .attr("depth", function (d) {
//                 return d.depth;
//             })
//             .each(function (d) {
//                 self.setCircleFill(d);
//             });

//         text.attr("transform", function (d) {
//                 var x = (d.x - coords[0]) * k,
//                     y = (d.y - coords[1]) * k;
//                 return "translate(" + x + "," + y + ")";
//             })
//         // text.attr("x", function (d) {
//         //         return (d.x - coords[0]) * k;
//         //     })
//         //     .attr("y", function (d) {
//         //         return (d.y - coords[1]) * k;
//         //     })
//             .attr("display", function (d) {
//                 self.setLabelVisibility(d);
//             })
//             .attr("depth", function (d) {
//                 return d.depth;
//             })
//             .each(function (d) {
//                 if (!d.data.terms) {
//                     return;
//                 }
//                 var sel = d3.select(this),
//                     len = d.data.terms.length;
//                 sel.selectAll("*").remove();
//                 d.data.terms.forEach(function (term, i) {
//                     sel.append("tspan")
//                         .text(term)
//                         .attr("x", 0)
//                         .attr("text-anchor", "middle")
//                         // This data is used for dynamic sizing of text.
//                         .attr("data-term-index", i)
//                         .attr("data-term-len", len);
//                 });
//             });

//         text.selectAll("tspan")
//             .attr("y", function () {
//                 var that = d3.select(this),
//                     i = +that.attr("data-term-index"),
//                     len = +that.attr("data-term-len");
//                 // `- (len / 2) + 0.75` shifts the term down appropriately.
//                 // `15 * k` spaces them out appropriately.
//                 return (self.FONT_SIZE * (k / 2) + 3) * 1.2 * (i - (len / 2) + 0.75);
//             })
//             .style("font-size", function () {
//                 return (self.FONT_SIZE * (k / 2) + 3) + "px";
//             });
//     },

//     /* Update node's children depending on whether it is the new or old parent.
//      */
//     updateNsToMove: function (selfRef, nsToMove, oldParentD, newParentD) {
//         var newChildren = [];

//         // Remove nodes-to-move from old parent.
//         if (nsToMove.length === 1) {
//             oldParentD.data.children.forEach(function (child) {
//                 if (child.id !== nsToMove[0].id) {
//                     newChildren.push(child);
//                 }
//             });
//             oldParentD.data.children = newChildren;
//         } else {
//             // In this scenario, the user selected a group of topics
//             // (`oldParent`), and we're moving all of that group's children.
//             oldParentD.data.children = [];
//         }

//         // Add nodes-to-move to new parent.
//         nsToMove.forEach(function (nToMove) {
//             newParentD.data.children.push(nToMove);
//         });
//     },

//     /* Removes child node from its parent.
//      */
//     removeChildDFromParent: function (childD) {
//         var newChildren = [];
//         childD.parent.data.children.forEach(function (n) {
//             if (n.id !== childD.data.id) {
//                 newChildren.push(n);
//             }
//         });
//         childD.parent.data.children = newChildren;
//     },

//     /* Make new group with `target` if node meets criteria.
//      */
//     createNewGroup: function (newGroupD, childD) {
//         var self = this;
//         newGroupD.data.children.push({
//             id: self.getNewID(),
//             children: [childD.data],
//             terms: childD.data.terms
//         });
//     },

//     /* Sets `source` with new value, resetting and setting circle and label fill
//      * and visibility.
//      */
//     setSource: function (newVal) {
//         var self = this,
//             oldVal = self.sourceD;
//         self.sourceD = newVal;
//         if (oldVal) {
//             self.setLabelVisibility(oldVal);
//             self.setCircleFill(oldVal);
//         }
//         if (newVal) {
//             self.setLabelVisibility(self.sourceD);
//             self.setCircleFill(self.sourceD);
//             Shiny.onInputChange("topic.selected", self.sourceD.data.id);
//             Shiny.onInputChange("topic.active", self.sourceD.data.id);
//         } else {
//             Shiny.onInputChange("topic.selected", "");
//         }
//     },

//     /* Correctly color any node.
//      */
//     setCircleFill: function (d) {
//         var self = this,
//             isfirstSelNode = self.sourceD
//                 && self.sourceD.data.id === d.data.id,
//             borderColor = null,
//             fillColor;
//         if (isfirstSelNode) {
//             borderColor = "rgb(12, 50, 127)";
//             fillColor = "rgb(25, 101, 255)";
//         } else if (d.children) {
//             fillColor = self.colorMap(d.depth);
//         } else {
//             fillColor = "rgb(255, 255, 255)";
//         }
//         d3.select("#node-" + d.data.id)
//             .style("fill", fillColor)
//             .style("stroke", borderColor)
//             .style("stroke-width", 2);
//     },

//     /* Correctly label any node.
//      */
//     setLabelVisibility: function (d, hover) {
//         var self = this,
//             dIs = !!d,
//             dIsSource = dIs && self.sourceD && d.data.id === self.sourceD.data.id,
//             dInFocus = dIs && d === self.nodeInFocus,
//             parentInFocus = dIs && d.depth === self.nodeInFocus.depth + 1,
//             isLeaf = dIs && self.isLeafNode(d),
//             isInFocus = dIs && d === self.nodeInFocus,
//             zoomedOnLeaf = isInFocus && isLeaf && !self.isRootNode(d),
//             label = d3.select('#label-' + d.data.id);

//         if ((dIsSource && !dInFocus) || parentInFocus || hover || zoomedOnLeaf) {
//             label.style("display", "inline");
//         } else {
//             label.style("display", "none");
//         }
//     },

//     /* Traverse the underlying tree data structure and apply a callback
//      * function to every node.
//      */
//     traverseTree: function (node, processNode) {
//         var self = this;
//         processNode(node);
//         if (typeof node.children !== "undefined") {
//             node.children.forEach(function (childNode) {
//                 self.traverseTree(childNode, processNode)
//             });
//         }
//     },

//     /* Convert R dataframe to tree.
//      */
//     getTreeFromRawData: function (x) {
//         var self = this,
//             data = {id: 0, children: [], terms: []},
//             srcData = HTMLWidgets.dataframeToD3(x.data);

//         // Sort srcData by node ID
//         srcData.sort(function(left, right) {
//             if (left.nodeID < right.nodeID) {
//                 return -1;
//             } else if (left.nodeID > right.nodeID) {
//                 return 1;
//             }

//             return 0;
//         });

//         // Assumes no broken connections, but does NOT assume that there are no empty IDs
//         var maxID = srcData[srcData.length-1].nodeID;

//         // NOTE(tfs): I'm not entirely sure how references work in JS. This could break horribly
//         // NOTE(tfs): When assigning to index out of bounds, JS arrays expand and include undefined entries.
//         var nodes = [];
//         nodes[0] = data;
//         for (var i = 0; i < srcData.length; i++) {
//             nodes[srcData[i].nodeID] = {id: srcData[i].nodeID, children: [], terms: []};
//         }

//         var rawPoint;
//         var cleanPoint;
//         var parent;

//         for (var i = 0; i < srcData.length; i++) {
//             rawPoint = srcData[i];
//             cleanPoint = nodes[rawPoint.nodeID];
//             parent = nodes[rawPoint.parentID];

//             if (rawPoint.weight === 0) {
//                 parent.children.push(cleanPoint);
//                 cleanPoint.terms = rawPoint.title.split(" ");
//             } else if (parent !== null && parent.hasOwnProperty("children")) {
//                 parent.children.push(cleanPoint);
//                 cleanPoint.terms = rawPoint.title.split(" ");
//                 cleanPoint.weight = rawPoint.weight;
//             }
//         }

//         // For each data row add to the output tree.
//         // srcData.forEach(function (d) {
//         //     var parent = self.findParent(data, d.parentID, d.nodeID);

//         //     // Leaf node.
//         //     if (d.weight === 0) {
//         //         parent.children.push({
//         //             id: d.nodeID,
//         //             terms: d.title.split(" "),
//         //             children: []
//         //         });
//         //     } else if (parent !== null && parent.hasOwnProperty("children")) {
//         //         parent.children.push({
//         //             id: d.nodeID,
//         //             terms: d.title.split(" "),
//         //             weight: d.weight
//         //         });
//         //     }
//         // });



//         return data;
//     },

//     /* Update the string that informs the Shiny server about the hierarchy of
//      * topic assignments
//      */
//     updateTopicAssignments: function (selfRef, callback) {
//         var self = selfRef,
//             assignments = [],
//             EVENT = "topics";
//         self.traverseTree(self.treeData, function (n) {
//             if (!n.children) {
//                 return;
//             }
//             if (n.weight <= 0 && n.children.length === 0) {
//                 return;
//             }
//             n.children.forEach(function (childN) {
//                 assignments.push(childN.id + ":" + n.id);
//             });
//         });
//         Shiny.addCustomMessageHandler(EVENT, function (newTopics) {
//             self.updateTopicView(newTopics);
//             callback();
//         });
//         Shiny.onInputChange(EVENT, assignments.join(","));
//     },

//     updateTopicView: function (newTopics) {
//         var self = this;
//         self.traverseTree(self.treeData, function (n) {
//             var terms = newTopics[n.id];
//             if (terms) {
//                 n.terms = terms.split(' ');
//             }
//         });
//     },

//     /* Helper function to add hierarchical structure to data.
//         TODO(tfs): Make this more efficient, usable for in-order (or any-order) assignments
//      */
//     findParent: function (branch, parentID, nodeID) {
//         var self = this,
//             rv = null;
//         if (branch.id === parentID) {
//             rv = branch;
//         } else if (rv === null && branch.children !== undefined) {
//             branch.children.forEach(function (child) {
//                 if (rv === null) {
//                     rv = self.findParent(child, parentID, nodeID);
//                 }
//             });
//         }
//         return rv;
//     },

//     /* Finds the maximum node ID and returns the next integer.
//      */
//     getNewID: function () {
//         var self = this,
//             maxID = 0;
//         self.traverseTree(self.treeData, function (n) {
//             if (n.id > maxID) {
//                 maxID = n.id;
//             }
//         });
//         return maxID + 1;
//     },

//     /* Returns `true` if the node is the root node, `false` otherwise.
//      */
//     isRootNode: function (d) {
//         return d.data.id === 0;
//     },

//     /* Returns `true` if the node is a leaf node, `false` otherwise.
//      */
//     isLeafNode: function (d) {
//         var hasChildren = typeof d.data.children !== 'undefined';
//         if (hasChildren) {
//             return d.data.children.length === 0;
//         } else {
//             return true;
//         }
//     },

//     /* Returns true if node `a` is a child node of `b`.
//      */
//     aIsChildOfB: function (aD, bD) {
//         var result = false;
//         if (bD && bD.data.children && bD.data.children.length > 0) {
//             bD.children.forEach(function (d) {
//                 if (d.data.id === aD.data.id) {
//                     result = true;
//                 }
//             });
//         }
//         return result;
//     },

//     /* Returns `true` if the node is both in focus and a group rather than a
//      * leaf.
//      */
//     isGroupInFocus: function (d) {
//         var self = this,
//             isInFocus = d === self.nodeInFocus,
//             isGroup = !self.isLeafNode(d);
//         return isInFocus && isGroup;
//     },

//     /* This is a critical function. We need to give D3 permanent IDs for each
//      * node so that it knows which data goes with which bubble. See:
//      * https://bost.ocks.org/mike/constancy/
//      */
//     constancy: function (d) {
//         return d.data.id;
//     },

//     /* Walks the tree data and moves each node after its parent.
//      */
//     sortNodesBasedOnTree: function () {
//         var self = this,
//             childNode,
//             parentNode;

//         function insertAfter(newNode, referenceNode) {
//             referenceNode.parentNode.insertBefore(newNode, referenceNode.nextSibling);
//         }

//         self.traverseTree(self.treeData, function (n) {
//             if (n.children) {
//                 n.children.forEach(function (child) {
//                     childNode = document.getElementById('node-' + child.id);
//                     parentNode = document.getElementById('node-' + n.id);
//                     insertAfter(childNode, parentNode);

//                     childNode = document.getElementById('label-' + child.id);
//                     parentNode = document.getElementById('label-' + n.id);
//                     insertAfter(childNode, parentNode);
//                 });
//             }
//         });
//     },

//     /* Walks up the tree and removes empty groups, starting with `oldParentD`.
//      */
//     removeChildlessNodes: function (groupD) {
//         var self = this,
//             removeGroup;

//         removeGroup = !groupD.data.children || groupD.data.children.length === 0;
//         if (removeGroup) {
//             self.removeChildDFromParent(groupD);
//         }
//         // Walk up the tree. In principle, `groupD` could be an only child. In
//         // this scenario, we want to remove its parent as well. This recursion
//         // should continue so long as each new group is an only child.
//         if (groupD.parent) {
//             self.removeChildlessNodes(groupD.parent);
//         }
//     }
// });
